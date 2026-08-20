import assert from 'node:assert/strict';
import test from 'node:test';
import { createWholesaleRoutes, matchWholesaleRoute } from '../src/http/routes.mjs';

function canonicalBody() {
  return {
    styleVersionId: 'style-version:1',
    colorwayId: 'colorway:black',
    sizeScaleVersionId: 'scale-version:ru',
    measurementUnitEntryId: 'mdm:unit:cm',
    baseSizeValueId: 'size:46',
    sizes: [{ sizeValueId: 'size:44' }, { sizeValueId: 'size:46' }],
    points: [{
      pointEntryId: 'mdm:pom:chest',
      description: 'Измерять горизонтально по линии груди',
      toleranceMinus: 0.5,
      tolerancePlus: 0.5,
      measurements: [{ sizeValueId: 'size:44', value: 88 }, { sizeValueId: 'size:46', value: 92 }],
    }],
    notes: 'Основная таблица мер',
  };
}

function harness() {
  const calls = [];
  const measurements = {
    pageForActor: async () => null,
    getForActor: async () => null,
    createMeasurementChart: async () => null,
    updateMeasurementChart: async () => null,
    publishMeasurementChart: async () => null,
    getCanonicalForActor: async (...args) => { calls.push(['get', ...args]); return { id: args[1] }; },
    createCanonicalMeasurementChart: async (...args) => { calls.push(['create', ...args]); return { id: 'measurement:1' }; },
    updateCanonicalMeasurementChart: async (...args) => { calls.push(['update', ...args]); return { id: args[2] }; },
    publishCanonicalMeasurementChart: async (...args) => { calls.push(['publish', ...args]); return { id: args[2], status: 'published' }; },
  };
  const routes = createWholesaleRoutes({
    platform: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {}, measurements,
  });
  return { routes, calls };
}

function route(routes, method, pathname) {
  const matched = matchWholesaleRoute(routes, method, pathname);
  assert.ok(matched, `${method} ${pathname} must resolve`);
  return matched;
}

test('canonical Measurement routes stay inside the existing measurements resource', async () => {
  const h = harness();
  const create = route(h.routes, 'POST', '/v2/measurements/canonical');
  await create.execute({ commandId: 'cmd:create', actorId: 'user:1', body: canonicalBody(), query: {}, params: create.params });

  const get = route(h.routes, 'GET', '/v2/measurements/canonical/measurement%3A1');
  await get.execute({ actorId: 'user:1', query: {}, params: get.params });

  const update = route(h.routes, 'PATCH', '/v2/measurements/canonical/measurement%3A1');
  const updateBody = { ...canonicalBody(), expectedVersion: 1 };
  delete updateBody.styleVersionId;
  delete updateBody.colorwayId;
  delete updateBody.sizeScaleVersionId;
  await update.execute({ commandId: 'cmd:update', actorId: 'user:1', body: updateBody, query: {}, params: update.params });

  const publish = route(h.routes, 'POST', '/v2/measurements/canonical/measurement%3A1/publish');
  await publish.execute({ commandId: 'cmd:publish', actorId: 'user:1', body: { expectedVersion: 2 }, query: {}, params: publish.params });

  assert.deepEqual(h.calls.map(([kind]) => kind), ['create', 'get', 'update', 'publish']);
  assert.equal(h.calls[1][2], 'measurement:1');
  assert.equal(h.calls[2][3], 'measurement:1');
  assert.equal(h.calls[3][3], 'measurement:1');
});

test('canonical HTTP contract rejects free-form unit, POM code/name and legacy size codes', async () => {
  const h = harness();
  const create = route(h.routes, 'POST', '/v2/measurements/canonical');

  await assert.rejects(
    Promise.resolve().then(() => create.execute({ commandId: 'cmd:unit', actorId: 'user:1', body: { ...canonicalBody(), unit: 'in' }, query: {}, params: create.params })),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error?.details?.unknownFields?.includes('unit'),
  );

  const withPointCode = canonicalBody();
  withPointCode.points[0].pointCode = 'FREE_FORM';
  await assert.rejects(
    Promise.resolve().then(() => create.execute({ commandId: 'cmd:point', actorId: 'user:1', body: withPointCode, query: {}, params: create.params })),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error?.details?.unknownFields?.includes('pointCode'),
  );

  const withName = canonicalBody();
  withName.points[0].name = 'Free form';
  await assert.rejects(
    Promise.resolve().then(() => create.execute({ commandId: 'cmd:name', actorId: 'user:1', body: withName, query: {}, params: create.params })),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error?.details?.unknownFields?.includes('name'),
  );

  const withLegacySize = canonicalBody();
  withLegacySize.sizes[0].code = '44';
  await assert.rejects(
    Promise.resolve().then(() => create.execute({ commandId: 'cmd:size', actorId: 'user:1', body: withLegacySize, query: {}, params: create.params })),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN' && error?.details?.unknownFields?.includes('code'),
  );
});

test('canonical route does not get swallowed by legacy /measurements/:sku route', () => {
  const h = harness();
  const canonical = route(h.routes, 'POST', '/v2/measurements/canonical');
  const legacy = route(h.routes, 'GET', '/v2/measurements/canonical');
  assert.equal(canonical.mutation, true);
  assert.equal(legacy.mutation, false);
  assert.deepEqual(legacy.params, ['canonical']);
});
