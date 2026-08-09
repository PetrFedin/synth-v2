import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const SUPPLY_SOURCE_TYPES = new Set(['inventory', 'inbound', 'production', 'drop-ship']);
const DISCREPANCY_STATUSES = new Set(['pending', 'clear', 'open']);
const MAX_INTEGER = 2_147_483_647;

export function createFulfillmentPlanSnapshot({
  id,
  order,
  orderCommit,
  supplyCommitment,
  reservations = [],
  shipFrom,
  shipTo,
  plannedShipAt,
  expectedDeliveryAt,
  createdAt,
}) {
  assertExecutionLineage(order, orderCommit);
  assertSupplyLineage(supplyCommitment, orderCommit);
  invariant(id, 'FULFILLMENT_PLAN_ID_REQUIRED', 'Fulfillment plan id is required');
  invariant(Array.isArray(reservations), 'FULFILLMENT_RESERVATIONS_INVALID', 'Inventory reservations must be an array');

  const reservationBySku = new Map();
  for (const reservation of reservations) {
    invariant(reservation?.orderId === order.id && reservation?.orderCommitSnapshotId === orderCommit.id, 'FULFILLMENT_RESERVATION_LINEAGE_MISMATCH', 'Inventory reservation belongs to another order commit', { sku: reservation?.sku });
    const quantity = positiveInteger(reservation.quantity, 'FULFILLMENT_RESERVATION_QUANTITY_INVALID', 'Reservation quantity');
    reservationBySku.set(reservation.sku, (reservationBySku.get(reservation.sku) ?? 0) + quantity);
  }

  const inventoryPlannedBySku = new Map();
  const lines = supplyCommitment.allocations.map((allocation, index) => {
    invariant(SUPPLY_SOURCE_TYPES.has(allocation.sourceType), 'FULFILLMENT_SUPPLY_SOURCE_INVALID', 'Fulfillment source type is invalid', { sourceType: allocation.sourceType });
    const quantity = positiveInteger(allocation.quantity, 'FULFILLMENT_LINE_QUANTITY_INVALID', 'Fulfillment line quantity');
    if (allocation.sourceType === 'inventory') {
      const next = (inventoryPlannedBySku.get(allocation.sku) ?? 0) + quantity;
      invariant(next <= (reservationBySku.get(allocation.sku) ?? 0), 'FULFILLMENT_INVENTORY_NOT_RESERVED', 'Inventory-backed fulfillment cannot exceed the pinned order reservation', {
        sku: allocation.sku,
        plannedInventoryQuantity: next,
        reservedQuantity: reservationBySku.get(allocation.sku) ?? 0,
      });
      inventoryPlannedBySku.set(allocation.sku, next);
    }
    return Object.freeze({
      lineId: `line-${String(index + 1).padStart(4, '0')}`,
      sku: requiredText(allocation.sku, 1, 200, 'FULFILLMENT_LINE_SKU_REQUIRED', 'SKU'),
      quantity,
      sourceType: allocation.sourceType,
      sourceRef: requiredText(allocation.sourceRef, 1, 240, 'FULFILLMENT_SOURCE_REF_REQUIRED', 'Supply source reference'),
      expectedAvailabilityAt: optionalTimestamp(allocation.expectedAvailabilityAt, 'FULFILLMENT_AVAILABILITY_INVALID'),
    });
  });
  invariant(lines.length > 0, 'FULFILLMENT_LINES_REQUIRED', 'Fulfillment plan requires at least one supply line');

  const plannedShip = requiredTimestamp(plannedShipAt, 'FULFILLMENT_PLANNED_SHIP_AT_INVALID');
  const expectedDelivery = requiredTimestamp(expectedDeliveryAt, 'FULFILLMENT_EXPECTED_DELIVERY_AT_INVALID');
  invariant(Date.parse(expectedDelivery) > Date.parse(plannedShip), 'FULFILLMENT_DELIVERY_WINDOW_INVALID', 'Expected delivery must be after planned shipment');
  const availabilityTimes = lines.filter((line) => line.expectedAvailabilityAt).map((line) => Date.parse(line.expectedAvailabilityAt));
  if (availabilityTimes.length) {
    invariant(Date.parse(plannedShip) >= Math.max(...availabilityTimes), 'FULFILLMENT_SHIP_BEFORE_SUPPLY_AVAILABLE', 'Planned shipment cannot precede committed supply availability');
  }

  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    supplyCommitmentSnapshotId: supplyCommitment.id,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    currency: orderCommit.currency,
    shipFrom: normalizeLocation(shipFrom, 'FULFILLMENT_SHIP_FROM'),
    shipTo: normalizeLocation(shipTo, 'FULFILLMENT_SHIP_TO'),
    plannedShipAt: plannedShip,
    expectedDeliveryAt: expectedDelivery,
    lines: Object.freeze(lines),
  });
  return Object.freeze({
    id,
    ...basis,
    status: 'planned',
    contentHash: hashBasis(basis),
    createdAt: requiredTimestamp(createdAt, 'FULFILLMENT_PLAN_CREATED_AT_INVALID'),
  });
}

export function createShipmentNoticeSnapshot({
  id,
  fulfillmentPlan,
  priorShipments = [],
  shipmentNumber,
  carrier,
  serviceLevel,
  trackingNumber = null,
  lines,
  shippedAt,
  expectedDeliveryAt,
  createdAt,
}) {
  invariant(fulfillmentPlan?.status === 'planned', 'FULFILLMENT_PLAN_NOT_PLANNED', 'Shipment notice requires a planned fulfillment snapshot');
  invariant(id, 'SHIPMENT_NOTICE_ID_REQUIRED', 'Shipment notice id is required');
  invariant(Array.isArray(priorShipments), 'SHIPMENT_PRIOR_SNAPSHOTS_INVALID', 'Prior shipment notices must be an array');
  invariant(Array.isArray(lines) && lines.length > 0, 'SHIPMENT_LINES_REQUIRED', 'Shipment notice requires shipment lines');

  const planByLine = new Map(fulfillmentPlan.lines.map((line) => [line.lineId, line]));
  const alreadyShipped = new Map();
  for (const shipment of priorShipments) {
    assertShipmentPlanLineage(shipment, fulfillmentPlan);
    for (const line of shipment.lines) alreadyShipped.set(line.lineId, (alreadyShipped.get(line.lineId) ?? 0) + line.quantity);
  }

  const seen = new Set();
  const normalizedLines = lines.map((input) => {
    const lineId = requiredText(input?.lineId, 1, 80, 'SHIPMENT_LINE_ID_REQUIRED', 'Fulfillment line id');
    invariant(!seen.has(lineId), 'SHIPMENT_LINE_DUPLICATE', 'Shipment cannot contain the same fulfillment line twice', { lineId });
    seen.add(lineId);
    const planLine = planByLine.get(lineId);
    invariant(planLine, 'SHIPMENT_LINE_NOT_IN_PLAN', 'Shipment line is not present in the fulfillment plan', { lineId });
    const quantity = positiveInteger(input.quantity, 'SHIPMENT_LINE_QUANTITY_INVALID', 'Shipment quantity');
    const cumulative = (alreadyShipped.get(lineId) ?? 0) + quantity;
    invariant(cumulative <= planLine.quantity, 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN', 'Cumulative shipped quantity cannot exceed fulfillment plan quantity', {
      lineId,
      sku: planLine.sku,
      planQuantity: planLine.quantity,
      cumulativeShippedQuantity: cumulative,
    });
    return Object.freeze({
      lineId,
      sku: planLine.sku,
      quantity,
      sourceType: planLine.sourceType,
      sourceRef: planLine.sourceRef,
    });
  });

  const shipped = requiredTimestamp(shippedAt, 'SHIPMENT_SHIPPED_AT_INVALID');
  const delivery = requiredTimestamp(expectedDeliveryAt, 'SHIPMENT_EXPECTED_DELIVERY_AT_INVALID');
  invariant(Date.parse(delivery) > Date.parse(shipped), 'SHIPMENT_DELIVERY_WINDOW_INVALID', 'Shipment expected delivery must be after shipment time');
  const basis = Object.freeze({
    orderId: fulfillmentPlan.orderId,
    orderVersion: fulfillmentPlan.orderVersion,
    orderCommitSnapshotId: fulfillmentPlan.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: fulfillmentPlan.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: fulfillmentPlan.id,
    brandId: fulfillmentPlan.brandId,
    shopId: fulfillmentPlan.shopId,
    shipmentNumber: requiredText(shipmentNumber, 2, 120, 'SHIPMENT_NUMBER_INVALID', 'Shipment number'),
    carrier: requiredText(carrier, 2, 160, 'SHIPMENT_CARRIER_INVALID', 'Carrier'),
    serviceLevel: requiredText(serviceLevel, 1, 120, 'SHIPMENT_SERVICE_LEVEL_INVALID', 'Service level'),
    trackingNumber: optionalText(trackingNumber, 160, 'SHIPMENT_TRACKING_NUMBER_INVALID', 'Tracking number'),
    shippedAt: shipped,
    expectedDeliveryAt: delivery,
    lines: Object.freeze(normalizedLines),
  });
  return Object.freeze({
    id,
    ...basis,
    status: 'shipped',
    contentHash: hashBasis(basis),
    createdAt: requiredTimestamp(createdAt, 'SHIPMENT_CREATED_AT_INVALID'),
  });
}

export function createReceiptSnapshot({
  id,
  shipment,
  priorReceipts = [],
  receiptReference,
  receivedBy,
  receiptComplete,
  lines,
  receivedAt,
  createdAt,
}) {
  invariant(shipment?.status === 'shipped', 'RECEIPT_SHIPMENT_NOT_SHIPPED', 'Receipt requires an immutable shipped ASN');
  invariant(id, 'RECEIPT_ID_REQUIRED', 'Receipt id is required');
  invariant(Array.isArray(priorReceipts), 'RECEIPT_PRIOR_SNAPSHOTS_INVALID', 'Prior receipts must be an array');
  invariant(!priorReceipts.some((receipt) => receipt.receiptComplete === true), 'RECEIPT_AFTER_FINAL_FORBIDDEN', 'No additional receipt can be recorded after a final receipt');
  invariant(typeof receiptComplete === 'boolean', 'RECEIPT_COMPLETE_FLAG_REQUIRED', 'receiptComplete must be boolean');
  invariant(Array.isArray(lines) && lines.length > 0, 'RECEIPT_LINES_REQUIRED', 'Receipt requires at least one line');

  for (const receipt of priorReceipts) assertReceiptShipmentLineage(receipt, shipment);
  const shipmentByLine = new Map(shipment.lines.map((line) => [line.lineId, line]));
  const seen = new Set();
  const normalizedLines = lines.map((input) => {
    const lineId = requiredText(input?.lineId, 1, 80, 'RECEIPT_LINE_ID_REQUIRED', 'Shipment line id');
    invariant(!seen.has(lineId), 'RECEIPT_LINE_DUPLICATE', 'Receipt cannot contain the same shipment line twice', { lineId });
    seen.add(lineId);
    const shipmentLine = shipmentByLine.get(lineId);
    invariant(shipmentLine, 'RECEIPT_LINE_NOT_IN_SHIPMENT', 'Receipt line is not present in the shipment notice', { lineId });
    const receivedQuantity = positiveInteger(input.receivedQuantity, 'RECEIPT_QUANTITY_INVALID', 'Received quantity');
    const damagedQuantity = nonNegativeInteger(input.damagedQuantity ?? 0, 'RECEIPT_DAMAGED_QUANTITY_INVALID', 'Damaged quantity');
    const rejectedQuantity = nonNegativeInteger(input.rejectedQuantity ?? 0, 'RECEIPT_REJECTED_QUANTITY_INVALID', 'Rejected quantity');
    invariant(damagedQuantity + rejectedQuantity <= receivedQuantity, 'RECEIPT_DISPOSITION_EXCEEDS_RECEIVED', 'Damaged and rejected quantities cannot exceed physically received quantity', { lineId, receivedQuantity, damagedQuantity, rejectedQuantity });
    return Object.freeze({
      lineId,
      sku: shipmentLine.sku,
      shippedQuantity: shipmentLine.quantity,
      receivedQuantity,
      damagedQuantity,
      rejectedQuantity,
      acceptedQuantity: receivedQuantity - damagedQuantity - rejectedQuantity,
    });
  });

  const basis = Object.freeze({
    orderId: shipment.orderId,
    orderVersion: shipment.orderVersion,
    orderCommitSnapshotId: shipment.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: shipment.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: shipment.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: shipment.id,
    brandId: shipment.brandId,
    shopId: shipment.shopId,
    receiptReference: requiredText(receiptReference, 2, 160, 'RECEIPT_REFERENCE_INVALID', 'Receipt reference'),
    receivedBy: requiredText(receivedBy, 2, 200, 'RECEIPT_RECEIVED_BY_INVALID', 'Receiver'),
    receiptComplete,
    receivedAt: requiredTimestamp(receivedAt, 'RECEIPT_RECEIVED_AT_INVALID'),
    lines: Object.freeze(normalizedLines),
  });
  return Object.freeze({
    id,
    ...basis,
    status: 'received',
    contentHash: hashBasis(basis),
    createdAt: requiredTimestamp(createdAt, 'RECEIPT_CREATED_AT_INVALID'),
  });
}

export function createReceiptDiscrepancySnapshot({ id, shipment, receipts, createdAt }) {
  invariant(shipment?.status === 'shipped', 'RECEIPT_DISCREPANCY_SHIPMENT_INVALID', 'Receipt discrepancy requires a shipped ASN');
  invariant(id, 'RECEIPT_DISCREPANCY_ID_REQUIRED', 'Receipt discrepancy id is required');
  invariant(Array.isArray(receipts) && receipts.length > 0, 'RECEIPT_DISCREPANCY_RECEIPTS_REQUIRED', 'Receipt discrepancy requires receipt snapshots');
  for (const receipt of receipts) assertReceiptShipmentLineage(receipt, shipment);

  const finalized = receipts.some((receipt) => receipt.receiptComplete === true);
  const aggregate = new Map(shipment.lines.map((line) => [line.lineId, {
    lineId: line.lineId,
    sku: line.sku,
    shippedQuantity: line.quantity,
    receivedQuantity: 0,
    acceptedQuantity: 0,
    damagedQuantity: 0,
    rejectedQuantity: 0,
  }]));
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      const value = aggregate.get(line.lineId);
      value.receivedQuantity += line.receivedQuantity;
      value.acceptedQuantity += line.acceptedQuantity;
      value.damagedQuantity += line.damagedQuantity;
      value.rejectedQuantity += line.rejectedQuantity;
    }
  }

  const lines = [...aggregate.values()].map((value) => Object.freeze({
    ...value,
    shortageQuantity: finalized ? Math.max(value.shippedQuantity - value.receivedQuantity, 0) : 0,
    overageQuantity: Math.max(value.receivedQuantity - value.shippedQuantity, 0),
  }));
  const issues = lines.filter((line) => line.shortageQuantity > 0 || line.overageQuantity > 0 || line.damagedQuantity > 0 || line.rejectedQuantity > 0);
  const status = issues.length > 0 ? 'open' : (finalized ? 'clear' : 'pending');
  invariant(DISCREPANCY_STATUSES.has(status), 'RECEIPT_DISCREPANCY_STATUS_INVALID', 'Receipt discrepancy status is invalid');
  const orderedReceipts = [...receipts].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || a.id.localeCompare(b.id));
  const basis = Object.freeze({
    orderId: shipment.orderId,
    orderVersion: shipment.orderVersion,
    orderCommitSnapshotId: shipment.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: shipment.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: shipment.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: shipment.id,
    brandId: shipment.brandId,
    shopId: shipment.shopId,
    receiptSnapshotIds: Object.freeze(orderedReceipts.map((receipt) => receipt.id)),
    latestReceiptSnapshotId: orderedReceipts.at(-1).id,
    finalized,
    lines: Object.freeze(lines),
    issueCount: issues.length,
  });
  return Object.freeze({
    id,
    ...basis,
    status,
    contentHash: hashBasis({ ...basis, status }),
    createdAt: requiredTimestamp(createdAt, 'RECEIPT_DISCREPANCY_CREATED_AT_INVALID'),
  });
}

function assertExecutionLineage(order, orderCommit) {
  invariant(order?.id && order.status === 'attached', 'ORDER_NOT_COMMITTED_FOR_EXECUTION', 'Fulfillment requires an attached wholesale order', { orderId: order?.id, status: order?.status });
  invariant(order.orderCommitSnapshotId === orderCommit?.id && orderCommit?.status === 'committed' && orderCommit.orderId === order.id, 'ORDER_COMMIT_SNAPSHOT_MISMATCH_FOR_EXECUTION', 'Fulfillment requires the exact immutable order commit snapshot');
  invariant(orderCommit.orderVersion === order.version && orderCommit.brandId === order.brandId && orderCommit.shopId === order.shopId && orderCommit.currency === order.currency, 'ORDER_COMMIT_TRADE_MISMATCH_FOR_EXECUTION', 'Order and immutable commit differ on execution identity');
}
function assertSupplyLineage(supplyCommitment, orderCommit) {
  invariant(supplyCommitment?.status === 'committed', 'FULFILLMENT_SUPPLY_COMMITMENT_REQUIRED', 'Fulfillment requires an immutable supply commitment');
  invariant(supplyCommitment.orderId === orderCommit.orderId && supplyCommitment.orderCommitSnapshotId === orderCommit.id, 'FULFILLMENT_SUPPLY_LINEAGE_MISMATCH', 'Supply commitment belongs to another order commit');
  invariant(supplyCommitment.brandId === orderCommit.brandId && supplyCommitment.shopId === orderCommit.shopId, 'FULFILLMENT_SUPPLY_TRADE_MISMATCH', 'Supply commitment belongs to another trade pair');
}
function assertShipmentPlanLineage(shipment, plan) {
  invariant(shipment?.fulfillmentPlanSnapshotId === plan.id && shipment.orderId === plan.orderId && shipment.orderCommitSnapshotId === plan.orderCommitSnapshotId && shipment.supplyCommitmentSnapshotId === plan.supplyCommitmentSnapshotId, 'SHIPMENT_PLAN_LINEAGE_MISMATCH', 'Shipment notice belongs to another fulfillment plan');
}
function assertReceiptShipmentLineage(receipt, shipment) {
  invariant(receipt?.shipmentNoticeSnapshotId === shipment.id && receipt.fulfillmentPlanSnapshotId === shipment.fulfillmentPlanSnapshotId && receipt.orderId === shipment.orderId && receipt.orderCommitSnapshotId === shipment.orderCommitSnapshotId, 'RECEIPT_SHIPMENT_LINEAGE_MISMATCH', 'Receipt belongs to another shipment lineage');
}
function normalizeLocation(value, prefix) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${prefix}_INVALID`, 'Location snapshot must be an object');
  const countryCode = requiredText(value.countryCode, 2, 2, `${prefix}_COUNTRY_INVALID`, 'Country code').toUpperCase();
  invariant(/^[A-Z]{2}$/.test(countryCode), `${prefix}_COUNTRY_INVALID`, 'Country code must be ISO-3166 alpha-2');
  return Object.freeze({
    locationId: requiredText(value.locationId, 1, 120, `${prefix}_ID_REQUIRED`, 'Location id'),
    name: requiredText(value.name, 1, 200, `${prefix}_NAME_REQUIRED`, 'Location name'),
    countryCode,
    city: requiredText(value.city, 1, 120, `${prefix}_CITY_REQUIRED`, 'City'),
    addressLine1: requiredText(value.addressLine1, 1, 240, `${prefix}_ADDRESS_REQUIRED`, 'Address line 1'),
    addressLine2: optionalText(value.addressLine2, 240, `${prefix}_ADDRESS_INVALID`, 'Address line 2'),
    postalCode: optionalText(value.postalCode, 40, `${prefix}_POSTAL_CODE_INVALID`, 'Postal code'),
  });
}
function positiveInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, code, `${label} must be a positive PostgreSQL integer`); return value; }
function nonNegativeInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 0 && value <= MAX_INTEGER, code, `${label} must be a non-negative PostgreSQL integer`); return value; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function optionalTimestamp(value, code) { return value === null || value === undefined || value === '' ? null : requiredTimestamp(value, code); }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optionalText(value, max, code, label) { return value === null || value === undefined || value === '' ? null : requiredText(value, 1, max, code, label); }
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
