import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function routes(catalog) {
  return createWholesaleRoutes({
    platform: {},
    catalog,
    partners: {},
    collaboration: {},
    orders: {},
    notifications: {},
    workspace: {},
  });
}

test('catalog page route forwards only declared actor-scoped query fields', async () => {
  const calls = [];
  const route = matchWholesaleRoute(routes({
    async pageForActor(actorId, query) { calls.push({ actorId, query }); return { items: [], nextCursor: null }; },
  }), 'GET', '/v2/catalog/skus');
  assert.ok(route);
  const result = await route.execute({
    actorId: 'actor_1',
    query: { limit: '25', cursor: 'opaque', q: 'dress', status: 'published', brandId: 'brand_1', collectionId: 'collection_1' },
  });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.deepEqual(calls, [{
    actorId: 'actor_1',
    query: { limit: '25', cursor: 'opaque', q: 'dress', status: 'published', brandId: 'brand_1', collectionId: 'collection_1' },
  }]);
});

test('catalog page route rejects unknown query fields before service invocation', async () => {
  let called = false;
  const route = matchWholesaleRoute(routes({
    async pageForActor() { called = true; },
  }), 'GET', '/v2/catalog/skus');
  await assert.rejects(
    () => route.execute({ actorId: 'actor_1', query: { offset: '20' } }),
    (error) => error?.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
  assert.equal(called, false);
});

test('catalog detail route decodes and forwards the SKU under actor scope', async () => {
  const calls = [];
  const route = matchWholesaleRoute(routes({
    async getForActor(actorId, sku) { calls.push({ actorId, sku }); return { sku }; },
  }), 'GET', '/v2/catalog/skus/SKU-1');
  const result = await route.execute({ actorId: 'actor_1', query: {}, params: route.params });
  assert.deepEqual(result, { sku: 'SKU-1' });
  assert.deepEqual(calls, [{ actorId: 'actor_1', sku: 'SKU-1' }]);
});
