import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFulfillmentPlanSnapshot,
  createReceiptDiscrepancySnapshot,
  createReceiptSnapshot,
  createShipmentNoticeSnapshot,
} from '../src/modules/fulfillment/public.mjs';

const now = '2026-08-10T00:00:00.000Z';
const order = Object.freeze({
  id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR',
  status: 'attached', version: 3, orderCommitSnapshotId: 'commit-1',
});
const orderCommit = Object.freeze({
  id: 'commit-1', orderId: 'order-1', orderVersion: 3, brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed',
  lines: Object.freeze([{ sku: 'SKU-1', quantity: 10, unitPrice: 100 }]),
});
const supply = Object.freeze({
  id: 'supply-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed',
  allocations: Object.freeze([
    Object.freeze({ sku: 'SKU-1', quantity: 6, sourceType: 'inventory', sourceRef: 'inventory-main', expectedAvailabilityAt: '2026-08-10T08:00:00.000Z' }),
    Object.freeze({ sku: 'SKU-1', quantity: 4, sourceType: 'production', sourceRef: 'PO-100', expectedAvailabilityAt: '2026-08-11T08:00:00.000Z' }),
  ]),
});
const reservations = Object.freeze([
  Object.freeze({ orderId: 'order-1', orderCommitSnapshotId: 'commit-1', sku: 'SKU-1', quantity: 10, lineageVersion: 2 }),
]);
const shipFrom = Object.freeze({ locationId: 'factory-1', name: 'Factory', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Industrial Zone 1' });
const shipTo = Object.freeze({ locationId: 'dc-1', name: 'Retail DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'Warehouse Strasse 1' });

function plan() {
  return createFulfillmentPlanSnapshot({
    id: 'plan-1', order, orderCommit, supplyCommitment: supply, reservations,
    shipFrom, shipTo, plannedShipAt: '2026-08-12T08:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z', createdAt: now,
  });
}

test('fulfillment plan pins order, supply and canonical inventory reservation lineage', () => {
  const value = plan();
  assert.equal(value.orderCommitSnapshotId, orderCommit.id);
  assert.equal(value.supplyCommitmentSnapshotId, supply.id);
  assert.deepEqual(value.lines.map((line) => [line.lineId, line.sourceType, line.quantity]), [
    ['line-0001', 'inventory', 6],
    ['line-0002', 'production', 4],
  ]);
  assert.equal(value.status, 'planned');
  assert.match(value.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(value));
});

test('inventory fulfillment cannot exceed pinned reservation', () => {
  assert.throws(() => createFulfillmentPlanSnapshot({
    id: 'plan-bad', order, orderCommit, supplyCommitment: supply,
    reservations: [{ orderId: order.id, orderCommitSnapshotId: orderCommit.id, sku: 'SKU-1', quantity: 5 }],
    shipFrom, shipTo, plannedShipAt: '2026-08-12T08:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z', createdAt: now,
  }), (error) => error.code === 'FULFILLMENT_INVENTORY_NOT_RESERVED');
});

test('split ASN cannot cumulatively exceed immutable fulfillment plan', () => {
  const fulfillmentPlan = plan();
  const first = createShipmentNoticeSnapshot({
    id: 'asn-1', fulfillmentPlan, shipmentNumber: 'ASN-1', carrier: 'DHL', serviceLevel: 'road',
    lines: [{ lineId: 'line-0001', quantity: 4 }], shippedAt: '2026-08-12T10:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z', createdAt: now,
  });
  assert.throws(() => createShipmentNoticeSnapshot({
    id: 'asn-2', fulfillmentPlan, priorShipments: [first], shipmentNumber: 'ASN-2', carrier: 'DHL', serviceLevel: 'road',
    lines: [{ lineId: 'line-0001', quantity: 3 }], shippedAt: '2026-08-12T12:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z', createdAt: now,
  }), (error) => error.code === 'SHIPMENT_EXCEEDS_FULFILLMENT_PLAN');
});

test('partial receipt remains pending while final shortage and damage open a discrepancy', () => {
  const fulfillmentPlan = plan();
  const shipment = createShipmentNoticeSnapshot({
    id: 'asn-1', fulfillmentPlan, shipmentNumber: 'ASN-1', carrier: 'DHL', serviceLevel: 'road',
    lines: [{ lineId: 'line-0001', quantity: 6 }], shippedAt: '2026-08-12T10:00:00.000Z', expectedDeliveryAt: '2026-08-15T08:00:00.000Z', createdAt: now,
  });
  const partial = createReceiptSnapshot({
    id: 'receipt-1', shipment, receiptReference: 'GRN-1', receivedBy: 'Warehouse A', receiptComplete: false,
    lines: [{ lineId: 'line-0001', receivedQuantity: 3 }], receivedAt: '2026-08-14T10:00:00.000Z', createdAt: now,
  });
  const pending = createReceiptDiscrepancySnapshot({ id: 'disc-1', shipment, receipts: [partial], createdAt: now });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.issueCount, 0);

  const finalReceipt = createReceiptSnapshot({
    id: 'receipt-2', shipment, priorReceipts: [partial], receiptReference: 'GRN-2', receivedBy: 'Warehouse A', receiptComplete: true,
    lines: [{ lineId: 'line-0001', receivedQuantity: 2, damagedQuantity: 1 }], receivedAt: '2026-08-15T10:00:00.000Z', createdAt: now,
  });
  const discrepancy = createReceiptDiscrepancySnapshot({ id: 'disc-2', shipment, receipts: [partial, finalReceipt], createdAt: now });
  assert.equal(discrepancy.status, 'open');
  assert.equal(discrepancy.issueCount, 1);
  assert.equal(discrepancy.lines[0].shortageQuantity, 1);
  assert.equal(discrepancy.lines[0].damagedQuantity, 1);
  assert.equal(discrepancy.finalized, true);
});
