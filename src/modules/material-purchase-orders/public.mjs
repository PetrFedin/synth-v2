import { invariant } from '../../core/errors.mjs';

// Заказ на материал — неизменяемый снимок присуждённой сделки, ровно как производственный заказ
// (`src/modules/production-orders/public.mjs`), без снимка техпака: закупка полотна не подтверждает
// техническую спецификацию изделия.

export const MATERIAL_PURCHASE_ORDER_STATUSES = Object.freeze(['draft', 'issued', 'confirmed', 'cancelled']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;

export function createMaterialPurchaseOrderFromAllocation({ id, rfq, supplier, createdAt }) {
  assertAllocatedRfq(rfq);
  assertSupplier(rfq, supplier);
  const allocation = rfq.allocation;
  const commercialSnapshot = snapshotCommercial(rfq);
  const supplierSnapshot = Object.freeze({
    supplierCode: supplier.supplierCode,
    legalName: requiredText(supplier.legalName, 2, 200, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_NAME_INVALID', 'Supplier legal name'),
    supplierVersion: positiveInteger(supplier.version, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_VERSION_INVALID', 'Supplier version'),
    countryCode: requiredText(supplier.countryCode, 2, 2, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_COUNTRY_INVALID', 'Supplier country'),
    email: requiredText(supplier.email, 5, 320, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_EMAIL_INVALID', 'Supplier email').toLowerCase(),
  });
  const at = timestamp(createdAt, 'MATERIAL_PURCHASE_ORDER_CREATED_AT_INVALID', 'Material Purchase Order creation time');
  return freezeOrder({
    id: identifier(id, 'MATERIAL_PURCHASE_ORDER_ID_REQUIRED', 'Material Purchase Order id'),
    purchaseOrderNumber: code(allocation.purchaseOrderNumber, 'MATERIAL_PURCHASE_ORDER_NUMBER_INVALID', 'Material Purchase Order number'),
    rfqId: identifier(rfq.id, 'MATERIAL_PURCHASE_ORDER_RFQ_ID_REQUIRED', 'Material RFQ id'),
    rfqCode: code(rfq.rfqCode, 'MATERIAL_PURCHASE_ORDER_RFQ_CODE_INVALID', 'Material RFQ code'),
    rfqVersion: positiveInteger(rfq.version, 'MATERIAL_PURCHASE_ORDER_RFQ_VERSION_INVALID', 'Material RFQ version'),
    brandId: identifier(rfq.brandId, 'MATERIAL_PURCHASE_ORDER_BRAND_REQUIRED', 'Brand'),
    materialCode: identifier(rfq.materialCode, 'MATERIAL_PURCHASE_ORDER_MATERIAL_REQUIRED', 'Material code'),
    materialVersion: positiveInteger(rfq.materialVersion, 'MATERIAL_PURCHASE_ORDER_MATERIAL_VERSION_INVALID', 'Material version'),
    quantity: positiveNumeric(allocation.quantity, 'MATERIAL_PURCHASE_ORDER_QUANTITY_INVALID', 'Material Purchase Order quantity'),
    unit: identifier(rfq.unit, 'MATERIAL_PURCHASE_ORDER_UNIT_REQUIRED', 'Unit'),
    orderPlacedAt: timestamp(allocation.orderPlacedAt, 'MATERIAL_PURCHASE_ORDER_PLACED_INVALID', 'Order placement time'),
    deliveryDueAt: timestamp(allocation.deliveryDueAt, 'MATERIAL_PURCHASE_ORDER_DELIVERY_INVALID', 'Delivery due date'),
    supplierCode: supplierSnapshot.supplierCode,
    supplierSnapshot,
    commercialSnapshot,
    allocationNotes: optionalText(allocation.notes, 1_000, 'MATERIAL_PURCHASE_ORDER_ALLOCATION_NOTES_INVALID', 'Allocation notes'),
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

export function issueMaterialPurchaseOrder(order, { actorId, issuedAt }) {
  invariant(order?.status === 'draft', 'MATERIAL_PURCHASE_ORDER_NOT_DRAFT', 'Only a draft Material Purchase Order can be issued', { status: order?.status });
  const at = timestamp(issuedAt, 'MATERIAL_PURCHASE_ORDER_ISSUED_AT_INVALID', 'Material Purchase Order issue time');
  invariant(Date.parse(at) <= Date.parse(order.orderPlacedAt), 'MATERIAL_PURCHASE_ORDER_ISSUED_AFTER_PLACEMENT', 'Material Purchase Order must be issued no later than the recorded order placement', { orderPlacedAt: order.orderPlacedAt });
  return freezeOrder({
    ...order,
    status: 'issued',
    version: order.version + 1,
    issuedAt: at,
    issuedBy: identifier(actorId, 'MATERIAL_PURCHASE_ORDER_ISSUED_BY_REQUIRED', 'Issuer'),
    updatedAt: at,
  });
}

export function confirmMaterialPurchaseOrder(order, { supplierCode, confirmationReference, confirmedBy, notes, confirmedAt }) {
  invariant(order?.status === 'issued', 'MATERIAL_PURCHASE_ORDER_NOT_ISSUED', 'Only an issued Material Purchase Order can be confirmed', { status: order?.status });
  invariant(supplierCode === order.supplierCode, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_MISMATCH', 'Material Purchase Order confirmation must come from the allocated supplier', { expectedSupplierCode: order.supplierCode, actualSupplierCode: supplierCode });
  const at = timestamp(confirmedAt, 'MATERIAL_PURCHASE_ORDER_CONFIRMED_AT_INVALID', 'Material Purchase Order confirmation time');
  invariant(Date.parse(at) >= Date.parse(order.issuedAt), 'MATERIAL_PURCHASE_ORDER_CONFIRMATION_BEFORE_ISSUE', 'Material Purchase Order cannot be confirmed before issue');
  const confirmation = Object.freeze({
    supplierCode,
    confirmationReference: requiredText(confirmationReference, 2, 120, 'MATERIAL_PURCHASE_ORDER_CONFIRMATION_REFERENCE_INVALID', 'Confirmation reference'),
    confirmedBy: requiredText(confirmedBy, 2, 200, 'MATERIAL_PURCHASE_ORDER_CONFIRMED_BY_INVALID', 'Supplier confirmer'),
    notes: optionalText(notes, 2_000, 'MATERIAL_PURCHASE_ORDER_CONFIRMATION_NOTES_INVALID', 'Confirmation notes'),
    confirmedAt: at,
    issuedMaterialPurchaseOrderVersion: order.version,
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

export function cancelMaterialPurchaseOrder(order, { reason, cancelledAt }) {
  invariant(['draft', 'issued'].includes(order?.status), 'MATERIAL_PURCHASE_ORDER_NOT_CANCELLABLE', 'Only a draft or issued Material Purchase Order can be cancelled', { status: order?.status });
  const at = timestamp(cancelledAt, 'MATERIAL_PURCHASE_ORDER_CANCELLED_AT_INVALID', 'Material Purchase Order cancellation time');
  return freezeOrder({
    ...order,
    status: 'cancelled',
    version: order.version + 1,
    cancelledAt: at,
    cancellationReason: requiredText(reason, 5, 1_000, 'MATERIAL_PURCHASE_ORDER_CANCELLATION_REASON_INVALID', 'Cancellation reason'),
    updatedAt: at,
  });
}

export function assertMaterialPurchaseOrderVersion(order, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'MATERIAL_PURCHASE_ORDER_EXPECTED_VERSION_INVALID', 'Expected Material Purchase Order version is invalid', { expectedVersion });
  invariant(order?.version === expectedVersion, 'MATERIAL_PURCHASE_ORDER_CONCURRENCY_CONFLICT', 'Material Purchase Order was changed by another operation', { purchaseOrderNumber: order?.purchaseOrderNumber, expectedVersion, actualVersion: order?.version });
}

function assertAllocatedRfq(rfq) {
  invariant(rfq?.status === 'allocated', 'MATERIAL_PURCHASE_ORDER_RFQ_NOT_ALLOCATED', 'Material Purchase Order requires an allocated Material RFQ', { rfqCode: rfq?.rfqCode, status: rfq?.status });
  invariant(rfq.selectedSupplierCode && rfq.award && rfq.allocation, 'MATERIAL_PURCHASE_ORDER_ALLOCATION_INCOMPLETE', 'Allocated Material RFQ is missing award or allocation data', { rfqCode: rfq?.rfqCode });
  invariant(rfq.allocation.supplierCode === rfq.selectedSupplierCode, 'MATERIAL_PURCHASE_ORDER_ALLOCATION_SUPPLIER_MISMATCH', 'Material RFQ allocation does not match the awarded supplier');
  invariant(rfq.allocation.quantity === rfq.targetQuantity, 'MATERIAL_PURCHASE_ORDER_ALLOCATION_QUANTITY_MISMATCH', 'Material Purchase Order requires the full awarded quantity');
  invariant(Date.parse(rfq.allocation.deliveryDueAt) > Date.parse(rfq.allocation.orderPlacedAt), 'MATERIAL_PURCHASE_ORDER_ALLOCATION_DATES_INVALID', 'Allocation delivery must follow order placement');
}

function assertSupplier(rfq, supplier) {
  invariant(supplier?.status === 'qualified', 'MATERIAL_PURCHASE_ORDER_SUPPLIER_NOT_QUALIFIED', 'Material Purchase Order supplier must remain qualified', { supplierCode: supplier?.supplierCode, status: supplier?.status });
  invariant(supplier.brandId === rfq.brandId && supplier.supplierCode === rfq.selectedSupplierCode, 'MATERIAL_PURCHASE_ORDER_SUPPLIER_MISMATCH', 'Supplier does not match the allocated Material RFQ', { supplierCode: supplier?.supplierCode, expectedSupplierCode: rfq?.selectedSupplierCode });
  invariant(Date.parse(supplier.auditExpiresAt) >= Date.parse(rfq.allocation.deliveryDueAt), 'MATERIAL_PURCHASE_ORDER_SUPPLIER_AUDIT_EXPIRES_EARLY', 'Supplier audit expires before the Material Purchase Order delivery date', { auditExpiresAt: supplier.auditExpiresAt, deliveryDueAt: rfq.allocation.deliveryDueAt });
}

function snapshotCommercial(rfq) {
  const award = rfq.award;
  invariant(award.supplierCode === rfq.selectedSupplierCode, 'MATERIAL_PURCHASE_ORDER_AWARD_SUPPLIER_MISMATCH', 'Material RFQ award supplier is inconsistent');
  invariant(award.incoterm === rfq.incoterm, 'MATERIAL_PURCHASE_ORDER_INCOTERM_MISMATCH', 'Material RFQ award Incoterm is inconsistent');
  return Object.freeze({
    currency: requiredText(award.currency, 3, 3, 'MATERIAL_PURCHASE_ORDER_CURRENCY_INVALID', 'Currency'),
    incoterm: requiredText(award.incoterm, 3, 3, 'MATERIAL_PURCHASE_ORDER_INCOTERM_INVALID', 'Incoterm'),
    unitPriceMinor: nonNegativeInteger(award.unitPriceMinor, 'MATERIAL_PURCHASE_ORDER_UNIT_PRICE_INVALID', 'Unit price'),
    fixedCostMinor: nonNegativeInteger(award.fixedCostMinor, 'MATERIAL_PURCHASE_ORDER_FIXED_COST_INVALID', 'Fixed cost'),
    totalCostMinor: nonNegativeInteger(award.totalCostMinor, 'MATERIAL_PURCHASE_ORDER_TOTAL_COST_INVALID', 'Total cost'),
    quoteRevision: positiveInteger(award.quoteRevision, 'MATERIAL_PURCHASE_ORDER_QUOTE_REVISION_INVALID', 'Quote revision'),
  });
}

function freezeOrder(value) {
  invariant(MATERIAL_PURCHASE_ORDER_STATUSES.includes(value.status), 'MATERIAL_PURCHASE_ORDER_STATUS_INVALID', 'Material Purchase Order status is invalid', { status: value.status });
  return Object.freeze(value);
}
function identifier(value, codeValue, label) { return requiredText(value, 1, 200, codeValue, label); }
function code(value, codeValue, label) { const normalized = requiredText(value, 3, 80, codeValue, label).toUpperCase(); invariant(CODE_PATTERN.test(normalized), codeValue, `${label} is invalid`); return normalized; }
function positiveInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 1, codeValue, `${label} must be a positive PostgreSQL integer`); return value; }
function positiveNumeric(value, codeValue, label) { invariant(typeof value === 'number' && Number.isFinite(value) && value > 0, codeValue, `${label} must be a positive number`); return Math.round(value * 10_000) / 10_000; }
function nonNegativeInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 0 && Number.isSafeInteger(value), codeValue, `${label} must be a non-negative safe integer`); return value; }
function timestamp(value, codeValue, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), codeValue, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function requiredText(value, min, max, codeValue, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, codeValue, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optionalText(value, max, codeValue, label) { if (value === null || value === undefined || value === '') return null; return requiredText(value, 1, max, codeValue, label); }
