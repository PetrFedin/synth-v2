import { invariant } from '../../core/errors.mjs';

// Route B: запрос цены и заказ на материал. Зеркалит `src/modules/sourcing/public.mjs` один в один
// там, где применимо (тот же реестр поставщиков, тот же цикл draft → issued → quoted → awarded →
// allocated), и расходится там, где нет: контекст — материал, а не SKU + BOM; количество — дробное
// (метры, килограммы), а не целое число штук; нет техпака и образца, потому что это не запрос на
// пошив изделия. Встречное предложение и ценовые пороги по количеству намеренно не перенесены — это
// отдельный слой переговоров поверх уже закрывающего дыру в цепочке цикла.

export const MATERIAL_RFQ_STATUSES = Object.freeze(['draft', 'issued', 'quoted', 'awarded', 'allocated', 'cancelled']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const PO_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const MATERIAL_UNITS = Object.freeze(['m', 'kg', 'pc', 'yd']);
const SOURCING_INCOTERMS = Object.freeze(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']);
const MAX_QUANTITY = 100_000_000;
const RFQ_EDITABLE_FIELDS = Object.freeze(['targetQuantity', 'unit', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes']);

export function createMaterialRfq({ id, material, suppliers, input, createdAt }) {
  assertPublishedMaterial(material);
  const normalized = normalizeRfqInput(input, suppliers, material.brandId, createdAt);
  return freezeRfq({
    id: identifier(id, 'MATERIAL_RFQ_ID_REQUIRED', 'Material RFQ id'),
    rfqCode: code(input?.rfqCode, 'MATERIAL_RFQ_CODE_INVALID', 'Material RFQ code'),
    brandId: material.brandId,
    materialCode: material.code,
    materialVersion: material.version,
    ...normalized,
    status: 'draft',
    quotes: Object.freeze([]),
    selectedSupplierCode: null,
    award: null,
    allocation: null,
    cancellationReason: null,
    version: 1,
    issuedAt: null,
    awardedAt: null,
    allocatedAt: null,
    cancelledAt: null,
    createdAt: timestamp(createdAt, 'MATERIAL_RFQ_CREATED_AT_INVALID', 'Material RFQ creation time'),
    updatedAt: timestamp(createdAt, 'MATERIAL_RFQ_CREATED_AT_INVALID', 'Material RFQ creation time'),
  });
}

export function updateDraftMaterialRfq(rfq, { material, suppliers, input, updatedAt }) {
  invariant(rfq?.status === 'draft', 'MATERIAL_RFQ_NOT_DRAFT', 'Only a draft Material RFQ can be edited');
  assertRfqContextCurrent(rfq, material);
  const normalized = normalizeRfqInput(input, suppliers, rfq.brandId, updatedAt);
  const next = { ...rfq, ...normalized };
  if (rfqProjection(next) === rfqProjection(rfq)) return rfq;
  return freezeRfq({ ...next, version: rfq.version + 1, updatedAt: timestamp(updatedAt, 'MATERIAL_RFQ_UPDATED_AT_INVALID', 'Material RFQ update time') });
}

export function issueMaterialRfq(rfq, { material, suppliers, issuedAt }) {
  invariant(rfq?.status === 'draft', 'MATERIAL_RFQ_NOT_DRAFT', 'Only a draft Material RFQ can be issued');
  assertRfqContextCurrent(rfq, material);
  const at = timestamp(issuedAt, 'MATERIAL_RFQ_ISSUED_AT_INVALID', 'Material RFQ issue time');
  assertRfqDates(rfq.responseDueAt, rfq.deliveryDueAt, at);
  const supplierMap = qualifiedSupplierMap(suppliers, rfq.brandId);
  for (const supplierCode of rfq.supplierCodes) {
    const supplier = supplierMap.get(supplierCode);
    invariant(supplier, 'MATERIAL_RFQ_SUPPLIER_NOT_QUALIFIED', 'Every invited supplier must be qualified', { supplierCode });
    invariant(supplier.incoterms.includes(rfq.incoterm), 'MATERIAL_RFQ_SUPPLIER_INCOTERM_UNSUPPORTED', 'Invited supplier does not support the RFQ Incoterm', { supplierCode, incoterm: rfq.incoterm });
    invariant(Date.parse(supplier.auditExpiresAt) >= Date.parse(rfq.deliveryDueAt), 'MATERIAL_RFQ_SUPPLIER_AUDIT_EXPIRES_EARLY', 'Supplier audit expires before requested delivery', { supplierCode, auditExpiresAt: supplier.auditExpiresAt });
  }
  return freezeRfq({ ...rfq, status: 'issued', version: rfq.version + 1, issuedAt: at, updatedAt: at });
}

export function upsertMaterialRfqQuote(rfq, { supplier, input, receivedAt }) {
  invariant(['issued', 'quoted'].includes(rfq?.status), 'MATERIAL_RFQ_NOT_OPEN_FOR_QUOTES', 'Material RFQ is not open for quotations', { status: rfq?.status });
  const at = timestamp(receivedAt, 'MATERIAL_RFQ_QUOTE_RECEIVED_AT_INVALID', 'Quotation receipt time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  invariant(rfq.supplierCodes.includes(supplier.supplierCode), 'MATERIAL_RFQ_SUPPLIER_NOT_INVITED', 'Supplier was not invited to this Material RFQ', { supplierCode: supplier.supplierCode });
  invariant(Date.parse(at) <= Date.parse(rfq.responseDueAt), 'MATERIAL_RFQ_RESPONSE_DEADLINE_PASSED', 'Quotation arrived after the response deadline', { responseDueAt: rfq.responseDueAt });
  const quote = normalizeQuote(input, supplier, rfq, at);
  const previous = rfq.quotes.find((item) => item.supplierCode === supplier.supplierCode);
  const replacement = Object.freeze({ ...quote, revision: (previous?.revision ?? 0) + 1 });
  const quotes = [...rfq.quotes.filter((item) => item.supplierCode !== supplier.supplierCode), replacement]
    .sort((left, right) => left.supplierCode.localeCompare(right.supplierCode));
  return freezeRfq({ ...rfq, status: 'quoted', quotes: Object.freeze(quotes), version: rfq.version + 1, updatedAt: at });
}

export function awardMaterialRfq(rfq, { supplier, awardedAt }) {
  invariant(rfq?.status === 'quoted', 'MATERIAL_RFQ_NOT_AWARDABLE', 'Material RFQ must contain a quotation before award', { status: rfq?.status });
  const at = timestamp(awardedAt, 'MATERIAL_RFQ_AWARDED_AT_INVALID', 'Material RFQ award time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  const quote = rfq.quotes.find((item) => item.supplierCode === supplier.supplierCode);
  invariant(quote, 'MATERIAL_RFQ_QUOTE_NOT_FOUND', 'Selected supplier has no quotation', { supplierCode: supplier.supplierCode });
  invariant(Date.parse(quote.validUntil) >= Date.parse(at), 'MATERIAL_RFQ_QUOTE_EXPIRED', 'Selected quotation has expired', { supplierCode: supplier.supplierCode, validUntil: quote.validUntil });
  invariant(rfq.targetQuantity >= quote.minimumOrderQuantity, 'MATERIAL_RFQ_QUOTE_MOQ_NOT_MET', 'Material RFQ quantity is below quotation MOQ', { targetQuantity: rfq.targetQuantity, minimumOrderQuantity: quote.minimumOrderQuantity });
  const award = Object.freeze({
    supplierCode: supplier.supplierCode,
    supplierName: supplier.legalName,
    supplierVersion: supplier.version,
    quoteRevision: quote.revision,
    unitPriceMinor: quote.unitPriceMinor,
    fixedCostMinor: quote.fixedCostMinor,
    totalCostMinor: quote.totalCostMinor,
    currency: quote.currency,
    incoterm: rfq.incoterm,
  });
  return freezeRfq({ ...rfq, status: 'awarded', selectedSupplierCode: supplier.supplierCode, award, version: rfq.version + 1, awardedAt: at, updatedAt: at });
}

export function allocateMaterialRfq(rfq, { supplier, input, allocatedAt }) {
  invariant(rfq?.status === 'awarded', 'MATERIAL_RFQ_NOT_ALLOCATABLE', 'Only an awarded Material RFQ can be allocated to a purchase order', { status: rfq?.status });
  const at = timestamp(allocatedAt, 'MATERIAL_RFQ_ALLOCATED_AT_INVALID', 'Material RFQ allocation time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  invariant(supplier.supplierCode === rfq.selectedSupplierCode, 'MATERIAL_RFQ_AWARDED_SUPPLIER_MISMATCH', 'The purchase order must be allocated to the awarded supplier');
  const quantity = numeric(input?.quantity, 'MATERIAL_RFQ_ALLOCATION_QUANTITY_INVALID', 'Allocation quantity');
  invariant(quantity === rfq.targetQuantity, 'MATERIAL_RFQ_ALLOCATION_INCOMPLETE', 'Allocation quantity must cover the full awarded Material RFQ quantity', { quantity, targetQuantity: rfq.targetQuantity });
  const orderPlacedAt = timestamp(input?.orderPlacedAt, 'MATERIAL_RFQ_ORDER_PLACED_INVALID', 'Order placement time');
  const deliveryDueAt = timestamp(input?.deliveryDueAt, 'MATERIAL_RFQ_ALLOCATION_DELIVERY_INVALID', 'Allocation delivery due date');
  invariant(Date.parse(orderPlacedAt) >= Date.parse(at), 'MATERIAL_RFQ_ORDER_PLACED_IN_PAST', 'Order placement cannot precede allocation');
  invariant(Date.parse(deliveryDueAt) > Date.parse(orderPlacedAt), 'MATERIAL_RFQ_ALLOCATION_DATES_INVALID', 'Delivery must be after order placement');
  invariant(Date.parse(deliveryDueAt) <= Date.parse(rfq.deliveryDueAt), 'MATERIAL_RFQ_ALLOCATION_LATE', 'Allocated delivery exceeds the Material RFQ delivery deadline', { deliveryDueAt, rfqDeliveryDueAt: rfq.deliveryDueAt });
  const allocation = Object.freeze({
    purchaseOrderNumber: code(input?.purchaseOrderNumber, 'MATERIAL_RFQ_PURCHASE_ORDER_INVALID', 'Purchase order number', PO_PATTERN),
    supplierCode: supplier.supplierCode,
    quantity,
    orderPlacedAt,
    deliveryDueAt,
    notes: optionalText(input?.notes, 1000, 'MATERIAL_RFQ_ALLOCATION_NOTES_INVALID', 'Allocation notes'),
  });
  return freezeRfq({ ...rfq, status: 'allocated', allocation, version: rfq.version + 1, allocatedAt: at, updatedAt: at });
}

export function cancelMaterialRfq(rfq, { reason, cancelledAt }) {
  invariant(['draft', 'issued', 'quoted', 'awarded'].includes(rfq?.status), 'MATERIAL_RFQ_NOT_CANCELLABLE', 'Allocated or already cancelled Material RFQ cannot be cancelled', { status: rfq?.status });
  const at = timestamp(cancelledAt, 'MATERIAL_RFQ_CANCELLED_AT_INVALID', 'Material RFQ cancellation time');
  return freezeRfq({
    ...rfq,
    status: 'cancelled',
    cancellationReason: requiredText(reason, 5, 500, 'MATERIAL_RFQ_CANCELLATION_REASON_INVALID', 'Material RFQ cancellation reason'),
    version: rfq.version + 1,
    cancelledAt: at,
    updatedAt: at,
  });
}

function normalizeRfqInput(input, suppliers, brandId, referenceTime) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_RFQ_INPUT_INVALID', 'Material RFQ input is invalid');
  assertAllowedFields(input, new Set(['rfqCode', 'materialCode', ...RFQ_EDITABLE_FIELDS]), 'MATERIAL_RFQ_FIELD_FORBIDDEN', 'Material RFQ input contains unsupported fields');
  const missing = RFQ_EDITABLE_FIELDS.filter((field) => !Object.hasOwn(input, field));
  invariant(missing.length === 0, 'MATERIAL_RFQ_FIELD_REQUIRED', 'Material RFQ input is missing required fields', { missingFields: missing });
  const responseDueAt = timestamp(input.responseDueAt, 'MATERIAL_RFQ_RESPONSE_DUE_INVALID', 'Material RFQ response due date');
  const deliveryDueAt = timestamp(input.deliveryDueAt, 'MATERIAL_RFQ_DELIVERY_DUE_INVALID', 'Material RFQ delivery due date');
  assertRfqDates(responseDueAt, deliveryDueAt, referenceTime);
  const supplierCodes = uniqueCodes(input.supplierCodes, 1, 20, 'MATERIAL_RFQ_SUPPLIERS_INVALID', 'Material RFQ supplier list');
  const supplierMap = new Map((Array.isArray(suppliers) ? suppliers : []).map((supplier) => [supplier.supplierCode, supplier]));
  for (const supplierCode of supplierCodes) {
    const supplier = supplierMap.get(supplierCode);
    invariant(supplier?.brandId === brandId, 'MATERIAL_RFQ_SUPPLIER_NOT_FOUND', 'Material RFQ supplier was not found for this brand', { supplierCode });
    invariant(supplier.status === 'qualified', 'MATERIAL_RFQ_SUPPLIER_NOT_QUALIFIED', 'Material RFQ supplier must be qualified', { supplierCode, status: supplier.status });
  }
  return Object.freeze({
    targetQuantity: numeric(input.targetQuantity, 'MATERIAL_RFQ_TARGET_QUANTITY_INVALID', 'Material RFQ target quantity'),
    unit: enumeration(input.unit, MATERIAL_UNITS, 'MATERIAL_RFQ_UNIT_INVALID', 'Material RFQ unit'),
    responseDueAt,
    deliveryDueAt,
    incoterm: enumeration(input.incoterm, SOURCING_INCOTERMS, 'MATERIAL_RFQ_INCOTERM_INVALID', 'Material RFQ Incoterm'),
    supplierCodes,
    notes: optionalText(input.notes, 2000, 'MATERIAL_RFQ_NOTES_INVALID', 'Material RFQ notes'),
  });
}

function normalizeQuote(input, supplier, rfq, receivedAt) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_RFQ_QUOTE_INPUT_INVALID', 'Quotation input is invalid');
  const allowed = new Set(['supplierCode', 'currency', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes']);
  assertAllowedFields(input, allowed, 'MATERIAL_RFQ_QUOTE_FIELD_FORBIDDEN', 'Quotation contains unsupported fields');
  invariant(input.supplierCode === supplier.supplierCode, 'MATERIAL_RFQ_QUOTE_SUPPLIER_MISMATCH', 'Quotation supplier does not match selected supplier');
  const currency = pattern(input.currency, /^[A-Z]{3}$/, 'MATERIAL_RFQ_QUOTE_CURRENCY_INVALID', 'Quotation currency');
  const unitPriceMinor = integer(input.unitPriceMinor, 1, Number.MAX_SAFE_INTEGER, 'MATERIAL_RFQ_QUOTE_UNIT_PRICE_INVALID', 'Quotation unit price');
  const fixedCostMinor = integer(input.fixedCostMinor, 0, Number.MAX_SAFE_INTEGER, 'MATERIAL_RFQ_QUOTE_FIXED_COST_INVALID', 'Quotation fixed cost');
  const minimumOrderQuantity = numeric(input.minimumOrderQuantity, 'MATERIAL_RFQ_QUOTE_MOQ_INVALID', 'Quotation MOQ');
  invariant(rfq.targetQuantity >= minimumOrderQuantity && rfq.targetQuantity >= supplier.minimumOrderQuantity, 'MATERIAL_RFQ_QUOTE_MOQ_NOT_MET', 'Material RFQ quantity does not meet supplier or quotation MOQ', { targetQuantity: rfq.targetQuantity, minimumOrderQuantity, supplierMinimumOrderQuantity: supplier.minimumOrderQuantity });
  const totalCostMinor = Math.round(unitPriceMinor * rfq.targetQuantity) + fixedCostMinor;
  invariant(Number.isSafeInteger(totalCostMinor), 'MATERIAL_RFQ_QUOTE_TOTAL_TOO_LARGE', 'Quotation total exceeds supported precision');
  const validUntil = timestamp(input.validUntil, 'MATERIAL_RFQ_QUOTE_VALID_UNTIL_INVALID', 'Quotation validity');
  invariant(Date.parse(validUntil) >= Date.parse(rfq.responseDueAt) && Date.parse(validUntil) > Date.parse(receivedAt), 'MATERIAL_RFQ_QUOTE_VALIDITY_TOO_SHORT', 'Quotation must remain valid beyond the RFQ response deadline');
  return Object.freeze({
    supplierCode: supplier.supplierCode,
    supplierName: supplier.legalName,
    supplierVersion: supplier.version,
    currency,
    unitPriceMinor,
    fixedCostMinor,
    totalCostMinor,
    leadTimeDays: integer(input.leadTimeDays, 1, 730, 'MATERIAL_RFQ_QUOTE_LEAD_TIME_INVALID', 'Quotation lead time'),
    minimumOrderQuantity,
    validUntil,
    notes: optionalText(input.notes, 1000, 'MATERIAL_RFQ_QUOTE_NOTES_INVALID', 'Quotation notes'),
    receivedAt,
  });
}

function assertPublishedMaterial(material) {
  invariant(material?.status === 'published', 'MATERIAL_RFQ_MATERIAL_NOT_PUBLISHED', 'Material must be published before RFQ creation', { materialCode: material?.code });
  invariant(Number.isInteger(material.version) && material.version > 0, 'MATERIAL_RFQ_CONTEXT_VERSION_INVALID', 'Material version is required');
}

function assertRfqContextCurrent(rfq, material) {
  assertPublishedMaterial(material);
  invariant(material.code === rfq.materialCode && material.brandId === rfq.brandId, 'MATERIAL_RFQ_CONTEXT_MISMATCH', 'Material RFQ material context is invalid');
  invariant(material.version === rfq.materialVersion, 'MATERIAL_RFQ_SNAPSHOT_STALE', 'Material RFQ material snapshot is stale', { expectedVersion: rfq.materialVersion, actualVersion: material.version });
}

function assertQualifiedSupplier(supplier, brandId) {
  invariant(supplier?.brandId === brandId, 'MATERIAL_RFQ_SUPPLIER_NOT_FOUND', 'Supplier was not found for this brand', { supplierCode: supplier?.supplierCode });
  invariant(supplier.status === 'qualified', 'MATERIAL_RFQ_SUPPLIER_NOT_QUALIFIED', 'Supplier must be qualified', { supplierCode: supplier.supplierCode, status: supplier.status });
}

function qualifiedSupplierMap(suppliers, brandId) {
  const map = new Map();
  for (const supplier of Array.isArray(suppliers) ? suppliers : []) {
    if (supplier?.brandId === brandId && supplier.status === 'qualified') map.set(supplier.supplierCode, supplier);
  }
  return map;
}

function assertRfqDates(responseDueAt, deliveryDueAt, referenceTime) {
  const reference = timestamp(referenceTime, 'MATERIAL_RFQ_REFERENCE_TIME_INVALID', 'Material RFQ reference time');
  invariant(Date.parse(responseDueAt) > Date.parse(reference), 'MATERIAL_RFQ_RESPONSE_DUE_NOT_FUTURE', 'Material RFQ response deadline must be in the future');
  invariant(Date.parse(deliveryDueAt) > Date.parse(responseDueAt), 'MATERIAL_RFQ_DATES_INVALID', 'Material RFQ delivery must be after the response deadline');
}

function rfqProjection(value) {
  return JSON.stringify(Object.fromEntries(RFQ_EDITABLE_FIELDS.map((field) => [field, value[field]])));
}
function code(value, errorCode, label, regex = CODE_PATTERN) { return pattern(value, regex, errorCode, label); }
function identifier(value, errorCode, label) { return requiredText(value, 1, 160, errorCode, label); }
function pattern(value, regex, errorCode, label) { invariant(typeof value === 'string' && regex.test(value), errorCode, `${label} is invalid`); return value; }
function enumeration(value, allowed, errorCode, label) { invariant(typeof value === 'string' && allowed.includes(value), errorCode, `${label} is invalid`, { allowed }); return value; }
function integer(value, minimum, maximum, errorCode, label) { invariant(Number.isSafeInteger(value) && value >= minimum && value <= maximum, errorCode, `${label} must be an integer from ${minimum} to ${maximum}`); return value; }
function numeric(value, errorCode, label) { invariant(typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_QUANTITY, errorCode, `${label} must be a positive number`); return Math.round(value * 10_000) / 10_000; }
function timestamp(value, errorCode, label) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), errorCode, `${label} is invalid`); return new Date(value).toISOString(); }
function requiredText(value, minimum, maximum, errorCode, label) { invariant(typeof value === 'string', errorCode, `${label} is required`); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= minimum && normalized.length <= maximum && !/[\u0000-\u001f\u007f]/.test(normalized), errorCode, `${label} must contain ${minimum}-${maximum} valid characters`); return normalized; }
function optionalText(value, maximum, errorCode, label) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, maximum, errorCode, label); }
function uniqueCodes(value, minimum, maximum, errorCode, label) { invariant(Array.isArray(value) && value.length >= minimum && value.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} entries`); const normalized = value.map((item) => code(item, errorCode, label)); invariant(new Set(normalized).size === normalized.length, errorCode, `${label} contains duplicates`); return Object.freeze([...normalized].sort()); }
function assertAllowedFields(value, allowed, errorCode, message) { const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(forbidden.length === 0, errorCode, message, { fields: forbidden }); }
function freezeRfq(value) {
  invariant(MATERIAL_RFQ_STATUSES.includes(value.status), 'MATERIAL_RFQ_STATUS_INVALID', 'Material RFQ status is invalid', { status: value.status });
  return Object.freeze({
    ...value,
    supplierCodes: Object.freeze([...(value.supplierCodes || [])]),
    quotes: Object.freeze((value.quotes || []).map((quote) => Object.freeze({ ...quote }))),
    award: value.award ? Object.freeze({ ...value.award }) : null,
    allocation: value.allocation ? Object.freeze({ ...value.allocation }) : null,
  });
}
