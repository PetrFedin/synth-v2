import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresSynthaV2Runtime } from '../src/runtime/postgres-syntha-v2-runtime.mjs';

test('SYNTH-V2 runtime exposes complete economics service, route bundle and OpenAPI', () => {
  const pool = {
    connect: async () => { throw new Error('not used in composition test'); },
    query: async () => { throw new Error('not used in composition test'); },
  };
  const runtime = createPostgresSynthaV2Runtime({ pool, nextId: (prefix) => `${prefix}-test` });

  assert.equal(typeof runtime.orderEconomics.getOrderEconomicsPositionForActor, 'function');
  assert.equal(typeof runtime.orderEconomics.getOrderMarginBridgeForActor, 'function');
  assert.ok(runtime.orderEconomicsRoutes.some((route) => route.method === 'GET' && route.pattern.test('/v2/orders/ORDER-1/margin-bridge')));
  assert.ok(runtime.openApi.paths['/orders/{orderId}/margin-bridge']);
  assert.ok(runtime.openApi.paths['/orders/{orderId}/economics-position']);
  assert.ok(Object.isFrozen(runtime));
});
