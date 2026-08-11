import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const MAX_INTEGER = 2_147_483_647;
export const INVENTORY_MOVEMENT_TYPES = Object.freeze(['receipt-posting']);

export function createReceiptInventoryMovements({
  idForLine,
  receipt,
  shipment,
  fulfillmentPlan,
  postedAt,
}) {
  invariant(typeof idForLine === 'function', 'INVENTORY_ID_GENERATOR_REQUIRED', 'Inventory movement id generator is required');
  assertReceiptExecutionLineage(receipt, shipment, fulfillmentPlan);
  const warehouseLocationId = requiredText(fulfillmentPlan.shipTo?.locationId, 1, 120, 'INVENTORY_WAREHOUSE_LOCATION_REQUIRED', 'Warehouse location id');
  const timestamp = requiredTimestamp(postedAt, 'INVENTORY_POSTED_AT_INVALID');

  return Object.freeze(receipt.lines.map((line) => createInventoryMovementLedgerEntry({
    id: idForLine(line.lineId),
    movementType: 'receipt-posting',
    orderId: receipt.orderId,
    orderVersion: receipt.orderVersion,
    orderCommitSnapshotId: receipt.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: receipt.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: receipt.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: receipt.shipmentNoticeSnapshotId,
    receiptSnapshotId: receipt.id,
    brandId: receipt.brandId,
    shopId: receipt.shopId,
    warehouseLocationId,
    receiptLineId: line.lineId,
    sku: line.sku,
    receivedQuantity: line.receivedQuantity,
    acceptedQuantity: line.acceptedQuantity,
    damagedQuantity: line.damagedQuantity,
    rejectedQuantity: line.rejectedQuantity,
    occurredAt: receipt.receivedAt,
    postedAt: timestamp,
  })));
}

export function createInventoryMovementLedgerEntry({
  id,
  movementType,
  orderId,
  orderVersion,
  orderCommitSnapshotId,
  supplyCommitmentSnapshotId,
  fulfillmentPlanSnapshotId,
  shipmentNoticeSnapshotId,
  receiptSnapshotId,
  brandId,
  shopId,
  warehouseLocationId,
  receiptLineId,
  sku,
  receivedQuantity,
  acceptedQuantity,
  damagedQuantity,
  rejectedQuantity,
  occurredAt,
  postedAt,
}) {
  invariant(id, 'INVENTORY_MOVEMENT_ID_REQUIRED', 'Inventory movement id is required');
  invariant(INVENTORY_MOVEMENT_TYPES.includes(movementType), 'INVENTORY_MOVEMENT_TYPE_INVALID', 'Inventory movement type is invalid', { movementType });
  const received = nonNegativeInteger(receivedQuantity, 'INVENTORY_RECEIVED_QUANTITY_INVALID', 'Received quantity');
  const accepted = nonNegativeInteger(acceptedQuantity, 'INVENTORY_ACCEPTED_QUANTITY_INVALID', 'Accepted quantity');
  const damaged = nonNegativeInteger(damagedQuantity, 'INVENTORY_DAMAGED_QUANTITY_INVALID', 'Damaged quantity');
  const rejected = nonNegativeInteger(rejectedQuantity, 'INVENTORY_REJECTED_QUANTITY_INVALID', 'Rejected quantity');
  invariant(received > 0, 'INVENTORY_RECEIVED_QUANTITY_REQUIRED', 'Receipt inventory posting requires positive received quantity');
  invariant(accepted + damaged + rejected === received, 'INVENTORY_RECEIPT_DISPOSITION_MISMATCH', 'Accepted, damaged and rejected quantities must exactly equal physically received quantity');

  const basis = Object.freeze({
    movementType,
    lineageVersion: 1,
    orderId: requiredText(orderId, 1, 200, 'INVENTORY_ORDER_ID_REQUIRED', 'Order id'),
    orderVersion: positiveInteger(orderVersion, 'INVENTORY_ORDER_VERSION_INVALID', 'Order version'),
    orderCommitSnapshotId: requiredText(orderCommitSnapshotId, 1, 200, 'INVENTORY_ORDER_COMMIT_REQUIRED', 'Order commit snapshot id'),
    supplyCommitmentSnapshotId: requiredText(supplyCommitmentSnapshotId, 1, 200, 'INVENTORY_SUPPLY_COMMITMENT_REQUIRED', 'Supply commitment snapshot id'),
    fulfillmentPlanSnapshotId: requiredText(fulfillmentPlanSnapshotId, 1, 200, 'INVENTORY_FULFILLMENT_PLAN_REQUIRED', 'Fulfillment plan snapshot id'),
    shipmentNoticeSnapshotId: requiredText(shipmentNoticeSnapshotId, 1, 200, 'INVENTORY_SHIPMENT_REQUIRED', 'Shipment notice snapshot id'),
    receiptSnapshotId: requiredText(receiptSnapshotId, 1, 200, 'INVENTORY_RECEIPT_REQUIRED', 'Receipt snapshot id'),
    brandId: requiredText(brandId, 1, 200, 'INVENTORY_BRAND_REQUIRED', 'Brand id'),
    shopId: requiredText(shopId, 1, 200, 'INVENTORY_SHOP_REQUIRED', 'Shop id'),
    warehouseLocationId: requiredText(warehouseLocationId, 1, 120, 'INVENTORY_WAREHOUSE_LOCATION_REQUIRED', 'Warehouse location id'),
    receiptLineId: requiredText(receiptLineId, 1, 80, 'INVENTORY_RECEIPT_LINE_REQUIRED', 'Receipt line id'),
    sku: requiredText(sku, 1, 160, 'INVENTORY_SKU_REQUIRED', 'SKU'),
    receivedQuantity: received,
    acceptedQuantity: accepted,
    damagedQuantity: damaged,
    rejectedQuantity: rejected,
    onHandDelta: received,
    availableDelta: accepted,
    quarantineDelta: damaged + rejected,
    occurredAt: requiredTimestamp(occurredAt, 'INVENTORY_OCCURRED_AT_INVALID'),
    postedAt: requiredTimestamp(postedAt, 'INVENTORY_POSTED_AT_INVALID'),
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

export function createWarehousePosition({ shopId, warehouseLocationId, sku, movements, asOf }) {
  invariant(Array.isArray(movements), 'WAREHOUSE_POSITION_MOVEMENTS_INVALID', 'Warehouse position movements must be an array');
  const normalizedShopId = requiredText(shopId, 1, 200, 'WAREHOUSE_POSITION_SHOP_REQUIRED', 'Shop id');
  const normalizedLocationId = requiredText(warehouseLocationId, 1, 120, 'WAREHOUSE_POSITION_LOCATION_REQUIRED', 'Warehouse location id');
  const normalizedSku = requiredText(sku, 1, 160, 'WAREHOUSE_POSITION_SKU_REQUIRED', 'SKU');
  for (const movement of movements) {
    invariant(
      movement.shopId === normalizedShopId && movement.warehouseLocationId === normalizedLocationId && movement.sku === normalizedSku,
      'WAREHOUSE_POSITION_SCOPE_MISMATCH',
      'Warehouse position cannot aggregate movements outside its exact shop/location/SKU scope',
      { movementId: movement.id },
    );
  }
  const onHandQuantity = sumInteger(movements, 'onHandDelta');
  const availableQuantity = sumInteger(movements, 'availableDelta');
  const quarantineQuantity = sumInteger(movements, 'quarantineDelta');
  invariant(onHandQuantity >= 0 && availableQuantity >= 0 && quarantineQuantity >= 0, 'WAREHOUSE_POSITION_NEGATIVE', 'Warehouse position cannot be negative');
  invariant(availableQuantity + quarantineQuantity <= onHandQuantity, 'WAREHOUSE_POSITION_DISPOSITION_INVALID', 'Available and quarantine quantities cannot exceed on-hand quantity');
  return Object.freeze({
    shopId: normalizedShopId,
    warehouseLocationId: normalizedLocationId,
    sku: normalizedSku,
    onHandQuantity,
    availableQuantity,
    quarantineQuantity,
    movementCount: movements.length,
    latestMovementId: movements.length ? [...movements].sort(compareMovements).at(-1).id : null,
    asOf: requiredTimestamp(asOf, 'WAREHOUSE_POSITION_AS_OF_INVALID'),
  });
}

function assertReceiptExecutionLineage(receipt, shipment, fulfillmentPlan) {
  invariant(receipt?.status === 'received', 'INVENTORY_RECEIPT_INVALID', 'Inventory posting requires an immutable received receipt snapshot');
  invariant(shipment?.status === 'shipped', 'INVENTORY_SHIPMENT_INVALID', 'Inventory posting requires an immutable shipment notice');
  invariant(fulfillmentPlan?.status === 'planned', 'INVENTORY_FULFILLMENT_PLAN_INVALID', 'Inventory posting requires an immutable fulfillment plan');
  invariant(
    receipt.shipmentNoticeSnapshotId === shipment.id &&
      receipt.fulfillmentPlanSnapshotId === fulfillmentPlan.id &&
      shipment.fulfillmentPlanSnapshotId === fulfillmentPlan.id &&
      receipt.orderId === shipment.orderId && receipt.orderId === fulfillmentPlan.orderId &&
      receipt.orderCommitSnapshotId === shipment.orderCommitSnapshotId && receipt.orderCommitSnapshotId === fulfillmentPlan.orderCommitSnapshotId &&
      receipt.supplyCommitmentSnapshotId === shipment.supplyCommitmentSnapshotId && receipt.supplyCommitmentSnapshotId === fulfillmentPlan.supplyCommitmentSnapshotId &&
      receipt.brandId === shipment.brandId && receipt.brandId === fulfillmentPlan.brandId &&
      receipt.shopId === shipment.shopId && receipt.shopId === fulfillmentPlan.shopId,
    'INVENTORY_RECEIPT_EXECUTION_LINEAGE_MISMATCH',
    'Receipt, shipment and fulfillment plan must belong to the exact same immutable execution lineage',
    { receiptSnapshotId: receipt?.id, shipmentNoticeSnapshotId: shipment?.id, fulfillmentPlanSnapshotId: fulfillmentPlan?.id },
  );
}
function compareMovements(a, b) { return Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id); }
function sumInteger(values, field) {
  const total = values.reduce((sum, value) => sum + Number(value?.[field] ?? 0), 0);
  invariant(Number.isSafeInteger(total), 'WAREHOUSE_POSITION_QUANTITY_OVERFLOW', 'Warehouse position quantity exceeds safe integer range', { field });
  return total;
}
function positiveInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, code, `${label} must be a positive PostgreSQL integer`); return value; }
function nonNegativeInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 0 && value <= MAX_INTEGER, code, `${label} must be a non-negative PostgreSQL integer`); return value; }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
