import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProductReadinessPersistence,
  runProductReadinessLiveAcceptance,
} from '../src/acceptance/product-readiness-live-acceptance.mjs';
import { assertBlockedReadinessProjectionBoundary } from '../src/acceptance/product-readiness-projection-boundary.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from '../src/acceptance/production-reference-bootstrap.mjs';

const BLOCKED_DIMENSIONS = Object.freeze([
  Object.freeze({ code: 'category', status: 'blocked' }),
  Object.freeze({ code: 'measurements', status: 'blocked' }),
]);

const IDS = Object.freeze({
  styleId: 'style-acceptance',
  styleVersionId: 'style-version-acceptance',
  colorwayId: 'colorway-acceptance',
  sizeScaleId: 'size-scale-acceptance',
  sizeScaleVersionId: 'size-scale-version-acceptance',
  sizeValueId: 'size-value-acceptance',
  skuId: 'sku-acceptance',
  mediaId: 'media-acceptance',
  readinessSnapshotId: 'readiness-acceptance',
});

test('Product Readiness persistence assertion proves exact ProductSku lineage and governed blockers', async () => {
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
        IDS.readinessSnapshotId,
      ]);
      return { rows: [persistenceRow(brandId)] };
    },
  };

  const persisted = await assertProductReadinessPersistence(pool, { ...IDS, brandId });
  assert.equal(persisted.readinessStatus, 'blocked');
  assert.deepEqual(persisted.blockedDimensions, ['category', 'measurements']);

  await assert.rejects(
    assertProductReadinessPersistence({ query: async () => ({ rows: [] }) }, { ...IDS, brandId }),
    /not visible in the configured PostgreSQL target/,
  );
});

test('Product Readiness persistence assertion fails closed when blocker semantics drift', async () => {
  const brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id;
  const row = { ...persistenceRow(brandId), dimensions: [{ code: 'category', status: 'blocked' }], blocked_dimension_count: 1 };
  await assert.rejects(
    assertProductReadinessPersistence({ query: async () => ({ rows: [row] }) }, { ...IDS, brandId }),
    /blockers changed/,
  );
});

test('blocked readiness projection boundary requires the exact domain rejection and zero persisted projection rows', async () => {
  const queries = [];
  const pool = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows: [{ projection_rows: 0 }] };
    },
  };
  const requests = [];
  const result = await assertBlockedReadinessProjectionBoundary({
    baseUrl: 'http://127.0.0.1:4100',
    token: 'opaque-test-token',
    pool,
    readinessSnapshotId: IDS.readinessSnapshotId,
    styleVersionId: IDS.styleVersionId,
    brandId: PRODUCTION_ACCEPTANCE_REFERENCES.brand.id,
    runId: 'boundary-001',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return response({ error: { code: 'COMMERCIAL_PROJECTION_READINESS_BLOCKED', message: 'blocked' } }, 422);
    },
  });

  assert.deepEqual(result, {
    rejected: true,
    httpStatus: 422,
    errorCode: 'COMMERCIAL_PROJECTION_READINESS_BLOCKED',
    projectionRowsBefore: 0,
    projectionRowsAfter: 0,
  });
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.match(query.sql, /FROM commercial_product_projection_versions/);
    assert.deepEqual(query.values, [IDS.styleVersionId, PRODUCTION_ACCEPTANCE_REFERENCES.brand.id]);
  }
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, new RegExp(`/v2/product/readiness/${IDS.readinessSnapshotId}/commercial-projection$`));
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.authorization, 'Bearer opaque-test-token');
  assert.equal(requests[0].options.headers['idempotency-key'], 'acceptance-boundary-001-blocked-projection-reject');
  assert.deepEqual(JSON.parse(requests[0].options.body), { expectedLatestVersionNo: 0 });
});

test('blocked readiness projection boundary fails closed on unexpected error semantics or pre-existing projection state', async () => {
  const zeroPool = { query: async () => ({ rows: [{ projection_rows: 0 }] }) };
  await assert.rejects(
    assertBlockedReadinessProjectionBoundary({
      baseUrl: 'http://127.0.0.1:4100',
      token: 'opaque-test-token',
      pool: zeroPool,
      readinessSnapshotId: IDS.readinessSnapshotId,
      styleVersionId: IDS.styleVersionId,
      brandId: PRODUCTION_ACCEPTANCE_REFERENCES.brand.id,
      runId: 'boundary-wrong-error',
      fetchImpl: async () => response({ error: { code: 'SOMETHING_ELSE' } }, 422),
    }),
    /unexpected contract/,
  );

  let attempted = false;
  await assert.rejects(
    assertBlockedReadinessProjectionBoundary({
      baseUrl: 'http://127.0.0.1:4100',
      token: 'opaque-test-token',
      pool: { query: async () => ({ rows: [{ projection_rows: 1 }] }) },
      readinessSnapshotId: IDS.readinessSnapshotId,
      styleVersionId: IDS.styleVersionId,
      brandId: PRODUCTION_ACCEPTANCE_REFERENCES.brand.id,
      runId: 'boundary-dirty',
      fetchImpl: async () => { attempted = true; return response({}, 200); },
    }),
    /acceptance namespace is not isolated/,
  );
  assert.equal(attempted, false);
});

test('live Product Identity to Readiness acceptance uses public idempotent HTTP, proves SQL lineage, rejects blocked projection and changes no downstream truth', async () => {
  const requests = [];
  const brandId = PRODUCTION_ACCEPTANCE_REFERENCES.brand.id;
  const snapshot = isolationSnapshot();
  const pool = {
    query: async (sql) => {
      if (sql.includes('FROM product_styles AS style')) return { rows: [persistenceRow(brandId)] };
      if (sql.includes('FROM commercial_product_projection_versions')) return { rows: [{ projection_rows: 0 }] };
      return { rows: [{ ...snapshot }] };
    },
  };

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? 'GET';
    const request = { path: parsed.pathname, method, headers: { ...(options.headers ?? {}) }, body: options.body };
    requests.push(request);
    const key = `${method} ${parsed.pathname}`;
    if (key === `POST /v2/product/readiness/${IDS.readinessSnapshotId}/commercial-projection`) {
      return response({
        error: {
          code: 'COMMERCIAL_PROJECTION_READINESS_BLOCKED',
          message: 'Commercial Product Projection requires a ready ProductReadinessSnapshot',
        },
      }, 422);
    }
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
      [`POST /v2/product/style-versions/${IDS.styleVersionId}/readiness`]: {
        data: {
          id: IDS.readinessSnapshotId,
          brandId,
          styleVersionId: IDS.styleVersionId,
          readinessStatus: 'blocked',
          blockedDimensionCount: 2,
          dimensions: BLOCKED_DIMENSIONS,
        },
      },
    };
    assert.ok(payloads[key], `unexpected acceptance request ${key}`);
    return response(payloads[key]);
  };

  const result = await runProductReadinessLiveAcceptance({
    baseUrl: 'http://127.0.0.1:4100',
    token: 'opaque-test-token',
    pool,
    fetchImpl,
    runId: 'run-002',
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.actorId, PRODUCTION_ACCEPTANCE_REFERENCES.actors.brandOwner);
  assert.equal(result.product.skuId, IDS.skuId);
  assert.equal(result.readiness.status, 'blocked');
  assert.deepEqual(result.readiness.blockedDimensions, ['category', 'measurements']);
  assert.equal(result.projectionBoundary.rejected, true);
  assert.equal(result.projectionBoundary.httpStatus, 422);
  assert.equal(result.projectionBoundary.errorCode, 'COMMERCIAL_PROJECTION_READINESS_BLOCKED');
  assert.equal(result.projectionBoundary.projectionRowsBefore, 0);
  assert.equal(result.projectionBoundary.projectionRowsAfter, 0);
  assert.equal(result.persistence.verified, true);
  assert.equal(result.isolation.unchanged, true);

  const mutations = requests.filter((request) => request.method === 'POST');
  assert.equal(mutations.length, 10);
  for (const request of mutations) {
    assert.match(request.headers['idempotency-key'], /^acceptance-run-002-/);
    assert.equal(request.headers.authorization, 'Bearer opaque-test-token');
    assert.equal(request.headers['content-type'], 'application/json');
  }

  const readinessRequest = requests.find((request) => request.path.endsWith('/readiness'));
  const readinessBody = JSON.parse(readinessRequest.body);
  assert.equal(readinessBody.developmentRoute, 'READY_GOODS');
  assert.deepEqual(Object.keys(readinessBody.externalEvidence).sort(), ['compliance', 'purchase_or_production_commitment', 'quality', 'sourcing']);
  assert.equal(readinessBody.commercialPreparation.mediaIds[0], IDS.mediaId);

  const projectionRequest = requests.find((request) => request.path.endsWith('/commercial-projection'));
  assert.deepEqual(JSON.parse(projectionRequest.body), { expectedLatestVersionNo: 0 });
});

test('live Product Readiness acceptance rejects a token for the wrong actor before any Product mutation', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push(`${options.method ?? 'GET'} ${parsed.pathname}`);
    if (parsed.pathname === '/health') return response({ status: 'ok' });
    if (parsed.pathname === '/ready') return response({ status: 'ready' });
    if (parsed.pathname === '/v2/auth/me') return response({ data: { actorId: 'someone-else' } });
    throw new Error('Product mutation must not execute');
  };

  await assert.rejects(
    runProductReadinessLiveAcceptance({
      baseUrl: 'http://localhost:4100',
      token: 'opaque-test-token',
      pool: { query: async () => ({ rows: [] }) },
      fetchImpl,
      runId: 'wrong-product-actor',
    }),
    /Acceptance token must authenticate as/,
  );
  assert.deepEqual(requests, ['GET /health', 'GET /ready', 'GET /v2/auth/me']);
});

function persistenceRow(brandId) {
  return {
    style_id: IDS.styleId,
    style_brand_id: brandId,
    style_version_id: IDS.styleVersionId,
    version_style_id: IDS.styleId,
    version_brand_id: brandId,
    colorway_id: IDS.colorwayId,
    colorway_style_version_id: IDS.styleVersionId,
    colorway_brand_id: brandId,
    size_scale_id: IDS.sizeScaleId,
    size_scale_brand_id: brandId,
    size_scale_version_id: IDS.sizeScaleVersionId,
    scale_version_scale_id: IDS.sizeScaleId,
    size_scale_version_brand_id: brandId,
    size_value_id: IDS.sizeValueId,
    size_value_scale_version_id: IDS.sizeScaleVersionId,
    size_value_brand_id: brandId,
    sku_id: IDS.skuId,
    sku_style_version_id: IDS.styleVersionId,
    sku_colorway_id: IDS.colorwayId,
    sku_size_value_id: IDS.sizeValueId,
    sku_brand_id: brandId,
    media_id: IDS.mediaId,
    media_style_version_id: IDS.styleVersionId,
    media_colorway_id: IDS.colorwayId,
    media_brand_id: brandId,
    readiness_snapshot_id: IDS.readinessSnapshotId,
    readiness_style_version_id: IDS.styleVersionId,
    readiness_brand_id: brandId,
    readiness_status: 'blocked',
    blocked_dimension_count: 2,
    dimensions: BLOCKED_DIMENSIONS,
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
