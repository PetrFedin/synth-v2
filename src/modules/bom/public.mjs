import { invariant } from '../../core/errors.mjs';
import { normalizeMoney } from '../../core/money.mjs';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const LINE_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const SCALE = 10_000n;
const PERCENT_DENOMINATOR = 1_000_000n;
const COST_DENOMINATOR = 100_000_000n;
const MAX_SCALED = BigInt(Number.MAX_SAFE_INTEGER);
const BOM_FIELDS = Object.freeze(new Set(['sku', 'currency', 'lines', 'laborCost', 'overheadCost', 'logisticsCost', 'otherCost', 'notes']));
const LINE_FIELDS = Object.freeze(new Set(['lineId', 'component', 'materialCode', 'quantity', 'wastePercent', 'exchangeRate']));

export function createBom({ id, catalogSku, materials, input, createdAt }) {
  invariant(typeof id === 'string' && id.length >= 1 && id.length <= 160, 'BOM_ID_REQUIRED', 'BOM id is required');
  const normalized = normalizeBomInput({ catalogSku, materials, input });
  return freezeBom({
    id,
    ...normalized,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function updateDraftBom(bom, { catalogSku, materials, input, updatedAt }) {
  invariant(bom?.status === 'draft', 'BOM_NOT_DRAFT', 'Only a draft BOM can be edited');
  invariant(catalogSku?.sku === bom.sku, 'BOM_SKU_MISMATCH', 'BOM SKU cannot be changed');
  const normalized = normalizeBomInput({ catalogSku, materials, input: { ...input, sku: bom.sku } });
  invariant(normalized.brandId === bom.brandId, 'BOM_BRAND_MISMATCH', 'BOM brand cannot be changed');
  const next = { ...bom, ...normalized };
  if (editableProjection(bom) === editableProjection(next)) return bom;
  return freezeBom({ ...next, version: bom.version + 1, updatedAt });
}

export function publishBom(bom, { catalogSku, materials, publishedAt }) {
  invariant(bom?.status === 'draft', 'BOM_NOT_DRAFT', 'Only a draft BOM can be published');
  invariant(catalogSku?.sku === bom.sku && catalogSku.brandId === bom.brandId, 'BOM_SKU_MISMATCH', 'BOM SKU context is invalid');
  invariant(catalogSku.status === 'published', 'BOM_SKU_NOT_PUBLISHED', 'SKU must be published before BOM publication', { sku: bom.sku });
  invariant(bom.lines.length > 0, 'BOM_LINES_REQUIRED', 'BOM must contain at least one material line');
  const materialByCode = materialMap(materials);
  for (const line of bom.lines) {
    const material = materialByCode.get(line.materialCode);
    invariant(material, 'BOM_MATERIAL_NOT_FOUND', 'BOM material not found', { materialCode: line.materialCode });
    invariant(material.brandId === bom.brandId, 'BOM_MATERIAL_BRAND_MISMATCH', 'BOM material belongs to another brand', { materialCode: line.materialCode });
    invariant(material.status === 'published', 'BOM_MATERIAL_NOT_PUBLISHED', 'Every BOM material must be published', { materialCode: line.materialCode });
    invariant(
      material.version === line.materialVersion
        && material.currency === line.materialCurrency
        && material.unit === line.unit
        && material.unitCost === line.unitCostSnapshot,
      'BOM_MATERIAL_SNAPSHOT_STALE',
      'BOM material snapshot is stale and must be repriced before publication',
      { materialCode: line.materialCode, expectedVersion: line.materialVersion, actualVersion: material.version },
    );
  }
  invariant(bom.totalCost > 0, 'BOM_TOTAL_COST_INVALID', 'BOM total cost must be greater than zero');
  return freezeBom({ ...bom, status: 'published', version: bom.version + 1, publishedAt, updatedAt: publishedAt });
}

export function normalizeBom(bom) {
  invariant(bom && typeof bom === 'object' && !Array.isArray(bom), 'BOM_INVALID', 'BOM is invalid');
  return freezeBom(bom);
}

function normalizeBomInput({ catalogSku, materials, input }) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'BOM_INPUT_INVALID', 'BOM input is invalid');
  assertAllowedFields(input, BOM_FIELDS, 'BOM_FIELD_FORBIDDEN', 'BOM input contains unsupported fields');
  const sku = code(input.sku, 'BOM_SKU_INVALID', 'BOM SKU');
  invariant(catalogSku?.sku === sku, 'BOM_SKU_NOT_FOUND', 'Catalog SKU not found', { sku });
  invariant(typeof catalogSku.brandId === 'string' && catalogSku.brandId, 'BOM_BRAND_REQUIRED', 'BOM brand is required');
  const currency = currencyCode(input.currency);
  invariant(Array.isArray(input.lines), 'BOM_LINES_INVALID', 'BOM lines must be an array');
  invariant(input.lines.length >= 1 && input.lines.length <= 500, 'BOM_LINES_INVALID', 'BOM must contain 1 to 500 lines');
  const materialByCode = materialMap(materials);
  const lineIds = new Set();
  const lines = input.lines.map((line, index) => normalizeLine({
    line,
    position: index + 1,
    brandId: catalogSku.brandId,
    bomCurrency: currency,
    materialByCode,
    lineIds,
  }));
  const laborCost = nonNegativeMoney(input.laborCost, 'BOM_LABOR_COST_INVALID', 'Labor cost');
  const overheadCost = nonNegativeMoney(input.overheadCost, 'BOM_OVERHEAD_COST_INVALID', 'Overhead cost');
  const logisticsCost = nonNegativeMoney(input.logisticsCost, 'BOM_LOGISTICS_COST_INVALID', 'Logistics cost');
  const otherCost = nonNegativeMoney(input.otherCost, 'BOM_OTHER_COST_INVALID', 'Other cost');
  const materialCostScaled = lines.reduce((sum, line) => sum + toScaled(line.lineCost), 0n);
  const totalCostScaled = materialCostScaled
    + toScaled(laborCost)
    + toScaled(overheadCost)
    + toScaled(logisticsCost)
    + toScaled(otherCost);
  return Object.freeze({
    sku,
    brandId: catalogSku.brandId,
    currency,
    lines: Object.freeze(lines),
    materialCost: fromScaled(materialCostScaled, 'BOM_MATERIAL_COST_TOO_LARGE'),
    laborCost,
    overheadCost,
    logisticsCost,
    otherCost,
    totalCost: fromScaled(totalCostScaled, 'BOM_TOTAL_COST_TOO_LARGE'),
    notes: optionalText(input.notes, 2000, 'BOM_NOTES_INVALID', 'BOM notes'),
  });
}

function normalizeLine({ line, position, brandId, bomCurrency, materialByCode, lineIds }) {
  invariant(line && typeof line === 'object' && !Array.isArray(line), 'BOM_LINE_INVALID', 'BOM line must be an object', { position });
  assertAllowedFields(line, LINE_FIELDS, 'BOM_LINE_FIELD_FORBIDDEN', 'BOM line contains unsupported fields', { position });
  const lineId = code(line.lineId, 'BOM_LINE_ID_INVALID', 'BOM line id', LINE_ID_PATTERN);
  invariant(!lineIds.has(lineId), 'BOM_LINE_ID_DUPLICATE', 'BOM line id must be unique', { lineId });
  lineIds.add(lineId);
  const materialCode = code(line.materialCode, 'BOM_MATERIAL_CODE_INVALID', 'Material code');
  const material = materialByCode.get(materialCode);
  invariant(material, 'BOM_MATERIAL_NOT_FOUND', 'BOM material not found', { materialCode });
  invariant(material.brandId === brandId, 'BOM_MATERIAL_BRAND_MISMATCH', 'BOM material belongs to another brand', { materialCode, brandId, materialBrandId: material.brandId });
  invariant(Number.isInteger(material.version) && material.version >= 1, 'BOM_MATERIAL_VERSION_INVALID', 'Material version is invalid', { materialCode });
  const quantity = positiveMoney(line.quantity, 'BOM_LINE_QUANTITY_INVALID', 'BOM line quantity');
  const wastePercent = nonNegativeMoney(line.wastePercent, 'BOM_LINE_WASTE_INVALID', 'BOM line waste percent');
  invariant(wastePercent <= 1000, 'BOM_LINE_WASTE_INVALID', 'BOM line waste percent cannot exceed 1000', { lineId, wastePercent });
  const exchangeRate = exchangeRateFor(line.exchangeRate, material.currency, bomCurrency, lineId);
  const grossQuantityScaled = roundDivide(
    toScaled(quantity) * (PERCENT_DENOMINATOR + toScaled(wastePercent)),
    PERCENT_DENOMINATOR,
  );
  const lineCostScaled = roundDivide(
    grossQuantityScaled * toScaled(material.unitCost) * toScaled(exchangeRate),
    COST_DENOMINATOR,
  );
  return Object.freeze({
    lineId,
    position,
    component: requiredText(line.component, 2, 160, 'BOM_COMPONENT_REQUIRED', 'BOM component'),
    materialCode,
    materialVersion: material.version,
    materialName: material.name,
    materialType: material.type,
    unit: material.unit,
    quantity,
    wastePercent,
    grossQuantity: fromScaled(grossQuantityScaled, 'BOM_GROSS_QUANTITY_TOO_LARGE'),
    materialCurrency: material.currency,
    unitCostSnapshot: material.unitCost,
    exchangeRate,
    lineCost: fromScaled(lineCostScaled, 'BOM_LINE_COST_TOO_LARGE'),
  });
}

function exchangeRateFor(value, materialCurrency, bomCurrency, lineId) {
  invariant(typeof materialCurrency === 'string' && /^[A-Z]{3}$/.test(materialCurrency), 'BOM_MATERIAL_CURRENCY_INVALID', 'Material currency is invalid', { lineId, materialCurrency });
  if (materialCurrency === bomCurrency) {
    if (value === undefined || value === null || value === '') return 1;
    const rate = positiveMoney(value, 'BOM_EXCHANGE_RATE_INVALID', 'Exchange rate');
    invariant(rate === 1, 'BOM_EXCHANGE_RATE_INVALID', 'Exchange rate must be 1 when material and BOM currencies match', { lineId });
    return 1;
  }
  invariant(value !== undefined && value !== null && value !== '', 'BOM_EXCHANGE_RATE_REQUIRED', 'Exchange rate is required for cross-currency material', { lineId, materialCurrency, bomCurrency });
  return positiveMoney(value, 'BOM_EXCHANGE_RATE_INVALID', 'Exchange rate');
}

function materialMap(materials) {
  invariant(Array.isArray(materials), 'BOM_MATERIALS_INVALID', 'BOM materials must be an array');
  const map = new Map();
  for (const material of materials) {
    invariant(material?.code && !map.has(material.code), 'BOM_MATERIALS_INVALID', 'BOM materials contain an invalid or duplicate record', { materialCode: material?.code });
    map.set(material.code, material);
  }
  return map;
}

function positiveMoney(value, codeValue, label) {
  return normalizeMoney(value, { invalidCode: codeValue, scaleCode: `${codeValue}_SCALE`, overflowCode: `${codeValue}_TOO_LARGE`, label });
}

function nonNegativeMoney(value, codeValue, label) {
  const normalized = value === undefined || value === null || value === '' ? 0 : value;
  return normalizeMoney(normalized, { invalidCode: codeValue, scaleCode: `${codeValue}_SCALE`, overflowCode: `${codeValue}_TOO_LARGE`, label, allowZero: true });
}

function toScaled(value) {
  return BigInt(Math.round(value * Number(SCALE)));
}

function fromScaled(value, errorCode) {
  invariant(value >= 0n && value <= MAX_SCALED, errorCode, 'Calculated BOM value exceeds supported precision');
  return Number(value) / Number(SCALE);
}

function roundDivide(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function code(value, errorCode, label, pattern = CODE_PATTERN) {
  invariant(typeof value === 'string' && pattern.test(value), errorCode, `${label} is invalid`);
  return value;
}

function currencyCode(value) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'BOM_CURRENCY_INVALID', 'BOM currency must be a three-letter uppercase code');
  return value;
}

function requiredText(value, minimum, maximum, errorCode, label) {
  invariant(typeof value === 'string', errorCode, `${label} is required`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= minimum && normalized.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} characters`);
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), errorCode, `${label} contains control characters`);
  return normalized;
}

function optionalText(value, maximum, errorCode, label) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, 1, maximum, errorCode, label);
}

function assertAllowedFields(value, allowed, errorCode, message, details = {}) {
  const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  invariant(forbidden.length === 0, errorCode, message, { ...details, fields: forbidden });
}

function editableProjection(value) {
  return JSON.stringify({
    currency: value.currency,
    lines: value.lines,
    materialCost: value.materialCost,
    laborCost: value.laborCost,
    overheadCost: value.overheadCost,
    logisticsCost: value.logisticsCost,
    otherCost: value.otherCost,
    totalCost: value.totalCost,
    notes: value.notes,
  });
}

function freezeBom(value) {
  const lines = Object.freeze((value.lines || []).map((line) => Object.freeze({ ...line })));
  return Object.freeze({ ...value, lines });
}
