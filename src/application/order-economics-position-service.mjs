import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

export function createOrderEconomicsPositionService({ economicsStore } = {}) {
  invariant(economicsStore && typeof economicsStore.transaction === 'function', 'ORDER_ECONOMICS_STORE_REQUIRED', 'Order economics store is required');

  return Object.freeze({
    getOrderEconomicsPositionForActor(actorId, orderId) {
      return economicsStore.transaction(async (tx) => {
        const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        const membership = await tx.getMembership(order.brandId, actorId);
        assertCapability(membership, CAPABILITIES.MARGIN_READ);
        invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Economics position requires an immutable order commit snapshot', { orderId });
        const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
        invariant(orderCommit.orderId === order.id && orderCommit.status === 'committed', 'ORDER_COMMIT_SNAPSHOT_INVALID_FOR_EXECUTION', 'Economics position requires the committed snapshot for this order', { orderId, orderCommitSnapshotId: orderCommit.id });

        const close = await tx.getCostCloseByOrderCommitSnapshotId(orderCommit.id);
        if (close) return closedPosition(tx, order, orderCommit, close);

        const readiness = await tx.getLatestCostCloseReadinessByOrderCommitSnapshotId(orderCommit.id);
        if (!readiness) return openPosition(order, orderCommit);
        return readinessPosition(tx, order, orderCommit, readiness);
      });
    },
  });
}

async function readinessPosition(tx, order, orderCommit, readiness) {
  const landed = requireEntity(await tx.getLandedCostSnapshot(readiness.landedCostSnapshotId), 'LANDED_COST_SNAPSHOT_NOT_FOUND', { landedCostSnapshotId: readiness.landedCostSnapshotId });
  const margin = requireEntity(await tx.getMarginActualizationSnapshot(readiness.marginActualizationSnapshotId), 'MARGIN_ACTUALIZATION_NOT_FOUND', { marginActualizationSnapshotId: readiness.marginActualizationSnapshotId });
  const currentEntries = (await tx.listActualCostEntries(order.id)).filter((entry) => entry.orderCommitSnapshotId === orderCommit.id);
  const currentIds = currentEntries.map((entry) => entry.id).sort();
  const landedIds = [...(landed.costEntryIds ?? [])].sort();
  const stale = canonicalJson(currentIds) !== canonicalJson(landedIds);
  return freezePosition({
    orderId: order.id,
    orderCommitSnapshotId: orderCommit.id,
    currency: orderCommit.currency,
    status: stale ? 'STALE' : readiness.status,
    costCloseReadinessSnapshotId: readiness.id,
    costCloseSnapshotId: null,
    latestPostCloseAdjustmentId: null,
    postCloseAllocationReconciliationSnapshotId: null,
    blockingReasons: stale ? ['ledger_changed'] : [...readiness.blockingReasons],
    effectiveLandedCostSnapshotId: landed.id,
    effectiveMarginActualizationSnapshotId: margin.id,
    allocationStatus: margin.allocationStatus ?? null,
    costAllocationRunSnapshotId: margin.costAllocationRunSnapshotId ?? null,
    costAllocationRunContentHash: margin.costAllocationRunContentHash ?? null,
    costAllocationPolicyVersionId: margin.costAllocationPolicyVersionId ?? null,
    costAllocationLineageMode: margin.costAllocationLineageMode ?? null,
    effectiveTotalLandedCost: landed.totalCost,
    effectiveContributionMarginAmount: margin.contributionMarginAmount,
    effectiveContributionMarginPercent: margin.contributionMarginPercent,
    baseTotalLandedCost: null,
    baseContributionMarginAmount: null,
    cumulativePostCloseCostDelta: null,
    cumulativePostCloseMarginDelta: null,
  });
}

async function closedPosition(tx, order, orderCommit, close) {
  const latestAdjustment = await tx.getLatestPostCloseAdjustment(close.id);
  const reconciliation = latestAdjustment
    ? await tx.getPostCloseAllocationReconciliationByAdjustmentId(latestAdjustment.id)
    : null;
  const landedCostSnapshotId = latestAdjustment?.landedCostSnapshotId ?? close.landedCostSnapshotId;
  const marginActualizationSnapshotId = reconciliation?.marginActualizationSnapshotId
    ?? latestAdjustment?.marginActualizationSnapshotId
    ?? close.marginActualizationSnapshotId;
  const landed = requireEntity(await tx.getLandedCostSnapshot(landedCostSnapshotId), 'LANDED_COST_SNAPSHOT_NOT_FOUND', { landedCostSnapshotId });
  const margin = requireEntity(await tx.getMarginActualizationSnapshot(marginActualizationSnapshotId), 'MARGIN_ACTUALIZATION_NOT_FOUND', { marginActualizationSnapshotId });
  invariant(landed.orderCommitSnapshotId === orderCommit.id && margin.orderCommitSnapshotId === orderCommit.id && margin.landedCostSnapshotId === landed.id, 'ORDER_ECONOMICS_POSITION_LINEAGE_MISMATCH', 'Effective economics snapshots do not belong to the closed order commit');
  if (reconciliation) {
    invariant(
      reconciliation.costCloseSnapshotId === close.id
        && reconciliation.postCloseAdjustmentId === latestAdjustment.id
        && reconciliation.landedCostSnapshotId === landed.id
        && reconciliation.marginActualizationSnapshotId === margin.id
        && margin.allocationStatus === 'current'
        && margin.costAllocationRunSnapshotId === reconciliation.costAllocationRunSnapshotId,
      'ORDER_ECONOMICS_POSITION_RECONCILIATION_MISMATCH',
      'Effective reconciliation does not match the latest post-close economics basis',
    );
  }
  const allocationSource = latestAdjustment ? margin : close;
  return freezePosition({
    orderId: order.id,
    orderCommitSnapshotId: orderCommit.id,
    currency: orderCommit.currency,
    status: latestAdjustment ? 'ADJUSTED' : 'CLOSED',
    costCloseReadinessSnapshotId: close.costCloseReadinessSnapshotId ?? null,
    costCloseSnapshotId: close.id,
    latestPostCloseAdjustmentId: latestAdjustment?.id ?? null,
    postCloseAllocationReconciliationSnapshotId: reconciliation?.id ?? null,
    blockingReasons: [],
    effectiveLandedCostSnapshotId: landed.id,
    effectiveMarginActualizationSnapshotId: margin.id,
    allocationStatus: allocationSource.allocationStatus ?? null,
    costAllocationRunSnapshotId: allocationSource.costAllocationRunSnapshotId ?? null,
    costAllocationRunContentHash: allocationSource.costAllocationRunContentHash ?? null,
    costAllocationPolicyVersionId: allocationSource.costAllocationPolicyVersionId ?? null,
    costAllocationLineageMode: allocationSource.costAllocationLineageMode ?? null,
    effectiveTotalLandedCost: landed.totalCost,
    effectiveContributionMarginAmount: margin.contributionMarginAmount,
    effectiveContributionMarginPercent: margin.contributionMarginPercent,
    baseTotalLandedCost: close.totalLandedCost,
    baseContributionMarginAmount: close.contributionMarginAmount,
    cumulativePostCloseCostDelta: roundMoney(landed.totalCost - close.totalLandedCost),
    cumulativePostCloseMarginDelta: roundMoney(margin.contributionMarginAmount - close.contributionMarginAmount),
  });
}

function openPosition(order, orderCommit) {
  return freezePosition({
    orderId: order.id,
    orderCommitSnapshotId: orderCommit.id,
    currency: orderCommit.currency,
    status: 'OPEN',
    costCloseReadinessSnapshotId: null,
    costCloseSnapshotId: null,
    latestPostCloseAdjustmentId: null,
    postCloseAllocationReconciliationSnapshotId: null,
    blockingReasons: ['readiness_not_evaluated'],
    effectiveLandedCostSnapshotId: null,
    effectiveMarginActualizationSnapshotId: null,
    allocationStatus: null,
    costAllocationRunSnapshotId: null,
    costAllocationRunContentHash: null,
    costAllocationPolicyVersionId: null,
    costAllocationLineageMode: null,
    effectiveTotalLandedCost: null,
    effectiveContributionMarginAmount: null,
    effectiveContributionMarginPercent: null,
    baseTotalLandedCost: null,
    baseContributionMarginAmount: null,
    cumulativePostCloseCostDelta: null,
    cumulativePostCloseMarginDelta: null,
  });
}

function freezePosition(value) {
  return Object.freeze({ ...value, blockingReasons: Object.freeze([...value.blockingReasons]) });
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function roundMoney(value) { return Math.round(value * 10_000) / 10_000; }
