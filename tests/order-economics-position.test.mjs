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

function createHarness({ readiness = null, close = null, latestAdjustment = null, landed = [], margins = [], costs = [] } = {}) {
  const tx = {
    getOrder: async (id) => id === order.id ? order : undefined,
    getOrderCommitSnapshot: async (id) => id === orderCommit.id ? orderCommit : undefined,
    getMembership: async (organisationId, userId) => organisationId === order.brandId && userId === actorId ? membership : undefined,
    getCostCloseByOrderCommitSnapshotId: async (id) => id === orderCommit.id ? close : undefined,
    getLatestCostCloseReadinessByOrderCommitSnapshotId: async (id) => id === orderCommit.id ? readiness : undefined,
    getLatestPostCloseAdjustment: async (closeId) => closeId === close?.id ? latestAdjustment : undefined,
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
function marginSnapshot(id, landedCostSnapshotId, landedCost, contributionMarginAmount, contributionMarginPercent) {
  return Object.freeze({
    id, orderId: order.id, orderCommitSnapshotId: orderCommit.id, landedCostSnapshotId, currency: order.currency,
    netRevenue: 1000, landedCost, contributionMarginAmount, contributionMarginPercent,
  });
}
function costEntry(id) {
  return Object.freeze({ id, orderId: order.id, orderCommitSnapshotId: orderCommit.id, entryKind: 'actual' });
}

test('economics position is OPEN before readiness exists', async () => {
  const service = createHarness();
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'OPEN');
  assert.deepEqual(position.blockingReasons, ['readiness_not_evaluated']);
  assert.equal(position.costCloseReadinessSnapshotId, null);
  assert.equal(position.costCloseSnapshotId, null);
  assert.equal(position.effectiveLandedCostSnapshotId, null);
  assert.equal(position.effectiveMarginActualizationSnapshotId, null);
});

test('economics position exposes current READY_TO_CLOSE economics when ledger matches readiness basis', async () => {
  const costs = [costEntry('COST-1'), costEntry('COST-2')];
  const landed = landedSnapshot('LANDED-READY', 600, costs.map((entry) => entry.id));
  const margin = marginSnapshot('MARGIN-READY', landed.id, 600, 400, 40);
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
  assert.equal(position.effectiveTotalLandedCost, 600);
  assert.equal(position.effectiveContributionMarginAmount, 400);
  assert.equal(position.effectiveContributionMarginPercent, 40);
});

test('economics position becomes STALE when cost ledger changes after readiness evaluation', async () => {
  const landed = landedSnapshot('LANDED-STALE', 600, ['COST-1']);
  const margin = marginSnapshot('MARGIN-STALE', landed.id, 600, 400, 40);
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
  const margin = marginSnapshot('MARGIN-CLOSE', landed.id, 600, 400, 40);
  const close = Object.freeze({
    id: 'CLOSE-1', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: 'READY-1', landedCostSnapshotId: landed.id,
    marginActualizationSnapshotId: margin.id, totalLandedCost: 600, contributionMarginAmount: 400,
  });
  const service = createHarness({ close, landed: [landed], margins: [margin] });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'CLOSED');
  assert.equal(position.costCloseSnapshotId, close.id);
  assert.equal(position.latestPostCloseAdjustmentId, null);
  assert.equal(position.effectiveTotalLandedCost, 600);
  assert.equal(position.effectiveContributionMarginAmount, 400);
  assert.equal(position.baseTotalLandedCost, 600);
  assert.equal(position.baseContributionMarginAmount, 400);
  assert.equal(position.cumulativePostCloseCostDelta, 0);
  assert.equal(position.cumulativePostCloseMarginDelta, 0);
});

test('economics position resolves latest post-close actualization as ADJUSTED against immutable base close', async () => {
  const baseLanded = landedSnapshot('LANDED-BASE', 600, ['COST-1']);
  const baseMargin = marginSnapshot('MARGIN-BASE', baseLanded.id, 600, 400, 40);
  const adjustedLanded = landedSnapshot('LANDED-ADJUSTED', 630, ['COST-1', 'COST-LATE-1', 'COST-LATE-2']);
  const adjustedMargin = marginSnapshot('MARGIN-ADJUSTED', adjustedLanded.id, 630, 370, 37);
  const close = Object.freeze({
    id: 'CLOSE-2', orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: 'READY-2', landedCostSnapshotId: baseLanded.id,
    marginActualizationSnapshotId: baseMargin.id, totalLandedCost: 600, contributionMarginAmount: 400,
  });
  const latestAdjustment = Object.freeze({
    id: 'ADJUSTMENT-2', costCloseSnapshotId: close.id, orderId: order.id, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: adjustedLanded.id, marginActualizationSnapshotId: adjustedMargin.id,
  });
  const service = createHarness({
    close,
    latestAdjustment,
    landed: [baseLanded, adjustedLanded],
    margins: [baseMargin, adjustedMargin],
  });
  const position = await service.getOrderEconomicsPositionForActor(actorId, order.id);

  assert.equal(position.status, 'ADJUSTED');
  assert.equal(position.latestPostCloseAdjustmentId, latestAdjustment.id);
  assert.equal(position.effectiveLandedCostSnapshotId, adjustedLanded.id);
  assert.equal(position.effectiveMarginActualizationSnapshotId, adjustedMargin.id);
  assert.equal(position.effectiveTotalLandedCost, 630);
  assert.equal(position.effectiveContributionMarginAmount, 370);
  assert.equal(position.baseTotalLandedCost, 600);
  assert.equal(position.baseContributionMarginAmount, 400);
  assert.equal(position.cumulativePostCloseCostDelta, 30);
  assert.equal(position.cumulativePostCloseMarginDelta, -30);
});
