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

test('OpenAPI publishes readiness/projection snapshots and all mutations require idempotency keys', () => {
  for (const path of [
    '/product/style-versions/{styleVersionId}/readiness',
    '/product/readiness/{readinessSnapshotId}',
    '/product/readiness/{readinessSnapshotId}/commercial-projection',
    '/product/commercial-projections/{projectionId}',
    '/product/style-versions/{styleVersionId}/commercial-projections',
  ]) assert(spec.paths[path], `missing ${path}`);
  assert.equal(spec.components.schemas.ProductReadinessSnapshot.properties.dimensions.minItems, 18);
  for (const operation of [
    spec.paths['/product/style-versions/{styleVersionId}/readiness'].post,
    spec.paths['/product/readiness/{readinessSnapshotId}/commercial-projection'].post,
  ]) assert(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key' && parameter.required));
});
