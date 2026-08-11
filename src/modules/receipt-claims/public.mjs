import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const CLAIM_REMEDIES = Object.freeze(['replacement', 'return', 'credit', 'investigation']);
export const CLAIM_RESOLUTION_TYPES = Object.freeze([
  'accepted-for-replacement',
  'accepted-for-return',
  'accepted-for-credit',
  'accepted-as-is',
  'rejected',
]);

export function createReceiptDiscrepancyClaimSnapshot({
  id,
  discrepancy,
  claimReference,
  reason,
  requestedRemedy,
  submittedAt,
}) {
  invariant(id, 'RECEIPT_CLAIM_ID_REQUIRED', 'Receipt claim id is required');
  invariant(discrepancy?.id, 'RECEIPT_CLAIM_DISCREPANCY_REQUIRED', 'Receipt discrepancy snapshot is required');
  invariant(discrepancy.finalized === true && discrepancy.status === 'open', 'RECEIPT_CLAIM_DISCREPANCY_NOT_CLAIMABLE', 'Only a finalized open discrepancy can be claimed', { receiptDiscrepancySnapshotId: discrepancy.id, status: discrepancy.status, finalized: discrepancy.finalized });
  invariant(Number.isInteger(discrepancy.issueCount) && discrepancy.issueCount > 0, 'RECEIPT_CLAIM_ISSUES_REQUIRED', 'Claimable discrepancy must contain issue lines');
  invariant(CLAIM_REMEDIES.includes(requestedRemedy), 'RECEIPT_CLAIM_REMEDY_INVALID', 'Requested remedy is invalid', { requestedRemedy });

  const issueLines = discrepancy.lines
    .filter(isIssueLine)
    .map((line) => Object.freeze({
      lineId: requiredText(line.lineId, 1, 80, 'RECEIPT_CLAIM_LINE_ID_INVALID', 'Line id'),
      sku: requiredText(line.sku, 1, 160, 'RECEIPT_CLAIM_SKU_INVALID', 'SKU'),
      shippedQuantity: nonNegativeInteger(line.shippedQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      receivedQuantity: nonNegativeInteger(line.receivedQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      acceptedQuantity: nonNegativeInteger(line.acceptedQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      damagedQuantity: nonNegativeInteger(line.damagedQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      rejectedQuantity: nonNegativeInteger(line.rejectedQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      shortageQuantity: nonNegativeInteger(line.shortageQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
      overageQuantity: nonNegativeInteger(line.overageQuantity, 'RECEIPT_CLAIM_QUANTITY_INVALID'),
    }));
  invariant(issueLines.length === discrepancy.issueCount, 'RECEIPT_CLAIM_ISSUE_COUNT_MISMATCH', 'Claim issue lines must exactly match discrepancy issue count');

  const basis = Object.freeze({
    orderId: discrepancy.orderId,
    orderVersion: discrepancy.orderVersion,
    orderCommitSnapshotId: discrepancy.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: discrepancy.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: discrepancy.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: discrepancy.shipmentNoticeSnapshotId,
    latestReceiptSnapshotId: discrepancy.latestReceiptSnapshotId,
    receiptDiscrepancySnapshotId: discrepancy.id,
    receiptDiscrepancyContentHash: discrepancy.contentHash,
    brandId: discrepancy.brandId,
    shopId: discrepancy.shopId,
    claimReference: requiredText(claimReference, 2, 160, 'RECEIPT_CLAIM_REFERENCE_INVALID', 'Claim reference'),
    reason: requiredText(reason, 2, 2000, 'RECEIPT_CLAIM_REASON_INVALID', 'Claim reason'),
    requestedRemedy,
    issueCount: issueLines.length,
    lines: Object.freeze(issueLines),
    status: 'submitted',
    submittedAt: requiredTimestamp(submittedAt, 'RECEIPT_CLAIM_SUBMITTED_AT_INVALID'),
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

export function createReceiptClaimResolutionSnapshot({
  id,
  claim,
  resolutionType,
  resolutionReason,
  resolvedAt,
}) {
  invariant(id, 'RECEIPT_CLAIM_RESOLUTION_ID_REQUIRED', 'Receipt claim resolution id is required');
  invariant(claim?.id && claim.status === 'submitted', 'RECEIPT_CLAIM_RESOLUTION_CLAIM_INVALID', 'Resolution requires an immutable submitted claim');
  invariant(CLAIM_RESOLUTION_TYPES.includes(resolutionType), 'RECEIPT_CLAIM_RESOLUTION_TYPE_INVALID', 'Claim resolution type is invalid', { resolutionType });
  const basis = Object.freeze({
    claimSnapshotId: claim.id,
    claimContentHash: claim.contentHash,
    orderId: claim.orderId,
    orderVersion: claim.orderVersion,
    orderCommitSnapshotId: claim.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: claim.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: claim.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: claim.shipmentNoticeSnapshotId,
    latestReceiptSnapshotId: claim.latestReceiptSnapshotId,
    receiptDiscrepancySnapshotId: claim.receiptDiscrepancySnapshotId,
    brandId: claim.brandId,
    shopId: claim.shopId,
    resolutionType,
    resolutionReason: requiredText(resolutionReason, 2, 2000, 'RECEIPT_CLAIM_RESOLUTION_REASON_INVALID', 'Resolution reason'),
    status: 'resolved',
    resolvedAt: requiredTimestamp(resolvedAt, 'RECEIPT_CLAIM_RESOLVED_AT_INVALID'),
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

function isIssueLine(line) {
  return Number(line?.shortageQuantity ?? 0) > 0 || Number(line?.overageQuantity ?? 0) > 0 || Number(line?.damagedQuantity ?? 0) > 0 || Number(line?.rejectedQuantity ?? 0) > 0;
}
function nonNegativeInteger(value, code) { invariant(Number.isInteger(value) && value >= 0 && value <= 2_147_483_647, code, 'Quantity must be a non-negative PostgreSQL integer'); return value; }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
