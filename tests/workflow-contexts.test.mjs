import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'workflow-contexts.js'), 'utf8');

function loadContexts() {
  const window = {};
  window.window = window;
  const context = vm.createContext({ window, Date, Object, Set, Map, Array });
  vm.runInContext(source, context);
  return window.SynthaWorkflowContexts;
}

test('cycle contexts contain only active and internally consistent trade combinations', () => {
  const contexts = loadContexts();
  const workspace = {
    relationships: [
      { id: 'rel-valid', status: 'active', brandId: 'brand-1', shopId: 'shop-1' },
      { id: 'rel-inactive', status: 'pending', brandId: 'brand-1', shopId: 'shop-1' },
      { id: 'rel-other', status: 'active', brandId: 'brand-2', shopId: 'shop-2' },
    ],
    campaigns: [
      { id: 'campaign-valid', status: 'open', brandId: 'brand-1' },
      { id: 'campaign-draft', status: 'draft', brandId: 'brand-1' },
      { id: 'campaign-other', status: 'open', brandId: 'brand-2' },
    ],
    collections: [
      { id: 'collection-valid', status: 'published', brandId: 'brand-1', campaignId: 'campaign-valid' },
      { id: 'collection-draft', status: 'draft', brandId: 'brand-1', campaignId: 'campaign-valid' },
      { id: 'collection-wrong-campaign', status: 'published', brandId: 'brand-1', campaignId: 'campaign-other' },
      { id: 'collection-other', status: 'published', brandId: 'brand-2', campaignId: 'campaign-other' },
    ],
  };

  const result = Array.from(contexts.buildCycleContexts(workspace, ['shop-1']));
  assert.equal(result.length, 1);
  assert.deepEqual({ ...result[0] }, {
    id: 'rel-valid|campaign-valid|collection-valid',
    relationshipId: 'rel-valid',
    brandId: 'brand-1',
    shopId: 'shop-1',
    campaignId: 'campaign-valid',
    collectionId: 'collection-valid',
  });
  assert.equal(Object.isFrozen(result[0]), true);
});

test('cycle contexts are empty when the actor owns neither trade organisation', () => {
  const contexts = loadContexts();
  const result = contexts.buildCycleContexts({
    relationships: [{ id: 'rel', status: 'active', brandId: 'brand-1', shopId: 'shop-1' }],
    campaigns: [{ id: 'campaign', status: 'open', brandId: 'brand-1' }],
    collections: [{ id: 'collection', status: 'published', brandId: 'brand-1', campaignId: 'campaign' }],
  }, ['shop-other']);
  assert.deepEqual(Array.from(result), []);
});

test('selection contexts require an owned shop cycle, active relationship, open matching showroom and accepted future invitation', () => {
  const contexts = loadContexts();
  const now = '2026-07-31T12:00:00.000Z';
  const workspace = {
    relationships: [
      { id: 'rel-valid', status: 'active', brandId: 'brand-1', shopId: 'shop-1' },
      { id: 'rel-inactive', status: 'revoked', brandId: 'brand-2', shopId: 'shop-1' },
    ],
    cycles: [
      { id: 'cycle-valid', stage: 'showroom', brandId: 'brand-1', shopId: 'shop-1', collectionId: 'collection-1' },
      { id: 'cycle-wrong-stage', stage: 'selection', brandId: 'brand-1', shopId: 'shop-1', collectionId: 'collection-1' },
      { id: 'cycle-other-shop', stage: 'showroom', brandId: 'brand-1', shopId: 'shop-2', collectionId: 'collection-1' },
      { id: 'cycle-revoked', stage: 'showroom', brandId: 'brand-2', shopId: 'shop-1', collectionId: 'collection-2' },
    ],
    showrooms: [
      { id: 'showroom-valid', status: 'open', brandId: 'brand-1', collectionId: 'collection-1' },
      { id: 'showroom-wrong-collection', status: 'open', brandId: 'brand-1', collectionId: 'collection-other' },
      { id: 'showroom-closed', status: 'draft', brandId: 'brand-1', collectionId: 'collection-1' },
    ],
    invitations: [
      { id: 'invitation-valid', status: 'accepted', showroomId: 'showroom-valid', brandId: 'brand-1', shopId: 'shop-1', expiresAt: '2026-08-01T12:00:00.000Z' },
      { id: 'invitation-expired', status: 'accepted', showroomId: 'showroom-wrong-collection', brandId: 'brand-1', shopId: 'shop-1', expiresAt: '2026-07-30T12:00:00.000Z' },
      { id: 'invitation-pending', status: 'pending', showroomId: 'showroom-valid', brandId: 'brand-1', shopId: 'shop-1', expiresAt: '2026-08-01T12:00:00.000Z' },
    ],
  };

  const result = Array.from(contexts.buildSelectionContexts(workspace, ['shop-1'], now));
  assert.equal(result.length, 1);
  assert.deepEqual({ ...result[0] }, {
    id: 'cycle-valid|showroom-valid|invitation-valid',
    cycleId: 'cycle-valid',
    showroomId: 'showroom-valid',
    invitationId: 'invitation-valid',
    brandId: 'brand-1',
    shopId: 'shop-1',
    collectionId: 'collection-1',
  });
});

test('invitation expiring exactly now is not considered valid', () => {
  const contexts = loadContexts();
  const now = '2026-07-31T12:00:00.000Z';
  const result = contexts.buildSelectionContexts({
    relationships: [{ id: 'rel', status: 'active', brandId: 'brand', shopId: 'shop' }],
    cycles: [{ id: 'cycle', stage: 'showroom', brandId: 'brand', shopId: 'shop', collectionId: 'collection' }],
    showrooms: [{ id: 'showroom', status: 'open', brandId: 'brand', collectionId: 'collection' }],
    invitations: [{ id: 'invitation', status: 'accepted', showroomId: 'showroom', brandId: 'brand', shopId: 'shop', expiresAt: now }],
  }, ['shop'], now);
  assert.deepEqual(Array.from(result), []);
});

test('missing workspace arrays return immutable empty context lists', () => {
  const contexts = loadContexts();
  const cycles = contexts.buildCycleContexts({}, []);
  const selections = contexts.buildSelectionContexts({}, [], '2026-07-31T12:00:00.000Z');
  assert.deepEqual(Array.from(cycles), []);
  assert.deepEqual(Array.from(selections), []);
  assert.equal(Object.isFrozen(cycles), true);
  assert.equal(Object.isFrozen(selections), true);
});
