import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFulfillmentPlanSnapshot,
  createReceiptSnapshot,
  createShipmentNoticeSnapshot,
} from '../src/modules/fulfillment/public.mjs';

const t0 = '2026-08-24T18:00:00.000Z';
const t1 = '2026-09-02T09:00:00.000Z';
const t2 = '2026-09-04T09:00:00.000Z';
const t3 = '2026-09-05T09:00:00.000Z';

function basis() {
  const order = Object.freeze({
    id: 'order-1',
    version: 4,
    brandId: 'brand-1',
    shopId: 'shop-1',
    currency: 'EUR',
    status: 'attached',
    orderCommitSnapshotId: 'commit-1',
  });
  const orderCommit = Object.freeze({
    id: 'commit-1',
    orderId: order.id,
    orderVersion: order.version,
    brandId: order.brandId,
    shopId: order.shopId,
    currency: order.currency,
    status: 'committed',
    lines: Object.freeze([
      Object.freeze({ lineNo: 1, sku: 'DUP-SKU', productSkuId: 'product-sku-red-38', quantity: 2 }),
      Object.freeze({ lineNo: 2, sku: 'DUP-SKU', productSkuId: 'product-sku-blue-38', quantity: 3 }),
    ]),
  });
  const supplyCommitment = Object.freeze({
    id: 'supply-1',
    status: 'committed',
    orderId: order.id,
    orderCommitSnapshotId: orderCommit.id,
    brandId: order.brandId,
    shopId: order.shopId,
    allocations: Object.freeze([
      Object.freeze({ orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU', quantity: 2, sourceType: 'production', sourceRef: 'po-red', expectedAvailabilityAt: t0 }),
      Object.freeze({ orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU', quantity: 3, sourceType: 'production', sourceRef: 'po-blue', expectedAvailabilityAt: t0 }),
    ]),
  });
  return { order, orderCommit, supplyCommitment };
}

function location(locationId, name) {
  return { locationId, name, countryCode: 'IT', city: 'Milan', addressLine1: 'Via Test 1' };
}

function buildPlan() {
  const { order, orderCommit, supplyCommitment } = basis();
  return createFulfillmentPlanSnapshot({
    id: 'plan-1',
    order,
    orderCommit,
    supplyCommitment,
    reservations: [],
    shipFrom: location('factory-1', 'Factory'),
    shipTo: location('warehouse-1', 'Buyer warehouse'),
    plannedShipAt: t1,
    expectedDeliveryAt: t2,
    createdAt: t0,
  });
}

test('ProductSku lineage survives Supply -> FulfillmentPlan -> Shipment -> Receipt', () => {
  const plan = buildPlan();
  assert.deepEqual(plan.lines.map(({ orderLineNo, productSkuId, sku }) => ({ orderLineNo, productSkuId, sku })), [
    { orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU' },
    { orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU' },
  ]);

  const shipment = createShipmentNoticeSnapshot({
    id: 'shipment-1',
    fulfillmentPlan: plan,
    priorShipments: [],
    shipmentNumber: 'ASN-001',
    carrier: 'Carrier',
    serviceLevel: 'road',
    lines: [
      { lineId: 'line-0001', quantity: 2 },
      { lineId: 'line-0002', quantity: 3 },
    ],
    shippedAt: t1,
    expectedDeliveryAt: t2,
    createdAt: t1,
  });
  assert.equal(shipment.lines[0].productSkuId, 'product-sku-red-38');
  assert.equal(shipment.lines[1].productSkuId, 'product-sku-blue-38');

  const receipt = createReceiptSnapshot({
    id: 'receipt-1',
    shipment,
    priorReceipts: [],
    receiptReference: 'GRN-001',
    receivedBy: 'Buyer Warehouse',
    receiptComplete: true,
    lines: [
      { lineId: 'line-0001', receivedQuantity: 2 },
      { lineId: 'line-0002', receivedQuantity: 3 },
    ],
    receivedAt: t3,
    createdAt: t3,
  });
  assert.deepEqual(receipt.lines.map(({ orderLineNo, productSkuId, sku }) => ({ orderLineNo, productSkuId, sku })), [
    { orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU' },
    { orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU' },
  ]);
});

test('shipment client cannot forge ProductSku lineage behind a valid fulfillment lineId', () => {
  const plan = buildPlan();
  assert.throws(() => createShipmentNoticeSnapshot({
    id: 'shipment-1',
    fulfillmentPlan: plan,
    priorShipments: [],
    shipmentNumber: 'ASN-001',
    carrier: 'Carrier',
    serviceLevel: 'road',
    lines: [{ lineId: 'line-0001', productSkuId: 'forged-product-sku', quantity: 1 }],
    shippedAt: t1,
    expectedDeliveryAt: t2,
    createdAt: t1,
  }), (error) => error.code === 'SHIPMENT_PRODUCT_SKU_MISMATCH');
});

test('receipt client cannot forge textual SKU lineage behind a valid shipment lineId', () => {
  const plan = buildPlan();
  const shipment = createShipmentNoticeSnapshot({
    id: 'shipment-1',
    fulfillmentPlan: plan,
    priorShipments: [],
    shipmentNumber: 'ASN-001',
    carrier: 'Carrier',
    serviceLevel: 'road',
    lines: [{ lineId: 'line-0001', quantity: 1 }],
    shippedAt: t1,
    expectedDeliveryAt: t2,
    createdAt: t1,
  });
  assert.throws(() => createReceiptSnapshot({
    id: 'receipt-1',
    shipment,
    priorReceipts: [],
    receiptReference: 'GRN-001',
    receivedBy: 'Buyer Warehouse',
    receiptComplete: true,
    lines: [{ lineId: 'line-0001', sku: 'FORGED-SKU', receivedQuantity: 1 }],
    receivedAt: t3,
    createdAt: t3,
  }), (error) => error.code === 'RECEIPT_SKU_MISMATCH');
});
