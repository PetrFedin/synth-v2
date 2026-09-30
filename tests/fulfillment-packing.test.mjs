import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePackingStatus } from '../src/modules/fulfillment-packing/public.mjs';

const base = { fulfillmentPlanId: 'plan-1', brandId: 'brand-1', actorId: 'brand-sales', updatedAt: '2026-09-30T00:00:00.000Z' };

test('packing status moves forward: none -> packing -> packed', () => {
  const started = advancePackingStatus({ ...base, currentStatus: null, nextStatus: 'packing' });
  assert.equal(started.status, 'packing');
  const packed = advancePackingStatus({ ...base, currentStatus: 'packing', nextStatus: 'packed' });
  assert.equal(packed.status, 'packed');
});

test('packing status cannot skip straight to packed', () => {
  assert.throws(
    () => advancePackingStatus({ ...base, currentStatus: null, nextStatus: 'packed' }),
    (error) => error.code === 'FULFILLMENT_PACKING_TRANSITION_INVALID',
  );
});

test('packing status cannot move backward', () => {
  assert.throws(
    () => advancePackingStatus({ ...base, currentStatus: 'packed', nextStatus: 'packing' }),
    (error) => error.code === 'FULFILLMENT_PACKING_TRANSITION_INVALID',
  );
});

test('packed is a dead end', () => {
  assert.throws(
    () => advancePackingStatus({ ...base, currentStatus: 'packed', nextStatus: 'packed' }),
    (error) => error.code === 'FULFILLMENT_PACKING_TRANSITION_INVALID',
  );
});
