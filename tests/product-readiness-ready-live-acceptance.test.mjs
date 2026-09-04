import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READY_PRODUCT_MDM_REFERENCES,
  assertReadyProductReadinessPersistence,
  runReadyProductReadinessLiveAcceptance,
} from '../src/acceptance/product-readiness-ready-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from '../src/acceptance/production-reference-bootstrap.mjs';

const IDS = Object.freeze({
  styleId: 'ready-style-acceptance',
  styleVersionId: 'ready-style-version-acceptance',
  colorwayId: 'ready-colorway-acceptance',
  sizeScaleId: 'ready-size-scale-acceptance',
  sizeScaleVersionId: 'ready-size-scale-version-acceptance',
  sizeValueId: 'ready-size-value-acceptance',
  skuId: 'ready-sku-acceptance',
  mediaId: 'ready-media-acceptance',
  measurementChartId: 'ready-measurement-acceptance',
  readinessSnapshotId: 'ready-readiness-acceptance',
});

const READY_DIMENSIONS = Object.freeze([
  Object.freeze({ code: 'category', status: 'ready' }),
  Object.freeze({ code: 'measurements', status: 'ready' }),
]);

test('READY Product Readiness persistence assertion pins Product Identity, exact MDM versions and published Measurement Chart', async () => {
  const brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id;
  const pool = {
    query: async (_sql, values) => {
      assert.deepEqual(values, [
        IDS.styleId,
        IDS.styleVersionId,
        IDS.colorwayId,
        IDS.sizeScaleId,
        IDS.sizeScaleVersionId,
        IDS.sizeValueId,
        IDS.skuId,
        IDS.mediaId,
        IDS.measurementChartId,
        IDS.readinessSnapshotId,
      ]);
      return { rows: [readyPersistenceRow(brandId)] };
    },
  };

  const persisted = await assertReadyProductReadinessPersistence(pool, {
    ...IDS,
    measurementChartVersion: 2,
    brandId,
  });
  assert.equal(persisted.readinessStatus, 'ready');
  assert.deepEqual(persisted.blockedDimensions, []);
  assert.deepEqual(persisted.categoryRef, READY_PRODUCT_MDM_REFERENCES.category);
  assert.deepEqual(persisted.measurementUnitRef, READY_PRODUCT_MDM_REFERENCES.measurementUnit);
  assert.deepEqual(persisted.measurementPointRef, READY_PRODUCT_MDM_REFERENCES.measurementPoint);

  await assert.rejects(
    assertReadyProductReadinessPersistence({ query: async () => ({ rows: [] }) }, {
      ...IDS,
      measurementChartVersion: 2,
      brandId,
    }),
    /not visible as one exact canonical lineage/,
  );
});

test('READY Product Readiness persistence fails closed on MDM or published-chart drift', async () => {
  const brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id;
  await assert.rejects(
    assertReadyProductReadinessPersistence({
      query: async () => ({ rows: [{ ...readyPersistenceRow(brandId), category_entry_version: 2 }] }),
    }, {
      ...IDS,
      measurementChartVersion: 2,
      brandId,
    }),
    /MDM\/Measurement lineage/,
  );

  await assert.rejects(
    assertReadyProductReadinessPersistence({
      query: async () => ({ rows: [{ ...readyPersistenceRow(brandId), measurement_status: 'draft', measurement_published_at: null }] }),
    }, {
      ...IDS,
      measurementChartVersion: 2,
      brandId,
    }),
    /published canonical Measurement Chart revision/,
  );
});

test('positive Product Identity to Readiness acceptance creates governed category and canonical measurements only through public idempotent API', async () => {
  const requests = [];
  const brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id;
  const snapshot = isolationSnapshot();
  const pool = {
    query: async (sql) => {
      if (sql.includes('category_usage.entry_id AS category_usage_entry_id')) return { rows: [readyPersistenceRow(brandId)] };
      return { rows: [{ ...snapshot }] };
    },
  };

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? 'GET';
    const request = { path: parsed.pathname, method, headers: { ...(options.headers ?? {}) }, body: options.body };
    requests.push(request);
    const key = `${method} ${parsed.pathname}`;
    const payloads = {
      'GET /health': { status: 'ok' },
      'GET /ready': { status: 'ready' },
      'GET /v2/auth/me': { data: { actorId: PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner } },
      'POST /v2/product/styles': { data: { id: IDS.styleId, brandId } },
      [`POST /v2/product/styles/${IDS.styleId}/versions`]: { data: { id: IDS.styleVersionId, brandId, styleId: IDS.styleId } },
      [`POST /v2/product/style-versions/${IDS.styleVersionId}/colorways`]: { data: { id: IDS.colorwayId, brandId, styleVersionId: IDS.styleVersionId } },
      'POST /v2/product/size-scales': { data: { id: IDS.sizeScaleId, brandId } },
      [`POST /v2/product/size-scales/${IDS.sizeScaleId}/versions`]: { data: { id: IDS.sizeScaleVersionId, brandId, sizeScaleId: IDS.sizeScaleId } },
      [`POST /v2/product/size-scale-versions/${IDS.sizeScaleVersionId}/values`]: { data: { id: IDS.sizeValueId, brandId, sizeScaleVersionId: IDS.sizeScaleVersionId } },
      'POST /v2/product/skus': { data: { id: IDS.skuId, brandId, styleVersionId: IDS.styleVersionId, colorwayId: IDS.colorwayId, sizeValueId: IDS.sizeValueId } },
      [`POST /v2/product/style-versions/${IDS.styleVersionId}/media`]: { data: { id: IDS.mediaId, brandId, styleVersionId: IDS.styleVersionId, colorwayId: IDS.colorwayId } },
      'POST /v2/measurements/canonical': {
        data: {
          id: IDS.measurementChartId,
          brandId,
          styleVersionId: IDS.styleVersionId,
          colorwayId: IDS.colorwayId,
          sizeScaleVersionId: IDS.sizeScaleVersionId,
          status: 'draft',
          version: 1,
        },
      },
      [`POST /v2/measurements/canonical/${IDS.measurementChartId}/publish`]: {
        data: {
          id: IDS.measurementChartId,
          brandId,
          styleVersionId: IDS.styleVersionId,
          colorwayId: IDS.colorwayId,
          sizeScaleVersionId: IDS.sizeScaleVersionId,
          status: 'published',
          version: 2,
        },
      },
      [`POST /v2/product/style-versions/${IDS.styleVersionId}/readiness`]: {
        data: {
          id: IDS.readinessSnapshotId,
          brandId,
          styleVersionId: IDS.styleVersionId,
          readinessStatus: 'ready',
          blockedDimensionCount: 0,
          dimensions: READY_DIMENSIONS,
        },
      },
    };
    assert.ok(payloads[key], `unexpected READY acceptance request ${key}`);
    return response(payloads[key]);
  };

  const result = await runReadyProductReadinessLiveAcceptance({
    baseUrl: 'http://127.0.0.1:4100',
    token: 'opaque-test-token',
    pool,
    fetchImpl,
    runId: 'ready-002',
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.actorId, PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner);
  assert.equal(result.product.skuId, IDS.skuId);
  assert.equal(result.measurement.id, IDS.measurementChartId);
  assert.equal(result.measurement.version, 2);
  assert.equal(result.measurement.status, 'published');
  assert.equal(result.readiness.status, 'ready');
  assert.deepEqual(result.readiness.blockedDimensions, []);
  assert.equal(result.persistence.verified, true);
  assert.equal(result.isolation.unchanged, true);

  const mutations = requests.filter((request) => request.method === 'POST');
  assert.equal(mutations.length, 11);
  for (const request of mutations) {
    assert.match(request.headers['idempotency-key'], /^acceptance-ready-002-/);
    assert.equal(request.headers.authorization, 'Bearer opaque-test-token');
    assert.equal(request.headers['content-type'], 'application/json');
  }

  const versionRequest = requests.find((request) => request.path === `/v2/product/styles/${IDS.styleId}/versions`);
  const versionBody = JSON.parse(versionRequest.body);
  assert.deepEqual(versionBody.categoryRef, READY_PRODUCT_MDM_REFERENCES.category);

  const sizeScaleVersionRequest = requests.find((request) => request.path === `/v2/product/size-scales/${IDS.sizeScaleId}/versions`);
  assert.deepEqual(JSON.parse(sizeScaleVersionRequest.body).sizeSystemRef, READY_PRODUCT_MDM_REFERENCES.sizeSystem);

  const sizeValueRequest = requests.find((request) => request.path === `/v2/product/size-scale-versions/${IDS.sizeScaleVersionId}/values`);
  assert.deepEqual(JSON.parse(sizeValueRequest.body).sizeRef, READY_PRODUCT_MDM_REFERENCES.sizeValue);

  const measurementCreate = requests.find((request) => request.path === '/v2/measurements/canonical');
  assert.deepEqual(JSON.parse(measurementCreate.body), {
    styleVersionId: IDS.styleVersionId,
    colorwayId: IDS.colorwayId,
    sizeScaleVersionId: IDS.sizeScaleVersionId,
    measurementUnitEntryId: READY_PRODUCT_MDM_REFERENCES.measurementUnit.entryId,
    baseSizeValueId: IDS.sizeValueId,
    sizes: [{ sizeValueId: IDS.sizeValueId }],
    points: [{
      pointEntryId: READY_PRODUCT_MDM_REFERENCES.measurementPoint.entryId,
      description: 'Acceptance canonical chest circumference.',
      toleranceMinus: 1,
      tolerancePlus: 1,
      measurements: [{ sizeValueId: IDS.sizeValueId, value: 96 }],
    }],
    notes: 'READY acceptance ready-002',
  });

  const measurementPublish = requests.find((request) => request.path.endsWith('/publish'));
  assert.deepEqual(JSON.parse(measurementPublish.body), { expectedVersion: 1 });

  const readinessRequest = requests.find((request) => request.path.endsWith('/readiness'));
  const readinessBody = JSON.parse(readinessRequest.body);
  assert.equal(readinessBody.developmentRoute, 'READY_GOODS');
  assert.deepEqual(Object.keys(readinessBody.externalEvidence).sort(), ['compliance', 'purchase_or_production_commitment', 'quality', 'sourcing']);
  assert.equal(readinessBody.commercialPreparation.mediaIds[0], IDS.mediaId);
  assert.equal(requests.some((request) => request.path.endsWith('/commercial-projection')), false);
});

test('positive Product Readiness acceptance rejects a wrong actor before Product/Measurement mutations', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push(`${options.method ?? 'GET'} ${parsed.pathname}`);
    if (parsed.pathname === '/health') return response({ status: 'ok' });
    if (parsed.pathname === '/ready') return response({ status: 'ready' });
    if (parsed.pathname === '/v2/auth/me') return response({ data: { actorId: 'someone-else' } });
    throw new Error('READY Product mutation must not execute');
  };

  await assert.rejects(
    runReadyProductReadinessLiveAcceptance({
      baseUrl: 'http://localhost:4100',
      token: 'opaque-test-token',
      pool: { query: async () => ({ rows: [] }) },
      fetchImpl,
      runId: 'wrong-ready-actor',
    }),
    /Acceptance token must authenticate as/,
  );
  assert.deepEqual(requests, ['GET /health', 'GET /ready', 'GET /v2/auth/me']);
});

function readyPersistenceRow(brandId) {
  return {
    style_id: IDS.styleId,
    style_brand_id: brandId,
    style_version_id: IDS.styleVersionId,
    version_style_id: IDS.styleId,
    version_brand_id: brandId,
    category_entry_id: READY_PRODUCT_MDM_REFERENCES.category.entryId,
    category_entry_version: READY_PRODUCT_MDM_REFERENCES.category.version,
    category_usage_entry_id: READY_PRODUCT_MDM_REFERENCES.category.entryId,
    category_usage_entry_version: READY_PRODUCT_MDM_REFERENCES.category.version,
    colorway_id: IDS.colorwayId,
    colorway_style_version_id: IDS.styleVersionId,
    colorway_brand_id: brandId,
    size_scale_id: IDS.sizeScaleId,
    size_scale_brand_id: brandId,
    size_scale_version_id: IDS.sizeScaleVersionId,
    scale_version_scale_id: IDS.sizeScaleId,
    size_scale_version_brand_id: brandId,
    size_system_entry_id: READY_PRODUCT_MDM_REFERENCES.sizeSystem.entryId,
    size_system_entry_version: READY_PRODUCT_MDM_REFERENCES.sizeSystem.version,
    size_value_id: IDS.sizeValueId,
    size_value_scale_version_id: IDS.sizeScaleVersionId,
    size_value_brand_id: brandId,
    size_entry_id: READY_PRODUCT_MDM_REFERENCES.sizeValue.entryId,
    size_entry_version: READY_PRODUCT_MDM_REFERENCES.sizeValue.version,
    sku_id: IDS.skuId,
    sku_style_version_id: IDS.styleVersionId,
    sku_colorway_id: IDS.colorwayId,
    sku_size_value_id: IDS.sizeValueId,
    sku_brand_id: brandId,
    media_id: IDS.mediaId,
    media_style_version_id: IDS.styleVersionId,
    media_colorway_id: IDS.colorwayId,
    media_brand_id: brandId,
    measurement_chart_id: IDS.measurementChartId,
    measurement_brand_id: brandId,
    measurement_style_version_id: IDS.styleVersionId,
    measurement_colorway_id: IDS.colorwayId,
    measurement_size_scale_version_id: IDS.sizeScaleVersionId,
    measurement_unit_entry_id: READY_PRODUCT_MDM_REFERENCES.measurementUnit.entryId,
    measurement_unit_entry_version: READY_PRODUCT_MDM_REFERENCES.measurementUnit.version,
    base_size_value_id: IDS.sizeValueId,
    measurement_status: 'published',
    measurement_version: 2,
    measurement_published_at: '2026-09-03T00:00:00.000Z',
    chart_size_value_id: IDS.sizeValueId,
    point_entry_id: READY_PRODUCT_MDM_REFERENCES.measurementPoint.entryId,
    point_entry_version: READY_PRODUCT_MDM_REFERENCES.measurementPoint.version,
    measurement_size_value_id: IDS.sizeValueId,
    measurement_value: '96.0000',
    readiness_snapshot_id: IDS.readinessSnapshotId,
    readiness_style_version_id: IDS.styleVersionId,
    readiness_brand_id: brandId,
    readiness_status: 'ready',
    blocked_dimension_count: 0,
    dimensions: READY_DIMENSIONS,
  };
}

function isolationSnapshot() {
  return {
    inventory_balance_rows: '0',
    inventory_available_quantity: '0',
    inventory_reserved_quantity: '0',
    warehouse_ledger_rows: '0',
    warehouse_on_hand_delta: '0',
    warehouse_available_delta: '0',
    warehouse_quarantine_delta: '0',
    commercial_publication_rows: '0',
    price_list_rows: '0',
    buyer_catalog_rows: '0',
    selection_rows: '0',
    order_rows: '0',
    supply_commitment_rows: '0',
    actual_cost_ledger_rows: '0',
    actual_cost_amount: '0',
  };
}

function response(payload, status = 200) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  });
}
