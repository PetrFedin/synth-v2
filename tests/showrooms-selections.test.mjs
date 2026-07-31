import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowroom, openShowroom } from '../src/modules/showrooms/public.mjs';
import { createSelection, submitSelection, upsertSelectionLine } from '../src/modules/selections/public.mjs';

const now = '2026-07-30T20:00:00.000Z';
const collection = Object.freeze({ id: 'collection-1', campaignId: 'campaign-1', brandId: 'brand-1', status: 'published' });

test('showroom requires a published collection and valid dates', () => {
  assert.throws(() => createShowroom({
    id: 'showroom-1', collection: { ...collection, status: 'draft' }, brandId: 'brand-1', name: 'Main',
    opensAt: '2027-01-01T00:00:00.000Z', closesAt: '2027-01-10T00:00:00.000Z', createdAt: now,
  }), (error) => error.code === 'COLLECTION_NOT_PUBLISHED');
  const showroom = createShowroom({
    id: 'showroom-1', collection, brandId: 'brand-1', name: 'Main',
    opensAt: '2027-01-01T00:00:00.000Z', closesAt: '2027-01-10T00:00:00.000Z', createdAt: now,
  });
  assert.equal(openShowroom(showroom, collection, now).status, 'open');
});

test('selection upsert is deterministic and submission requires trusted catalog lines', () => {
  const showroom = Object.freeze({ id: 'showroom-1', collectionId: 'collection-1', brandId: 'brand-1', status: 'open' });
  const cycle = Object.freeze({ id: 'cycle-1', collectionId: 'collection-1', brandId: 'brand-1', shopId: 'shop-1', stage: 'showroom' });
  const selection = createSelection({ id: 'selection-1', cycle, showroom, createdAt: now });
  assert.throws(() => submitSelection(selection, now), (error) => error.code === 'SELECTION_LINES_REQUIRED');
  const trusted = { sku: 'SKU-1', quantity: 2, unitPrice: 100, currency: 'EUR', catalogVersion: 2 };
  const withLine = upsertSelectionLine(selection, trusted, 'buyer-1', now);
  const replaced = upsertSelectionLine(withLine, { ...trusted, quantity: 3 }, 'buyer-1', now);
  assert.equal(replaced.lines.length, 1);
  assert.equal(replaced.lines[0].quantity, 3);
  assert.equal(replaced.lines[0].catalogVersion, 2);
  assert.equal(submitSelection(replaced, now).status, 'submitted');
});
