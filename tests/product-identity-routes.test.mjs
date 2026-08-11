import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductIdentityRoutes } from '../src/http/product-identity-routes.mjs';

function serviceSpy() {
  const calls = [];
  const proxy = new Proxy({}, { get: (_target, name) => (...args) => { calls.push([name, ...args]); return { ok: name }; } });
  return { service: proxy, calls };
}

function route(routes, method, path) {
  return routes.find((candidate) => candidate.method === method && candidate.pattern.test(path));
}

test('Product Identity routes expose reads separately from idempotent mutations', async () => {
  const { service, calls } = serviceSpy();
  const routes = createProductIdentityRoutes({ productIdentity: service });
  const getStyle = route(routes, 'GET', '/v2/product/styles/style%3A1');
  const createStyle = route(routes, 'POST', '/v2/product/styles');
  assert.equal(getStyle.mutation, false);
  assert.equal(createStyle.mutation, true);
  await getStyle.execute({ actorId: 'user:1', params: ['style:1'], query: { versionNo: '2' }, body: {} });
  await createStyle.execute({ actorId: 'user:1', commandId: 'cmd:1', params: [], query: {}, body: { brandId: 'brand:1', styleCode: 'DRS-001' } });
  assert.deepEqual(calls[0], ['getStyleForActor', 'user:1', 'style:1', { versionNo: '2' }]);
  assert.deepEqual(calls[1], ['createStyle', 'cmd:1', 'user:1', { brandId: 'brand:1', styleCode: 'DRS-001' }]);
});

test('Product Identity route contracts reject unknown and missing fields before service execution', () => {
  const { service } = serviceSpy();
  const routes = createProductIdentityRoutes({ productIdentity: service });
  const createStyle = route(routes, 'POST', '/v2/product/styles');
  assert.throws(
    () => createStyle.execute({ actorId: 'user:1', commandId: 'cmd:1', params: [], query: {}, body: { brandId: 'brand:1', styleCode: 'DRS-001', price: 99 } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
  assert.throws(
    () => createStyle.execute({ actorId: 'user:1', commandId: 'cmd:1', params: [], query: {}, body: { brandId: 'brand:1' } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
});

test('Product Identity MDM refs are strict nested objects and technical payload remains governed JSON', () => {
  const { service } = serviceSpy();
  const routes = createProductIdentityRoutes({ productIdentity: service });
  const styleVersion = route(routes, 'POST', '/v2/product/styles/style%3A1/versions');
  assert.throws(
    () => styleVersion.execute({ actorId: 'user:1', commandId: 'cmd:1', params: ['style:1'], query: {}, body: { expectedLatestVersionNo: 0, titleRu: 'Платье', titleEn: 'Dress', categoryRef: { entryId: 'mdm:1', version: 1, label: 'Dress' } } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
  assert.throws(
    () => styleVersion.execute({ actorId: 'user:1', commandId: 'cmd:1', params: ['style:1'], query: {}, body: { expectedLatestVersionNo: 0, titleRu: 'Платье', titleEn: 'Dress', technicalPayload: [] } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
});

test('GET Product Identity routes accept only versionNo query', () => {
  const { service } = serviceSpy();
  const routes = createProductIdentityRoutes({ productIdentity: service });
  const getScale = route(routes, 'GET', '/v2/product/size-scales/scale%3A1');
  assert.throws(
    () => getScale.execute({ actorId: 'user:1', params: ['scale:1'], query: { q: 'M' }, body: {} }),
    (error) => error?.code === 'HTTP_QUERY_FIELD_UNKNOWN',
  );
});
