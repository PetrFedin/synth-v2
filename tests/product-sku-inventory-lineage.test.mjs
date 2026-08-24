import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptInventoryMovements, createWarehousePosition } from '../src/modules/inventory/public.mjs';

const receivedAt = '2026-09-05T09:00:00.000Z';
const postedAt = '2026-09-05T09:01:00.000Z';

function canonicalExecution() {
  const fulfillmentPlan = Object.freeze({
    id: 'plan-1', status: 'planned', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    brandId: 'brand-1', shopId: 'shop-1', shipTo: Object.freeze({ locationId: 'warehouse-1' }),
    lines: Object.freeze([Object.freeze({ lineId: 'line-0001', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1' })]),
  });
  const shipment = Object.freeze({
    id: 'shipment-1', status: 'shipped', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    fulfillmentPlanSnapshotId: fulfillmentPlan.id, brandId: 'brand-1', shopId: 'shop-1',
    lines: Object.freeze([Object.freeze({ lineId: 'line-0001', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1', quantity: 3 })]),
  });
  const receipt = Object.freeze({
    id: 'receipt-1', status: 'received', orderId: 'order-1', orderVersion: 3, orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    fulfillmentPlanSnapshotId: fulfillmentPlan.id, shipmentNoticeSnapshotId: shipment.id, brandId: 'brand-1', shopId: 'shop-1', receivedAt,
    lines: Object.freeze([Object.freeze({ lineId: 'line-0001', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1', receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 1, rejectedQuantity: 0 })]),
  });
  return { fulfillmentPlan, shipment, receipt };
}

test('canonical receipt posts V2 inventory movement with immutable ProductSku order-line lineage', () => {
  const { fulfillmentPlan, shipment, receipt } = canonicalExecution();
  const movements = createReceiptInventoryMovements({ idForLine: (lineId) => `movement-${lineId}`, receipt, shipment, fulfillmentPlan, postedAt });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].lineageVersion, 2);
  assert.equal(movements[0].orderLineNo, 1);
  assert.equal(movements[0].productSkuId, 'product-sku-1');
  assert.equal(movements[0].sku, 'SKU-1');
  assert.equal(movements[0].availableDelta, 2);
  assert.equal(movements[0].quarantineDelta, 1);
});

test('receipt cannot post inventory when ProductSku differs from shipment or fulfillment plan', () => {
  const { fulfillmentPlan, shipment, receipt } = canonicalExecution();
  const forgedReceipt = Object.freeze({
    ...receipt,
    lines: Object.freeze([Object.freeze({ ...receipt.lines[0], productSkuId: 'forged-product-sku' })]),
  });
  assert.throws(() => createReceiptInventoryMovements({ idForLine: () => 'movement-1', receipt: forgedReceipt, shipment, fulfillmentPlan, postedAt }), (error) => error.code === 'INVENTORY_RECEIPT_PRODUCT_SKU_LINEAGE_MISMATCH');
});

test('legacy receipt without ProductSku remains an explicit V1 compatibility movement', () => {
  const { fulfillmentPlan, shipment, receipt } = canonicalExecution();
  const legacyPlan = Object.freeze({ ...fulfillmentPlan, lines: Object.freeze([Object.freeze({ lineId: 'line-0001', sku: 'SKU-1' })]) });
  const legacyShipment = Object.freeze({ ...shipment, lines: Object.freeze([Object.freeze({ lineId: 'line-0001', sku: 'SKU-1', quantity: 3 })]) });
  const legacyReceipt = Object.freeze({ ...receipt, lines: Object.freeze([Object.freeze({ lineId: 'line-0001', sku: 'SKU-1', receivedQuantity: 3, acceptedQuantity: 3, damagedQuantity: 0, rejectedQuantity: 0 })]) });
  const movements = createReceiptInventoryMovements({ idForLine: () => 'movement-legacy', receipt: legacyReceipt, shipment: legacyShipment, fulfillmentPlan: legacyPlan, postedAt });
  assert.equal(movements[0].lineageVersion, 1);
  assert.equal(movements[0].productSkuId, null);
  assert.equal(movements[0].orderLineNo, null);
});

test('warehouse position cannot aggregate another ProductSku into a canonical position', () => {
  const { fulfillmentPlan, shipment, receipt } = canonicalExecution();
  const [movement] = createReceiptInventoryMovements({ idForLine: () => 'movement-1', receipt, shipment, fulfillmentPlan, postedAt });
  assert.throws(() => createWarehousePosition({
    shopId: 'shop-1',
    warehouseLocationId: 'warehouse-1',
    productSkuId: 'different-product-sku',
    sku: 'SKU-1',
    movements: [movement],
    asOf: postedAt,
  }), (error) => error.code === 'WAREHOUSE_POSITION_SCOPE_MISMATCH');
});
