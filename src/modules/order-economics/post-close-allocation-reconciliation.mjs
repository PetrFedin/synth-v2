import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import {
  createAllocationAwareMarginActualizationSnapshot,
  resolveOrderEconomicsLineageMode,
} from './allocation-close-lineage.mjs';

export function createPostCloseAllocationReconciliation({
  reconciliationId,
  marginActualizationId,
  order,
  orderCommit,
  costClose,
  postCloseAdjustment,
  pendingMarginActualization,
  landedCost,
  costAllocation,
  reconciledAt,
}) {
  invariant(reconciliationId, 'POST_CLOSE_ALLOCATION_RECONCILIATION_ID_REQUIRED', 'Post-close allocation reconciliation id is required');
  invariant(marginActualizationId, 'POST_CLOSE_ALLOCATION_MARGIN_ID_REQUIRED', 'Reconciled margin actualization id is required');
  invariant(resolveOrderEconomicsLineageMode(orderCommit) === 'product-sku-v2', 'POST_CLOSE_ALLOCATION_RECONCILIATION_LEGACY_NOT_APPLICABLE', 'Legacy economics does not require ProductSku post-close allocation reconciliation');
  invariant(costClose?.id && costClose.status === 'closed', 'POST_CLOSE_ALLOCATION_COST_CLOSE_REQUIRED', 'Post-close allocation reconciliation requires an immutable cost close');
  invariant(costClose.orderId === order.id && costClose.orderCommitSnapshotId === orderCommit.id, 'POST_CLOSE_ALLOCATION_COST_CLOSE_LINEAGE_MISMATCH', 'Cost close belongs to another order commit');
  invariant(postCloseAdjustment?.id && postCloseAdjustment.status === 'recorded', 'POST_CLOSE_ALLOCATION_ADJUSTMENT_REQUIRED', 'Post-close allocation reconciliation requires a recorded post-close adjustment');
  invariant(postCloseAdjustment.costCloseSnapshotId === costClose.id && postCloseAdjustment.orderId === order.id && postCloseAdjustment.orderCommitSnapshotId === orderCommit.id, 'POST_CLOSE_ALLOCATION_ADJUSTMENT_LINEAGE_MISMATCH', 'Post-close adjustment belongs to another cost-close chain');
  invariant(landedCost?.id === postCloseAdjustment.landedCostSnapshotId, 'POST_CLOSE_ALLOCATION_LANDED_MISMATCH', 'Reconciliation must use the exact landed-cost snapshot created by the post-close adjustment');
  invariant(pendingMarginActualization?.id === postCloseAdjustment.marginActualizationSnapshotId, 'POST_CLOSE_ALLOCATION_PENDING_MARGIN_MISMATCH', 'Reconciliation must start from the exact pending margin created by the post-close adjustment');
  invariant(pendingMarginActualization.allocationStatus === 'pending-post-close', 'POST_CLOSE_ALLOCATION_PENDING_MARGIN_REQUIRED', 'Post-close reconciliation requires a pending-post-close margin basis');
  invariant(pendingMarginActualization.orderId === order.id && pendingMarginActualization.orderCommitSnapshotId === orderCommit.id && pendingMarginActualization.landedCostSnapshotId === landedCost.id, 'POST_CLOSE_ALLOCATION_PENDING_MARGIN_LINEAGE_MISMATCH', 'Pending margin belongs to another economics basis');
  invariant(typeof pendingMarginActualization.aggregateContentHash === 'string' && pendingMarginActualization.aggregateContentHash.length === 64, 'POST_CLOSE_ALLOCATION_PENDING_AGGREGATE_HASH_REQUIRED', 'Pending margin must preserve its aggregate economics hash');
  invariant(typeof costAllocation?.createdAt === 'string' && Number.isFinite(Date.parse(costAllocation.createdAt)), 'POST_CLOSE_ALLOCATION_RUN_TIMESTAMP_INVALID', 'Exact cost allocation run must contain a valid creation timestamp');

  const timestamp = requireTimestamp(reconciledAt);
  invariant(Date.parse(timestamp) >= Date.parse(postCloseAdjustment.recordedAt), 'POST_CLOSE_ALLOCATION_RECONCILIATION_TIMESTAMP_INVALID', 'Reconciliation cannot predate the post-close adjustment');
  invariant(Date.parse(timestamp) >= Date.parse(costAllocation.createdAt), 'POST_CLOSE_ALLOCATION_RECONCILIATION_TIMESTAMP_INVALID', 'Reconciliation cannot predate the exact allocation run');

  const marginActualization = createAllocationAwareMarginActualizationSnapshot({
    id: marginActualizationId,
    order,
    orderCommit,
    landedCost,
    costAllocation,
    createdAt: timestamp,
  });
  invariant(marginActualization.allocationStatus === 'current', 'POST_CLOSE_ALLOCATION_RESULT_NOT_CURRENT', 'Reconciled margin must bind a current exact ProductSku allocation');
  invariant(marginActualization.aggregateContentHash === pendingMarginActualization.aggregateContentHash, 'POST_CLOSE_ALLOCATION_AGGREGATE_ECONOMICS_CHANGED', 'Post-close allocation reconciliation may change provenance only, not aggregate economics');
  invariant(
    marginActualization.netRevenue === pendingMarginActualization.netRevenue
      && marginActualization.landedCost === pendingMarginActualization.landedCost
      && marginActualization.contributionMarginAmount === pendingMarginActualization.contributionMarginAmount
      && marginActualization.contributionMarginPercent === pendingMarginActualization.contributionMarginPercent,
    'POST_CLOSE_ALLOCATION_AGGREGATE_ECONOMICS_CHANGED',
    'Post-close allocation reconciliation may not rewrite aggregate revenue, landed cost or margin',
  );

  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    costCloseSnapshotId: costClose.id,
    postCloseAdjustmentId: postCloseAdjustment.id,
    pendingMarginActualizationSnapshotId: pendingMarginActualization.id,
    landedCostSnapshotId: landedCost.id,
    costAllocationRunSnapshotId: marginActualization.costAllocationRunSnapshotId,
    costAllocationRunContentHash: marginActualization.costAllocationRunContentHash,
    costAllocationPolicyVersionId: marginActualization.costAllocationPolicyVersionId,
    costAllocationLineageMode: marginActualization.costAllocationLineageMode,
    marginActualizationSnapshotId: marginActualization.id,
    previousAllocationStatus: 'pending-post-close',
    resultingAllocationStatus: 'current',
    reconciledAt: timestamp,
  });
  const reconciliation = Object.freeze({
    id: reconciliationId,
    ...basis,
    status: 'reconciled',
    contentHash: hashBasis(basis),
  });
  return Object.freeze({ reconciliation, marginActualization });
}

function requireTimestamp(value) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'POST_CLOSE_ALLOCATION_RECONCILIATION_TIMESTAMP_INVALID', 'Reconciliation timestamp must be a valid date-time');
  return new Date(value).toISOString();
}
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
