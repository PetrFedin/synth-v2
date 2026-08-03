import assert from 'node:assert/strict';
import test from 'node:test';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function fixture() {
  const calls = [];
  const materials = {
    async pageForActor(actorId, query) { calls.push(['page', actorId, query]); return { items: [], nextCursor: null }; },
    async getForActor(actorId, code) { calls.push(['get', actorId, code]); return { code }; },
    async createMaterial(commandId, actorId, body) { calls.push(['create', commandId, actorId, body]); return body; },
    async updateMaterial(commandId, actorId, code, body) { calls.push(['update', commandId, actorId, code, body]); return { code, ...body }; },
    async publishMaterial(commandId, actorId, code, body) { calls.push(['publish', commandId, actorId, code, body]); return { code, status: 'published' }; },
  };
  const inert = new Proxy({}, { get: () => async () => ({}) });
  return {
    calls,
    routes: createWholesaleRoutes({ platform: inert, catalog: inert, materials, partners: inert, collaboration: inert, orders: inert, notifications: inert, workspace: inert }),
  };
}

const createBody = {
  code: 'FAB-001', brandId: 'brand-1', name: 'Italian wool', type: 'fabric', unit: 'm',
  supplierName: 'Mill One', supplierReference: null, composition: '100% wool', color: 'Black',
  currency: 'EUR', unitCost: 18.25, minimumOrderQuantity: 50, availableQuantity: 120,
};

test('material routes expose bounded reads and all governed mutations', async () => {
  const { routes, calls } = fixture();
  const page = matchWholesaleRoute(routes, 'GET', '/v2/materials');
  await page.execute({ actorId: 'user-1', query: { limit: '50', type: 'fabric' }, params: page.params });
  const detail = matchWholesaleRoute(routes, 'GET', '/v2/materials/FAB-001');
  await detail.execute({ actorId: 'user-1', query: {}, params: detail.params });
  const create = matchWholesaleRoute(routes, 'POST', '/v2/materials');
  await create.execute({ actorId: 'user-1', commandId: 'cmd-1', body: createBody, query: {}, params: create.params });
  const update = matchWholesaleRoute(routes, 'PATCH', '/v2/materials/FAB-001');
  await update.execute({ actorId: 'user-1', commandId: 'cmd-2', body: { expectedVersion: 1, ...Object.fromEntries(Object.entries(createBody).filter(([key]) => !['code', 'brandId'].includes(key))) }, query: {}, params: update.params });
  const publish = matchWholesaleRoute(routes, 'POST', '/v2/materials/FAB-001/publish');
  await publish.execute({ actorId: 'user-1', commandId: 'cmd-3', body: { expectedVersion: 2 }, query: {}, params: publish.params });
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'update', 'publish']);
  assert.equal(create.mutation, true);
  assert.equal(page.mutation, false);
});

test('material route contracts reject unsupported query and body fields before services', () => {
  const { routes, calls } = fixture();
  const page = matchWholesaleRoute(routes, 'GET', '/v2/materials');
  assert.throws(() => page.execute({ actorId: 'user-1', query: { supplierId: 'hidden' }, params: page.params }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  const create = matchWholesaleRoute(routes, 'POST', '/v2/materials');
  assert.throws(() => create.execute({ actorId: 'user-1', commandId: 'cmd-1', body: { ...createBody, reservedQuantity: 10 }, query: {}, params: create.params }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.equal(calls.length, 0);
});
