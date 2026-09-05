import { createHash, randomUUID } from 'node:crypto';
import { snapshotAcceptanceIsolation, validateAcceptanceOrigin } from './collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES } from './production-reference-bootstrap.mjs';

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EVIDENCE_APPROVED_AT = '2026-08-31T00:00:00.000Z';
const MAX_COMMAND_ID_LENGTH = 128;

export const READY_PRODUCT_MDM_REFERENCES = Object.freeze({
  category: Object.freeze({ entryId: 'mdm-entry:assortment-category:apparel', version: 1 }),
  sizeSystem: Object.freeze({ entryId: 'mdm-entry:size-system:int-alpha', version: 1 }),
  sizeValue: Object.freeze({ entryId: 'mdm-entry:size:int-m', version: 1 }),
  measurementUnit: Object.freeze({ entryId: 'mdm-entry:measurement-unit:cm', version: 1 }),
  measurementPoint: Object.freeze({ entryId: 'mdm-entry:measurement-point:chest-circ', version: 1 }),
});

export async function assertReadyProductReadinessPersistence(pool, {
  styleId,
  styleVersionId,
  colorwayId,
  sizeScaleId,
  sizeScaleVersionId,
  sizeValueId,
  skuId,
  mediaId,
  measurementChartId,
  measurementChartVersion,
  readinessSnapshotId,
  brandId,
  mdm = READY_PRODUCT_MDM_REFERENCES,
} = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL pool is required');
  const identities = {
    styleId, styleVersionId, colorwayId, sizeScaleId, sizeScaleVersionId, sizeValueId,
    skuId, mediaId, measurementChartId, readinessSnapshotId, brandId,
  };
  if (Object.values(identities).some((value) => typeof value !== 'string' || !value)) {
    throw new Error('READY Product Readiness acceptance persistence identity is required');
  }
  if (!Number.isInteger(measurementChartVersion) || measurementChartVersion < 2) {
    throw new Error('READY Product Readiness acceptance requires the published Measurement Chart version');
  }

  const result = await pool.query(
    `SELECT style.id AS style_id,
            style.brand_id AS style_brand_id,
            version.id AS style_version_id,
            version.style_id AS version_style_id,
            version.brand_id AS version_brand_id,
            version.category_entry_id,
            version.category_entry_version,
            category_usage.entry_id AS category_usage_entry_id,
            category_usage.entry_version AS category_usage_entry_version,
            colorway.id AS colorway_id,
            colorway.style_version_id AS colorway_style_version_id,
            colorway.brand_id AS colorway_brand_id,
            scale.id AS size_scale_id,
            scale.brand_id AS size_scale_brand_id,
            scale_version.id AS size_scale_version_id,
            scale_version.size_scale_id AS scale_version_scale_id,
            scale_version.brand_id AS size_scale_version_brand_id,
            scale_version.size_system_entry_id,
            scale_version.size_system_entry_version,
            size_value.id AS size_value_id,
            size_value.size_scale_version_id AS size_value_scale_version_id,
            size_value.brand_id AS size_value_brand_id,
            size_value.size_entry_id,
            size_value.size_entry_version,
            sku.id AS sku_id,
            sku.style_version_id AS sku_style_version_id,
            sku.colorway_id AS sku_colorway_id,
            sku.size_value_id AS sku_size_value_id,
            sku.brand_id AS sku_brand_id,
            inventory_balance.product_sku_id AS inventory_product_sku_id,
            inventory_balance.brand_id AS inventory_brand_id,
            inventory_balance.available_quantity AS inventory_available_quantity,
            inventory_balance.reserved_quantity AS inventory_reserved_quantity,
            inventory_balance.version AS inventory_balance_version,
            media.id AS media_id,
            media.style_version_id AS media_style_version_id,
            media.colorway_id AS media_colorway_id,
            media.brand_id AS media_brand_id,
            chart.id AS measurement_chart_id,
            chart.brand_id AS measurement_brand_id,
            chart.style_version_id AS measurement_style_version_id,
            chart.colorway_id AS measurement_colorway_id,
            chart.size_scale_version_id AS measurement_size_scale_version_id,
            chart.measurement_unit_entry_id,
            chart.measurement_unit_entry_version,
            chart.base_size_value_id,
            chart.status AS measurement_status,
            chart.version AS measurement_version,
            chart.published_at AS measurement_published_at,
            chart_size.size_value_id AS chart_size_value_id,
            point.point_entry_id,
            point.point_entry_version,
            measurement.size_value_id AS measurement_size_value_id,
            measurement.value AS measurement_value,
            readiness.id AS readiness_snapshot_id,
            readiness.style_version_id AS readiness_style_version_id,
            readiness.brand_id AS readiness_brand_id,
            readiness.readiness_status,
            readiness.blocked_dimension_count,
            readiness.dimensions
       FROM product_styles AS style
       JOIN product_style_versions AS version ON version.style_id = style.id
       LEFT JOIN mdm_usage_snapshots AS category_usage
         ON category_usage.source_type = 'product_style_version'
        AND category_usage.source_id = version.id
        AND category_usage.field_path = 'categoryRef'
       JOIN product_colorways AS colorway ON colorway.style_version_id = version.id
       JOIN product_skus AS sku ON sku.style_version_id = version.id AND sku.colorway_id = colorway.id
       JOIN product_sku_inventory_balances AS inventory_balance
         ON inventory_balance.product_sku_id = sku.id
        AND inventory_balance.brand_id = sku.brand_id
       JOIN product_size_values AS size_value ON size_value.id = sku.size_value_id
       JOIN product_size_scale_versions AS scale_version ON scale_version.id = size_value.size_scale_version_id
       JOIN product_size_scales AS scale ON scale.id = scale_version.size_scale_id
       JOIN product_media AS media ON media.style_version_id = version.id AND media.colorway_id = colorway.id
       JOIN measurement_charts AS chart
         ON chart.style_version_id = version.id
        AND chart.colorway_id = colorway.id
        AND chart.size_scale_version_id = scale_version.id
       JOIN measurement_chart_sizes AS chart_size
         ON chart_size.chart_id = chart.id
        AND chart_size.size_value_id = size_value.id
       JOIN measurement_points AS point ON point.chart_id = chart.id
       JOIN measurement_values AS measurement
         ON measurement.chart_id = chart.id
        AND measurement.point_code = point.point_code
        AND measurement.size_value_id = size_value.id
       JOIN product_readiness_snapshots AS readiness ON readiness.style_version_id = version.id
      WHERE style.id = $1
        AND version.id = $2
        AND colorway.id = $3
        AND scale.id = $4
        AND scale_version.id = $5
        AND size_value.id = $6
        AND sku.id = $7
        AND media.id = $8
        AND chart.id = $9
        AND readiness.id = $10`,
    [
      styleId, styleVersionId, colorwayId, sizeScaleId, sizeScaleVersionId,
      sizeValueId, skuId, mediaId, measurementChartId, readinessSnapshotId,
    ],
  );

  if (result.rows.length !== 1) {
    throw new Error('READY Product Readiness HTTP mutations are not visible as one exact canonical lineage in the configured PostgreSQL target');
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
    row.inventory_brand_id,
    row.media_brand_id,
    row.measurement_brand_id,
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
    && row.inventory_product_sku_id === skuId
    && row.media_id === mediaId
    && row.media_style_version_id === styleVersionId
    && row.media_colorway_id === colorwayId
    && row.measurement_chart_id === measurementChartId
    && row.measurement_style_version_id === styleVersionId
    && row.measurement_colorway_id === colorwayId
    && row.measurement_size_scale_version_id === sizeScaleVersionId
    && row.chart_size_value_id === sizeValueId
    && row.measurement_size_value_id === sizeValueId
    && row.base_size_value_id === sizeValueId
    && row.readiness_snapshot_id === readinessSnapshotId
    && row.readiness_style_version_id === styleVersionId;
  const exactMdm = row.category_entry_id === mdm.category.entryId
    && Number(row.category_entry_version) === mdm.category.version
    && row.category_usage_entry_id === mdm.category.entryId
    && Number(row.category_usage_entry_version) === mdm.category.version
    && row.size_system_entry_id === mdm.sizeSystem.entryId
    && Number(row.size_system_entry_version) === mdm.sizeSystem.version
    && row.size_entry_id === mdm.sizeValue.entryId
    && Number(row.size_entry_version) === mdm.sizeValue.version
    && row.measurement_unit_entry_id === mdm.measurementUnit.entryId
    && Number(row.measurement_unit_entry_version) === mdm.measurementUnit.version
    && row.point_entry_id === mdm.measurementPoint.entryId
    && Number(row.point_entry_version) === mdm.measurementPoint.version;

  if (!sameBrand || !exactLineage || !exactMdm) {
    throw new Error('READY Product Readiness persisted Product Identity/MDM/Measurement lineage does not match the public HTTP result');
  }
  if (Number(row.inventory_available_quantity) !== 0
      || Number(row.inventory_reserved_quantity) !== 0
      || Number(row.inventory_balance_version) !== 1) {
    throw new Error('READY ProductSku canonical inventory identity must be zero-initialized at version 1');
  }
  if (row.measurement_status !== 'published' || Number(row.measurement_version) !== measurementChartVersion || !row.measurement_published_at) {
    throw new Error('READY Product Readiness acceptance requires the exact published canonical Measurement Chart revision');
  }
  if (Number(row.measurement_value) !== 96) {
    throw new Error('READY Product Readiness acceptance persisted measurement value changed');
  }
  if (row.readiness_status !== 'ready' || Number(row.blocked_dimension_count) !== 0 || blockedDimensionCodes(row.dimensions).length !== 0) {
    throw new Error('READY Product Readiness acceptance persisted snapshot is not READY with zero blockers');
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
    measurementChartId,
    measurementChartVersion,
    readinessSnapshotId,
    brandId,
    readinessStatus: row.readiness_status,
    blockedDimensions: Object.freeze([]),
    categoryRef: Object.freeze({ ...mdm.category }),
    measurementUnitRef: Object.freeze({ ...mdm.measurementUnit }),
    measurementPointRef: Object.freeze({ ...mdm.measurementPoint }),
    inventoryBalance: Object.freeze({
      productSkuId: row.inventory_product_sku_id,
      brandId: row.inventory_brand_id,
      availableQuantity: Number(row.inventory_available_quantity),
      reservedQuantity: Number(row.inventory_reserved_quantity),
      version: Number(row.inventory_balance_version),
    }),
  });
}

export async function runReadyProductReadinessLiveAcceptance({
  baseUrl,
  token,
  pool,
  fetchImpl = globalThis.fetch,
  runId = randomUUID(),
  references = PRODUCTION_ACCEPTANCE_REFERENCES,
  mdm = READY_PRODUCT_MDM_REFERENCES,
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
    method: 'POST', token, idempotencyKey: command(runId, 'ready-style'),
    body: { brandId: references.brand.id, styleCode: `ACR.${code}` },
  }), 'READY Product Style creation');

  const styleVersion = data(await requestJson(fetchImpl, target.url, `/v2/product/styles/${encodeURIComponent(style.id)}/versions`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-style-version'),
    body: {
      expectedLatestVersionNo: 0,
      titleRu: `Готовый приёмочный товар ${suffix}`,
      titleEn: `Ready Acceptance Product ${suffix}`,
      categoryRef: mdm.category,
      technicalPayload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Style Version creation');

  const colorway = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/colorways`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-colorway'),
    body: {
      colorwayCode: 'BASE',
      nameRu: 'Базовый',
      nameEn: 'Base',
      swatchHex: '#111111',
      payload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Colorway creation');

  const sizeScale = data(await requestJson(fetchImpl, target.url, '/v2/product/size-scales', {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-scale'),
    body: {
      brandId: references.brand.id,
      scaleCode: `ACR-${code}`,
      nameRu: `Готовый приёмочный размерный ряд ${suffix}`,
      nameEn: `Ready Acceptance Size Scale ${suffix}`,
    },
  }), 'READY Size Scale creation');

  const sizeScaleVersion = data(await requestJson(fetchImpl, target.url, `/v2/product/size-scales/${encodeURIComponent(sizeScale.id)}/versions`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-scale-version'),
    body: {
      expectedLatestVersionNo: 0,
      sizeSystemRef: mdm.sizeSystem,
      payload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Size Scale Version creation');

  const sizeValue = data(await requestJson(fetchImpl, target.url, `/v2/product/size-scale-versions/${encodeURIComponent(sizeScaleVersion.id)}/values`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-size'),
    body: {
      sizeCode: 'M',
      labelRu: 'M',
      labelEn: 'M',
      sortOrder: 0,
      sizeRef: mdm.sizeValue,
      payload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Size Value creation');

  const sku = data(await requestJson(fetchImpl, target.url, '/v2/product/skus', {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-sku'),
    body: {
      skuCode: `ACR_${code}_M`,
      styleVersionId: styleVersion.id,
      colorwayId: colorway.id,
      sizeValueId: sizeValue.id,
      payload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Product SKU creation');

  const media = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/media`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-media'),
    body: {
      colorwayId: colorway.id,
      mediaType: 'image',
      mediaRole: 'hero',
      uri: `https://example.invalid/syntha-acceptance/ready-${encodeURIComponent(runId)}.jpg`,
      sortOrder: 0,
      payload: { acceptanceRunId: runId, acceptanceScenario: 'ready' },
    },
  }), 'READY Product Media creation');

  const measurementDraft = data(await requestJson(fetchImpl, target.url, '/v2/measurements/canonical', {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-measurement'),
    body: {
      styleVersionId: styleVersion.id,
      colorwayId: colorway.id,
      sizeScaleVersionId: sizeScaleVersion.id,
      measurementUnitEntryId: mdm.measurementUnit.entryId,
      baseSizeValueId: sizeValue.id,
      sizes: [{ sizeValueId: sizeValue.id }],
      points: [{
        pointEntryId: mdm.measurementPoint.entryId,
        description: 'Acceptance canonical chest circumference.',
        toleranceMinus: 1,
        tolerancePlus: 1,
        measurements: [{ sizeValueId: sizeValue.id, value: 96 }],
      }],
      notes: `READY acceptance ${runId}`,
    },
  }), 'canonical Measurement Chart creation');
  if (measurementDraft.status !== 'draft' || !Number.isInteger(measurementDraft.version) || measurementDraft.version < 1) {
    throw new Error('READY Product Readiness acceptance expected a DRAFT canonical Measurement Chart');
  }

  const measurement = data(await requestJson(fetchImpl, target.url, `/v2/measurements/canonical/${encodeURIComponent(measurementDraft.id)}/publish`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-measure-publish'),
    body: { expectedVersion: measurementDraft.version },
  }), 'canonical Measurement Chart publication');
  if (measurement.status !== 'published' || measurement.version !== measurementDraft.version + 1) {
    throw new Error('READY Product Readiness acceptance expected the exact published canonical Measurement Chart revision');
  }

  const commercialPreparation = {
    titleRu: `Готовый приёмочный товар ${suffix}`,
    titleEn: `Ready Acceptance Product ${suffix}`,
    descriptionRu: 'Контрольный товар для положительного Product Identity → Readiness acceptance.',
    descriptionEn: 'Controlled product for positive Product Identity to Readiness acceptance.',
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
    sourcing: evidence(runId, 'ready-sourcing', references.actors.brandOwner),
    purchase_or_production_commitment: evidence(runId, 'ready-purchase', references.actors.brandOwner),
    quality: evidence(runId, 'ready-quality', references.actors.brandOwner),
    compliance: evidence(runId, 'ready-compliance', references.actors.brandOwner),
  });
  const readiness = data(await requestJson(fetchImpl, target.url, `/v2/product/style-versions/${encodeURIComponent(styleVersion.id)}/readiness`, {
    method: 'POST', token, idempotencyKey: command(runId, 'ready-readiness'),
    body: { developmentRoute: 'READY_GOODS', commercialPreparation, externalEvidence },
  }), 'READY Product Readiness assessment');

  const blockedDimensions = blockedDimensionCodes(readiness.dimensions);
  if (readiness.readinessStatus !== 'ready' || readiness.blockedDimensionCount !== 0 || blockedDimensions.length !== 0) {
    throw new Error(`READY Product Readiness acceptance expected READY with zero blockers; received ${readiness.readinessStatus} / ${blockedDimensions.join(', ') || 'none'}`);
  }

  const persistence = await assertReadyProductReadinessPersistence(pool, {
    styleId: style.id,
    styleVersionId: styleVersion.id,
    colorwayId: colorway.id,
    sizeScaleId: sizeScale.id,
    sizeScaleVersionId: sizeScaleVersion.id,
    sizeValueId: sizeValue.id,
    skuId: sku.id,
    mediaId: media.id,
    measurementChartId: measurement.id,
    measurementChartVersion: measurement.version,
    readinessSnapshotId: readiness.id,
    brandId: references.brand.id,
    mdm,
  });
  const after = await snapshotAcceptanceIsolation(pool, references.brand.id);
  assertReadyProductInventoryIsolationDelta(before, after);

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
    measurement: Object.freeze({
      id: measurement.id,
      version: measurement.version,
      status: measurement.status,
      measurementUnitRef: Object.freeze({ ...mdm.measurementUnit }),
      measurementPointRef: Object.freeze({ ...mdm.measurementPoint }),
    }),
    readiness: Object.freeze({ id: readiness.id, status: readiness.readinessStatus, blockedDimensions: Object.freeze([]) }),
    persistence: Object.freeze({ ...persistence, verified: true }),
    isolation: Object.freeze({ before, after, inventoryBalanceIdentityDelta: 1, downstreamUnchanged: true }),
  });
}

function blockedDimensionCodes(dimensions) {
  if (!Array.isArray(dimensions)) throw new Error('READY Product Readiness acceptance did not return governed readiness dimensions');
  return dimensions.filter((dimension) => dimension?.status === 'blocked').map((dimension) => dimension.code).sort();
}

export function assertReadyProductInventoryIsolationDelta(before, after) {
  const keys = Object.keys(before ?? {});
  if (!keys.length || keys.length !== Object.keys(after ?? {}).length || !keys.includes('inventory_balance_rows')) {
    throw new Error('Acceptance isolation snapshot shape changed');
  }
  let beforeBalanceRows;
  let afterBalanceRows;
  try {
    beforeBalanceRows = BigInt(String(before.inventory_balance_rows));
    afterBalanceRows = BigInt(String(after.inventory_balance_rows));
  } catch {
    throw new Error('READY Product Readiness inventory balance counter is invalid');
  }
  const changed = keys.filter((key) => key !== 'inventory_balance_rows' && String(before[key]) !== String(after[key]));
  const balanceIdentityDeltaValid = afterBalanceRows === beforeBalanceRows + 1n;
  if (!balanceIdentityDeltaValid || changed.length) {
    const changedKeys = [...(!balanceIdentityDeltaValid ? ['inventory_balance_rows'] : []), ...changed];
    const error = new Error(`READY Product Readiness acceptance changed state outside the single zero ProductSku inventory identity: ${changedKeys.join(', ')}`);
    error.code = 'ACCEPTANCE_ISOLATION_CHANGED';
    error.details = Object.freeze(Object.fromEntries(changedKeys.map((key) => [key, Object.freeze({ before: before[key], after: after[key] })])));
    throw error;
  }
  return true;
}

function evidence(runId, dimension, approvedBy) {
  return Object.freeze({
    status: 'ready',
    evidenceId: `acceptance-${runId}-${dimension}`,
    sourceSystem: 'syntha-live-acceptance',
    version: `${runId}:ready`,
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
function command(runId, operation) {
  const value = `acceptance-${runId}-${operation}`;
  if (value.length > MAX_COMMAND_ID_LENGTH) throw new Error(`Acceptance command id exceeds ${MAX_COMMAND_ID_LENGTH} characters`);
  return value;
}

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
