import { invariant } from '../../core/errors.mjs';

export const SUPPLIER_STATUSES = Object.freeze(['draft', 'qualified', 'suspended', 'archived']);
export const RFQ_STATUSES = Object.freeze(['draft', 'issued', 'quoted', 'awarded', 'allocated', 'cancelled']);
export const SOURCING_INCOTERMS = Object.freeze(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const PO_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INTEGER = 2_147_483_647;
const SUPPLIER_EDITABLE_FIELDS = Object.freeze(new Set([
  'legalName', 'countryCode', 'email', 'currency', 'incoterms', 'categories', 'leadTimeDays',
  'minimumOrderQuantity', 'paymentTermsDays', 'auditExpiresAt', 'notes',
]));
const RFQ_EDITABLE_FIELDS = Object.freeze(new Set([
  'targetQuantity', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes',
]));

export function createSupplier({ id, brandId, input, createdAt }) {
  const supplierCode = code(input?.supplierCode, 'SUPPLIER_CODE_INVALID', 'Supplier code');
  const normalized = normalizeSupplierInput(input, { requireCode: true });
  return freezeSupplier({
    id: identifier(id, 'SUPPLIER_ID_REQUIRED', 'Supplier id'),
    supplierCode,
    brandId: identifier(brandId, 'SUPPLIER_BRAND_REQUIRED', 'Supplier brand'),
    ...normalized,
    status: 'draft',
    version: 1,
    qualifiedAt: null,
    suspendedAt: null,
    suspensionReason: null,
    archivedAt: null,
    createdAt: timestamp(createdAt, 'SUPPLIER_CREATED_AT_INVALID', 'Supplier creation time'),
    updatedAt: timestamp(createdAt, 'SUPPLIER_CREATED_AT_INVALID', 'Supplier creation time'),
  });
}

export function updateSupplier(supplier, { input, updatedAt }) {
  invariant(['draft', 'suspended'].includes(supplier?.status), 'SUPPLIER_NOT_EDITABLE', 'Only a draft or suspended supplier can be edited', { status: supplier?.status });
  const normalized = normalizeSupplierInput(input, { requireCode: false });
  const next = { ...supplier, ...normalized };
  if (supplierProjection(next) === supplierProjection(supplier)) return supplier;
  return freezeSupplier({ ...next, version: supplier.version + 1, updatedAt: timestamp(updatedAt, 'SUPPLIER_UPDATED_AT_INVALID', 'Supplier update time') });
}

export function qualifySupplier(supplier, { qualifiedAt }) {
  invariant(['draft', 'suspended'].includes(supplier?.status), 'SUPPLIER_NOT_QUALIFIABLE', 'Only a draft or suspended supplier can be qualified', { status: supplier?.status });
  const at = timestamp(qualifiedAt, 'SUPPLIER_QUALIFIED_AT_INVALID', 'Supplier qualification time');
  invariant(Date.parse(supplier.auditExpiresAt) > Date.parse(at), 'SUPPLIER_AUDIT_EXPIRED', 'Supplier audit must remain valid after qualification', { auditExpiresAt: supplier.auditExpiresAt });
  invariant(supplier.categories.length > 0, 'SUPPLIER_CATEGORIES_REQUIRED', 'At least one supplier category is required');
  invariant(supplier.incoterms.length > 0, 'SUPPLIER_INCOTERMS_REQUIRED', 'At least one supplier Incoterm is required');
  return freezeSupplier({
    ...supplier,
    status: 'qualified',
    version: supplier.version + 1,
    qualifiedAt: at,
    suspendedAt: null,
    suspensionReason: null,
    archivedAt: null,
    updatedAt: at,
  });
}

export function suspendSupplier(supplier, { reason, suspendedAt }) {
  invariant(supplier?.status === 'qualified', 'SUPPLIER_NOT_QUALIFIED', 'Only a qualified supplier can be suspended', { status: supplier?.status });
  const at = timestamp(suspendedAt, 'SUPPLIER_SUSPENDED_AT_INVALID', 'Supplier suspension time');
  return freezeSupplier({
    ...supplier,
    status: 'suspended',
    version: supplier.version + 1,
    suspendedAt: at,
    suspensionReason: requiredText(reason, 5, 500, 'SUPPLIER_SUSPENSION_REASON_INVALID', 'Supplier suspension reason'),
    updatedAt: at,
  });
}

export function archiveSupplier(supplier, { archivedAt }) {
  invariant(['draft', 'suspended'].includes(supplier?.status), 'SUPPLIER_NOT_ARCHIVABLE', 'A qualified supplier must be suspended before archival', { status: supplier?.status });
  const at = timestamp(archivedAt, 'SUPPLIER_ARCHIVED_AT_INVALID', 'Supplier archival time');
  return freezeSupplier({ ...supplier, status: 'archived', version: supplier.version + 1, archivedAt: at, updatedAt: at });
}

export function createRfq({ id, catalogSku, bom, suppliers, input, createdAt }) {
  assertPublishedSourcingContext(catalogSku, bom);
  const normalized = normalizeRfqInput(input, suppliers, catalogSku.brandId, createdAt);
  return freezeRfq({
    id: identifier(id, 'RFQ_ID_REQUIRED', 'RFQ id'),
    rfqCode: code(input?.rfqCode, 'RFQ_CODE_INVALID', 'RFQ code'),
    brandId: catalogSku.brandId,
    sku: catalogSku.sku,
    skuVersion: catalogSku.version,
    bomVersion: bom.version,
    bomCurrency: bom.currency,
    bomTotalCost: bom.totalCost,
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
    createdAt: timestamp(createdAt, 'RFQ_CREATED_AT_INVALID', 'RFQ creation time'),
    updatedAt: timestamp(createdAt, 'RFQ_CREATED_AT_INVALID', 'RFQ creation time'),
  });
}

export function updateDraftRfq(rfq, { catalogSku, bom, suppliers, input, updatedAt }) {
  invariant(rfq?.status === 'draft', 'RFQ_NOT_DRAFT', 'Only a draft RFQ can be edited');
  assertRfqContextCurrent(rfq, catalogSku, bom);
  const normalized = normalizeRfqInput(input, suppliers, rfq.brandId, updatedAt);
  const next = { ...rfq, ...normalized };
  if (rfqProjection(next) === rfqProjection(rfq)) return rfq;
  return freezeRfq({ ...next, version: rfq.version + 1, updatedAt: timestamp(updatedAt, 'RFQ_UPDATED_AT_INVALID', 'RFQ update time') });
}

export function issueRfq(rfq, { catalogSku, bom, suppliers, issuedAt }) {
  invariant(rfq?.status === 'draft', 'RFQ_NOT_DRAFT', 'Only a draft RFQ can be issued');
  assertRfqContextCurrent(rfq, catalogSku, bom);
  const at = timestamp(issuedAt, 'RFQ_ISSUED_AT_INVALID', 'RFQ issue time');
  assertRfqDates(rfq.responseDueAt, rfq.deliveryDueAt, at);
  const supplierMap = qualifiedSupplierMap(suppliers, rfq.brandId);
  for (const supplierCode of rfq.supplierCodes) {
    const supplier = supplierMap.get(supplierCode);
    invariant(supplier, 'RFQ_SUPPLIER_NOT_QUALIFIED', 'Every invited supplier must be qualified', { supplierCode });
    invariant(supplier.incoterms.includes(rfq.incoterm), 'RFQ_SUPPLIER_INCOTERM_UNSUPPORTED', 'Invited supplier does not support the RFQ Incoterm', { supplierCode, incoterm: rfq.incoterm });
    invariant(Date.parse(supplier.auditExpiresAt) >= Date.parse(rfq.deliveryDueAt), 'RFQ_SUPPLIER_AUDIT_EXPIRES_EARLY', 'Supplier audit expires before requested delivery', { supplierCode, auditExpiresAt: supplier.auditExpiresAt });
  }
  return freezeRfq({ ...rfq, status: 'issued', version: rfq.version + 1, issuedAt: at, updatedAt: at });
}

export function upsertRfqQuote(rfq, { supplier, input, receivedAt }) {
  invariant(['issued', 'quoted'].includes(rfq?.status), 'RFQ_NOT_OPEN_FOR_QUOTES', 'RFQ is not open for quotations', { status: rfq?.status });
  const at = timestamp(receivedAt, 'RFQ_QUOTE_RECEIVED_AT_INVALID', 'Quotation receipt time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  invariant(rfq.supplierCodes.includes(supplier.supplierCode), 'RFQ_SUPPLIER_NOT_INVITED', 'Supplier was not invited to this RFQ', { supplierCode: supplier.supplierCode });
  invariant(Date.parse(at) <= Date.parse(rfq.responseDueAt), 'RFQ_RESPONSE_DEADLINE_PASSED', 'Quotation arrived after the response deadline', { responseDueAt: rfq.responseDueAt });
  const quote = normalizeQuote(input, supplier, rfq, at);
  const previous = rfq.quotes.find((item) => item.supplierCode === supplier.supplierCode);
  const replacement = Object.freeze({ ...quote, revision: (previous?.revision ?? 0) + 1 });
  const quotes = [...rfq.quotes.filter((item) => item.supplierCode !== supplier.supplierCode), replacement]
    .sort((left, right) => left.supplierCode.localeCompare(right.supplierCode));
  return freezeRfq({ ...rfq, status: 'quoted', quotes: Object.freeze(quotes), version: rfq.version + 1, updatedAt: at });
}

export function awardRfq(rfq, { supplier, awardedAt }) {
  invariant(rfq?.status === 'quoted', 'RFQ_NOT_AWARDABLE', 'RFQ must contain a quotation before award', { status: rfq?.status });
  const at = timestamp(awardedAt, 'RFQ_AWARDED_AT_INVALID', 'RFQ award time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  const quote = rfq.quotes.find((item) => item.supplierCode === supplier.supplierCode);
  invariant(quote, 'RFQ_QUOTE_NOT_FOUND', 'Selected supplier has no quotation', { supplierCode: supplier.supplierCode });
  invariant(Date.parse(quote.validUntil) >= Date.parse(at), 'RFQ_QUOTE_EXPIRED', 'Selected quotation has expired', { supplierCode: supplier.supplierCode, validUntil: quote.validUntil });
  invariant(rfq.targetQuantity >= quote.minimumOrderQuantity, 'RFQ_QUOTE_MOQ_NOT_MET', 'RFQ quantity is below quotation MOQ', { targetQuantity: rfq.targetQuantity, minimumOrderQuantity: quote.minimumOrderQuantity });
  const award = Object.freeze({
    supplierCode: supplier.supplierCode,
    supplierName: supplier.legalName,
    supplierVersion: supplier.version,
    quoteRevision: quote.revision,
    unitPriceMinor: quote.unitPriceMinor,
    fixedCostMinor: quote.fixedCostMinor,
    totalCostMinor: quote.totalCostMinor,
    currency: rfq.bomCurrency,
    incoterm: rfq.incoterm,
  });
  return freezeRfq({ ...rfq, status: 'awarded', selectedSupplierCode: supplier.supplierCode, award, version: rfq.version + 1, awardedAt: at, updatedAt: at });
}

export function allocateRfq(rfq, { supplier, input, allocatedAt }) {
  invariant(rfq?.status === 'awarded', 'RFQ_NOT_ALLOCATABLE', 'Only an awarded RFQ can be allocated to production', { status: rfq?.status });
  const at = timestamp(allocatedAt, 'RFQ_ALLOCATED_AT_INVALID', 'RFQ allocation time');
  assertQualifiedSupplier(supplier, rfq.brandId);
  invariant(supplier.supplierCode === rfq.selectedSupplierCode, 'RFQ_AWARDED_SUPPLIER_MISMATCH', 'Production must be allocated to the awarded supplier');
  const quantity = integer(input?.quantity, 1, MAX_INTEGER, 'RFQ_ALLOCATION_QUANTITY_INVALID', 'Allocation quantity');
  invariant(quantity === rfq.targetQuantity, 'RFQ_ALLOCATION_INCOMPLETE', 'Allocation quantity must cover the full awarded RFQ quantity', { quantity, targetQuantity: rfq.targetQuantity });
  const productionStartAt = timestamp(input?.productionStartAt, 'RFQ_PRODUCTION_START_INVALID', 'Production start');
  const deliveryDueAt = timestamp(input?.deliveryDueAt, 'RFQ_ALLOCATION_DELIVERY_INVALID', 'Allocation delivery due date');
  invariant(Date.parse(productionStartAt) >= Date.parse(at), 'RFQ_PRODUCTION_START_IN_PAST', 'Production start cannot precede allocation');
  invariant(Date.parse(deliveryDueAt) > Date.parse(productionStartAt), 'RFQ_ALLOCATION_DATES_INVALID', 'Delivery must be after production start');
  invariant(Date.parse(deliveryDueAt) <= Date.parse(rfq.deliveryDueAt), 'RFQ_ALLOCATION_LATE', 'Allocated delivery exceeds the RFQ delivery deadline', { deliveryDueAt, rfqDeliveryDueAt: rfq.deliveryDueAt });
  const allocation = Object.freeze({
    purchaseOrderNumber: code(input?.purchaseOrderNumber, 'RFQ_PURCHASE_ORDER_INVALID', 'Purchase order number', PO_PATTERN),
    supplierCode: supplier.supplierCode,
    quantity,
    productionStartAt,
    deliveryDueAt,
    notes: optionalText(input?.notes, 1000, 'RFQ_ALLOCATION_NOTES_INVALID', 'Allocation notes'),
  });
  return freezeRfq({ ...rfq, status: 'allocated', allocation, version: rfq.version + 1, allocatedAt: at, updatedAt: at });
}

export function cancelRfq(rfq, { reason, cancelledAt }) {
  invariant(['draft', 'issued', 'quoted', 'awarded'].includes(rfq?.status), 'RFQ_NOT_CANCELLABLE', 'Allocated or already cancelled RFQ cannot be cancelled', { status: rfq?.status });
  const at = timestamp(cancelledAt, 'RFQ_CANCELLED_AT_INVALID', 'RFQ cancellation time');
  return freezeRfq({
    ...rfq,
    status: 'cancelled',
    cancellationReason: requiredText(reason, 5, 500, 'RFQ_CANCELLATION_REASON_INVALID', 'RFQ cancellation reason'),
    version: rfq.version + 1,
    cancelledAt: at,
    updatedAt: at,
  });
}

function normalizeSupplierInput(input, { requireCode }) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'SUPPLIER_INPUT_INVALID', 'Supplier input is invalid');
  const allowed = requireCode ? new Set(['supplierCode', ...SUPPLIER_EDITABLE_FIELDS]) : SUPPLIER_EDITABLE_FIELDS;
  assertAllowedFields(input, allowed, 'SUPPLIER_FIELD_FORBIDDEN', 'Supplier input contains unsupported fields');
  const missing = [...SUPPLIER_EDITABLE_FIELDS].filter((field) => !Object.hasOwn(input, field));
  invariant(missing.length === 0, 'SUPPLIER_FIELD_REQUIRED', 'Supplier input is missing required fields', { missingFields: missing });
  if (requireCode) code(input.supplierCode, 'SUPPLIER_CODE_INVALID', 'Supplier code');
  return Object.freeze({
    legalName: requiredText(input.legalName, 2, 200, 'SUPPLIER_LEGAL_NAME_INVALID', 'Supplier legal name'),
    countryCode: pattern(input.countryCode, COUNTRY_PATTERN, 'SUPPLIER_COUNTRY_INVALID', 'Supplier country'),
    email: pattern(input.email, EMAIL_PATTERN, 'SUPPLIER_EMAIL_INVALID', 'Supplier email').toLowerCase(),
    currency: pattern(input.currency, CURRENCY_PATTERN, 'SUPPLIER_CURRENCY_INVALID', 'Supplier currency'),
    incoterms: uniqueEnumList(input.incoterms, SOURCING_INCOTERMS, 1, 6, 'SUPPLIER_INCOTERMS_INVALID', 'Supplier Incoterms'),
    categories: uniqueTextList(input.categories, 1, 30, 2, 80, 'SUPPLIER_CATEGORIES_INVALID', 'Supplier categories'),
    leadTimeDays: integer(input.leadTimeDays, 1, 730, 'SUPPLIER_LEAD_TIME_INVALID', 'Supplier lead time'),
    minimumOrderQuantity: integer(input.minimumOrderQuantity, 1, MAX_INTEGER, 'SUPPLIER_MOQ_INVALID', 'Supplier minimum order quantity'),
    paymentTermsDays: integer(input.paymentTermsDays, 0, 365, 'SUPPLIER_PAYMENT_TERMS_INVALID', 'Supplier payment terms'),
    auditExpiresAt: timestamp(input.auditExpiresAt, 'SUPPLIER_AUDIT_EXPIRES_AT_INVALID', 'Supplier audit expiry'),
    notes: optionalText(input.notes, 2000, 'SUPPLIER_NOTES_INVALID', 'Supplier notes'),
  });
}

function normalizeRfqInput(input, suppliers, brandId, referenceTime) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'RFQ_INPUT_INVALID', 'RFQ input is invalid');
  const allowed = new Set(['rfqCode', 'sku', ...RFQ_EDITABLE_FIELDS]);
  assertAllowedFields(input, allowed, 'RFQ_FIELD_FORBIDDEN', 'RFQ input contains unsupported fields');
  const missing = [...RFQ_EDITABLE_FIELDS].filter((field) => !Object.hasOwn(input, field));
  invariant(missing.length === 0, 'RFQ_FIELD_REQUIRED', 'RFQ input is missing required fields', { missingFields: missing });
  const responseDueAt = timestamp(input.responseDueAt, 'RFQ_RESPONSE_DUE_INVALID', 'RFQ response due date');
  const deliveryDueAt = timestamp(input.deliveryDueAt, 'RFQ_DELIVERY_DUE_INVALID', 'RFQ delivery due date');
  assertRfqDates(responseDueAt, deliveryDueAt, referenceTime);
  const supplierCodes = uniqueCodes(input.supplierCodes, 1, 20, 'RFQ_SUPPLIERS_INVALID', 'RFQ supplier list');
  const supplierMap = new Map((Array.isArray(suppliers) ? suppliers : []).map((supplier) => [supplier.supplierCode, supplier]));
  for (const supplierCode of supplierCodes) {
    const supplier = supplierMap.get(supplierCode);
    invariant(supplier?.brandId === brandId, 'RFQ_SUPPLIER_NOT_FOUND', 'RFQ supplier was not found for this brand', { supplierCode });
    invariant(supplier.status === 'qualified', 'RFQ_SUPPLIER_NOT_QUALIFIED', 'RFQ supplier must be qualified', { supplierCode, status: supplier.status });
  }
  return Object.freeze({
    targetQuantity: integer(input.targetQuantity, 1, MAX_INTEGER, 'RFQ_TARGET_QUANTITY_INVALID', 'RFQ target quantity'),
    responseDueAt,
    deliveryDueAt,
    incoterm: enumValue(input.incoterm, SOURCING_INCOTERMS, 'RFQ_INCOTERM_INVALID', 'RFQ Incoterm'),
    supplierCodes,
    notes: optionalText(input.notes, 2000, 'RFQ_NOTES_INVALID', 'RFQ notes'),
  });
}

function normalizeQuote(input, supplier, rfq, receivedAt) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'RFQ_QUOTE_INPUT_INVALID', 'Quotation input is invalid');
  const allowed = new Set(['supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes']);
  assertAllowedFields(input, allowed, 'RFQ_QUOTE_FIELD_FORBIDDEN', 'Quotation contains unsupported fields');
  invariant(input.supplierCode === supplier.supplierCode, 'RFQ_QUOTE_SUPPLIER_MISMATCH', 'Quotation supplier does not match selected supplier');
  const unitPriceMinor = integer(input.unitPriceMinor, 1, Number.MAX_SAFE_INTEGER, 'RFQ_QUOTE_UNIT_PRICE_INVALID', 'Quotation unit price');
  const fixedCostMinor = integer(input.fixedCostMinor, 0, Number.MAX_SAFE_INTEGER, 'RFQ_QUOTE_FIXED_COST_INVALID', 'Quotation fixed cost');
  const minimumOrderQuantity = integer(input.minimumOrderQuantity, 1, MAX_INTEGER, 'RFQ_QUOTE_MOQ_INVALID', 'Quotation MOQ');
  invariant(rfq.targetQuantity >= minimumOrderQuantity && rfq.targetQuantity >= supplier.minimumOrderQuantity, 'RFQ_QUOTE_MOQ_NOT_MET', 'RFQ quantity does not meet supplier or quotation MOQ', { targetQuantity: rfq.targetQuantity, minimumOrderQuantity, supplierMinimumOrderQuantity: supplier.minimumOrderQuantity });
  const totalCostMinor = unitPriceMinor * rfq.targetQuantity + fixedCostMinor;
  invariant(Number.isSafeInteger(totalCostMinor), 'RFQ_QUOTE_TOTAL_TOO_LARGE', 'Quotation total exceeds supported precision');
  const validUntil = timestamp(input.validUntil, 'RFQ_QUOTE_VALID_UNTIL_INVALID', 'Quotation validity');
  invariant(Date.parse(validUntil) >= Date.parse(rfq.responseDueAt) && Date.parse(validUntil) > Date.parse(receivedAt), 'RFQ_QUOTE_VALIDITY_TOO_SHORT', 'Quotation must remain valid beyond the RFQ response deadline');
  return Object.freeze({
    supplierCode: supplier.supplierCode,
    supplierName: supplier.legalName,
    supplierVersion: supplier.version,
    unitPriceMinor,
    fixedCostMinor,
    totalCostMinor,
    leadTimeDays: integer(input.leadTimeDays, 1, 730, 'RFQ_QUOTE_LEAD_TIME_INVALID', 'Quotation lead time'),
    minimumOrderQuantity,
    validUntil,
    notes: optionalText(input.notes, 1000, 'RFQ_QUOTE_NOTES_INVALID', 'Quotation notes'),
    receivedAt,
  });
}

function assertPublishedSourcingContext(catalogSku, bom) {
  invariant(catalogSku?.status === 'published', 'RFQ_SKU_NOT_PUBLISHED', 'SKU must be published before RFQ creation', { sku: catalogSku?.sku });
  invariant(bom?.status === 'published', 'RFQ_BOM_NOT_PUBLISHED', 'Published BOM is required before RFQ creation', { sku: catalogSku?.sku });
  invariant(bom.sku === catalogSku.sku && bom.brandId === catalogSku.brandId, 'RFQ_BOM_CONTEXT_MISMATCH', 'BOM does not match RFQ SKU context');
  invariant(Number.isInteger(catalogSku.version) && catalogSku.version > 0 && Number.isInteger(bom.version) && bom.version > 0, 'RFQ_CONTEXT_VERSION_INVALID', 'SKU and BOM versions are required');
  invariant(typeof bom.currency === 'string' && CURRENCY_PATTERN.test(bom.currency), 'RFQ_BOM_CURRENCY_INVALID', 'BOM currency is invalid');
  invariant(typeof bom.totalCost === 'number' && Number.isFinite(bom.totalCost) && bom.totalCost > 0, 'RFQ_BOM_COST_INVALID', 'BOM total cost is invalid');
}

function assertRfqContextCurrent(rfq, catalogSku, bom) {
  assertPublishedSourcingContext(catalogSku, bom);
  invariant(catalogSku.sku === rfq.sku && catalogSku.brandId === rfq.brandId, 'RFQ_SKU_CONTEXT_MISMATCH', 'RFQ SKU context is invalid');
  invariant(catalogSku.version === rfq.skuVersion, 'RFQ_SKU_SNAPSHOT_STALE', 'RFQ SKU snapshot is stale', { expectedVersion: rfq.skuVersion, actualVersion: catalogSku.version });
  invariant(bom.version === rfq.bomVersion && bom.currency === rfq.bomCurrency && bom.totalCost === rfq.bomTotalCost, 'RFQ_BOM_SNAPSHOT_STALE', 'RFQ BOM snapshot is stale', { expectedVersion: rfq.bomVersion, actualVersion: bom.version });
}

function assertQualifiedSupplier(supplier, brandId) {
  invariant(supplier?.brandId === brandId, 'RFQ_SUPPLIER_NOT_FOUND', 'Supplier was not found for this brand', { supplierCode: supplier?.supplierCode });
  invariant(supplier.status === 'qualified', 'RFQ_SUPPLIER_NOT_QUALIFIED', 'Supplier must be qualified', { supplierCode: supplier.supplierCode, status: supplier.status });
}

function qualifiedSupplierMap(suppliers, brandId) {
  const map = new Map();
  for (const supplier of Array.isArray(suppliers) ? suppliers : []) {
    if (supplier?.brandId === brandId && supplier.status === 'qualified') map.set(supplier.supplierCode, supplier);
  }
  return map;
}

function assertRfqDates(responseDueAt, deliveryDueAt, referenceTime) {
  const reference = timestamp(referenceTime, 'RFQ_REFERENCE_TIME_INVALID', 'RFQ reference time');
  invariant(Date.parse(responseDueAt) > Date.parse(reference), 'RFQ_RESPONSE_DUE_NOT_FUTURE', 'RFQ response deadline must be in the future');
  invariant(Date.parse(deliveryDueAt) > Date.parse(responseDueAt), 'RFQ_DATES_INVALID', 'RFQ delivery must be after the response deadline');
}

function supplierProjection(value) {
  return JSON.stringify(Object.fromEntries([...SUPPLIER_EDITABLE_FIELDS].map((field) => [field, value[field]])));
}
function rfqProjection(value) {
  return JSON.stringify(Object.fromEntries([...RFQ_EDITABLE_FIELDS].map((field) => [field, value[field]])));
}
function code(value, errorCode, label, regex = CODE_PATTERN) { return pattern(value, regex, errorCode, label); }
function identifier(value, errorCode, label) { return requiredText(value, 1, 160, errorCode, label); }
function pattern(value, regex, errorCode, label) { invariant(typeof value === 'string' && regex.test(value), errorCode, `${label} is invalid`); return value; }
function enumValue(value, allowed, errorCode, label) { invariant(typeof value === 'string' && allowed.includes(value), errorCode, `${label} is invalid`, { allowed }); return value; }
function integer(value, minimum, maximum, errorCode, label) { invariant(Number.isSafeInteger(value) && value >= minimum && value <= maximum, errorCode, `${label} must be an integer from ${minimum} to ${maximum}`); return value; }
function timestamp(value, errorCode, label) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), errorCode, `${label} is invalid`); return new Date(value).toISOString(); }
function requiredText(value, minimum, maximum, errorCode, label) { invariant(typeof value === 'string', errorCode, `${label} is required`); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= minimum && normalized.length <= maximum && !/[\u0000-\u001f\u007f]/.test(normalized), errorCode, `${label} must contain ${minimum}-${maximum} valid characters`); return normalized; }
function optionalText(value, maximum, errorCode, label) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, maximum, errorCode, label); }
function uniqueCodes(value, minimum, maximum, errorCode, label) { invariant(Array.isArray(value) && value.length >= minimum && value.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} entries`); const normalized = value.map((item) => code(item, errorCode, label)); invariant(new Set(normalized).size === normalized.length, errorCode, `${label} contains duplicates`); return Object.freeze([...normalized].sort()); }
function uniqueEnumList(value, allowed, minimum, maximum, errorCode, label) { invariant(Array.isArray(value) && value.length >= minimum && value.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} entries`); const normalized = value.map((item) => enumValue(item, allowed, errorCode, label)); invariant(new Set(normalized).size === normalized.length, errorCode, `${label} contains duplicates`); return Object.freeze([...normalized].sort()); }
function uniqueTextList(value, minimum, maximum, textMinimum, textMaximum, errorCode, label) { invariant(Array.isArray(value) && value.length >= minimum && value.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} entries`); const normalized = value.map((item) => requiredText(item, textMinimum, textMaximum, errorCode, label)); invariant(new Set(normalized.map((item) => item.toLowerCase())).size === normalized.length, errorCode, `${label} contains duplicates`); return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b))); }
function assertAllowedFields(value, allowed, errorCode, message) { const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(forbidden.length === 0, errorCode, message, { fields: forbidden }); }
function freezeSupplier(value) { return Object.freeze({ ...value, incoterms: Object.freeze([...(value.incoterms || [])]), categories: Object.freeze([...(value.categories || [])]) }); }
function freezeRfq(value) { return Object.freeze({ ...value, supplierCodes: Object.freeze([...(value.supplierCodes || [])]), quotes: Object.freeze((value.quotes || []).map((quote) => Object.freeze({ ...quote }))), award: value.award ? Object.freeze({ ...value.award }) : null, allocation: value.allocation ? Object.freeze({ ...value.allocation }) : null }); }
