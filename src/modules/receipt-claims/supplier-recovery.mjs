import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const RECOVERABLE_RESOLUTIONS = new Set(['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit']);

export function createSupplierRecoverySnapshot({ id, resolution, supplier, actualCost, landedCost, marginActualization, costClose = null, postCloseAdjustment = null, reason, recordedAt }) {
  invariant(id, 'SUPPLIER_RECOVERY_ID_REQUIRED', 'Supplier recovery id is required');
  invariant(resolution?.id && resolution.status === 'resolved', 'SUPPLIER_RECOVERY_RESOLUTION_REQUIRED', 'Supplier recovery requires an immutable claim resolution');
  invariant(RECOVERABLE_RESOLUTIONS.has(resolution.resolutionType), 'SUPPLIER_RECOVERY_RESOLUTION_NOT_RECOVERABLE', 'Claim resolution is not eligible for supplier recovery', { resolutionType: resolution.resolutionType });
  invariant(supplier?.id && supplier.supplierCode && supplier.brandId === resolution.brandId, 'SUPPLIER_RECOVERY_SUPPLIER_MISMATCH', 'Supplier must belong to the selling brand', { supplierCode: supplier?.supplierCode });
  invariant(supplier.status !== 'draft', 'SUPPLIER_RECOVERY_SUPPLIER_UNESTABLISHED', 'Draft supplier cannot be used for recovery', { supplierCode: supplier.supplierCode });
  invariant(actualCost?.id && actualCost.entryKind === 'actual' && actualCost.amount < 0, 'SUPPLIER_RECOVERY_ACTUAL_COST_INVALID', 'Supplier recovery must create a negative canonical actual cost entry');
  invariant(actualCost.costType === 'quality', 'SUPPLIER_RECOVERY_COST_TYPE_INVALID', 'Supplier recovery must use quality cost type');
  invariant(actualCost.orderId === resolution.orderId && actualCost.orderCommitSnapshotId === resolution.orderCommitSnapshotId, 'SUPPLIER_RECOVERY_ACTUAL_COST_LINEAGE_MISMATCH', 'Recovery actual cost belongs to another order commit');
  invariant(actualCost.physicalLineageVersion === 2 && actualCost.fulfillmentPlanSnapshotId === resolution.fulfillmentPlanSnapshotId && actualCost.shipmentNoticeSnapshotId === resolution.shipmentNoticeSnapshotId && actualCost.receiptSnapshotId === resolution.latestReceiptSnapshotId && actualCost.receiptDiscrepancySnapshotId === resolution.receiptDiscrepancySnapshotId, 'SUPPLIER_RECOVERY_PHYSICAL_LINEAGE_MISMATCH', 'Recovery actual cost must pin the exact receipt claim evidence');
  invariant(landedCost?.id && landedCost.orderCommitSnapshotId === resolution.orderCommitSnapshotId && landedCost.costEntryIds?.includes(actualCost.id), 'SUPPLIER_RECOVERY_LANDED_COST_INVALID', 'Recovery landed cost must include the recovery actual cost entry');
  invariant(marginActualization?.id && marginActualization.landedCostSnapshotId === landedCost.id && marginActualization.orderCommitSnapshotId === resolution.orderCommitSnapshotId, 'SUPPLIER_RECOVERY_MARGIN_INVALID', 'Recovery margin must be actualized from the recovery landed cost');
  invariant((costClose === null) === (postCloseAdjustment === null), 'SUPPLIER_RECOVERY_CLOSE_SHAPE_INVALID', 'Cost close and post-close adjustment must be both present or both absent');
  if (costClose) {
    invariant(costClose.status === 'closed' && costClose.orderCommitSnapshotId === resolution.orderCommitSnapshotId, 'SUPPLIER_RECOVERY_COST_CLOSE_MISMATCH', 'Cost close belongs to another claim order commit');
    invariant(postCloseAdjustment.costCloseSnapshotId === costClose.id && postCloseAdjustment.actualCostEntryId === actualCost.id && postCloseAdjustment.landedCostSnapshotId === landedCost.id && postCloseAdjustment.marginActualizationSnapshotId === marginActualization.id, 'SUPPLIER_RECOVERY_POST_CLOSE_MISMATCH', 'Post-close adjustment does not represent the supplier recovery economics');
  }
  const basis = Object.freeze({
    claimResolutionSnapshotId: resolution.id,
    claimResolutionContentHash: resolution.contentHash,
    claimSnapshotId: resolution.claimSnapshotId,
    orderId: resolution.orderId,
    orderVersion: resolution.orderVersion,
    orderCommitSnapshotId: resolution.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: resolution.supplyCommitmentSnapshotId,
    fulfillmentPlanSnapshotId: resolution.fulfillmentPlanSnapshotId,
    shipmentNoticeSnapshotId: resolution.shipmentNoticeSnapshotId,
    receiptSnapshotId: resolution.latestReceiptSnapshotId,
    receiptDiscrepancySnapshotId: resolution.receiptDiscrepancySnapshotId,
    brandId: resolution.brandId,
    shopId: resolution.shopId,
    supplierId: supplier.id,
    supplierCode: supplier.supplierCode,
    supplierStatus: supplier.status,
    actualCostEntryId: actualCost.id,
    sourceRef: requiredText(actualCost.sourceRef, 1, 240, 'SUPPLIER_RECOVERY_SOURCE_REF_INVALID', 'Recovery source reference'),
    sourceRecoveryAmount: -actualCost.sourceAmount,
    sourceCurrency: actualCost.sourceCurrency,
    recoveryAmount: -actualCost.amount,
    currency: actualCost.currency,
    landedCostSnapshotId: landedCost.id,
    marginActualizationSnapshotId: marginActualization.id,
    costCloseSnapshotId: costClose?.id ?? null,
    postCloseAdjustmentId: postCloseAdjustment?.id ?? null,
    reason: requiredText(reason, 2, 1000, 'SUPPLIER_RECOVERY_REASON_INVALID', 'Recovery reason'),
    status: 'recorded',
    recordedAt: requiredTimestamp(recordedAt, 'SUPPLIER_RECOVERY_RECORDED_AT_INVALID'),
  });
  invariant(basis.sourceRecoveryAmount > 0 && basis.recoveryAmount > 0, 'SUPPLIER_RECOVERY_AMOUNT_INVALID', 'Supplier recovery amounts must be positive');
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}
function requiredText(value,min,max,code,label){ const normalized=typeof value==='string'?value.trim():''; invariant(normalized.length>=min&&normalized.length<=max,code,`${label} must contain ${min} to ${max} characters`); return normalized; }
function requiredTimestamp(value,code){ const parsed=Date.parse(value); invariant(typeof value==='string'&&Number.isFinite(parsed),code,'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function hashBasis(value){ return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
