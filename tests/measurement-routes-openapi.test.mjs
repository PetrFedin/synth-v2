import assert from 'node:assert/strict';
import test from 'node:test';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture() {
  const calls = [];
  const measurements = {
    pageForActor: async (actorId, query) => { calls.push(['page', actorId, query]); return { items: [], nextCursor: null }; },
    getForActor: async (actorId, sku) => { calls.push(['get', actorId, sku]); return { sku }; },
    createMeasurementChart: async (commandId, actorId, body) => { calls.push(['create', commandId, actorId, body]); return body; },
    updateMeasurementChart: async (commandId, actorId, sku, body) => { calls.push(['update', commandId, actorId, sku, body]); return { sku, ...body }; },
    publishMeasurementChart: async (commandId, actorId, sku, body) => { calls.push(['publish', commandId, actorId, sku, body]); return { sku, status: 'published', ...body }; },
  };
  const inert = new Proxy({}, { get: () => async () => ({}) });
  return { calls, routes: createWholesaleRoutes({ platform: inert, catalog: inert, materials: inert, boms: inert, measurements, partners: inert, collaboration: inert, orders: inert, notifications: inert, workspace: inert }) };
}
const editable = {
  unit: 'cm', baseSizeCode: 'M', sizes: [{ code: 'S', label: 'Small' }, { code: 'M', label: 'Medium' }],
  points: [{ pointCode: 'CHEST', name: 'Half chest', description: null, toleranceMinus: 0.5, tolerancePlus: 0.5, measurements: [{ sizeCode: 'S', value: 48 }, { sizeCode: 'M', value: 51 }] }],
  notes: null,
};

test('Measurement routes expose bounded reads and governed mutations', async () => {
  const { routes, calls } = fixture();
  const page = matchWholesaleRoute(routes, 'GET', '/v2/measurements');
  await page.execute({ actorId: 'sales-user', query: { limit: '50', status: 'published', unit: 'cm' }, params: page.params });
  const detail = matchWholesaleRoute(routes, 'GET', '/v2/measurements/STYLE-001');
  await detail.execute({ actorId: 'sales-user', query: {}, params: detail.params });
  const create = matchWholesaleRoute(routes, 'POST', '/v2/measurements');
  await create.execute({ actorId: 'owner-user', commandId: 'cmd-1', body: { sku: 'STYLE-001', ...editable }, query: {}, params: create.params });
  const update = matchWholesaleRoute(routes, 'PATCH', '/v2/measurements/STYLE-001');
  await update.execute({ actorId: 'owner-user', commandId: 'cmd-2', body: { expectedVersion: 1, ...editable }, query: {}, params: update.params });
  const publish = matchWholesaleRoute(routes, 'POST', '/v2/measurements/STYLE-001/publish');
  await publish.execute({ actorId: 'owner-user', commandId: 'cmd-3', body: { expectedVersion: 2 }, query: {}, params: publish.params });
  assert.deepEqual(calls.map((call) => call[0]), ['page', 'get', 'create', 'update', 'publish']);
});

test('transport rejects derived fields at every measurement matrix level', () => {
  const { routes, calls } = fixture();
  const create = matchWholesaleRoute(routes, 'POST', '/v2/measurements');
  assert.throws(() => create.execute({ actorId: 'owner-user', commandId: 'cmd-top', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, skuVersion: 9 } }), { code: 'HTTP_BODY_FIELD_UNKNOWN' });
  assert.throws(() => create.execute({ actorId: 'owner-user', commandId: 'cmd-size', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, sizes: [{ ...editable.sizes[0], position: 1 }] } }), (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.field === 'sizes' && error.details?.index === 0);
  assert.throws(() => create.execute({ actorId: 'owner-user', commandId: 'cmd-point', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, points: [{ ...editable.points[0], baseValue: 51 }] } }), (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.field === 'points' && error.details?.index === 0);
  assert.throws(() => create.execute({ actorId: 'owner-user', commandId: 'cmd-value', query: {}, params: create.params, body: { sku: 'STYLE-001', ...editable, points: [{ ...editable.points[0], measurements: [{ sizeCode: 'M', value: 51, deltaFromPrevious: 3 }] }] } }), (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.pointIndex === 0 && error.details?.valueIndex === 0);
  assert.equal(calls.length, 0);
});

test('the authoritative 1.13 document preserves governed Measurement revision semantics', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.13.0');
  assert.ok(specification.paths['/materials'].get);
  assert.ok(specification.paths['/boms'].post);
  assert.ok(specification.paths['/measurements'].get);
  const update = specification.paths['/measurements/{sku}'].patch;
  assert.ok(update);
  assert.match(update.description, /atomically archives/);
  assert.equal(update['x-syntha-published-transition'], 'archive-published-snapshot-and-open-draft-revision');
  assert.match(specification.components.schemas.MeasurementChartUpdate.description, /governed draft revision/);
  assert.ok(specification.paths['/measurements/{sku}/publish'].post);
  assert.equal(specification.components.schemas.MeasurementChartCreate.additionalProperties, false);
  assert.equal(specification.components.schemas.MeasurementValueInput.properties.deltaFromPrevious, undefined);
  assert.equal(Object.isFrozen(specification), true);
});
