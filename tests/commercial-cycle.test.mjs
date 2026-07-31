import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { advanceCommercialCycle, attachOrder, createCommercialCycle } from '../src/modules/commercial-cycle/public.mjs';

const now = '2026-07-30T20:00:00.000Z';
const campaign = Object.freeze({ id: 'campaign-1', brandId: 'b1', status: 'open' });
const collection = Object.freeze({ id: 'collection-1', campaignId: 'campaign-1', brandId: 'b1', status: 'published' });

test('commercial lifecycle advances only one stage at a time', () => {
  const cycle = createCommercialCycle({ id: 'c1', brandId: 'b1', shopId: 's1', campaign, collection, createdAt: now });
  assert.equal(advanceCommercialCycle(cycle, 'collection', now).stage, 'collection');
  assert.throws(() => advanceCommercialCycle(cycle, 'showroom', now), (error) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, 'STAGE_TRANSITION_INVALID');
    return true;
  });
});

test('order total must reconcile with order lines', () => {
  let cycle = createCommercialCycle({ id: 'c1', brandId: 'b1', shopId: 's1', campaign, collection, createdAt: now });
  for (const stage of ['collection', 'showroom', 'selection', 'order-builder', 'order']) cycle = advanceCommercialCycle(cycle, stage, now);
  assert.throws(() => attachOrder(cycle, {
    id: 'o1', currency: 'EUR', totalAmount: 500, lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 100 }],
  }, now), (error) => error.code === 'ORDER_TOTAL_MISMATCH');
});
