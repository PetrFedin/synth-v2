import { invariant } from '../../core/errors.mjs';

export const OUTBOUND_SHIPMENT_STATUSES = Object.freeze(['planned','booked','ready-to-dispatch','dispatched','cancelled']);
export const OUTBOUND_TRANSPORT_MODES = Object.freeze(['road','air','sea','rail','courier']);
export const OUTBOUND_DOCUMENT_TYPES = Object.freeze(['packing-list','commercial-invoice','transport-document','customs-declaration','certificate-of-origin','other']);
const REQUIRED_DOCUMENT_TYPES = Object.freeze(['packing-list','transport-document']);
const POSTGRES_INTEGER_MAXIMUM = 2_147_483_647;

export function createOutboundShipment({ id, release, consignee, createdAt }) {
  invariant(release?.releaseCode && release?.inspectionCode, 'SHIPMENT_RELEASE_REQUIRED', 'An immutable Final Quality shipment release is required');
  const releasedAt = timestamp(release.releasedAt, 'SHIPMENT_RELEASED_AT_INVALID', 'Quality release time');
  const created = timestamp(createdAt, 'SHIPMENT_CREATED_AT_INVALID', 'Shipment creation time');
  invariant(Date.parse(created) >= Date.parse(releasedAt), 'SHIPMENT_CREATED_BEFORE_RELEASE', 'Shipment cannot be created before Final Quality release');
  const quantity = positiveInteger(release.quantity, 'SHIPMENT_QUANTITY_INVALID', 'Released quantity');
  return freezeShipment({
    id: text(id, 1, 200, 'SHIPMENT_ID_REQUIRED', 'Shipment id'),
    shipmentCode: `SHP-${text(release.productionOrderNumber, 1, 120, 'SHIPMENT_PRODUCTION_ORDER_REQUIRED', 'Production Order number')}`,
    releaseId: text(release.id, 1, 200, 'SHIPMENT_RELEASE_ID_REQUIRED', 'Shipment release id'),
    releaseCode: text(release.releaseCode, 3, 120, 'SHIPMENT_RELEASE_CODE_INVALID', 'Shipment release code'),
    inspectionCode: text(release.inspectionCode, 3, 160, 'SHIPMENT_INSPECTION_CODE_INVALID', 'Inspection code'),
    inspectionVersion: positiveInteger(release.inspectionVersion, 'SHIPMENT_INSPECTION_VERSION_INVALID', 'Inspection version'),
    executionCode: text(release.executionCode, 3, 160, 'SHIPMENT_EXECUTION_CODE_INVALID', 'Execution code'),
    productionOrderNumber: release.productionOrderNumber,
    brandId: text(release.brandId, 1, 200, 'SHIPMENT_BRAND_REQUIRED', 'Brand id'),
    supplierCode: text(release.supplierCode, 2, 160, 'SHIPMENT_SUPPLIER_REQUIRED', 'Supplier code'),
    sku: text(release.sku, 1, 160, 'SHIPMENT_SKU_REQUIRED', 'SKU'),
    quantity,
    sourceSnapshot: Object.freeze({
      releaseCode: release.releaseCode,
      inspectionCode: release.inspectionCode,
      inspectionVersion: release.inspectionVersion,
      executionCode: release.executionCode,
      productionOrderNumber: release.productionOrderNumber,
      supplierCode: release.supplierCode,
      sku: release.sku,
      quantity,
      runNumber: positiveInteger(release.runNumber, 'SHIPMENT_RUN_NUMBER_INVALID', 'Quality run number'),
      releasedAt,
      releasedBy: text(release.releasedBy, 1, 200, 'SHIPMENT_RELEASED_BY_REQUIRED', 'Quality approver'),
      releaseNotes: optional(release.notes, 2000, 'SHIPMENT_RELEASE_NOTES_INVALID', 'Quality release notes'),
    }),
    consignee: normalizeConsignee(consignee),
    status: 'planned',
    version: 1,
    booking: null,
    packages: Object.freeze([]),
    documents: Object.freeze([]),
    readyAt: null,
    readyBy: null,
    dispatch: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: created,
    updatedAt: created,
  });
}

export function reviseShipmentConsignee(shipment, input) {
  invariant(shipment?.status === 'planned', 'SHIPMENT_CONSIGNEE_LOCKED', 'Consignee can only be revised before carrier booking', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const updatedAt = timestamp(input.updatedAt, 'SHIPMENT_UPDATED_AT_INVALID', 'Consignee update time');
  assertChronology(updatedAt, shipment.createdAt, 'SHIPMENT_UPDATE_BEFORE_CREATION', 'Shipment update cannot precede creation');
  const consignee = normalizeConsignee(input.consignee);
  if (JSON.stringify(consignee) === JSON.stringify(shipment.consignee)) return shipment;
  return freezeShipment({ ...shipment, consignee, version: shipment.version + 1, updatedAt });
}

export function bookOutboundShipment(shipment, input) {
  invariant(shipment?.status === 'planned', 'SHIPMENT_NOT_PLANNED', 'Only a planned shipment can be booked', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const bookedAt = timestamp(input.bookedAt, 'SHIPMENT_BOOKED_AT_INVALID', 'Booking time');
  assertChronology(bookedAt, shipment.createdAt, 'SHIPMENT_BOOKED_BEFORE_CREATION', 'Shipment cannot be booked before creation');
  const pickupWindowStart = timestamp(input.pickupWindowStart, 'SHIPMENT_PICKUP_START_INVALID', 'Pickup window start');
  const pickupWindowEnd = timestamp(input.pickupWindowEnd, 'SHIPMENT_PICKUP_END_INVALID', 'Pickup window end');
  const expectedDeliveryAt = timestamp(input.expectedDeliveryAt, 'SHIPMENT_EXPECTED_DELIVERY_INVALID', 'Expected delivery time');
  invariant(Date.parse(pickupWindowStart) >= Date.parse(bookedAt) && Date.parse(pickupWindowEnd) >= Date.parse(pickupWindowStart), 'SHIPMENT_PICKUP_WINDOW_INVALID', 'Pickup window must follow booking and be ordered');
  invariant(Date.parse(expectedDeliveryAt) >= Date.parse(pickupWindowStart), 'SHIPMENT_DELIVERY_BEFORE_PICKUP', 'Expected delivery cannot precede pickup');
  const booking = Object.freeze({
    carrierCode: text(input.carrierCode, 2, 80, 'SHIPMENT_CARRIER_CODE_INVALID', 'Carrier code'),
    carrierName: text(input.carrierName, 2, 160, 'SHIPMENT_CARRIER_NAME_INVALID', 'Carrier name'),
    transportMode: enumValue(input.transportMode, OUTBOUND_TRANSPORT_MODES, 'SHIPMENT_TRANSPORT_MODE_INVALID', 'Transport mode'),
    bookingReference: text(input.bookingReference, 2, 120, 'SHIPMENT_BOOKING_REFERENCE_INVALID', 'Booking reference'),
    serviceLevel: optional(input.serviceLevel, 120, 'SHIPMENT_SERVICE_LEVEL_INVALID', 'Service level'),
    pickupWindowStart,
    pickupWindowEnd,
    expectedDeliveryAt,
    vehicleOrVoyageReference: optional(input.vehicleOrVoyageReference, 160, 'SHIPMENT_VEHICLE_REFERENCE_INVALID', 'Vehicle or voyage reference'),
    bookedAt,
    bookedBy: text(input.actorId, 1, 200, 'SHIPMENT_BOOKED_BY_REQUIRED', 'Booking actor'),
  });
  return freezeShipment({ ...shipment, status: 'booked', version: shipment.version + 1, booking, updatedAt: bookedAt });
}

export function setOutboundShipmentPacking(shipment, input) {
  invariant(shipment?.status === 'booked', 'SHIPMENT_PACKING_NOT_EDITABLE', 'Packing can only be set while shipment is booked', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const packages = normalizePackages(input.packages, shipment.quantity);
  const updatedAt = timestamp(input.updatedAt, 'SHIPMENT_PACKING_UPDATED_AT_INVALID', 'Packing update time');
  assertChronology(updatedAt, shipment.booking.bookedAt, 'SHIPMENT_PACKING_BEFORE_BOOKING', 'Packing cannot be recorded before booking');
  return freezeShipment({ ...shipment, packages, version: shipment.version + 1, updatedAt });
}

export function setOutboundShipmentDocuments(shipment, input) {
  invariant(shipment?.status === 'booked', 'SHIPMENT_DOCUMENTS_NOT_EDITABLE', 'Documents can only be set while shipment is booked', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const documents = normalizeDocuments(input.documents);
  const updatedAt = timestamp(input.updatedAt, 'SHIPMENT_DOCUMENTS_UPDATED_AT_INVALID', 'Document update time');
  assertChronology(updatedAt, shipment.booking.bookedAt, 'SHIPMENT_DOCUMENTS_BEFORE_BOOKING', 'Documents cannot be recorded before booking');
  return freezeShipment({ ...shipment, documents, version: shipment.version + 1, updatedAt });
}

export function markOutboundShipmentReady(shipment, input) {
  invariant(shipment?.status === 'booked', 'SHIPMENT_NOT_BOOKED', 'Only a booked shipment can pass the dispatch gate', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  invariant(shipment.packages.length > 0, 'SHIPMENT_PACKING_REQUIRED', 'Packing must be complete before dispatch readiness');
  assertRequiredDocuments(shipment.documents);
  const readyAt = timestamp(input.readyAt, 'SHIPMENT_READY_AT_INVALID', 'Dispatch readiness time');
  assertChronology(readyAt, shipment.booking.bookedAt, 'SHIPMENT_READY_BEFORE_BOOKING', 'Shipment cannot be ready before booking');
  return freezeShipment({
    ...shipment,
    status: 'ready-to-dispatch',
    version: shipment.version + 1,
    readyAt,
    readyBy: text(input.actorId, 1, 200, 'SHIPMENT_READY_BY_REQUIRED', 'Readiness actor'),
    updatedAt: readyAt,
  });
}

export function dispatchOutboundShipment(shipment, input) {
  invariant(shipment?.status === 'ready-to-dispatch', 'SHIPMENT_NOT_READY_TO_DISPATCH', 'Shipment must pass the dispatch gate before carrier handover', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const dispatchedAt = timestamp(input.dispatchedAt, 'SHIPMENT_DISPATCHED_AT_INVALID', 'Dispatch time');
  assertChronology(dispatchedAt, shipment.readyAt, 'SHIPMENT_DISPATCH_BEFORE_READY', 'Carrier handover cannot precede dispatch readiness');
  const dispatch = Object.freeze({
    dispatchedAt,
    dispatchedBy: text(input.actorId, 1, 200, 'SHIPMENT_DISPATCHED_BY_REQUIRED', 'Dispatch actor'),
    handoverReference: text(input.handoverReference, 2, 160, 'SHIPMENT_HANDOVER_REFERENCE_INVALID', 'Carrier handover reference'),
    trackingNumber: text(input.trackingNumber, 2, 160, 'SHIPMENT_TRACKING_NUMBER_INVALID', 'Tracking number'),
    sealNumbers: normalizeStringList(input.sealNumbers ?? [], 50, 120, 'SHIPMENT_SEAL_NUMBERS_INVALID', 'Seal number'),
    notes: optional(input.notes, 2000, 'SHIPMENT_DISPATCH_NOTES_INVALID', 'Dispatch notes'),
  });
  return freezeShipment({ ...shipment, status: 'dispatched', version: shipment.version + 1, dispatch, updatedAt: dispatchedAt });
}

export function cancelOutboundShipment(shipment, input) {
  invariant(['planned','booked','ready-to-dispatch'].includes(shipment?.status), 'SHIPMENT_NOT_CANCELLABLE', 'A dispatched or cancelled shipment cannot be cancelled', { status: shipment?.status });
  assertOutboundShipmentVersion(shipment, input.expectedVersion);
  const cancelledAt = timestamp(input.cancelledAt, 'SHIPMENT_CANCELLED_AT_INVALID', 'Cancellation time');
  assertChronology(cancelledAt, shipment.createdAt, 'SHIPMENT_CANCELLED_BEFORE_CREATION', 'Cancellation cannot precede creation');
  return freezeShipment({
    ...shipment,
    status: 'cancelled',
    version: shipment.version + 1,
    cancelledAt,
    cancelledBy: text(input.actorId, 1, 200, 'SHIPMENT_CANCELLED_BY_REQUIRED', 'Cancellation actor'),
    cancellationReason: text(input.reason, 5, 1000, 'SHIPMENT_CANCELLATION_REASON_INVALID', 'Cancellation reason'),
    updatedAt: cancelledAt,
  });
}

export function assertOutboundShipmentVersion(shipment, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1 && expectedVersion <= POSTGRES_INTEGER_MAXIMUM, 'SHIPMENT_EXPECTED_VERSION_INVALID', 'Shipment expectedVersion must be a positive PostgreSQL integer');
  invariant(shipment?.version === expectedVersion, 'SHIPMENT_CONCURRENCY_CONFLICT', 'Shipment was changed by another operation', { shipmentCode: shipment?.shipmentCode, expectedVersion, actualVersion: shipment?.version });
}

function normalizeConsignee(value) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'SHIPMENT_CONSIGNEE_INVALID', 'Consignee is required');
  return Object.freeze({
    organisationName: text(value.organisationName, 2, 200, 'SHIPMENT_CONSIGNEE_NAME_INVALID', 'Consignee organisation name'),
    locationCode: optional(value.locationCode, 80, 'SHIPMENT_CONSIGNEE_LOCATION_CODE_INVALID', 'Consignee location code'),
    countryCode: countryCode(value.countryCode),
    city: text(value.city, 2, 120, 'SHIPMENT_CONSIGNEE_CITY_INVALID', 'Consignee city'),
    postalCode: text(value.postalCode, 2, 32, 'SHIPMENT_CONSIGNEE_POSTAL_INVALID', 'Consignee postal code'),
    addressLine1: text(value.addressLine1, 3, 240, 'SHIPMENT_CONSIGNEE_ADDRESS_INVALID', 'Consignee address'),
    addressLine2: optional(value.addressLine2, 240, 'SHIPMENT_CONSIGNEE_ADDRESS_INVALID', 'Consignee address line 2'),
    contactName: text(value.contactName, 2, 160, 'SHIPMENT_CONSIGNEE_CONTACT_INVALID', 'Consignee contact'),
    email: optionalEmail(value.email),
    phone: optional(value.phone, 80, 'SHIPMENT_CONSIGNEE_PHONE_INVALID', 'Consignee phone'),
  });
}
function normalizePackages(value, shipmentQuantity) {
  invariant(Array.isArray(value) && value.length >= 1 && value.length <= 500, 'SHIPMENT_PACKAGES_INVALID', 'Shipment must contain 1 to 500 packages');
  const ids = new Set(); let packedQuantity = 0;
  const packages = value.map((item, index) => {
    invariant(item && typeof item === 'object' && !Array.isArray(item), 'SHIPMENT_PACKAGE_INVALID', 'Package record is invalid', { index });
    const packageId = text(item.packageId, 1, 80, 'SHIPMENT_PACKAGE_ID_INVALID', 'Package id');
    invariant(!ids.has(packageId), 'SHIPMENT_PACKAGE_ID_DUPLICATE', 'Package ids must be unique', { packageId }); ids.add(packageId);
    const quantity = positiveInteger(item.quantity, 'SHIPMENT_PACKAGE_QUANTITY_INVALID', 'Package quantity'); packedQuantity += quantity;
    return Object.freeze({
      packageId,
      packageType: text(item.packageType, 2, 80, 'SHIPMENT_PACKAGE_TYPE_INVALID', 'Package type'),
      quantity,
      grossWeightKg: positiveNumber(item.grossWeightKg, 'SHIPMENT_PACKAGE_WEIGHT_INVALID', 'Package gross weight'),
      lengthCm: positiveNumber(item.lengthCm, 'SHIPMENT_PACKAGE_DIMENSION_INVALID', 'Package length'),
      widthCm: positiveNumber(item.widthCm, 'SHIPMENT_PACKAGE_DIMENSION_INVALID', 'Package width'),
      heightCm: positiveNumber(item.heightCm, 'SHIPMENT_PACKAGE_DIMENSION_INVALID', 'Package height'),
      marks: optional(item.marks, 240, 'SHIPMENT_PACKAGE_MARKS_INVALID', 'Package marks'),
    });
  });
  invariant(packedQuantity === shipmentQuantity, 'SHIPMENT_PARTIAL_PACKING_FORBIDDEN', 'Packed quantity must exactly match the released lot; partial shipments are not supported', { packedQuantity, shipmentQuantity });
  return Object.freeze(packages);
}
function normalizeDocuments(value) {
  invariant(Array.isArray(value) && value.length >= 1 && value.length <= 100, 'SHIPMENT_DOCUMENTS_INVALID', 'Shipment documents must contain 1 to 100 records');
  const keys = new Set();
  return Object.freeze(value.map((item, index) => {
    invariant(item && typeof item === 'object' && !Array.isArray(item), 'SHIPMENT_DOCUMENT_INVALID', 'Shipment document is invalid', { index });
    const type = enumValue(item.type, OUTBOUND_DOCUMENT_TYPES, 'SHIPMENT_DOCUMENT_TYPE_INVALID', 'Shipment document type');
    const reference = text(item.reference, 2, 500, 'SHIPMENT_DOCUMENT_REFERENCE_INVALID', 'Shipment document reference');
    const key = `${type}:${reference}`;
    invariant(!keys.has(key), 'SHIPMENT_DOCUMENT_DUPLICATE', 'Shipment documents must be unique', { type, reference }); keys.add(key);
    return Object.freeze({ type, reference, issuedAt: item.issuedAt ? timestamp(item.issuedAt, 'SHIPMENT_DOCUMENT_ISSUED_AT_INVALID', 'Document issue time') : null });
  }));
}
function assertRequiredDocuments(documents) {
  const types = new Set(documents.map((document) => document.type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((type) => !types.has(type));
  invariant(missing.length === 0, 'SHIPMENT_REQUIRED_DOCUMENTS_MISSING', 'Packing list and transport document are required before dispatch readiness', { missing });
}
function normalizeStringList(value, maximum, itemMaximum, code, label) {
  invariant(Array.isArray(value) && value.length <= maximum, code, `${label}s must be an array with at most ${maximum} items`);
  const normalized = value.map((item) => text(item, 1, itemMaximum, code, label));
  invariant(new Set(normalized).size === normalized.length, code, `${label}s must be unique`);
  return Object.freeze(normalized);
}
function freezeShipment(value) { invariant(OUTBOUND_SHIPMENT_STATUSES.includes(value.status), 'SHIPMENT_STATUS_INVALID', 'Shipment status is invalid'); return deepFreeze(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
function enumValue(value, allowed, code, label) { invariant(allowed.includes(value), code, `${label} is invalid`, { value, allowed }); return value; }
function text(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optional(value, max, code, label) { return value === null || value === undefined || value === '' ? null : text(value, 1, max, code, label); }
function optionalEmail(value) { if (value === null || value === undefined || value === '') return null; const normalized = text(value, 3, 254, 'SHIPMENT_CONSIGNEE_EMAIL_INVALID', 'Consignee email').toLowerCase(); invariant(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), 'SHIPMENT_CONSIGNEE_EMAIL_INVALID', 'Consignee email is invalid'); return normalized; }
function countryCode(value) { const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''; invariant(/^[A-Z]{2}$/.test(normalized), 'SHIPMENT_CONSIGNEE_COUNTRY_INVALID', 'Consignee country code must be ISO-3166 alpha-2'); return normalized; }
function positiveInteger(value, code, label) { invariant(Number.isSafeInteger(value) && value >= 1, code, `${label} must be a positive integer`); return value; }
function positiveNumber(value, code, label) { invariant(typeof value === 'number' && Number.isFinite(value) && value > 0, code, `${label} must be a positive finite number`); return value; }
function timestamp(value, code, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function assertChronology(value, lowerBound, code, message) { invariant(Date.parse(value) >= Date.parse(lowerBound), code, message); }
