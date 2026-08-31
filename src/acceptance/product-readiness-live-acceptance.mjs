import { createHash, randomUUID } from 'node:crypto';
import { snapshotAcceptanceIsolation, validateAcceptanceOrigin } from './collection-live-acceptance.mjs';
import { assertBlockedReadinessProjectionBoundary } from './product-readiness-projection-boundary.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EXPECTED_BLOCKED_DIMENSIONS = Object.freeze(['category', 'measurements']);
const EVIDENCE_APPROVED_AT = '2026-08-31T00:00:00.000Z';

export async function assertProductReadinessPersistence(pool, {
  styleId,
  styleVersionId,
  colorwayId,
  sizeScaleId,
  sizeScaleVersionId,
  sizeValueId,
  skuId,
  mediaId,
  readinessSnapshotId,
  brandId,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  const identities = { styleId, styleVersionId, colorwayId, sizeScaleId, sizeScaleVersionId, sizeValueId, skuId, mediaId, readinessSnapshotId, brandId };
  if (Object.values(identities).some((value) => typeof value !== 'string' || !value)) {
    throw new Error('Product readiness acceptance persistence identity is required');
  }

  const result = await pool.query(
    `SELECT style.id AS style_id,
            style.brand_id AS style_brand_id,
            version.id AS style_version_id,
            version.style_id AS version_style_id,
            version.brand_id AS version_brand_id,
            colorway.id AS colorway_id,
            colorway.style_version_id AS colorway_style_version_id,
            colorway.brand_id AS colorway_brand_id,
            scale.id AS size_scale_id,
            scale.brand_id AS size_scale_brand_id,
            scale_version.id AS size_scale_version_id,
            scale_version.size_scale_id AS scale_version_scale_id,
            scale_version.brand_id AS size_scale_version_brand_id,
            size_value.id AS size_value_id,
            size_value.size_scale_version_id AS size_value_scale_version_id,
            size_value.brand_id AS size_value_brand_id,
            sku.id AS sku_id,
            sku.style_version_id AS sku_style_version_id,
            sku.colorway_id AS sku_colorway_id,
            sku.size_value_id AS sku_size_value_id,
            sku.brand_id AS sku_brand_id,
            media.id AS media_id,
            media.style_version_id AS media_style_version_id,
            media.colorway_id AS media_colorway_id,
            media.brand_id AS media_brand_id,
            readiness.id AS readiness_snapshot_id,
            readiness.style_version_id AS readiness_style_version_id,
            readiness.brand_id AS readiness_brand_id,
            readiness.readiness_status,
            readiness.blocked_dimension_count,
            readiness.dimensions
       FROM product_styles AS style
       JOIN product_style_versions AS version ON version.style_id = style.id
       JOIN product_colorways AS colorway ON colorway.style_version_id = version.id
       JOIN product_skus AS sku ON sku.style_version_id = version.id AND sku.colorway_id = colorway.id
       JOIN product_size_values AS size_value ON size_value.id = sku.size_value_id
       JOIN product_size_scale_versions AS scale_version ON scale_version.id = size_value.size_scale_version_id
       JOIN product_size_scales AS scale ON scale.id = scale_version.size_scale_id
       JOIN product_media AS media ON media.style_version_id = version.id AND media.colorway_id = colorway.id
       JOIN product_readiness_snapshots AS readiness ON readiness.style_version_id = version.id
      WHERE style.id = $1
        AND version.id = $2
        AND colorway.id = $3
        AND scale.id = $4
        AND scale_version.id = $5
        AND size_value.id = $6
        AND sku.id = $7
        AND media.id = $8
        AND readiness.id = $9`,
    [styleId, styleVersionId, colorwayId, sizeScaleId, sizeScaleVersionId, sizeValueId, skuId, mediaId, readinessSnapshotId],
  );

  if (result.rows.length !== 1) {
    throw new Error('Product readiness acceptance HTTP mutations are not visible in the configured PostgreSQL target; verify SYNTHA_ACCEPTANCE_BASE_URL and database URL point to the same environment');
  }
  const row = result.rows[0];
  const sameBrand = [
    row.style_brand_id,
    row.version_brand_id,
    row.colorway_brand_id,
    row.size_scale_brand_id,
    row.size_scale_version_brand_id,
    row.size_value_brand_id,
    row.sku_brand_id,
    row.media_brand_id,
    row.readiness_brand_id,
  ].every((value) => value === brandId);
  const exactLineage = row.style_id === styleId
    && row.style_version_id === styleVersionId
    && row.version_style_id === styleId
    && row.colorway_id === colorwayId
    && row.colorway_style_version_id === styleVersionId
    && row.size_scale_id === sizeScaleId
    && row.size_scale_version_id === sizeScaleVersionId
    && row.scale_version_scale_id === sizeScaleId
    && row.size_value_id === sizeValueId
    && row.size_value_scale_version_id === sizeScaleVersionId
    && row.sku_id === skuId
    && row.sku_style_version_id === styleVersionId
    && row.sku_colorway_id === colorwayId
    && row.sku_size_value_id === sizeValueId
    && row.media_id === mediaId
    && row.media_style_version_id === styleVersionId
    && row.media_colorway_id === colorwayId
    && row.readiness_snapshot_id === readinessSnapshotId
    && row.readiness_style_version_id === styleVersionId;

  if (!sameBrand || !exactLineage || row.readiness_status !== 'blocked') {
    throw new Error('Product readiness acceptance persisted Product Identity/Readiness lineage does not match the HTTP result');
  }
  const blockedDimensions = blockedDimensionCodes(row.dimensions);
  assertExpectedBlockedDimensions(blockedDimensions);
  if (Number(row.blocked_dimension_count) !== EXPECTED_BLOCKED_DIMENSIONS.length) {
    throw new Error('Product readiness acceptance persisted blocked dimension count does not match the governed acceptance contract');
  }

  return Object.freeze({
    styleId,
    styleVersionId,
    colorwayId,
    sizeScaleId,
    sizeScaleVersionId,
    sizeValueId,
    skuId,
    mediaId,
    readinessSnapshotId,
    brandId,
    readinessStatus: row.readiness_status,
    blockedDimensions: Object.freeze(blockedDimensions),
  });
}

export async function runProductReadinessLiveAcceptance({
  baseUrl,
  token,
  pool,
  fetchImpl = globalThis.fetch,
  runId = randomUUID(),
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
} = {}) {
  const target = validateAcceptanceOrigin(baseUrl);
  if (typeof token !== 'string' || !token.trim()) throw new Error('Acceptance bearer token is required');
  if (!RUN_ID_PATTERN.test(runId)) throw new Error('Acceptance runId must contain only letters, numbers, underscores or hyphens and be at most 80 characters');

  const health = await requestJson(fetchImpl, target.url, '/health');
  if (health?.status !== 'ok') throw new Error('Acceptance target failed liveness check');
  const targetReadiness = await requestJson(fetchImpl, target.url, '/ready');
  if (targetReadiness?.status !== 'ready') throw new Error('Acceptance target is not ready');
  const identity = await requestJson(fetchImpl, target.url, '/v2/auth/me', { token });
  if (identity?.data?.actorId !== references.actors.brandOwner) {
    throw new Error(`Acceptance token must authenticate as ${references.actors.brandOwner}`);
  }

  const before = await snapshotAcceptanceIsolation(pool, references.brand.id);
  const code = acceptanceCode(runId);
  const suffix = runId.slice(0, 18);

  const style = data(await requestJson(fetchImpl, target.url, '/v2/product/styles', {
    method: 'POST', token, idempotencyKey: command(runId, 'product-style-create'),
    body: { brandId: references.brand.id, styleCode: `ACC.${code}` },
  }), 'Product Style creation');

  const styleVersion = data(await requestJson(fetchImpl, target.url, `/v2/product/styles/${encodeURIComponent(style.id)}/versions`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-style-version-create'),
    body: {
      expectedLatestVersionNo: 0,
      titleRu: `Приёмочный товар ${suffix}`,
      titleEn: `Acceptance Product ${suffix}`,
      technicalPayload: { acceptanceRunId: runId },
    },
  }), 'Style Version creation');

  const colorway = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/colorways`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-colorway-create'),
    body: {
      colorwayCode: 'BASE',
      nameRu: 'Базовый',
      nameEn: 'Base',
      swatchHex: '#111111',
      payload: { acceptanceRunId: runId },
    },
  }), 'Colorway creation');

  const sizeScale = data(await requestJson(fetchImpl, target.url, '/v2/product/size-scales', {
    method: 'POST', token, idempotencyKey: command(runId, 'product-size-scale-create'),
    body: {
      brandId: references.brand.id,
      scaleCode: `ACC-${code}`,
      nameRu: `Приёмочный размерный ряд ${suffix}`,
      nameEn: `Acceptance Size Scale ${suffix}`,
    },
  }), 'Size Scale creation');

  const sizeScaleVersion = data(await requestJson(fetchImpl, target.url, `/v2/product/size-scales/${encodeURIComponent(sizeScale.id)}/versions`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-size-scale-version-create'),
    body: { expectedLatestVersionNo: 0, payload: { acceptanceRunId: runId } },
  }), 'Size Scale Version creation');

  const sizeValue = data(await requestJson(fetchImpl, target.url, `/v2/product/size-scale-versions/${encodeURIComponent(sizeScaleVersion.id)}/values`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-size-value-create'),
    body: { sizeCode: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 0, payload: { acceptanceRunId: runId } },
  }), 'Size Value creation');

  const sku = data(await requestJson(fetchImpl, target.url, '/v2/product/skus', {
    method: 'POST', token, idempotencyKey: command(runId, 'product-sku-create'),
    body: {
      skuCode: `ACC_${code}_M`,
      styleVersionId: styleVersion.id,
      colorwayId: colorway.id,
      sizeValueId: sizeValue.id,
      payload: { acceptanceRunId: runId },
    },
  }), 'Product SKU creation');

  const media = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/media`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-media-create'),
    body: {
      colorwayId: colorway.id,
      mediaType: 'image',
      mediaRole: 'hero',
      uri: `https://example.invalid/syntha-acceptance/${encodeURIComponent(runId)}.jpg`,
      sortOrder: 0,
      payload: { acceptanceRunId: runId },
    },
  }), 'Product Media creation');

  const commercialPreparation = {
    titleRu: `Приёмочный товар ${suffix}`,
    titleEn: `Acceptance Product ${suffix}`,
    descriptionRu: 'Контрольный товар для live acceptance Product Identity → Readiness.',
    descriptionEn: 'Controlled product for Product Identity to Readiness live acceptance.',
    compositionRu: '100% хлопок',
    compositionEn: '100% cotton',
    countryOfOrigin: 'TR',
    currency: 'USD',
    wholesalePriceMinor: 10000,
    rrpMinor: 20000,
    minimumOrderQuantity: 1,
    deliveryStart: '2026-09-01',
    deliveryEnd: '2026-12-31',
    availability: { mode: 'available_to_sell', quantity: 10 },
    mediaIds: [media.id],
    attributeCoverageConfirmed: true,
  };
  const externalEvidence = Object.freeze({
    sourcing: evidence(runId, 'sourcing', references.actors.brandOwner),
    purchase_or_production_commitment: evidence(runId, 'purchase', references.actors.brandOwner),
    quality: evidence(runId, 'quality', references.actors.brandOwner),
    compliance: evidence(runId, 'compliance', references.actors.brandOwner),
  });
  const readiness = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/readiness`, {
    method: 'POST', token, idempotencyKey: command(runId, 'product-readiness-assess'),
    body: { developmentRoute: 'READY_GOODS', commercialPreparation, externalEvidence },
  }), 'Product Readiness assessment');

  if (readiness.readinessStatus !== 'blocked') {
    throw new Error('Product readiness acceptance expected a blocked immutable snapshot until category MDM and canonical measurements are supplied');
  }
  const blockedDimensions = blockedDimensionCodes(readiness.dimensions);
  assertExpectedBlockedDimensions(blockedDimensions);
  if (readiness.blockedDimensionCount !== EXPECTED_BLOCKED_DIMENSIONS.length) {
    throw new Error('Product readiness acceptance blocked dimension count does not match the governed acceptance contract');
  }

  const persistence = await assertProductReadinessPersistence(pool, {
    styleId: style.id,
    styleVersionId: styleVersion.id,
    colorwayId: colorway.id,
    sizeScaleId: sizeScale.id,
    sizeScaleVersionId: sizeScaleVersion.id,
    sizeValueId: sizeValue.id,
    skuId: sku.id,
    mediaId: media.id,
    readinessSnapshotId: readiness.id,
    brandId: references.brand.id,
  });
  const projectionBoundary = await assertBlockedReadinessProjectionBoundary({
    baseUrl: target.url,
    token,
    pool,
    readinessSnapshotId: readiness.id,
    styleVersionId: styleVersion.id,
    brandId: references.brand.id,
    runId,
    fetchImpl,
  });
  const after = await snapshotAcceptanceIsolation(pool, references.brand.id);
  assertDownstreamIsolationUnchanged(before, after);

  return Object.freeze({
    status: 'passed',
    runId,
    target: target.url.origin,
    actorId: identity.data.actorId,
    product: Object.freeze({
      styleId: style.id,
      styleVersionId: styleVersion.id,
      colorwayId: colorway.id,
      sizeScaleId: sizeScale.id,
      sizeScaleVersionId: sizeScaleVersion.id,
      sizeValueId: sizeValue.id,
      skuId: sku.id,
      mediaId: media.id,
    }),
    readiness: Object.freeze({
      id: readiness.id,
      status: readiness.readinessStatus,
      blockedDimensions: Object.freeze(blockedDimensions),
      expectedBlockers: Object.freeze([...EXPECTED_BLOCKED_DIMENSIONS]),
    }),
    projectionBoundary,
    persistence: Object.freeze({ ...persistence, verified: true }),
    isolation: Object.freeze({ before, after, unchanged: true }),
  });
}

function blockedDimensionCodes(dimensions) {
  if (!Array.isArray(dimensions)) throw new Error('Product readiness acceptance did not return governed readiness dimensions');
  return dimensions.filter((dimension) => dimension?.status === 'blocked').map((dimension) => dimension.code).sort();
}

function assertExpectedBlockedDimensions(actual) {
  const expected = [...EXPECTED_BLOCKED_DIMENSIONS].sort();
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`Product readiness acceptance blockers changed: expected ${expected.join(', ')}, received ${actual.join(', ') || 'none'}`);
  }
}

function assertDownstreamIsolationUnchanged(before, after) {
  const keys = Object.keys(before ?? {});
  if (!keys.length || keys.length !== Object.keys(after ?? {}).length) throw new Error('Acceptance isolation snapshot shape changed');
  const changed = keys.filter((key) => String(before[key]) !== String(after[key]));
  if (changed.length) {
    const error = new Error(`Product readiness acceptance changed downstream/warehouse/economic state: ${changed.join(', ')}`);
    error.code = 'ACCEPTANCE_ISOLATION_CHANGED';
    error.details = Object.freeze(Object.fromEntries(changed.map((key) => [key, Object.freeze({ before: before[key], after: after[key] })])));
    throw error;
  }
}

function evidence(runId, dimension, approvedBy) {
  return Object.freeze({
    status: 'ready',
    evidenceId: `acceptance-${runId}-${dimension}`,
    sourceSystem: 'syntha-live-acceptance',
    version: runId,
    contentHash: createHash('sha256').update(`acceptance:${runId}:${dimension}`).digest('hex'),
    approvedAt: EVIDENCE_APPROVED_AT,
    approvedBy,
  });
}

function acceptanceCode(runId) {
  const normalized = runId.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  return normalized || 'RUN';
}
function data(payload, operation) {
  if (!payload?.data?.id) throw new Error(`Acceptance ${operation} did not return an entity id`);
  return payload.data;
}
function command(runId, operation) { return `acceptance-${runId}-${operation}`; }

async function requestJson(fetchImpl, baseUrl, pathname, { method = 'GET', token, body, idempotencyKey } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation is required');
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  let serialized;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    serialized = JSON.stringify(body);
  }
  const response = await fetchImpl(new URL(pathname, baseUrl), { method, headers, ...(serialized === undefined ? {} : { body: serialized }) });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Acceptance target returned non-JSON response for ${method} ${pathname}`); }
  }
  if (!response.ok) {
    const code = payload?.error?.code ? ` (${payload.error.code})` : '';
    throw new Error(`Acceptance request failed: ${method} ${pathname} -> HTTP ${response.status}${code}`);
  }
  return payload;
}
