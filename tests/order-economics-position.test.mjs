import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsPositionService } from '../src/application/order-economics-position-service.mjs';

const actorId = 'USER-1';
const order = Object.freeze({
  id: 'ORDER-POS-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  orderCommitSnapshotId: 'COMMIT-POS-1',
});
const orderCommit = Object.freeze({
  id: 'COMMIT-POS-1', orderId: order.id, orderVersion: order.version, status: 'committed',
  brandId: order.brandId, shopId: order.shopId, currency: order.currency, totalAmount: order.totalAmount,
});
const membership = Object.freeze({
  id: 'MEM-POS-1', organisationId: order.brandId, organisationType: 'brand', userId: actorId,
  role: 'owner', status: 'active', createdAt: '2026-08-09T00:00:00.000Z',
});

function createHarness({ readiness = null, close = null, latestAdjustment = null, reconciliations = [], landed = [], margins = [], costs = [] } = {}) {
  const tx = {
    getOrder: async (id) => id === order.id ? order : undefined,
    getOrderCommitSnapshot: async (id) => id === orderCommit.id ? orderCommit : undefined,
    getMembership: async (organisationId, userId) => organisationId === order.brandId && userId === actorId ? membership : undefined,
    getCostCloseByOrderCommitSnapshotId: async (id) => id === orderCommit.id ? close : undefined,
    getLatestCostCloseReadinessByOrderCommitSnapshotId: async (id) => id === orderCommit.id ? readiness : undefined,
    getLatestPostCloseAdjustment: async (closeId) => closeId === close?.id ? latestAdjustment : undefined,
    getPostCloseAllocationReconciliationByAdjustmentId: async (adjustmentId) => reconciliations.find((snapshot) => snapshot.postCloseAdjustmentId === adjustmentId),
    getLandedCostSnapshot: async (id) => landed.find((snapshot) => snapshot.id === id),
    getMarginActualizationSnapshot: async (id) => margins.find((snapshot) => snapshot.id === id),
    listActualCostEntries: async (id) => id === order.id ? costs : [],
  };
  return createOrderEconomicsPositionService({ economicsStore: { transaction: (work) => work(tx) } });
}

function landedSnapshot(id, totalCost, costEntryIds) {
  return Object.freeze({
    id, orderId: order.id, orderCommitSnapshotId: orderCommit.id, currency: order.currency,
    totalCost, costEntryIds: Object.freeze([...costEntryIds]),
  });
}
function marginSnapshot(id, landedCostSnapshotId, landedCost, contributionMarginAmount, contributionMarginPercent, allocation = {}) {
  return Object.freeze({
    id, orderId: order.id, orderCommitSnapshotId: orderCommit.id, landedCostSnapshotId, currency: order.currency,
    netRevenue: 1000, landedCost, contributionMarginAmount, contributionMarginPercent,
    allocationStatus: allocation.allocationStatus ?? null,
    costAllocationRunSnapshotId: allocation.costAllocationRunSnapshotId ?? null,
    costAllocationRunContentHash: allocation.costAllocationRunContentHash ?? null,
    costAllocationPolicyVersionId: allocation.costAllocationPolicyVersionId ?? null,
    costAllocationLineageMode: allocation.costAllocationLineageMode ?? null,
  });
}
function costEntry(id) {
  return Object.freeze({ id, orderId: order.id, orderCommitSnapshotId: orderCommit.id, entryKind: 'actual' });
}

const currentAllocation = Object.freeze({
  allocationStatus: 'current',
  costAllocationRunSnapshotId: 'ALLOCATION-CURRENT',
  costAllocationRunContentHash: 'a'.repeat(64),
  costAllocationPolicyVersionId: 'POLICY-1',
  costAllocationLineageMode: 'product-sku-v2',
});

test('economics position is OPEN before readiness exists', async () => {
  const service = createHarness();
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'OPEN');
  assert.deepEqual(position.blockingReasons, ['readiness_not_evaluated']);
  assert.equal(position.costCloseReadinessSnapshotId, null);
  assert.equal(position.costCloseSnapshotId, null);
  assert.equal(position.effectiveLandedCostSnapshotId, null);
  assert.equal(position.effectiveMarginActualizationSnapshotId, null);
  assert.equal(position.postCloseAllocationReconciliationSnapshotId, null);
  assert.equal(position.allocationStatus, null);
});

test('economics position exposes current READY_TO_CLOSE economics when ledger matches readiness basis', async () => {
  const costs = [costEntry('COST-1'), costEntry('COST-2')];
  const landed = landedSnapshot('LANDED-READY', 600, costs.map((entry) => entry.id));
  const margin = marginSnapshot('MARGIN-READY', landed.id, 600, 400, 40, currentAllocation);
  const readiness = Object.freeze({
    id: 'READY-1', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: landed.id, marginActualizationSnapshotId: margin.id,
    status: 'READY_TO_CLOSE', blockingReasons: Object.freeze([]),
  });
  const service = createHarness({ readiness, landed: [landed], margins: [margin], costs });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'READY_TO_CLOSE');
  assert.deepEqual(position.blockingReasons, []);
  assert.equal(position.costCloseReadinessSnapshotId, readiness.id);
  assert.equal(position.effectiveLandedCostSnapshotId, landed.id);
  assert.equal(position.effectiveMarginActualizationSnapshotId, margin.id);
  assert.equal(position.allocationStatus, 'current');
  assert.equal(position.costAllocationRunSnapshotId, currentAllocation.costAllocationRunSnapshotId);
  assert.equal(position.effectiveTotalLandedCost, 600);
  assert.equal(position.effectiveContributionMarginAmount, 400);
  assert.equal(position.effectiveContributionMarginPercent, 40);
});

test('economics position becomes STALE when cost ledger changes after readiness evaluation', async () => {
  const landed = landedSnapshot('LANDED-STALE', 600, ['COST-1']);
  const margin = marginSnapshot('MARGIN-STALE', landed.id, 600, 400, 40, currentAllocation);
  const readiness = Object.freeze({
    id: 'READY-STALE', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: landed.id, marginActualizationSnapshotId: margin.id,
    status: 'READY_TO_CLOSE', blockingReasons: Object.freeze([]),
  });
  const service = createHarness({
    readiness,
    landed: [landed],
    margins: [margin],
    costs: [costEntry('COST-1'), costEntry('COST-LATE')],
  });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'STALE');
  assert.deepEqual(position.blockingReasons, ['ledger_changed']);
  assert.equal(position.effectiveTotalLandedCost, 600);
  assert.equal(position.costCloseSnapshotId, null);
});

test('economics position resolves immutable close as CLOSED with zero post-close delta', async () => {
  const landed = landedSnapshot('LANDED-CLOSE', 600, ['COST-1']);
  const margin = marginSnapshot('MARGIN-CLOSE', landed.id, 600, 400, 40, currentAllocation);
  const close = Object.freeze({
    id: 'CLOSE-1', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: 'READY-1', landedCostSnapshotId: landed.id,
    marginActualizationSnapshotId: margin.id, totalLandedCost: 600, contributionMarginAmount: 400,
    ...currentAllocation,
  });
  const service = createHarness({ close, landed: [landed], margins: [margin] });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'CLOSED');
  assert.equal(position.costCloseSnapshotId, close.id);
  assert.equal(position.latestPostCloseAdjustmentId, null);
  assert.equal(position.postCloseAllocationReconciliationSnapshotId, null);
  assert.equal(position.allocationStatus, 'current');
  assert.equal(position.costAllocationRunSnapshotId, currentAllocation.costAllocationRunSnapshotId);
  assert.equal(position.effectiveTotalLandedCost, 600);
  assert.equal(position.effectiveContributionMarginAmount, 400);
  assert.equal(position.baseTotalLandedCost, 600);
  assert.equal(position.baseContributionMarginAmount, 400);
  assert.equal(position.cumulativePostCloseCostDelta, 0);
  assert.equal(position.cumulativePostCloseMarginDelta, 0);
});

test('latest post-close adjustment remains pending until its exact allocation is reconciled', async () => {
  const baseLanded = landedSnapshot('LANDED-BASE', 600, ['COST-1']);
  const baseMargin = marginSnapshot('MARGIN-BASE', baseLanded.id, 600, 400, 40, currentAllocation);
  const adjustedLanded = landedSnapshot('LANDED-ADJUSTED', 630, ['COST-1', 'COST-LATE-1', 'COST-LATE-2']);
  const pendingMargin = marginSnapshot('MARGIN-PENDING', adjustedLanded.id, 630, 370, 37, { allocationStatus: 'pending-post-close' });
  const close = Object.freeze({
    id: 'CLOSE-2', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: 'READY-2', landedCostSnapshotId: baseLanded.id,
    marginActualizationSnapshotId: baseMargin.id, totalLandedCost: 600, contributionMarginAmount: 400,
    ...currentAllocation,
  });
  const latestAdjustment = Object.freeze({
    id: 'ADJUSTMENT-2', costCloseSnapshotId: close.id, orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: adjustedLanded.id, marginActualizationSnapshotId: pendingMargin.id,
  });
  const service = createHarness({
    close,
    latestAdjustment,
    landed: [baseLanded, adjustedLanded],
    margins: [baseMargin, pendingMargin],
  });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'ADJUSTED');
  assert.equal(position.latestPostCloseAdjustmentId, latestAdjustment.id);
  assert.equal(position.postCloseAllocationReconciliationSnapshotId, null);
  assert.equal(position.effectiveLandedCostSnapshotId, adjustedLanded.id);
  assert.equal(position.effectiveMarginActualizationSnapshotId, pendingMargin.id);
  assert.equal(position.allocationStatus, 'pending-post-close');
  assert.equal(position.costAllocationRunSnapshotId, null);
  assert.equal(position.costAllocationRunContentHash, null);
  assert.equal(position.effectiveTotalLandedCost, 630);
  assert.equal(position.effectiveContributionMarginAmount, 370);
  assert.equal(position.cumulativePostCloseCostDelta, 30);
  assert.equal(position.cumulativePostCloseMarginDelta, -30);
});

test('latest post-close reconciliation promotes effective economics back to current exact allocation provenance', async () => {
  const baseLanded = landedSnapshot('LANDED-BASE-R', 600, ['COST-1']);
  const baseMargin = marginSnapshot('MARGIN-BASE-R', baseLanded.id, 600, 400, 40, currentAllocation);
  const adjustedLanded = landedSnapshot('LANDED-ADJUSTED-R', 630, ['COST-1', 'COST-LATE']);
  const pendingMargin = marginSnapshot('MARGIN-PENDING-R', adjustedLanded.id, 630, 370, 37, { allocationStatus: 'pending-post-close' });
  const reconciledAllocation = Object.freeze({
    allocationStatus: 'current',
    costAllocationRunSnapshotId: 'ALLOCATION-RECONCILED',
    costAllocationRunContentHash: 'b'.repeat(64),
    costAllocationPolicyVersionId: 'POLICY-2',
    costAllocationLineageMode: 'product-sku-v2',
  });
  const reconciledMargin = marginSnapshot('MARGIN-RECONCILED', adjustedLanded.id, 630, 370, 37, reconciledAllocation);
  const close = Object.freeze({
    id: 'CLOSE-R', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: 'READY-R', landedCostSnapshotId: baseLanded.id,
    marginActualizationSnapshotId: baseMargin.id, totalLandedCost: 600, contributionMarginAmount: 400,
    ...currentAllocation,
  });
  const latestAdjustment = Object.freeze({
    id: 'ADJUSTMENT-R', costCloseSnapshotId: close.id, orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: adjustedLanded.id, marginActualizationSnapshotId: pendingMargin.id,
  });
  const reconciliation = Object.freeze({
    id: 'RECON-R', costCloseSnapshotId: close.id, postCloseAdjustmentId: latestAdjustment.id,
    landedCostSnapshotId: adjustedLanded.id, marginActualizationSnapshotId: reconciledMargin.id,
    costAllocationRunSnapshotId: reconciledAllocation.costAllocationRunSnapshotId,
  });
  const service = createHarness({
    close,
    latestAdjustment,
    reconciliations: [reconciliation],
    landed: [baseLanded, adjustedLanded],
    margins: [baseMargin, pendingMargin, reconciledMargin],
  });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'ADJUSTED');
  assert.equal(position.postCloseAllocationReconciliationSnapshotId, reconciliation.id);
  assert.equal(position.effectiveMarginActualizationSnapshotId, reconciledMargin.id);
  assert.equal(position.allocationStatus, 'current');
  assert.equal(position.costAllocationRunSnapshotId, reconciledAllocation.costAllocationRunSnapshotId);
  assert.equal(position.costAllocationRunContentHash, reconciledAllocation.costAllocationRunContentHash);
  assert.equal(position.costAllocationPolicyVersionId, reconciledAllocation.costAllocationPolicyVersionId);
  assert.equal(position.effectiveContributionMarginAmount, pendingMargin.contributionMarginAmount);
});
