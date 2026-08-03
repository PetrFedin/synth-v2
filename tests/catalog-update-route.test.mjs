import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function routes(catalog) {
  return createWholesaleRoutes({ platform: {}, catalog, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {} });
}

const body = Object.freeze({
  expectedVersion: 4,
  name: 'Updated Jacket',
  wholesalePrice: 99.5,
  minimumOrderQuantity: 3,
  availableQuantity: 20,
});

test('catalog PATCH route forwards the decoded SKU and strict update body', async () => {
  const calls = [];
  const route = matchWholesaleRoute(routes({
    async updateSku(...args) { calls.push(args); return { sku: args[2], version: 5 }; },
  }), 'PATCH', '/v2/catalog/skus/SKU%2D1');
  assert.ok(route);
  const result = await route.execute({ commandId: 'command-1', actorId: 'sales-1', params: route.params, query: {}, body });
  assert.deepEqual(result, { sku: 'SKU-1', version: 5 });
  assert.deepEqual(calls, [['command-1', 'sales-1', 'SKU-1', body]]);
});

test('catalog PATCH route rejects identity and unknown fields before service invocation', async () => {
  let called = false;
  const route = matchWholesaleRoute(routes({ async updateSku() { called = true; } }), 'PATCH', '/v2/catalog/skus/SKU-1');
  assert.throws(
    () => route.execute({ commandId: 'command-1', actorId: 'sales-1', params: route.params, query: {}, body: { ...body, collectionId: 'collection-2' } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.unknownFields?.[0] === 'collectionId',
  );
  assert.equal(called, false);
});

test('catalog publish route forwards the expected version body', async () => {
  const calls = [];
  const route = matchWholesaleRoute(routes({
    async publishSku(...args) { calls.push(args); return { sku: args[2], status: 'published' }; },
  }), 'POST', '/v2/catalog/skus/SKU-1/publish');
  const request = { expectedVersion: 7 };
  const result = await route.execute({ commandId: 'command-2', actorId: 'sales-1', params: route.params, query: {}, body: request });
  assert.equal(result.status, 'published');
  assert.deepEqual(calls, [['command-2', 'sales-1', 'SKU-1', request]]);
});
