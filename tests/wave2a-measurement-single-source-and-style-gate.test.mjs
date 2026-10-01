import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createProductIdentityRoutes } from '../src/http/product-identity-routes.mjs';
import { evaluateProductReadiness } from '../src/modules/product-readiness/public.mjs';

const at = '2026-08-12T12:00:00.000Z';
const hash = 'a'.repeat(64);

// ---------- P-05: экран измерений и расчёт готовности смотрят в разные таблицы ----------

function product() {
  return {
    style: { id: 'style:1', brandId: 'brand:1', styleCode: 'DRS-001' },
    styleVersion: { id: 'style-version:1', brandId: 'brand:1', versionNo: 1, categoryRef: { entryId: 'category:dress', version: 2 }, contentHash: hash },
    styleMedia: [], styleAttributes: [], mdmUsage: [],
    colorways: [{ id: 'colorway:black', media: [], attributes: [], skus: [{ id: 'sku:m', skuCode: 'DRS-M', colorwayId: 'colorway:black', attributes: [], size: { id: 'size:m', sizeScaleVersionId: 'scale-version:1', sortOrder: 2 } }] }],
  };
}

function measurementsDimension(technicalSnapshotExtra) {
  const dimensions = evaluateProductReadiness({
    developmentRoute: 'OWN_DEVELOPMENT',
    technicalSnapshot: { styleVersionId: 'style-version:1', brandId: 'brand:1', capturedAt: at, product: product(), measurementEvidence: [], technicalEvidence: [], ...technicalSnapshotExtra },
    commercialPreparation: { brandId: 'brand:1' },
    externalEvidence: {},
  });
  return dimensions.find((value) => value.code === 'measurements');
}

test('a chart typed on the legacy catalog-SKU screen is reported by readiness instead of silently ignored', () => {
  const plain = measurementsDimension({});
  assert.equal(plain.status, 'blocked');
  assert.deepEqual(plain.evidence.legacyCharts ?? [], []);

  const withLegacy = measurementsDimension({ legacyMeasurementEvidence: [{ sku: 'SKU-LEGACY-M', status: 'published', version: 2 }] });
  assert.equal(withLegacy.status, 'blocked');
  assert.deepEqual(withLegacy.evidence.legacyCharts, [{ sku: 'SKU-LEGACY-M', status: 'published', version: 2 }]);
  assert.match(withLegacy.evidence.reason, /legacy screen/);
  assert.notEqual(withLegacy.evidence.reason, plain.evidence.reason);
});

// ---------- P-06: статус модели не зависел от готовности ----------

function identityHarness(readiness) {
  const styles = new Map([['style:1', Object.freeze({ id: 'style:1', brandId: 'brand:1', styleCode: 'DRS-001', lifecycleStatus: 'compliance_ready', version: 4, createdAt: at, createdBy: 'user:1', updatedAt: at, updatedBy: 'user:1' })]]);
  const commands = new Map();
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getMembership: async () => ({ id: 'm', organisationId: 'brand:1', organisationType: 'brand', userId: 'user:1', role: 'owner', status: 'active' }),
    getStyleForUpdate: async (id) => styles.get(id),
    saveStyle: async (value) => styles.set(value.id, value),
    getLatestReadinessSnapshotForStyle: async () => readiness,
  };
  const service = createProductIdentityService({ store: { transaction: async (work) => work(tx) }, clock: () => at });
  return { service, styles };
}
const rejectsWith = (code) => (error) => error?.code === code;

test('a style cannot become commercially ready before its readiness is assessed', async () => {
  const h = identityHarness(undefined);
  await assert.rejects(h.service.transitionStyle('cmd:1', 'user:1', 'style:1', { expectedVersion: 4, nextStatus: 'commercial_ready' }), rejectsWith('PRODUCT_STYLE_READINESS_NOT_ASSESSED'));
  assert.equal(h.styles.get('style:1').lifecycleStatus, 'compliance_ready');
});

test('a style cannot become commercially ready while the latest assessment is blocked', async () => {
  const h = identityHarness({ id: 'readiness:1', readinessStatus: 'blocked', blockedDimensionCount: 3 });
  await assert.rejects(h.service.transitionStyle('cmd:1', 'user:1', 'style:1', { expectedVersion: 4, nextStatus: 'commercial_ready' }), rejectsWith('PRODUCT_STYLE_READINESS_BLOCKED'));
  assert.equal(h.styles.get('style:1').lifecycleStatus, 'compliance_ready');
});

test('a ready assessment lets the style become commercially ready', async () => {
  const h = identityHarness({ id: 'readiness:1', readinessStatus: 'ready', blockedDimensionCount: 0 });
  const moved = await h.service.transitionStyle('cmd:1', 'user:1', 'style:1', { expectedVersion: 4, nextStatus: 'commercial_ready' });
  assert.equal(moved.lifecycleStatus, 'commercial_ready');
});

test('activation is gated by readiness as well', async () => {
  const h = identityHarness({ id: 'readiness:1', readinessStatus: 'blocked', blockedDimensionCount: 1 });
  h.styles.set('style:1', Object.freeze({ ...h.styles.get('style:1'), lifecycleStatus: 'commercial_ready' }));
  await assert.rejects(h.service.transitionStyle('cmd:1', 'user:1', 'style:1', { expectedVersion: 4, nextStatus: 'active' }), rejectsWith('PRODUCT_STYLE_READINESS_BLOCKED'));
});

test('states that make no readiness claim are not gated', async () => {
  const h = identityHarness(undefined);
  const held = await h.service.transitionStyle('cmd:1', 'user:1', 'style:1', { expectedVersion: 4, nextStatus: 'on_hold' });
  assert.equal(held.lifecycleStatus, 'on_hold');
});

test('the lifecycle endpoint tells a screen which states depend on readiness', () => {
  const routes = createProductIdentityRoutes({ productIdentity: {} });
  const lifecycle = routes.find((candidate) => candidate.method === 'GET' && candidate.pattern.test('/v2/product/lifecycle'));
  const result = lifecycle.execute({ actorId: 'user:1', query: {} });
  assert.deepEqual([...result.readinessGated].sort(), ['active', 'commercial_ready']);
});
