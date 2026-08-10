import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptClaimResolutionSnapshot, createReceiptDiscrepancyClaimSnapshot } from '../src/modules/receipt-claims/public.mjs';

const discrepancy = Object.freeze({
  id: 'disc-1', orderId: 'order-1', orderVersion: 2, orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
  fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'asn-1', latestReceiptSnapshotId: 'receipt-1',
  brandId: 'brand-1', shopId: 'shop-1', finalized: true, status: 'open', issueCount: 1, contentHash: 'a'.repeat(64),
  lines: Object.freeze([
    Object.freeze({ lineId: 'line-1', sku: 'SKU-A', shippedQuantity: 10, receivedQuantity: 10, acceptedQuantity: 8, damagedQuantity: 1, rejectedQuantity: 1, shortageQuantity: 0, overageQuantity: 0 }),
    Object.freeze({ lineId: 'line-2', sku: 'SKU-B', shippedQuantity: 5, receivedQuantity: 5, acceptedQuantity: 5, damagedQuantity: 0, rejectedQuantity: 0, shortageQuantity: 0, overageQuantity: 0 }),
  ]),
});

test('claim copies only immutable discrepancy issue lines', () => {
  const claim = createReceiptDiscrepancyClaimSnapshot({ id: 'claim-1', discrepancy, claimReference: 'CLAIM-100', reason: 'Damaged goods', requestedRemedy: 'credit', submittedAt: '2026-08-10T12:00:00.000Z' });
  assert.equal(claim.issueCount, 1);
  assert.equal(claim.lines.length, 1);
  assert.equal(claim.lines[0].sku, 'SKU-A');
  assert.equal(claim.lines[0].damagedQuantity, 1);
  assert.equal(claim.receiptDiscrepancyContentHash, 'a'.repeat(64));
  assert.equal(claim.status, 'submitted');
  assert.match(claim.contentHash, /^[a-f0-9]{64}$/);
});

test('claim rejects pending, clear or non-finalized discrepancies', () => {
  for (const candidate of [
    { ...discrepancy, finalized: false, status: 'open' },
    { ...discrepancy, status: 'clear', issueCount: 0 },
    { ...discrepancy, status: 'pending', finalized: false, issueCount: 0 },
  ]) assert.throws(() => createReceiptDiscrepancyClaimSnapshot({ id: 'claim-x', discrepancy: candidate, claimReference: 'CLAIM-X', reason: 'Invalid', requestedRemedy: 'investigation', submittedAt: '2026-08-10T12:00:00.000Z' }), (error) => error.code === 'RECEIPT_CLAIM_DISCREPANCY_NOT_CLAIMABLE');
});

test('resolution pins exact claim hash and contains no monetary settlement fields', () => {
  const claim = createReceiptDiscrepancyClaimSnapshot({ id: 'claim-1', discrepancy, claimReference: 'CLAIM-100', reason: 'Damaged goods', requestedRemedy: 'credit', submittedAt: '2026-08-10T12:00:00.000Z' });
  const resolution = createReceiptClaimResolutionSnapshot({ id: 'resolution-1', claim, resolutionType: 'accepted-for-credit', resolutionReason: 'Evidence accepted', resolvedAt: '2026-08-10T13:00:00.000Z' });
  assert.equal(resolution.claimSnapshotId, claim.id);
  assert.equal(resolution.claimContentHash, claim.contentHash);
  assert.equal(resolution.status, 'resolved');
  assert.equal(Object.hasOwn(resolution, 'amount'), false);
  assert.equal(Object.hasOwn(resolution, 'supplierCode'), false);
});
