import { invariant } from '../../core/errors.mjs';

export const MEASUREMENT_UNITS = Object.freeze(['cm', 'in']);
export const MEASUREMENT_STATUSES = Object.freeze(['draft', 'published']);

const SCALE = 10_000;
const MAX_SCALED = Number.MAX_SAFE_INTEGER;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const SIZE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,15}$/;
const POINT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const MDM_CODE_PATTERN = /^[A-Z][A-Z0-9._-]{0,63}$/;
const CHART_FIELDS = Object.freeze(new Set(['sku', 'unit', 'baseSizeCode', 'sizes', 'points', 'notes']));
const SIZE_FIELDS = Object.freeze(new Set(['code', 'label']));
const POINT_FIELDS = Object.freeze(new Set(['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']));
const MEASUREMENT_FIELDS = Object.freeze(new Set(['sizeCode', 'value']));
const CANONICAL_CHART_FIELDS = Object.freeze(new Set([
  'styleVersionId',
  'colorwayId',
  'sizeScaleVersionId',
  'measurementUnitEntryId',
  'baseSizeValueId',
  'sizes',
  'points',
  'notes',
]));
const CANONICAL_SIZE_FIELDS = Object.freeze(new Set(['sizeValueId']));
const CANONICAL_POINT_FIELDS = Object.freeze(new Set(['pointEntryId', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']));
const CANONICAL_MEASUREMENT_FIELDS = Object.freeze(new Set(['sizeValueId', 'value']));

export function createMeasurementChart({ id, catalogSku, input, createdAt }) {
  invariant(typeof id === 'string' && id.length >= 1 && id.length <= 160, 'MEASUREMENT_ID_REQUIRED', 'Measurement chart id is required');
  const normalized = normalizeChartInput({ catalogSku, input });
  return freezeChart({
    id,
    ...normalized,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function updateDraftMeasurementChart(chart, { catalogSku, input, updatedAt }) {
  invariant(chart?.status === 'draft', 'MEASUREMENT_NOT_DRAFT', 'Only a draft measurement chart can be edited');
  invariant(catalogSku?.sku === chart.sku, 'MEASUREMENT_SKU_MISMATCH', 'Measurement chart SKU cannot be changed');
  const normalized = normalizeChartInput({ catalogSku, input: { ...input, sku: chart.sku } });
  invariant(normalized.brandId === chart.brandId, 'MEASUREMENT_BRAND_MISMATCH', 'Measurement chart brand cannot be changed');
  const next = { ...chart, ...normalized };
  if (editableProjection(chart) === editableProjection(next)) return chart;
  return freezeChart({ ...next, version: chart.version + 1, updatedAt });
}

export function revisePublishedMeasurementChart(chart, { catalogSku, input, revisedAt }) {
  invariant(chart?.status === 'published', 'MEASUREMENT_NOT_PUBLISHED', 'Only a published measurement chart can start a revision');
  invariant(catalogSku?.sku === chart.sku, 'MEASUREMENT_SKU_MISMATCH', 'Measurement chart SKU cannot be changed');
  const normalized = normalizeChartInput({ catalogSku, input: { ...input, sku: chart.sku } });
  invariant(normalized.brandId === chart.brandId, 'MEASUREMENT_BRAND_MISMATCH', 'Measurement chart brand cannot be changed');
  return freezeChart({
    ...chart,
    ...normalized,
    status: 'draft',
    version: chart.version + 1,
    publishedAt: null,
    updatedAt: revisedAt,
  });
}

export function publishMeasurementChart(chart, { catalogSku, publishedAt }) {
  invariant(chart?.status === 'draft', 'MEASUREMENT_NOT_DRAFT', 'Only a draft measurement chart can be published');
  invariant(catalogSku?.sku === chart.sku && catalogSku.brandId === chart.brandId, 'MEASUREMENT_SKU_MISMATCH', 'Measurement chart SKU context is invalid');
  invariant(catalogSku.status === 'published', 'MEASUREMENT_SKU_NOT_PUBLISHED', 'SKU must be published before measurement chart publication', { sku: chart.sku });
  invariant(Number.isInteger(catalogSku.version) && chart.skuVersion === catalogSku.version, 'MEASUREMENT_SKU_SNAPSHOT_STALE', 'Measurement chart SKU snapshot is stale', {
    sku: chart.sku,
    expectedVersion: chart.skuVersion,
    actualVersion: catalogSku.version,
  });
  assertCompleteMatrix(chart);
  return freezeChart({ ...chart, status: 'published', version: chart.version + 1, publishedAt, updatedAt: publishedAt });
}

export function createCanonicalMeasurementChart({ id, context, input, createdAt }) {
  invariant(typeof id === 'string' && id.length >= 1 && id.length <= 160, 'MEASUREMENT_ID_REQUIRED', 'Measurement chart id is required');
  const normalized = normalizeCanonicalChartInput({ context, input });
  return freezeChart({
    id,
    sku: null,
    skuVersion: null,
    ...normalized,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function updateCanonicalDraftMeasurementChart(chart, { context, input, updatedAt }) {
  assertCanonicalChart(chart);
  invariant(chart.status === 'draft', 'MEASUREMENT_NOT_DRAFT', 'Only a draft measurement chart can be edited');
  const normalized = normalizeCanonicalChartInput({
    context,
    input: {
      ...input,
      styleVersionId: chart.styleVersionId,
      colorwayId: chart.colorwayId,
      sizeScaleVersionId: chart.sizeScaleVersionId,
    },
  });
  assertCanonicalLineage(chart, normalized);
  const next = { ...chart, ...normalized };
  if (canonicalEditableProjection(chart) === canonicalEditableProjection(next)) return chart;
  return freezeChart({ ...next, version: chart.version + 1, updatedAt });
}

export function revisePublishedCanonicalMeasurementChart(chart, { context, input, revisedAt }) {
  assertCanonicalChart(chart);
  invariant(chart.status === 'published', 'MEASUREMENT_NOT_PUBLISHED', 'Only a published measurement chart can start a revision');
  const normalized = normalizeCanonicalChartInput({
    context,
    input: {
      ...input,
      styleVersionId: chart.styleVersionId,
      colorwayId: chart.colorwayId,
      sizeScaleVersionId: chart.sizeScaleVersionId,
    },
  });
  assertCanonicalLineage(chart, normalized);
  return freezeChart({
    ...chart,
    ...normalized,
    status: 'draft',
    version: chart.version + 1,
    publishedAt: null,
    updatedAt: revisedAt,
  });
}

export function publishCanonicalMeasurementChart(chart, { publishedAt }) {
  assertCanonicalChart(chart);
  invariant(chart.status === 'draft', 'MEASUREMENT_NOT_DRAFT', 'Only a draft measurement chart can be published');
  invariant(chart.measurementUnit?.dictionaryCode === 'measurement.unit', 'MEASUREMENT_UNIT_MDM_INVALID', 'Canonical measurement unit snapshot is invalid');
  invariant(chart.measurementUnit?.version === chart.measurementUnitEntryVersion, 'MEASUREMENT_UNIT_MDM_VERSION_MISMATCH', 'Canonical measurement unit version is invalid');
  for (const point of chart.points) {
    invariant(point.pointRef?.dictionaryCode === 'measurement.point', 'MEASUREMENT_POINT_MDM_INVALID', 'Canonical point of measure snapshot is invalid', { pointEntryId: point.pointEntryId });
    invariant(point.pointRef?.version === point.pointEntryVersion, 'MEASUREMENT_POINT_MDM_VERSION_MISMATCH', 'Canonical point of measure version is invalid', { pointEntryId: point.pointEntryId });
  }
  assertCompleteCanonicalMatrix(chart);
  return freezeChart({ ...chart, status: 'published', version: chart.version + 1, publishedAt, updatedAt: publishedAt });
}

function normalizeChartInput({ catalogSku, input }) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_INPUT_INVALID', 'Measurement chart input is invalid');
  assertAllowedFields(input, CHART_FIELDS, 'MEASUREMENT_FIELD_FORBIDDEN', 'Measurement chart input contains unsupported fields');
  const sku = code(input.sku, SKU_PATTERN, 'MEASUREMENT_SKU_INVALID', 'Measurement chart SKU');
  invariant(catalogSku?.sku === sku, 'MEASUREMENT_SKU_NOT_FOUND', 'Catalog SKU not found', { sku });
  invariant(typeof catalogSku.brandId === 'string' && catalogSku.brandId, 'MEASUREMENT_BRAND_REQUIRED', 'Measurement chart brand is required');
  invariant(Number.isInteger(catalogSku.version) && catalogSku.version >= 1, 'MEASUREMENT_SKU_VERSION_INVALID', 'Catalog SKU version is invalid', { sku });
  invariant(MEASUREMENT_UNITS.includes(input.unit), 'MEASUREMENT_UNIT_INVALID', 'Measurement chart unit is invalid', { allowed: MEASUREMENT_UNITS });
  invariant(Array.isArray(input.sizes) && input.sizes.length >= 1 && input.sizes.length <= 50, 'MEASUREMENT_SIZES_INVALID', 'Measurement chart must contain 1 to 50 sizes');
  const sizeCodes = new Set();
  const sizes = input.sizes.map((size, index) => normalizeSize(size, index + 1, sizeCodes));
  const baseSizeCode = code(input.baseSizeCode, SIZE_CODE_PATTERN, 'MEASUREMENT_BASE_SIZE_INVALID', 'Base size code');
  invariant(sizeCodes.has(baseSizeCode), 'MEASUREMENT_BASE_SIZE_INVALID', 'Base size must exist in the size chart', { baseSizeCode });
  invariant(Array.isArray(input.points) && input.points.length <= 300, 'MEASUREMENT_POINTS_INVALID', 'Measurement chart can contain at most 300 points of measure');
  const pointCodes = new Set();
  const points = input.points.map((point, index) => normalizePoint({ point, position: index + 1, sizes, sizeCodes, baseSizeCode, pointCodes }));
  return Object.freeze({
    sku,
    brandId: catalogSku.brandId,
    skuVersion: catalogSku.version,
    unit: input.unit,
    baseSizeCode,
    sizes: Object.freeze(sizes),
    points: Object.freeze(points),
    notes: optionalText(input.notes, 2000, 'MEASUREMENT_NOTES_INVALID', 'Measurement chart notes'),
  });
}

function normalizeCanonicalChartInput({ context, input }) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MEASUREMENT_INPUT_INVALID', 'Measurement chart input is invalid');
  assertAllowedFields(input, CANONICAL_CHART_FIELDS, 'MEASUREMENT_CANONICAL_FIELD_FORBIDDEN', 'Canonical measurement chart input contains unsupported fields');
  const styleVersionId = requiredId(input.styleVersionId, 'MEASUREMENT_STYLE_VERSION_REQUIRED', 'StyleVersion id');
  const colorwayId = requiredId(input.colorwayId, 'MEASUREMENT_COLORWAY_REQUIRED', 'Colorway id');
  const sizeScaleVersionId = requiredId(input.sizeScaleVersionId, 'MEASUREMENT_SIZE_SCALE_VERSION_REQUIRED', 'SizeScaleVersion id');
  invariant(context?.styleVersion?.id === styleVersionId, 'MEASUREMENT_STYLE_VERSION_NOT_FOUND', 'Exact Product StyleVersion was not resolved', { styleVersionId });
  invariant(context.colorway?.id === colorwayId && context.colorway.styleVersionId === styleVersionId, 'MEASUREMENT_COLORWAY_MISMATCH', 'Colorway must belong to the exact Product StyleVersion', { styleVersionId, colorwayId });
  invariant(context.sizeScaleVersion?.id === sizeScaleVersionId, 'MEASUREMENT_SIZE_SCALE_VERSION_NOT_FOUND', 'Exact Product SizeScaleVersion was not resolved', { sizeScaleVersionId });
  const brandId = context.styleVersion.brandId;
  invariant(context.colorway.brandId === brandId && context.sizeScaleVersion.brandId === brandId, 'MEASUREMENT_BRAND_MISMATCH', 'Canonical measurement lineage must belong to one brand');

  const measurementUnitEntryId = requiredId(input.measurementUnitEntryId, 'MEASUREMENT_UNIT_MDM_REQUIRED', 'Measurement unit MDM entry id');
  const measurementUnit = normalizeMdmReference(context.measurementUnit, {
    entryId: measurementUnitEntryId,
    dictionaryCode: 'measurement.unit',
    invalidCode: 'MEASUREMENT_UNIT_MDM_INVALID',
  });
  invariant(measurementUnit.snapshot?.attributes?.dimension === 'length', 'MEASUREMENT_UNIT_DIMENSION_INVALID', 'Garment Measurement Chart requires a length unit');
  invariant(measurementUnit.snapshot?.attributes?.system === 'metric', 'MEASUREMENT_UNIT_SYSTEM_INVALID', 'Russia-first garment Measurement Chart requires a metric unit');
  const unit = code(measurementUnit.snapshot?.code, MDM_CODE_PATTERN, 'MEASUREMENT_UNIT_MDM_INVALID', 'Measurement unit MDM code');

  invariant(Array.isArray(input.sizes) && input.sizes.length >= 1 && input.sizes.length <= 50, 'MEASUREMENT_SIZES_INVALID', 'Canonical measurement chart must contain 1 to 50 Product SizeValues');
  const sizeValueById = new Map((context.sizeValues || []).map((value) => [value.id, value]));
  const selectedSizeIds = new Set();
  const sizes = input.sizes.map((raw, index) => {
    invariant(raw && typeof raw === 'object' && !Array.isArray(raw), 'MEASUREMENT_SIZE_INVALID', 'Canonical measurement size must be an object', { position: index + 1 });
    assertAllowedFields(raw, CANONICAL_SIZE_FIELDS, 'MEASUREMENT_SIZE_FIELD_FORBIDDEN', 'Canonical measurement size contains unsupported fields', { position: index + 1 });
    const sizeValueId = requiredId(raw.sizeValueId, 'MEASUREMENT_SIZE_VALUE_REQUIRED', 'Product SizeValue id');
    invariant(!selectedSizeIds.has(sizeValueId), 'MEASUREMENT_SIZE_VALUE_DUPLICATE', 'Product SizeValue must be unique in the chart', { sizeValueId });
    const sizeValue = sizeValueById.get(sizeValueId);
    invariant(sizeValue && sizeValue.sizeScaleVersionId === sizeScaleVersionId && sizeValue.brandId === brandId, 'MEASUREMENT_SIZE_VALUE_MISMATCH', 'Product SizeValue must belong to the exact Product SizeScaleVersion and brand', { sizeValueId, sizeScaleVersionId });
    selectedSizeIds.add(sizeValueId);
    return Object.freeze({
      sizeValueId,
      code: requiredText(sizeValue.sizeCode, 1, 64, 'MEASUREMENT_SIZE_CODE_INVALID', 'Product size code'),
      label: requiredText(sizeValue.labelRu, 1, 80, 'MEASUREMENT_SIZE_LABEL_INVALID', 'Product size label'),
      labelRu: requiredText(sizeValue.labelRu, 1, 80, 'MEASUREMENT_SIZE_LABEL_INVALID', 'Product size RU label'),
      labelEn: requiredText(sizeValue.labelEn, 1, 80, 'MEASUREMENT_SIZE_LABEL_INVALID', 'Product size EN label'),
      position: index + 1,
      sortOrder: sizeValue.sortOrder,
      sizeRef: sizeValue.sizeRef ? deepFreezeClone(sizeValue.sizeRef) : null,
    });
  });

  const baseSizeValueId = requiredId(input.baseSizeValueId, 'MEASUREMENT_BASE_SIZE_INVALID', 'Base Product SizeValue id');
  invariant(selectedSizeIds.has(baseSizeValueId), 'MEASUREMENT_BASE_SIZE_INVALID', 'Base Product SizeValue must exist in the chart', { baseSizeValueId });
  const baseSizeCode = sizes.find((value) => value.sizeValueId === baseSizeValueId).code;

  invariant(Array.isArray(input.points) && input.points.length <= 300, 'MEASUREMENT_POINTS_INVALID', 'Measurement chart can contain at most 300 governed points of measure');
  const pointRefById = new Map((context.pointEntries || []).map((value) => [value.entryId, value]));
  const pointEntryIds = new Set();
  const points = input.points.map((raw, index) => normalizeCanonicalPoint({
    point: raw,
    position: index + 1,
    sizes,
    selectedSizeIds,
    baseSizeValueId,
    pointRefById,
    pointEntryIds,
  }));

  return Object.freeze({
    brandId,
    styleVersionId,
    colorwayId,
    sizeScaleVersionId,
    measurementUnitEntryId,
    measurementUnitEntryVersion: measurementUnit.version,
    measurementUnit,
    unit,
    baseSizeValueId,
    baseSizeCode,
    sizes: Object.freeze(sizes),
    points: Object.freeze(points),
    notes: optionalText(input.notes, 2000, 'MEASUREMENT_NOTES_INVALID', 'Measurement chart notes'),
  });
}

function normalizeCanonicalPoint({ point, position, sizes, selectedSizeIds, baseSizeValueId, pointRefById, pointEntryIds }) {
  invariant(point && typeof point === 'object' && !Array.isArray(point), 'MEASUREMENT_POINT_INVALID', 'Canonical point of measure must be an object', { position });
  assertAllowedFields(point, CANONICAL_POINT_FIELDS, 'MEASUREMENT_POINT_FIELD_FORBIDDEN', 'Canonical point of measure contains unsupported fields', { position });
  const pointEntryId = requiredId(point.pointEntryId, 'MEASUREMENT_POINT_MDM_REQUIRED', 'Point of measure MDM entry id');
  invariant(!pointEntryIds.has(pointEntryId), 'MEASUREMENT_POINT_MDM_DUPLICATE', 'Point of measure MDM entry must be unique in the chart', { pointEntryId });
  pointEntryIds.add(pointEntryId);
  const pointRef = normalizeMdmReference(pointRefById.get(pointEntryId), {
    entryId: pointEntryId,
    dictionaryCode: 'measurement.point',
    invalidCode: 'MEASUREMENT_POINT_MDM_INVALID',
  });
  const pointCode = code(pointRef.snapshot?.code, MDM_CODE_PATTERN, 'MEASUREMENT_POINT_MDM_INVALID', 'Point of measure MDM code');
  invariant(pointRef.snapshot?.attributes?.dimension === 'length', 'MEASUREMENT_POINT_DIMENSION_INVALID', 'Garment point of measure must use a length dimension', { pointEntryId });
  const toleranceMinus = nonNegativeDecimal(point.toleranceMinus, 'MEASUREMENT_TOLERANCE_MINUS_INVALID', 'Negative tolerance');
  const tolerancePlus = nonNegativeDecimal(point.tolerancePlus, 'MEASUREMENT_TOLERANCE_PLUS_INVALID', 'Positive tolerance');
  invariant(Array.isArray(point.measurements) && point.measurements.length <= sizes.length, 'MEASUREMENT_VALUES_INVALID', 'Point measurements cannot exceed the Product SizeValue chart', { pointEntryId });
  const valueBySizeId = new Map();
  for (const rawMeasurement of point.measurements) {
    invariant(rawMeasurement && typeof rawMeasurement === 'object' && !Array.isArray(rawMeasurement), 'MEASUREMENT_VALUE_INVALID', 'Canonical measurement value must be an object', { pointEntryId });
    assertAllowedFields(rawMeasurement, CANONICAL_MEASUREMENT_FIELDS, 'MEASUREMENT_VALUE_FIELD_FORBIDDEN', 'Canonical measurement value contains unsupported fields', { pointEntryId });
    const sizeValueId = requiredId(rawMeasurement.sizeValueId, 'MEASUREMENT_VALUE_SIZE_INVALID', 'Measurement Product SizeValue id');
    invariant(selectedSizeIds.has(sizeValueId), 'MEASUREMENT_VALUE_SIZE_UNKNOWN', 'Measurement value references a Product SizeValue outside the chart', { pointEntryId, sizeValueId });
    invariant(!valueBySizeId.has(sizeValueId), 'MEASUREMENT_VALUE_SIZE_DUPLICATE', 'Point of measure can contain only one value per Product SizeValue', { pointEntryId, sizeValueId });
    valueBySizeId.set(sizeValueId, positiveDecimal(rawMeasurement.value, 'MEASUREMENT_VALUE_INVALID', 'Measurement value'));
  }
  const measurements = [];
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    if (!valueBySizeId.has(size.sizeValueId)) continue;
    const value = valueBySizeId.get(size.sizeValueId);
    const previousSizeValueId = sizes[index - 1]?.sizeValueId;
    const previousValue = previousSizeValueId && valueBySizeId.has(previousSizeValueId) ? valueBySizeId.get(previousSizeValueId) : null;
    measurements.push(Object.freeze({
      sizeValueId: size.sizeValueId,
      sizeCode: size.code,
      value,
      deltaFromPrevious: previousValue === null ? null : subtractDecimals(value, previousValue),
    }));
  }
  const snapshot = pointRef.snapshot;
  return Object.freeze({
    pointEntryId,
    pointEntryVersion: pointRef.version,
    pointRef,
    pointCode,
    position,
    name: requiredText(snapshot?.name_ru, 2, 120, 'MEASUREMENT_POINT_NAME_INVALID', 'Point of measure RU name'),
    nameRu: requiredText(snapshot?.name_ru, 2, 120, 'MEASUREMENT_POINT_NAME_INVALID', 'Point of measure RU name'),
    nameEn: requiredText(snapshot?.name_en, 2, 120, 'MEASUREMENT_POINT_NAME_INVALID', 'Point of measure EN name'),
    description: optionalText(point.description, 500, 'MEASUREMENT_POINT_DESCRIPTION_INVALID', 'Point of measure method description') ?? optionalText(snapshot?.description_ru, 500, 'MEASUREMENT_POINT_DESCRIPTION_INVALID', 'Point of measure description'),
    toleranceMinus,
    tolerancePlus,
    baseValue: valueBySizeId.get(baseSizeValueId) ?? null,
    measurements: Object.freeze(measurements),
  });
}

function normalizeMdmReference(reference, { entryId, dictionaryCode, invalidCode }) {
  invariant(reference?.entryId === entryId, invalidCode, 'Governed MDM entry was not resolved', { entryId, dictionaryCode });
  invariant(reference.dictionaryCode === dictionaryCode, invalidCode, 'MDM entry belongs to another dictionary', { entryId, expectedDictionaryCode: dictionaryCode, actualDictionaryCode: reference.dictionaryCode });
  invariant(Number.isInteger(reference.version) && reference.version > 0 && reference.currentVersion === reference.version, invalidCode, 'Canonical Measurement Chart requires the current exact MDM entry version', { entryId, version: reference.version, currentVersion: reference.currentVersion });
  invariant(reference.status === 'active', invalidCode, 'Canonical Measurement Chart requires an active MDM entry', { entryId, status: reference.status });
  invariant(reference.approvalStatus === 'approved' || reference.approvalStatus === 'not_required', invalidCode, 'Canonical Measurement Chart requires an approved MDM entry', { entryId, approvalStatus: reference.approvalStatus });
  return deepFreezeClone(reference);
}

function normalizeSize(size, position, sizeCodes) {
  invariant(size && typeof size === 'object' && !Array.isArray(size), 'MEASUREMENT_SIZE_INVALID', 'Measurement size must be an object', { position });
  assertAllowedFields(size, SIZE_FIELDS, 'MEASUREMENT_SIZE_FIELD_FORBIDDEN', 'Measurement size contains unsupported fields', { position });
  const sizeCode = code(size.code, SIZE_CODE_PATTERN, 'MEASUREMENT_SIZE_CODE_INVALID', 'Measurement size code');
  invariant(!sizeCodes.has(sizeCode), 'MEASUREMENT_SIZE_CODE_DUPLICATE', 'Measurement size code must be unique', { sizeCode });
  sizeCodes.add(sizeCode);
  return Object.freeze({ code: sizeCode, label: requiredText(size.label, 1, 40, 'MEASUREMENT_SIZE_LABEL_INVALID', 'Measurement size label'), position });
}

function normalizePoint({ point, position, sizes, sizeCodes, baseSizeCode, pointCodes }) {
  invariant(point && typeof point === 'object' && !Array.isArray(point), 'MEASUREMENT_POINT_INVALID', 'Point of measure must be an object', { position });
  assertAllowedFields(point, POINT_FIELDS, 'MEASUREMENT_POINT_FIELD_FORBIDDEN', 'Point of measure contains unsupported fields', { position });
  const pointCode = code(point.pointCode, POINT_CODE_PATTERN, 'MEASUREMENT_POINT_CODE_INVALID', 'Point of measure code');
  invariant(!pointCodes.has(pointCode), 'MEASUREMENT_POINT_CODE_DUPLICATE', 'Point of measure code must be unique', { pointCode });
  pointCodes.add(pointCode);
  const toleranceMinus = nonNegativeDecimal(point.toleranceMinus, 'MEASUREMENT_TOLERANCE_MINUS_INVALID', 'Negative tolerance');
  const tolerancePlus = nonNegativeDecimal(point.tolerancePlus, 'MEASUREMENT_TOLERANCE_PLUS_INVALID', 'Positive tolerance');
  invariant(Array.isArray(point.measurements) && point.measurements.length <= sizes.length, 'MEASUREMENT_VALUES_INVALID', 'Point measurements cannot exceed the size chart', { pointCode });
  const measurementBySize = new Map();
  for (const rawMeasurement of point.measurements) {
    invariant(rawMeasurement && typeof rawMeasurement === 'object' && !Array.isArray(rawMeasurement), 'MEASUREMENT_VALUE_INVALID', 'Measurement value must be an object', { pointCode });
    assertAllowedFields(rawMeasurement, MEASUREMENT_FIELDS, 'MEASUREMENT_VALUE_FIELD_FORBIDDEN', 'Measurement value contains unsupported fields', { pointCode });
    const sizeCode = code(rawMeasurement.sizeCode, SIZE_CODE_PATTERN, 'MEASUREMENT_VALUE_SIZE_INVALID', 'Measurement value size code');
    invariant(sizeCodes.has(sizeCode), 'MEASUREMENT_VALUE_SIZE_UNKNOWN', 'Measurement value references an unknown size', { pointCode, sizeCode });
    invariant(!measurementBySize.has(sizeCode), 'MEASUREMENT_VALUE_SIZE_DUPLICATE', 'Point of measure can contain only one value per size', { pointCode, sizeCode });
    measurementBySize.set(sizeCode, positiveDecimal(rawMeasurement.value, 'MEASUREMENT_VALUE_INVALID', 'Measurement value'));
  }
  const measurements = [];
  for (let index = 0; index < sizes.length; index += 1) {
    const sizeCode = sizes[index].code;
    if (!measurementBySize.has(sizeCode)) continue;
    const value = measurementBySize.get(sizeCode);
    const previousSizeCode = sizes[index - 1]?.code;
    const previousValue = previousSizeCode && measurementBySize.has(previousSizeCode) ? measurementBySize.get(previousSizeCode) : null;
    measurements.push(Object.freeze({ sizeCode, value, deltaFromPrevious: previousValue === null ? null : subtractDecimals(value, previousValue) }));
  }
  return Object.freeze({
    pointCode,
    position,
    name: requiredText(point.name, 2, 120, 'MEASUREMENT_POINT_NAME_INVALID', 'Point of measure name'),
    description: optionalText(point.description, 500, 'MEASUREMENT_POINT_DESCRIPTION_INVALID', 'Point of measure description'),
    toleranceMinus,
    tolerancePlus,
    baseValue: measurementBySize.get(baseSizeCode) ?? null,
    measurements: Object.freeze(measurements),
  });
}

function assertCompleteMatrix(chart) {
  invariant(chart.points.length >= 1, 'MEASUREMENT_POINTS_REQUIRED', 'Measurement chart must contain at least one point of measure');
  for (const point of chart.points) {
    invariant(point.measurements.length === chart.sizes.length, 'MEASUREMENT_MATRIX_INCOMPLETE', 'Every point of measure must contain a value for every size', { pointCode: point.pointCode });
    invariant(point.measurements.every((measurement, index) => measurement.sizeCode === chart.sizes[index].code), 'MEASUREMENT_MATRIX_INCOMPLETE', 'Measurement values must follow the complete size order', { pointCode: point.pointCode });
    invariant(point.measurements.some((measurement) => measurement.sizeCode === chart.baseSizeCode), 'MEASUREMENT_BASE_VALUE_REQUIRED', 'Every point of measure must contain the base size value', { pointCode: point.pointCode, baseSizeCode: chart.baseSizeCode });
  }
}

function assertCompleteCanonicalMatrix(chart) {
  invariant(chart.points.length >= 1, 'MEASUREMENT_POINTS_REQUIRED', 'Canonical measurement chart must contain at least one governed point of measure');
  for (const point of chart.points) {
    invariant(point.measurements.length === chart.sizes.length, 'MEASUREMENT_MATRIX_INCOMPLETE', 'Every governed point of measure must contain a value for every Product SizeValue', { pointEntryId: point.pointEntryId });
    invariant(point.measurements.every((measurement, index) => measurement.sizeValueId === chart.sizes[index].sizeValueId), 'MEASUREMENT_MATRIX_INCOMPLETE', 'Canonical measurement values must follow the complete Product SizeValue order', { pointEntryId: point.pointEntryId });
    invariant(point.measurements.some((measurement) => measurement.sizeValueId === chart.baseSizeValueId), 'MEASUREMENT_BASE_VALUE_REQUIRED', 'Every governed point of measure must contain the base Product SizeValue', { pointEntryId: point.pointEntryId, baseSizeValueId: chart.baseSizeValueId });
  }
}

function assertCanonicalChart(chart) {
  invariant(chart?.sku === null && chart?.skuVersion === null, 'MEASUREMENT_CANONICAL_REQUIRED', 'Canonical Measurement Chart is required');
  invariant(chart?.styleVersionId && chart?.colorwayId && chart?.sizeScaleVersionId, 'MEASUREMENT_CANONICAL_LINEAGE_INVALID', 'Canonical Measurement Chart lineage is incomplete');
}

function assertCanonicalLineage(chart, normalized) {
  invariant(normalized.brandId === chart.brandId, 'MEASUREMENT_BRAND_MISMATCH', 'Measurement chart brand cannot be changed');
  invariant(normalized.styleVersionId === chart.styleVersionId && normalized.colorwayId === chart.colorwayId && normalized.sizeScaleVersionId === chart.sizeScaleVersionId, 'MEASUREMENT_CANONICAL_LINEAGE_IMMUTABLE', 'Canonical Measurement Chart Product Identity lineage cannot be changed');
}

function positiveDecimal(value, errorCode, label) { return decimal(value, { errorCode, label, allowZero: false, allowNegative: false }); }
function nonNegativeDecimal(value, errorCode, label) {
  const normalized = value === undefined || value === null || value === '' ? 0 : value;
  return decimal(normalized, { errorCode, label, allowZero: true, allowNegative: false });
}
function decimal(value, { errorCode, label, allowZero, allowNegative }) {
  invariant(Number.isFinite(value), errorCode, `${label} must be a finite number`);
  invariant(allowNegative ? (allowZero ? value <= Number.MAX_VALUE : value !== 0) : (allowZero ? value >= 0 : value > 0), errorCode, `${label} is outside the supported range`);
  const scaled = Math.round(value * SCALE);
  invariant(Number.isSafeInteger(scaled) && Math.abs(scaled) <= MAX_SCALED, `${errorCode}_TOO_LARGE`, `${label} exceeds the safe fixed-point range`);
  const normalized = scaled / SCALE;
  const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  invariant(Math.abs(value - normalized) <= tolerance, `${errorCode}_SCALE`, `${label} must use at most 4 decimal places`);
  return normalized;
}
function subtractDecimals(left, right) {
  const result = Math.round(left * SCALE) - Math.round(right * SCALE);
  invariant(Number.isSafeInteger(result), 'MEASUREMENT_DELTA_TOO_LARGE', 'Measurement grading delta exceeds the safe fixed-point range');
  return result / SCALE;
}
function code(value, pattern, errorCode, label) { invariant(typeof value === 'string' && pattern.test(value), errorCode, `${label} is invalid`); return value; }
function requiredId(value, errorCode, label) { return requiredText(value, 1, 160, errorCode, label); }
function requiredText(value, minimum, maximum, errorCode, label) {
  invariant(typeof value === 'string', errorCode, `${label} is required`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= minimum && normalized.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} characters`);
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), errorCode, `${label} contains control characters`);
  return normalized;
}
function optionalText(value, maximum, errorCode, label) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, maximum, errorCode, label); }
function assertAllowedFields(value, allowed, errorCode, message, details = {}) {
  const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  invariant(forbidden.length === 0, errorCode, message, { ...details, fields: forbidden });
}
function editableProjection(value) { return JSON.stringify({ skuVersion: value.skuVersion, unit: value.unit, baseSizeCode: value.baseSizeCode, sizes: value.sizes, points: value.points, notes: value.notes }); }
function canonicalEditableProjection(value) { return JSON.stringify({ measurementUnitEntryId: value.measurementUnitEntryId, measurementUnitEntryVersion: value.measurementUnitEntryVersion, baseSizeValueId: value.baseSizeValueId, sizes: value.sizes, points: value.points, notes: value.notes }); }
function deepFreezeClone(value) { return deepFreeze(structuredClone(value)); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
function freezeChart(value) {
  const sizes = Object.freeze((value.sizes || []).map((size) => Object.freeze({ ...size })));
  const points = Object.freeze((value.points || []).map((point) => Object.freeze({ ...point, measurements: Object.freeze((point.measurements || []).map((measurement) => Object.freeze({ ...measurement }))) })));
  return Object.freeze({ ...value, sizes, points });
}
