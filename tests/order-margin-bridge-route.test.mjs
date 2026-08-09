import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderMarginBridgeRoutes } from '../src/http/order-margin-bridge-routes.mjs';

test('margin bridge route forwards actor and order identity to read-only service', async () => {
  const calls = [];
  const expected = { orderId: 'ORDER-1', status: 'ADJUSTED', cumulativePostCloseCostDelta: 30 };
  const routes = createOrderMarginBridgeRoutes({
    orderMarginBridge: {
      getOrderMarginBridgeForActor: async (...args) => { calls.push(args); return expected; },
    },
  });
  const route = routes[0];
  const result = await route.execute({ actorId: 'USER-1', params: ['ORDER-1'], query: {} });

  assert.equal(route.method, 'GET');
  assert.equal(route.mutation, false);
  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [['USER-1', 'ORDER-1']]);
});

test('margin bridge route rejects unknown query parameters', () => {
  const route = createOrderMarginBridgeRoutes({
    orderMarginBridge: { getOrderMarginBridgeForActor: async () => ({}) },
  })[0];
  assert.throws(
    () => route.execute({ actorId: 'USER-1', params: ['ORDER-1'], query: { latest: 'true' } }),
    (error) => error?.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
});
