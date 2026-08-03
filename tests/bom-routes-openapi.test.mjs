import assert from 'node:assert/strict';
import test from 'node:test';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';
import { withBomOpenApi } from '../src/http/bom-openapi.mjs';
import { withMaterialOpenApi } from '../src/http/material-openapi.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

function fixture() {
  const calls = [];
  const boms = {
    pageForActor: async (actorId, query) => { calls.push(['page', actorId, query]); return { items: [], nextCursor: null }; },
    getForActor: async (actorId, sku) => { calls.push(['get', actorId, sku]); return { sku }; },
    createBom: async (commandId, actorId, body) => { calls.push(['create', commandId, actorId, body]); return body; },
    updateBom: async (commandId, actorId, sku, body) => { calls.push(['update', commandId, actorId, sku, body]); return { sku, ...body }; },
    publishBom: async (commandId, actorId, sku, body) => { calls.push(['publish', commandId, actorId, sku, body]); return { sku, status: 'published' }; },
  };
  const inert = new Proxy({}, { get: () => async () => ({}) });
  return { calls, routes: createWholesaleRoutes({ platform: inert, catalog: inert, materials: inert, boms, partners: inert, collaboration: inert, orders: inert, notifications: inert, workspace: inert }) };
}
const editable = {
  currency: 'EUR', lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: 'FAB-001', quantity: 2, wastePercent: 10, exchangeRate: 1 }],
  laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, notes: null,
};

test('BOM routes expose bounded reads and governed mutations', async () => {
  const { routes, calls } = fixture();
  const page = matchWholesaleRoute(routes, 'GET', '/v2/boms');
  await page.execute({ actorId: 'user-1', query: { limit: '50', status: 'draft' }, params: page.params });
  const detail = matchWholesaleRoute(routes, 'GET', '/v2/boms/STYLE-001');
  await detail.execute({ actorId: 'user-1', query: {}, params: detail.params });
  const create = matchWholesaleRoute(routes, 'POST', '/v2/boms');
  await create.execute({ actorId: 'user-1', commandId: 'cmd-1', body: { sku: 'STYLE-001', ...editable }, query: {}, params: create.params });
  const update = matchWholesaleRoute(routes, 'PATCH', '/v2/boms/STYLE-001');
  await update.execute({ actorId: 'user-1', commandId: 'cmd-2', body: { expectedVersion: 1, ...editable }, query: {}, params: update.params });
  const publish = matchWholesaleRoute(routes, 'POST', '/v2/boms/STYLE-001/publish');
  await publish.execute({ actorId: 'user-1', commandId: 'cmd-3', body: { expectedVersion: 2 }, query: {}, params: publish.params });
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'update', 'publish']);
});

test('route contract blocks top-level and nested snapshot injection before service', () => {
  const { routes, calls } = fixture();
  const create = matchWholesaleRoute(routes, 'POST', '/v2/boms');
  assert.throws(() => create.execute({ actorId: 'user-1', commandId: 'cmd-1', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, totalCost: 0.01 } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.throws(
    () => create.execute({ actorId: 'user-1', commandId: 'cmd-2', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, lines: [{ ...editable.lines[0], unitCostSnapshot: 0.01 }] } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.field === 'lines' && error.details?.index === 0,
  );
  assert.equal(calls.length, 0);
});

test('OpenAPI exposes strict complete BOM snapshots', () => {
  const specification = withBomOpenApi(withMaterialOpenApi(wholesaleV2OpenApi));
  assert.equal(specification.info.version, '1.9.0');
  assert.ok(specification.paths['/boms'].get);
  assert.ok(specification.paths['/boms'].post);
  assert.ok(specification.paths['/boms/{sku}'].patch);
  assert.ok(specification.paths['/boms/{sku}/publish'].post);
  assert.equal(specification.components.schemas.BomCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.BomCreate.required.includes('laborCost'), true);
  assert.equal(specification.components.schemas.BomUpdate.required.includes('notes'), true);
  assert.equal(specification.components.schemas.BomLineInput.properties.unitCostSnapshot, undefined);
  assert.equal(Object.isFrozen(specification), true);
});
