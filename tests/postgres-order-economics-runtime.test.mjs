import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresOrderEconomicsRuntime } from '../src/runtime/postgres-order-economics-runtime.mjs';

test('order economics runtime composes mutation, position and margin bridge services', () => {
  const pool = {
    connect: async () => { throw new Error('not used in composition test'); },
    query: async () => { throw new Error('not used in composition test'); },
  };
  const runtime = createPostgresOrderEconomicsRuntime({ pool, nextId: (prefix) => `${prefix}-test` });

  for (const method of [
    'createSupplyCommitment',
    'createFxRateSnapshot',
    'recordActualCost',
    'correctActualCost',
    'actualizeLandedCost',
    'actualizeMargin',
    'evaluateCostCloseReadiness',
    'closeCost',
    'recordPostCloseAdjustment',
    'getOrderEconomicsPositionForActor',
    'getOrderMarginBridgeForActor',
  ]) {
    assert.equal(typeof runtime.service[method], 'function', `missing order economics runtime method ${method}`);
  }
  assert.ok(Object.isFrozen(runtime));
  assert.ok(Object.isFrozen(runtime.service));
});
