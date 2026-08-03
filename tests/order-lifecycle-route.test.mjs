import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function routes(orders) {
  return createWholesaleRoutes({ platform: {}, catalog: {}, partners: {}, collaboration: {}, orders, notifications: {}, workspace: {} });
}

const terms = Object.freeze({ incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' });

async function execute(method, path, body, orders) {
  const route = matchWholesaleRoute(routes(orders), method, path);
  assert.ok(route);
  return route.execute({ commandId: 'command-1', actorId: 'actor-1', body, query: {}, params: route.params });
}

test('order lifecycle routes forward expectedVersion to every mutation', async () => {
  const calls = [];
  const orders = {
    reviseTerms: (...args) => { calls.push(['revise', ...args]); return {}; },
    acceptTerms: (...args) => { calls.push(['accept', ...args]); return {}; },
    attachOrderToCycle: (...args) => { calls.push(['attach', ...args]); return {}; },
    cancelOrder: (...args) => { calls.push(['cancel', ...args]); return {}; },
  };
  await execute('PATCH', '/v2/orders/order-1/terms', { expectedVersion: 4, terms }, orders);
  await execute('POST', '/v2/orders/order-1/accept', { organisationId: 'shop-1', expectedVersion: 5 }, orders);
  await execute('POST', '/v2/orders/order-1/attach', { expectedVersion: 6 }, orders);
  await execute('POST', '/v2/orders/order-1/cancel', { reason: 'Cancelled by buyer', expectedVersion: 7 }, orders);
  assert.deepEqual(calls, [
    ['revise', 'command-1', 'actor-1', { orderId: 'order-1', expectedVersion: 4, terms }],
    ['accept', 'command-1', 'actor-1', { organisationId: 'shop-1', expectedVersion: 5, orderId: 'order-1' }],
    ['attach', 'command-1', 'actor-1', { orderId: 'order-1', expectedVersion: 6 }],
    ['cancel', 'command-1', 'actor-1', { orderId: 'order-1', reason: 'Cancelled by buyer', expectedVersion: 7 }],
  ]);
});

test('order lifecycle routes reject undeclared fields before service execution', async () => {
  let called = false;
  const orders = { acceptTerms() { called = true; } };
  await assert.rejects(
    () => execute('POST', '/v2/orders/order-1/accept', { organisationId: 'shop-1', expectedVersion: 1, force: true }, orders),
    error => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
  assert.equal(called, false);
});
