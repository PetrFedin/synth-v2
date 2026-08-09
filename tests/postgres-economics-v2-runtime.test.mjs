import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresEconomicsV2Runtime } from '../src/runtime/postgres-economics-v2-runtime.mjs';

test('economics runtime composes order economics, margin bridge and SKU cost allocation', () => {
  const pool = {
    connect: async () => { throw new Error('not used in composition test'); },
    query: async () => { throw new Error('not used in composition test'); },
  };
  const runtime = createPostgresEconomicsV2Runtime({ pool, nextId: (prefix) => `${prefix}-test` });

  assert.equal(typeof runtime.orderEconomics.getOrderEconomicsPositionForActor, 'function');
  assert.equal(typeof runtime.orderEconomics.getOrderMarginBridgeForActor, 'function');
  assert.equal(typeof runtime.costAllocation.createPolicyVersion, 'function');
  assert.equal(typeof runtime.costAllocation.allocateLandedCost, 'function');
  assert.ok(runtime.routes.some((route) => route.pattern.test('/v2/orders/ORDER-1/margin-bridge')));
  assert.ok(runtime.routes.some((route) => route.pattern.test('/v2/orders/ORDER-1/cost-allocation-runs')));
  assert.ok(runtime.openApi.paths['/orders/{orderId}/cost-allocation-runs']);
  assert.ok(Object.isFrozen(runtime));
});
