import { invariant } from '../../core/errors.mjs';

export const PRODUCTION_ORDER_STATUSES = Object.freeze(['draft', 'issued', 'confirmed', 'cancelled']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const MAX_INTEGER = 2_147_483_647;

export function createProductionOrderFromAllocation({ id, rfq, supplier, createdAt }) {
  assertAllocatedRfq(rfq);
  assertSupplier(rfq, supplier);
  const allocation = rfq.allocation;
  const techPackSnapshot = snapshotTechPack(allocation);
  const commercialSnapshot = snapshotCommercial(rfq);
  const supplierSnapshot = Object.freeze({
    supplierCode: supplier.supplierCode,
    legalName: requiredText(supplier.legalName, 2, 200, 'PRODUCTION_ORDER_SUPPLIER_NAME_INVALID', 'Supplier legal name'),
    supplierVersion: positiveInteger(supplier.version, 'PRODUCTION_ORDER_SUPPLIER_VERSION_INVALID', 'Supplier version'),
    countryCode: requiredText(supplier.countryCode, 2, 2, 'PRODUCTION_ORDER_SUPPLIER_COUNTRY_INVALID', 'Supplier country'),
    email: requiredText(supplier.email, 5, 320, 'PRODUCTION_ORDER_SUPPLIER_EMAIL_INVALID', 'Supplier email').toLowerCase(),
  });
  const at = timestamp(createdAt, 'PRODUCTION_ORDER_CREATED_AT_INVALID', 'Production Order creation time');
  return freezeOrder({
    id: identifier(id, 'PRODUCTION_ORDER_ID_REQUIRED', 'Production Order id'),
    productionOrderNumber: code(allocation.purchaseOrderNumber, 'PRODUCTION_ORDER_NUMBER_INVALID', 'Production Order number'),
    rfqId: identifier(rfq.id, 'PRODUCTION_ORDER_RFQ_ID_REQUIRED', 'RFQ id'),
    rfqCode: code(rfq.rfqCode, 'PRODUCTION_ORDER_RFQ_CODE_INVALID', 'RFQ code'),
    rfqVersion: positiveInteger(rfq.version, 'PRODUCTION_ORDER_RFQ_VERSION_INVALID', 'RFQ version'),
    brandId: identifier(rfq.brandId, 'PRODUCTION_ORDER_BRAND_REQUIRED', 'Brand'),
    sku: identifier(rfq.sku, 'PRODUCTION_ORDER_SKU_REQUIRED', 'SKU'),
    skuVersion: positiveInteger(rfq.skuVersion, 'PRODUCTION_ORDER_SKU_VERSION_INVALID', 'SKU version'),
    bomVersion: positiveInteger(rfq.bomVersion, 'PRODUCTION_ORDER_BOM_VERSION_INVALID', 'BOM version'),
    quantity: positiveInteger(allocation.quantity, 'PRODUCTION_ORDER_QUANTITY_INVALID', 'Production Order quantity'),
    productionStartAt: timestamp(allocation.productionStartAt, 'PRODUCTION_ORDER_START_INVALID', 'Production start'),
    deliveryDueAt: timestamp(allocation.deliveryDueAt, 'PRODUCTION_ORDER_DELIVERY_INVALID', 'Delivery due date'),
    supplierCode: supplierSnapshot.supplierCode,
    supplierSnapshot,
    commercialSnapshot,
    techPackSnapshot,
    allocationNotes: optionalText(allocation.notes, 1_000, 'PRODUCTION_ORDER_ALLOCATION_NOTES_INVALID', 'Allocation notes'),
    status: 'draft',
    version: 1,
    issuedAt: null,
    issuedBy: null,
    confirmedAt: null,
    confirmation: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: at,
    updatedAt: at,
  });
}

export function issueProductionOrder(order, { actorId, issuedAt }) {
  invariant(order?.status === 'draft', 'PRODUCTION_ORDER_NOT_DRAFT', 'Only a draft Production Order can be issued', { status: order?.status });
  const at = timestamp(issuedAt, 'PRODUCTION_ORDER_ISSUED_AT_INVALID', 'Production Order issue time');
  invariant(Date.parse(at) <= Date.parse(order.productionStartAt), 'PRODUCTION_ORDER_ISSUED_AFTER_START', 'Production Order must be issued before production starts', { productionStartAt: order.productionStartAt });
  return freezeOrder({
    ...order,
    status: 'issued',
    version: order.version + 1,
    issuedAt: at,
    issuedBy: identifier(actorId, 'PRODUCTION_ORDER_ISSUED_BY_REQUIRED', 'Issuer'),
    updatedAt: at,
  });
}

export function confirmProductionOrder(order, { supplierCode, confirmationReference, confirmedBy, notes, confirmedAt }) {
  invariant(order?.status === 'issued', 'PRODUCTION_ORDER_NOT_ISSUED', 'Only an issued Production Order can be confirmed', { status: order?.status });
  invariant(supplierCode === order.supplierCode, 'PRODUCTION_ORDER_SUPPLIER_MISMATCH', 'Production Order confirmation must come from the allocated supplier', { expectedSupplierCode: order.supplierCode, actualSupplierCode: supplierCode });
  const at = timestamp(confirmedAt, 'PRODUCTION_ORDER_CONFIRMED_AT_INVALID', 'Production Order confirmation time');
  invariant(Date.parse(at) >= Date.parse(order.issuedAt), 'PRODUCTION_ORDER_CONFIRMATION_BEFORE_ISSUE', 'Production Order cannot be confirmed before issue');
  const confirmation = Object.freeze({
    supplierCode,
    confirmationReference: requiredText(confirmationReference, 2, 120, 'PRODUCTION_ORDER_CONFIRMATION_REFERENCE_INVALID', 'Confirmation reference'),
    confirmedBy: requiredText(confirmedBy, 2, 200, 'PRODUCTION_ORDER_CONFIRMED_BY_INVALID', 'Supplier confirmer'),
    notes: optionalText(notes, 2_000, 'PRODUCTION_ORDER_CONFIRMATION_NOTES_INVALID', 'Confirmation notes'),
    confirmedAt: at,
    issuedProductionOrderVersion: order.version,
  });
  return freezeOrder({
    ...order,
    status: 'confirmed',
    version: order.version + 1,
    confirmedAt: at,
    confirmation,
    updatedAt: at,
  });
}

export function cancelProductionOrder(order, { reason, cancelledAt }) {
  invariant(['draft', 'issued'].includes(order?.status), 'PRODUCTION_ORDER_NOT_CANCELLABLE', 'Only a draft or issued Production Order can be cancelled', { status: order?.status });
  const at = timestamp(cancelledAt, 'PRODUCTION_ORDER_CANCELLED_AT_INVALID', 'Production Order cancellation time');
  return freezeOrder({
    ...order,
    status: 'cancelled',
    version: order.version + 1,
    cancelledAt: at,
    cancellationReason: requiredText(reason, 5, 1_000, 'PRODUCTION_ORDER_CANCELLATION_REASON_INVALID', 'Cancellation reason'),
    updatedAt: at,
  });
}

export function assertProductionOrderVersion(order, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1 && expectedVersion <= MAX_INTEGER, 'PRODUCTION_ORDER_EXPECTED_VERSION_INVALID', 'Expected Production Order version is invalid', { expectedVersion });
  invariant(order?.version === expectedVersion, 'PRODUCTION_ORDER_CONCURRENCY_CONFLICT', 'Production Order was changed by another operation', { productionOrderNumber: order?.productionOrderNumber, expectedVersion, actualVersion: order?.version });
}

function assertAllocatedRfq(rfq) {
  invariant(rfq?.status === 'allocated', 'PRODUCTION_ORDER_RFQ_NOT_ALLOCATED', 'Production Order requires an allocated RFQ', { rfqCode: rfq?.rfqCode, status: rfq?.status });
  invariant(rfq.selectedSupplierCode && rfq.award && rfq.allocation, 'PRODUCTION_ORDER_ALLOCATION_INCOMPLETE', 'Allocated RFQ is missing award or allocation data', { rfqCode: rfq?.rfqCode });
  invariant(rfq.allocation.supplierCode === rfq.selectedSupplierCode, 'PRODUCTION_ORDER_ALLOCATION_SUPPLIER_MISMATCH', 'RFQ allocation does not match the awarded supplier');
  invariant(rfq.allocation.quantity === rfq.targetQuantity, 'PRODUCTION_ORDER_ALLOCATION_QUANTITY_MISMATCH', 'Production Order requires the full awarded quantity');
  invariant(Date.parse(rfq.allocation.deliveryDueAt) > Date.parse(rfq.allocation.productionStartAt), 'PRODUCTION_ORDER_ALLOCATION_DATES_INVALID', 'Allocation delivery must follow production start');
}

function assertSupplier(rfq, supplier) {
  invariant(supplier?.status === 'qualified', 'PRODUCTION_ORDER_SUPPLIER_NOT_QUALIFIED', 'Production Order supplier must remain qualified', { supplierCode: supplier?.supplierCode, status: supplier?.status });
  invariant(supplier.brandId === rfq.brandId && supplier.supplierCode === rfq.selectedSupplierCode, 'PRODUCTION_ORDER_SUPPLIER_MISMATCH', 'Supplier does not match the allocated RFQ', { supplierCode: supplier?.supplierCode, expectedSupplierCode: rfq?.selectedSupplierCode });
  invariant(Date.parse(supplier.auditExpiresAt) >= Date.parse(rfq.allocation.deliveryDueAt), 'PRODUCTION_ORDER_SUPPLIER_AUDIT_EXPIRES_EARLY', 'Supplier audit expires before the Production Order delivery date', { auditExpiresAt: supplier.auditExpiresAt, deliveryDueAt: rfq.allocation.deliveryDueAt });
}

function snapshotCommercial(rfq) {
  const award = rfq.award;
  invariant(award.supplierCode === rfq.selectedSupplierCode, 'PRODUCTION_ORDER_AWARD_SUPPLIER_MISMATCH', 'RFQ award supplier is inconsistent');
  invariant(award.currency === rfq.bomCurrency, 'PRODUCTION_ORDER_CURRENCY_MISMATCH', 'RFQ award currency is inconsistent');
  invariant(award.incoterm === rfq.incoterm, 'PRODUCTION_ORDER_INCOTERM_MISMATCH', 'RFQ award Incoterm is inconsistent');
  return Object.freeze({
    currency: requiredText(award.currency, 3, 3, 'PRODUCTION_ORDER_CURRENCY_INVALID', 'Currency'),
    incoterm: requiredText(award.incoterm, 3, 3, 'PRODUCTION_ORDER_INCOTERM_INVALID', 'Incoterm'),
    unitPriceMinor: nonNegativeInteger(award.unitPriceMinor, 'PRODUCTION_ORDER_UNIT_PRICE_INVALID', 'Unit price'),
    fixedCostMinor: nonNegativeInteger(award.fixedCostMinor, 'PRODUCTION_ORDER_FIXED_COST_INVALID', 'Fixed cost'),
    totalCostMinor: nonNegativeInteger(award.totalCostMinor, 'PRODUCTION_ORDER_TOTAL_COST_INVALID', 'Total cost'),
    quoteRevision: positiveInteger(award.quoteRevision, 'PRODUCTION_ORDER_QUOTE_REVISION_INVALID', 'Quote revision'),
  });
}

function snapshotTechPack(allocation) {
  invariant(allocation.techPackCode && allocation.techPackAcknowledgementReference, 'PRODUCTION_ORDER_TECH_PACK_SNAPSHOT_REQUIRED', 'Production Order requires the acknowledged Tech Pack allocation snapshot');
  return Object.freeze({
    techPackCode: code(allocation.techPackCode, 'PRODUCTION_ORDER_TECH_PACK_CODE_INVALID', 'Tech Pack code'),
    revision: positiveInteger(allocation.techPackRevision, 'PRODUCTION_ORDER_TECH_PACK_REVISION_INVALID', 'Tech Pack revision'),
    version: positiveInteger(allocation.techPackVersion, 'PRODUCTION_ORDER_TECH_PACK_VERSION_INVALID', 'Tech Pack version'),
    issuedVersion: positiveInteger(allocation.techPackIssuedVersion, 'PRODUCTION_ORDER_TECH_PACK_ISSUED_VERSION_INVALID', 'Issued Tech Pack version'),
    acknowledgedAt: timestamp(allocation.techPackAcknowledgedAt, 'PRODUCTION_ORDER_TECH_PACK_ACKNOWLEDGED_AT_INVALID', 'Tech Pack acknowledgement time'),
    acknowledgementReference: requiredText(allocation.techPackAcknowledgementReference, 2, 120, 'PRODUCTION_ORDER_TECH_PACK_ACK_REFERENCE_INVALID', 'Tech Pack acknowledgement reference'),
  });
}

function freezeOrder(value) {
  invariant(PRODUCTION_ORDER_STATUSES.includes(value.status), 'PRODUCTION_ORDER_STATUS_INVALID', 'Production Order status is invalid', { status: value.status });
  return Object.freeze(value);
}
function identifier(value, codeValue, label) { return requiredText(value, 1, 200, codeValue, label); }
function code(value, codeValue, label) { const normalized = requiredText(value, 3, 80, codeValue, label).toUpperCase(); invariant(CODE_PATTERN.test(normalized), codeValue, `${label} is invalid`); return normalized; }
function positiveInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, codeValue, `${label} must be a positive PostgreSQL integer`); return value; }
function nonNegativeInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 0 && Number.isSafeInteger(value), codeValue, `${label} must be a non-negative safe integer`); return value; }
function timestamp(value, codeValue, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), codeValue, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function requiredText(value, min, max, codeValue, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, codeValue, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optionalText(value, max, codeValue, label) { if (value === null || value === undefined || value === '') return null; return requiredText(value, 1, max, codeValue, label); }
