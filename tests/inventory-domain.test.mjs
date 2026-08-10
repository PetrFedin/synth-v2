import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptInventoryMovements, createWarehousePosition } from '../src/modules/inventory/public.mjs';

const plan = Object.freeze({
  id: 'plan-1', status: 'planned', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
  brandId: 'brand-1', shopId: 'shop-1', shipTo: Object.freeze({ locationId: 'dc-berlin' }),
});
const shipment = Object.freeze({
  id: 'asn-1', status: 'shipped', fulfillmentPlanSnapshotId: 'plan-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1',
  supplyCommitmentSnapshotId: 'supply-1', brandId: 'brand-1', shopId: 'shop-1',
});
const receipt = Object.freeze({
  id: 'receipt-1', status: 'received', orderId: 'order-1', orderVersion: 2, orderCommitSnapshotId: 'commit-1',
  supplyCommitmentSnapshotId: 'supply-1', fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'asn-1',
  brandId: 'brand-1', shopId: 'shop-1', receivedAt: '2026-08-10T10:00:00.000Z',
  lines: Object.freeze([
    Object.freeze({ lineId: 'line-1', sku: 'SKU-A', receivedQuantity: 10, acceptedQuantity: 7, damagedQuantity: 2, rejectedQuantity: 1 }),
    Object.freeze({ lineId: 'line-2', sku: 'SKU-B', receivedQuantity: 5, acceptedQuantity: 5, damagedQuantity: 0, rejectedQuantity: 0 }),
  ]),
});

test('receipt posting preserves physical receipt and disposition quantities in append-only deltas', () => {
  let sequence = 0;
  const movements = createReceiptInventoryMovements({ idForLine: () => `move-${++sequence}`, receipt, shipment, fulfillmentPlan: plan, postedAt: '2026-08-10T10:01:00.000Z' });
  assert.equal(movements.length, 2);
  assert.deepEqual(
    movements.map((movement) => ({ sku: movement.sku, onHand: movement.onHandDelta, available: movement.availableDelta, quarantine: movement.quarantineDelta })),
    [
      { sku: 'SKU-A', onHand: 10, available: 7, quarantine: 3 },
      { sku: 'SKU-B', onHand: 5, available: 5, quarantine: 0 },
    ],
  );
  assert.ok(movements.every((movement) => movement.warehouseLocationId === 'dc-berlin'));
  assert.ok(movements.every((movement) => movement.receiptSnapshotId === 'receipt-1'));
  assert.ok(movements.every((movement) => /^[a-f0-9]{64}$/.test(movement.contentHash)));
});

test('warehouse position is derived from movements rather than mutable stock state', () => {
  let sequence = 0;
  const [movement] = createReceiptInventoryMovements({ idForLine: () => `move-${++sequence}`, receipt: { ...receipt, lines: [receipt.lines[0]] }, shipment, fulfillmentPlan: plan, postedAt: '2026-08-10T10:01:00.000Z' });
  const position = createWarehousePosition({ shopId: 'shop-1', warehouseLocationId: 'dc-berlin', sku: 'SKU-A', movements: [movement], asOf: '2026-08-10T10:02:00.000Z' });
  assert.equal(position.onHandQuantity, 10);
  assert.equal(position.availableQuantity, 7);
  assert.equal(position.quarantineQuantity, 3);
  assert.equal(position.movementCount, 1);
});

test('receipt posting rejects execution-lineage drift and inconsistent receipt dispositions', () => {
  assert.throws(
    () => createReceiptInventoryMovements({ idForLine: () => 'move-1', receipt, shipment: { ...shipment, fulfillmentPlanSnapshotId: 'plan-other' }, fulfillmentPlan: plan, postedAt: '2026-08-10T10:01:00.000Z' }),
    (error) => error.code === 'INVENTORY_RECEIPT_EXECUTION_LINEAGE_MISMATCH',
  );
  assert.throws(
    () => createReceiptInventoryMovements({
      idForLine: () => 'move-1',
      receipt: { ...receipt, lines: [{ ...receipt.lines[0], acceptedQuantity: 8 }] },
      shipment,
      fulfillmentPlan: plan,
      postedAt: '2026-08-10T10:01:00.000Z',
    }),
    (error) => error.code === 'INVENTORY_RECEIPT_DISPOSITION_MISMATCH',
  );
});
