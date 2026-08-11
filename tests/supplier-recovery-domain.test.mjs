import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierRecoverySnapshot } from '../src/modules/receipt-claims/supplier-recovery.mjs';

function fixture(overrides = {}) {
  const resolution = Object.freeze({
    id: 'resolution-1', status: 'resolved', resolutionType: 'accepted-for-credit', contentHash: 'a'.repeat(64),
    claimSnapshotId: 'claim-1', orderId: 'order-1', orderVersion: 2, orderCommitSnapshotId: 'commit-1',
    supplyCommitmentSnapshotId: 'supply-1', fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'shipment-1',
    latestReceiptSnapshotId: 'receipt-1', receiptDiscrepancySnapshotId: 'discrepancy-1', brandId: 'brand-1', shopId: 'shop-1',
    ...overrides.resolution,
  });
  const supplier = Object.freeze({ id: 'supplier-1', supplierCode: 'SUP-01', brandId: 'brand-1', status: 'qualified', ...overrides.supplier });
  const actualCost = Object.freeze({
    id: 'actual-cost-1', entryKind: 'actual', costType: 'quality', sourceAmount: -10, sourceCurrency: 'EUR', amount: -10,
    currency: 'EUR', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', physicalLineageVersion: 2,
    fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'shipment-1', receiptSnapshotId: 'receipt-1',
    receiptDiscrepancySnapshotId: 'discrepancy-1', sourceRef: 'CREDIT-NOTE-1', ...overrides.actualCost,
  });
  const landedCost = Object.freeze({ id: 'landed-1', orderCommitSnapshotId: 'commit-1', costEntryIds: ['actual-cost-1'], ...overrides.landedCost });
  const marginActualization = Object.freeze({ id: 'margin-1', orderCommitSnapshotId: 'commit-1', landedCostSnapshotId: 'landed-1', ...overrides.marginActualization });
  return { resolution, supplier, actualCost, landedCost, marginActualization };
}

function create(overrides = {}) {
  const values = fixture(overrides);
  return createSupplierRecoverySnapshot({
    id: 'recovery-1', ...values, costClose: overrides.costClose ?? null, postCloseAdjustment: overrides.postCloseAdjustment ?? null,
    reason: 'Accepted supplier credit', recordedAt: '2026-08-11T10:00:00.000Z',
  });
}

test('supplier recovery preserves claim, physical and economics lineage', () => {
  const recovery = create();
  assert.equal(recovery.claimResolutionSnapshotId, 'resolution-1');
  assert.equal(recovery.actualCostEntryId, 'actual-cost-1');
  assert.equal(recovery.sourceRecoveryAmount, 10);
  assert.equal(recovery.recoveryAmount, 10);
  assert.equal(recovery.sourceRef, 'CREDIT-NOTE-1');
  assert.equal(recovery.costCloseSnapshotId, null);
  assert.match(recovery.contentHash, /^[a-f0-9]{64}$/);
});

test('supplier recovery rejects non-recoverable resolution and physical lineage drift', () => {
  assert.throws(() => create({ resolution: { resolutionType: 'rejected' } }), (error) => error.code === 'SUPPLIER_RECOVERY_RESOLUTION_NOT_RECOVERABLE');
  assert.throws(() => create({ actualCost: { receiptSnapshotId: 'receipt-other' } }), (error) => error.code === 'SUPPLIER_RECOVERY_PHYSICAL_LINEAGE_MISMATCH');
  assert.throws(() => create({ supplier: { brandId: 'brand-other' } }), (error) => error.code === 'SUPPLIER_RECOVERY_SUPPLIER_MISMATCH');
});

test('post-close supplier recovery requires an exact adjustment chain', () => {
  const costClose = Object.freeze({ id: 'close-1', status: 'closed', orderCommitSnapshotId: 'commit-1' });
  const adjustment = Object.freeze({
    costCloseSnapshotId: 'close-1', actualCostEntryId: 'actual-cost-1', landedCostSnapshotId: 'landed-1', marginActualizationSnapshotId: 'margin-1',
  });
  const recovery = create({ costClose, postCloseAdjustment: adjustment });
  assert.equal(recovery.costCloseSnapshotId, 'close-1');
  assert.throws(() => create({ costClose }), (error) => error.code === 'SUPPLIER_RECOVERY_CLOSE_SHAPE_INVALID');
  assert.throws(() => create({ costClose, postCloseAdjustment: { ...adjustment, actualCostEntryId: 'wrong' } }), (error) => error.code === 'SUPPLIER_RECOVERY_POST_CLOSE_MISMATCH');
});
