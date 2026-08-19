import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { canonicalJson } from '../src/core/fingerprints.mjs';

function upsertReplayFixture({ membership }) {
  const calls = [];
  const line = Object.freeze({ sku: 'SKU-1', quantity: 2 });
  const previousResult = Object.freeze({
    id: 'selection-1',
    shopId: 'shop-1',
    brandId: 'brand-1',
    collectionId: 'collection-1',
    status: 'draft',
    version: 2,
    lines: Object.freeze([{ sku: 'SKU-1', quantity: 2 }]),
  });
  const store = {
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            actorId: 'buyer-1',
            fingerprint: `upsertSelectionLine:buyer-1:selection-1:${canonicalJson(line)}`,
            result: previousResult,
          });
        },
        async getSelection(id) {
          calls.push(`selection:${id}`);
          return previousResult;
        },
        async getMembership(organisationId, userId) {
          calls.push(`membership:${organisationId}:${userId}`);
          return membership;
        },
        saveSelection() { throw new Error('replay must not save selection'); },
        appendOutbox() { throw new Error('replay must not append outbox'); },
        insertCommand() { throw new Error('replay must not insert command'); },
      });
    },
    async snapshot() { return {}; },
  };
  return { calls, line, previousResult, store };
}

test('revoked buyer cannot retrieve a stored selection result', async () => {
  const fixture = upsertReplayFixture({ membership: undefined });
  let catalogReads = 0;
  const service = createShowroomSelectionService({
    store: fixture.store,
    catalogReader: { async getSku() { catalogReads += 1; return undefined; } },
  });

  await assert.rejects(
    () => service.upsertSelectionLine('command-1', 'buyer-1', 'selection-1', fixture.line),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.equal(catalogReads, 0);
  assert.deepEqual(fixture.calls, [
    'command:command-1',
    'selection:selection-1',
    'membership:shop-1:buyer-1',
  ]);
});

test('authorized selection replay skips mutable catalog validation', async () => {
  const fixture = upsertReplayFixture({
    membership: Object.freeze({
      organisationId: 'shop-1',
      userId: 'buyer-1',
      organisationType: 'shop',
      status: 'active',
      role: 'buyer',
    }),
  });
  let catalogReads = 0;
  const service = createShowroomSelectionService({
    store: fixture.store,
    catalogReader: { async getSku() { catalogReads += 1; throw new Error('catalog must not be read on replay'); } },
  });

  const result = await service.upsertSelectionLine('command-1', 'buyer-1', 'selection-1', fixture.line);

  assert.equal(result, fixture.previousResult);
  assert.equal(catalogReads, 0);
});

test('selection creation replay does not re-run the one-selection-per-cycle mutation guard', async () => {
  const previousResult = Object.freeze({ selection: Object.freeze({ id: 'selection-1' }), cycle: Object.freeze({ id: 'cycle-1' }) });
  const calls = [];
  const store = {
    async transaction(work) {
      return work({
        async getCommand(id) {
          calls.push(`command:${id}`);
          return Object.freeze({
            id,
            actorId: 'buyer-1',
            fingerprint: 'createSelection:buyer-1:cycle-1:showroom-1:legacy',
            result: previousResult,
          });
        },
        async getCycle(id) {
          calls.push(`cycle:${id}`);
          return Object.freeze({ id, brandId: 'brand-1', shopId: 'shop-1' });
        },
        async getShowroom(id) {
          calls.push(`showroom:${id}`);
          return Object.freeze({ id, brandId: 'brand-1' });
        },
        async getMembership() {
          calls.push('membership');
          return Object.freeze({ organisationId: 'shop-1', userId: 'buyer-1', status: 'active', role: 'buyer' });
        },
        async getRelationshipByTrade() {
          calls.push('relationship');
          return Object.freeze({ id: 'relationship-1', brandId: 'brand-1', shopId: 'shop-1', status: 'active' });
        },
        async getShowroomInvitationByAccess() {
          calls.push('invitation');
          return Object.freeze({
            id: 'invitation-1',
            showroomId: 'showroom-1',
            brandId: 'brand-1',
            shopId: 'shop-1',
            status: 'accepted',
            expiresAt: '2027-01-01T00:00:00.000Z',
          });
        },
        getSelectionByCycle() { throw new Error('replay must not evaluate uniqueness guard'); },
        insertSelection() { throw new Error('replay must not insert selection'); },
        saveCycle() { throw new Error('replay must not advance cycle'); },
        appendOutbox() { throw new Error('replay must not append outbox'); },
        insertCommand() { throw new Error('replay must not insert command'); },
      });
    },
    async snapshot() { return {}; },
  };
  const service = createShowroomSelectionService({
    store,
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const result = await service.createSelection('command-1', 'buyer-1', {
    cycleId: 'cycle-1',
    showroomId: 'showroom-1',
  });

  assert.equal(result, previousResult);
  assert.deepEqual(calls, [
    'command:command-1',
    'cycle:cycle-1',
    'showroom:showroom-1',
    'membership',
    'relationship',
    'invitation',
  ]);
});
