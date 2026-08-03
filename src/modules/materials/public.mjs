import { invariant } from '../../core/errors.mjs';
import { normalizeMoney } from '../../core/money.mjs';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
export const MATERIAL_TYPES = Object.freeze(['fabric', 'trim', 'packaging', 'other']);
export const MATERIAL_UNITS = Object.freeze(['m', 'kg', 'pc', 'yd']);

export function createMaterial({
  code,
  brandId,
  name,
  type,
  unit,
  supplierName,
  supplierReference,
  composition,
  color,
  currency,
  unitCost,
  minimumOrderQuantity,
  availableQuantity,
  createdAt,
}) {
  const normalized = normalizeInput({
    code, brandId, name, type, unit, supplierName, supplierReference, composition, color,
    currency, unitCost, minimumOrderQuantity, availableQuantity,
  }, { includeIdentity: true });
  return freezeAvailability({
    id: normalized.code,
    ...normalized,
    reservedQuantity: 0,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function updateDraftMaterial(material, input, updatedAt) {
  invariant(material?.status === 'draft', 'MATERIAL_NOT_DRAFT', 'Only a draft material can be edited');
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_UPDATE_INVALID', 'Material update is invalid');
  const normalized = normalizeInput({ ...input, code: material.code, brandId: material.brandId }, { includeIdentity: true });
  const next = {
    ...material,
    name: normalized.name,
    type: normalized.type,
    unit: normalized.unit,
    supplierName: normalized.supplierName,
    supplierReference: normalized.supplierReference,
    composition: normalized.composition,
    color: normalized.color,
    currency: normalized.currency,
    unitCost: normalized.unitCost,
    minimumOrderQuantity: normalized.minimumOrderQuantity,
    availableQuantity: normalized.availableQuantity,
  };
  invariant(next.availableQuantity >= material.reservedQuantity, 'MATERIAL_AVAILABLE_BELOW_RESERVED', 'Available material quantity cannot be below reserved quantity', {
    code: material.code,
    availableQuantity: next.availableQuantity,
    reservedQuantity: material.reservedQuantity,
  });
  if (editableFieldsEqual(material, next)) return material;
  return freezeAvailability({ ...next, version: material.version + 1, updatedAt });
}

export function publishMaterial(material, publishedAt) {
  invariant(material?.status === 'draft', 'MATERIAL_NOT_DRAFT', 'Only a draft material can be published');
  invariant(material.supplierName, 'MATERIAL_SUPPLIER_REQUIRED', 'Supplier name is required before material publication');
  return freezeAvailability({
    ...material,
    status: 'published',
    version: material.version + 1,
    publishedAt,
    updatedAt: publishedAt,
  });
}

export function normalizeMaterial(material) {
  invariant(material && typeof material === 'object' && !Array.isArray(material), 'MATERIAL_INVALID', 'Material is invalid');
  const normalized = normalizeInput(material, { includeIdentity: true });
  const reservedQuantity = quantity(material.reservedQuantity ?? 0, 'MATERIAL_RESERVED_QUANTITY_INVALID', 'Reserved quantity', true);
  invariant(reservedQuantity <= normalized.availableQuantity, 'MATERIAL_RESERVED_QUANTITY_INVALID', 'Reserved quantity cannot exceed available quantity', {
    code: normalized.code,
    availableQuantity: normalized.availableQuantity,
    reservedQuantity,
  });
  return freezeAvailability({ ...material, ...normalized, reservedQuantity });
}

function normalizeInput(input, { includeIdentity }) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_INVALID', 'Material is invalid');
  const code = includeIdentity ? materialCode(input.code) : undefined;
  const brandId = includeIdentity ? identifier(input.brandId, 'MATERIAL_BRAND_REQUIRED', 'Material brand') : undefined;
  return Object.freeze({
    ...(includeIdentity ? { code, brandId } : {}),
    name: text(input.name, 'MATERIAL_NAME_REQUIRED', 'Material name', 2, 160, true),
    type: enumeration(input.type, MATERIAL_TYPES, 'MATERIAL_TYPE_INVALID', 'Material type'),
    unit: enumeration(input.unit, MATERIAL_UNITS, 'MATERIAL_UNIT_INVALID', 'Material unit'),
    supplierName: text(input.supplierName, 'MATERIAL_SUPPLIER_INVALID', 'Supplier name', 0, 160, false),
    supplierReference: text(input.supplierReference, 'MATERIAL_SUPPLIER_REFERENCE_INVALID', 'Supplier reference', 0, 120, false),
    composition: text(input.composition, 'MATERIAL_COMPOSITION_INVALID', 'Composition', 0, 500, false),
    color: text(input.color, 'MATERIAL_COLOR_INVALID', 'Material color', 0, 120, false),
    currency: currency(input.currency),
    unitCost: normalizeMoney(input.unitCost, {
      invalidCode: 'MATERIAL_UNIT_COST_INVALID',
      scaleCode: 'MATERIAL_UNIT_COST_SCALE_INVALID',
      overflowCode: 'MATERIAL_UNIT_COST_TOO_LARGE',
      label: 'Material unit cost',
    }),
    minimumOrderQuantity: quantity(input.minimumOrderQuantity, 'MATERIAL_MOQ_INVALID', 'Material MOQ'),
    availableQuantity: quantity(input.availableQuantity, 'MATERIAL_AVAILABLE_QUANTITY_INVALID', 'Available quantity', true),
  });
}

function materialCode(value) {
  invariant(CODE_PATTERN.test(value ?? ''), 'MATERIAL_CODE_INVALID', 'Material code must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
  return value;
}

function identifier(value, code, label) {
  invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, code, `${label} is required`);
  return value;
}

function text(value, code, label, minimum, maximum, required) {
  if (value === undefined || value === null || value === '') {
    invariant(!required, code, `${label} is required`);
    return null;
  }
  invariant(typeof value === 'string', code, `${label} must be a string`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= minimum && normalized.length <= maximum, code, `${label} must contain ${minimum}-${maximum} characters`);
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), code, `${label} contains control characters`);
  return normalized || null;
}

function enumeration(value, allowed, code, label) {
  invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { allowed });
  return value;
}

function currency(value) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'MATERIAL_CURRENCY_INVALID', 'Material currency must be a three-letter uppercase code');
  return value;
}

function quantity(value, code, label, allowZero = false) {
  return normalizeMoney(value, {
    invalidCode: code,
    scaleCode: `${code}_SCALE`,
    overflowCode: `${code}_TOO_LARGE`,
    label,
    allowZero,
  });
}

function editableFieldsEqual(left, right) {
  return [
    'name', 'type', 'unit', 'supplierName', 'supplierReference', 'composition', 'color',
    'currency', 'unitCost', 'minimumOrderQuantity', 'availableQuantity',
  ].every((field) => left[field] === right[field]);
}

function freezeAvailability(value) {
  invariant(value.reservedQuantity <= value.availableQuantity, 'MATERIAL_RESERVED_QUANTITY_INVALID', 'Reserved quantity cannot exceed available quantity', {
    code: value.code,
    availableQuantity: value.availableQuantity,
    reservedQuantity: value.reservedQuantity,
  });
  const availableToUse = Math.round((value.availableQuantity - value.reservedQuantity) * 10_000) / 10_000;
  return Object.freeze({ ...value, availableToUse });
}
