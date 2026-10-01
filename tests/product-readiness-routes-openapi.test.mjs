import assert from 'node:assert/strict';
import test from 'node:test';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';
import { withProductReadinessOpenApi } from '../src/http/product-readiness-openapi.mjs';
import { createProductReadinessRoutes } from '../src/http/product-readiness-routes.mjs';

const spec = withProductReadinessOpenApi(wholesaleV2OpenApi);

function route(routes, method, path) { return routes.find((candidate) => candidate.method === method && candidate.pattern.test(path)); }
function serviceSpy() { const calls = []; return { calls, service: new Proxy({}, { get: (_target, name) => (...args) => { calls.push([name, ...args]); return { ok: name }; } }) }; }

function assessmentBody() {
  return {
    developmentRoute: 'OWN_DEVELOPMENT',
    commercialPreparation: {
      titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description', compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU', currency: 'RUB',
      wholesalePriceMinor: 10000, rrpMinor: 20000, minimumOrderQuantity: 1,
      deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z', availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media:1'], attributeCoverageConfirmed: true,
    },
  };
}

test('readiness route bundle exposes the formal PLM to commercial handoff', async () => {
  const { service, calls } = serviceSpy();
  const routes = createProductReadinessRoutes({ productReadiness: service });
  const assess = route(routes, 'POST', '/v2/product/style-versions/style%3A1/readiness');
  const publish = route(routes, 'POST', '/v2/product/readiness/readiness%3A1/commercial-projection');
  assert(assess?.mutation);
  assert(publish?.mutation);
  await assess.execute({ actorId: 'user:1', commandId: 'cmd:1', params: ['style:1'], query: {}, body: assessmentBody() });
  await publish.execute({ actorId: 'user:1', commandId: 'cmd:2', params: ['readiness:1'], query: {}, body: { expectedLatestVersionNo: 0 } });
  assert.equal(calls[0][0], 'assessReadiness');
  assert.equal(calls[1][0], 'publishCommercialProjection');
});

test('assessment transport rejects unknown commercial or external evidence fields', () => {
  const { service } = serviceSpy();
  const routes = createProductReadinessRoutes({ productReadiness: service });
  const assess = route(routes, 'POST', '/v2/product/style-versions/style%3A1/readiness');
  assert.throws(
    () => assess.execute({ actorId: 'user:1', commandId: 'cmd:1', params: ['style:1'], query: {}, body: { ...assessmentBody(), commercialPreparation: { ...assessmentBody().commercialPreparation, mutableBuyerPrice: 1 } } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
  assert.throws(
    () => assess.execute({ actorId: 'user:1', commandId: 'cmd:1', params: ['style:1'], query: {}, body: { ...assessmentBody(), externalEvidence: { compliance: { status: 'ready', evidenceId: 'e:1', sourceSystem: 'docs', version: 'v1', contentHash: 'a'.repeat(64), approvedAt: '2026-08-12T00:00:00.000Z', approvedBy: 'u:1', mutableLabel: 'x' } } } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
});

test('pack ratio template transport wires through to the service and rejects a bad ratio', async () => {
  const { service, calls } = serviceSpy();
  const routes = createProductReadinessRoutes({ productReadiness: service });
  const create = route(routes, 'POST', '/v2/product/pack-ratio-templates');
  const list = route(routes, 'GET', '/v2/product/pack-ratio-templates');
  assert(create?.mutation);
  assert(!list?.mutation);
  await create.execute({ actorId: 'user:1', commandId: 'cmd:1', params: [], query: {}, body: { brandId: 'brand:1', name: 'Стандарт', ratio: [1, 2, 2, 1] } });
  assert.equal(calls[0][0], 'createPackRatioTemplate');
  assert.throws(
    () => create.execute({ actorId: 'user:1', commandId: 'cmd:1', params: [], query: {}, body: { brandId: 'brand:1', name: 'Стандарт', ratio: [1, 0, 1] } }),
    (error) => error?.code === 'HTTP_BODY_FIELD_INVALID',
  );
  await list.execute({ actorId: 'user:1', params: [], query: { brandId: 'brand:1' } });
  assert.equal(calls.at(-1)[0], 'listPackRatioTemplatesForActor');
  assert.throws(
    () => list.execute({ actorId: 'user:1', params: [], query: {} }),
    (error) => error?.code === 'HTTP_QUERY_FIELD_INVALID',
  );
});

test('OpenAPI publishes readiness/projection snapshots and all mutations require idempotency keys', () => {
  for (const path of [
    '/product/style-versions/{styleVersionId}/readiness',
    '/product/readiness/{readinessSnapshotId}',
    '/product/readiness/{readinessSnapshotId}/commercial-projection',
    '/product/commercial-projections/{projectionId}',
    '/product/style-versions/{styleVersionId}/commercial-projections',
    '/product/pack-ratio-templates',
  ]) assert(spec.paths[path], `missing ${path}`);
  assert.equal(spec.components.schemas.ProductReadinessSnapshot.properties.dimensions.minItems, 18);
  for (const operation of [
    spec.paths['/product/style-versions/{styleVersionId}/readiness'].post,
    spec.paths['/product/readiness/{readinessSnapshotId}/commercial-projection'].post,
    spec.paths['/product/pack-ratio-templates'].post,
  ]) assert(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key' && parameter.required));
});
