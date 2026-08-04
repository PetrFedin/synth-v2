import { invariant } from '../../core/errors.mjs';

export const MEASUREMENT_UNITS = Object.freeze(['cm', 'in']);
export const MEASUREMENT_STATUSES = Object.freeze(['draft', 'published']);

const SCALE = 10_000;
const MAX_SCALED = Number.MAX_SAFE_INTEGER;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const SIZE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,15}$/;
const POINT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;
const CHART_FIELDS = Object.freeze(new Set(['sku', 'unit', 'baseSizeCode', 'sizes', 'points', 'notes']));
const SIZE_FIELDS = Object.freeze(new Set(['code', 'label']));
const POINT_FIELDS = Object.freeze(new Set(['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements']));
const MEASUREMENT_FIELDS = Object.freeze(new Set(['sizeCode', 'value']));

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
  invariant(chart.points.length >= 1, 'MEASUREMENT_POINTS_REQUIRED', 'Measurement chart must contain at least one point of measure');
  for (const point of chart.points) {
    invariant(point.measurements.length === chart.sizes.length, 'MEASUREMENT_MATRIX_INCOMPLETE', 'Every point of measure must contain a value for every size', { pointCode: point.pointCode });
    invariant(point.measurements.every((measurement, index) => measurement.sizeCode === chart.sizes[index].code), 'MEASUREMENT_MATRIX_INCOMPLETE', 'Measurement values must follow the complete size order', { pointCode: point.pointCode });
    invariant(point.measurements.some((measurement) => measurement.sizeCode === chart.baseSizeCode), 'MEASUREMENT_BASE_VALUE_REQUIRED', 'Every point of measure must contain the base size value', { pointCode: point.pointCode, baseSizeCode: chart.baseSizeCode });
  }
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
function freezeChart(value) {
  const sizes = Object.freeze((value.sizes || []).map((size) => Object.freeze({ ...size })));
  const points = Object.freeze((value.points || []).map((point) => Object.freeze({ ...point, measurements: Object.freeze((point.measurements || []).map((measurement) => Object.freeze({ ...measurement }))) })));
  return Object.freeze({ ...value, sizes, points });
}
