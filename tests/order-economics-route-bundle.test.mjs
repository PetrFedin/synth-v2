import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsRouteBundle } from '../src/http/order-economics-route-bundle.mjs';

const service = new Proxy({}, { get: () => async () => ({}) });

test('order economics route bundle contains margin bridge beside the existing economics endpoints', () => {
  const routes = createOrderEconomicsRouteBundle({ orderEconomics: service });
  const signatures = routes.map((route) => `${route.method} ${route.pattern}`);

  assert.ok(signatures.some((value) => value.includes('economics-position')));
  assert.ok(signatures.some((value) => value.includes('cost-close')));
  assert.ok(signatures.some((value) => value.includes('margin-bridge')));
  assert.equal(routes.filter((route) => route.method === 'GET' && route.pattern.test('/v2/orders/ORDER-1/margin-bridge')).length, 1);
  assert.ok(Object.isFrozen(routes));
});
