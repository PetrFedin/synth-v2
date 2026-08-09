import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderMarginBridgeService } from '../src/application/order-margin-bridge-service.mjs';

const actorId = 'USER-1';
const order = Object.freeze({ id: 'ORDER-1', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', status: 'attached', orderCommitSnapshotId: 'COMMIT-1' });
const commit = Object.freeze({ id: 'COMMIT-1', orderId: order.id, brandId: order.brandId, shopId: order.shopId, currency: 'EUR', status: 'committed' });
const membership = Object.freeze({ id: 'MEM-1', organisationId: order.brandId, organisationType: 'brand', userId: actorId, role: 'owner', status: 'active' });
const close = Object.freeze({
  id: 'CLOSE-1', orderId: order.id, orderCommitSnapshotId: commit.id, costCloseReadinessSnapshotId: 'READY-1',
  landedCostSnapshotId: 'LANDED-BASE', marginActualizationSnapshotId: 'MARGIN-BASE', currency: 'EUR',
  totalLandedCost: 600, contributionMarginAmount: 400, contributionMarginPercent: 40,
});

function step(overrides = {}) {
  return Object.freeze({
    adjustmentId: 'ADJ-1', costCloseSnapshotId: close.id, previousAdjustmentId: null,
    orderId: order.id, orderCommitSnapshotId: commit.id, stepNumber: 1,
    actualCostEntryId: 'COST-LATE-1', costType: 'freight', sku: null, sourceRef: 'FREIGHT-1',
    sourceAmount: 50, sourceCurrency: 'EUR', fxRateSnapshotId: null, fxRate: null, fxRateType: null, fxSourceRef: null,
    convertedAmount: 50, currency: 'EUR', costDeltaAmount: 50, marginDeltaAmount: -50,
    reason: 'Late freight invoice',
    priorLandedCostSnapshotId: close.landedCostSnapshotId, priorLandedCost: 600,
    landedCostSnapshotId: 'LANDED-1', landedCost: 650,
    priorMarginActualizationSnapshotId: close.marginActualizationSnapshotId,
    priorContributionMarginAmount: 400, priorContributionMarginPercent: 40,
    marginActualizationSnapshotId: 'MARGIN-1', contributionMarginAmount: 350, contributionMarginPercent: 35,
    baseLandedCost: 600, baseContributionMarginAmount: 400, baseContributionMarginPercent: 40,
    cumulativeCostDeltaAmount: 50, cumulativeMarginDeltaAmount: -50,
    recordedAt: '2026-08-09T01:00:00.000Z',
    ...overrides,
  });
}

function serviceFor(steps, costClose = close) {
  const tx = {
    getOrder: async (id) => id === order.id ? order : undefined,
    getMembership: async (organisationId, userId) => organisationId === order.brandId && userId === actorId ? membership : undefined,
    getOrderCommitSnapshot: async (id) => id === commit.id ? commit : undefined,
    getCostCloseByOrderCommitSnapshotId: async (id) => id === commit.id ? costClose : undefined,
    listMarginBridgeSteps: async (id) => id === costClose?.id ? steps : [],
  };
  return createOrderMarginBridgeService({ reader: { transaction: (work) => work(tx) } });
}

test('margin bridge exposes immutable close as both base and effective economics before late adjustments', async () => {
  const bridge = await serviceFor([]).getOrderMarginBridgeForActor(actorId, order.id);
  assert.equal(bridge.status, 'CLOSED');
  assert.equal(bridge.costCloseSnapshotId, close.id);
  assert.deepEqual(bridge.steps, []);
  assert.deepEqual(bridge.base, {
    landedCostSnapshotId: 'LANDED-BASE', marginActualizationSnapshotId: 'MARGIN-BASE',
    totalLandedCost: 600, contributionMarginAmount: 400, contributionMarginPercent: 40,
  });
  assert.deepEqual(bridge.effective, bridge.base);
  assert.equal(bridge.cumulativePostCloseCostDelta, 0);
  assert.equal(bridge.cumulativePostCloseMarginDelta, 0);
});

test('margin bridge explains every late cost and credit and resolves current effective margin', async () => {
  const first = step();
  const second = step({
    adjustmentId: 'ADJ-2', previousAdjustmentId: first.adjustmentId, stepNumber: 2,
    actualCostEntryId: 'COST-CREDIT-1', costType: 'quality', sourceRef: 'QUALITY-CREDIT-1',
    sourceAmount: -20, convertedAmount: -20, costDeltaAmount: -20, marginDeltaAmount: 20,
    reason: 'Supplier quality credit',
    priorLandedCostSnapshotId: first.landedCostSnapshotId, priorLandedCost: 650,
    landedCostSnapshotId: 'LANDED-2', landedCost: 630,
    priorMarginActualizationSnapshotId: first.marginActualizationSnapshotId,
    priorContributionMarginAmount: 350, priorContributionMarginPercent: 35,
    marginActualizationSnapshotId: 'MARGIN-2', contributionMarginAmount: 370, contributionMarginPercent: 37,
    cumulativeCostDeltaAmount: 30, cumulativeMarginDeltaAmount: -30,
    recordedAt: '2026-08-09T02:00:00.000Z',
  });
  const bridge = await serviceFor([first, second]).getOrderMarginBridgeForActor(actorId, order.id);

  assert.equal(bridge.status, 'ADJUSTED');
  assert.equal(bridge.steps.length, 2);
  assert.equal(bridge.steps[0].reason, 'Late freight invoice');
  assert.equal(bridge.steps[1].reason, 'Supplier quality credit');
  assert.equal(bridge.effective.totalLandedCost, 630);
  assert.equal(bridge.effective.contributionMarginAmount, 370);
  assert.equal(bridge.effective.landedCostSnapshotId, 'LANDED-2');
  assert.equal(bridge.effective.marginActualizationSnapshotId, 'MARGIN-2');
  assert.equal(bridge.cumulativePostCloseCostDelta, 30);
  assert.equal(bridge.cumulativePostCloseMarginDelta, -30);
});

test('margin bridge preserves source currency and FX explanation for converted late cost', async () => {
  const converted = step({
    sourceAmount: 100, sourceCurrency: 'USD', fxRateSnapshotId: 'FX-1', fxRate: 0.5,
    fxRateType: 'invoice', fxSourceRef: 'ECB-1', convertedAmount: 50,
  });
  const bridge = await serviceFor([converted]).getOrderMarginBridgeForActor(actorId, order.id);
  assert.equal(bridge.steps[0].sourceAmount, 100);
  assert.equal(bridge.steps[0].sourceCurrency, 'USD');
  assert.equal(bridge.steps[0].fxRateSnapshotId, 'FX-1');
  assert.equal(bridge.steps[0].fxRate, 0.5);
  assert.equal(bridge.steps[0].fxRateType, 'invoice');
  assert.equal(bridge.steps[0].fxSourceRef, 'ECB-1');
  assert.equal(bridge.steps[0].convertedAmount, 50);
  assert.equal(bridge.steps[0].currency, 'EUR');
});

test('margin bridge rejects a broken adjustment chain instead of silently presenting false economics', async () => {
  const broken = step({ previousAdjustmentId: 'UNKNOWN-ADJUSTMENT' });
  await assert.rejects(
    () => serviceFor([broken]).getOrderMarginBridgeForActor(actorId, order.id),
    (error) => error?.code === 'MARGIN_BRIDGE_ADJUSTMENT_CHAIN_INVALID',
  );
});

test('margin bridge rejects cost and margin deltas that do not reconcile', async () => {
  const broken = step({ marginDeltaAmount: -49 });
  await assert.rejects(
    () => serviceFor([broken]).getOrderMarginBridgeForActor(actorId, order.id),
    (error) => error?.code === 'MARGIN_BRIDGE_MARGIN_DELTA_MISMATCH',
  );
});

test('margin bridge is unavailable until the immutable cost close exists', async () => {
  await assert.rejects(
    () => serviceFor([], null).getOrderMarginBridgeForActor(actorId, order.id),
    (error) => error?.code === 'COST_CLOSE_REQUIRED_FOR_MARGIN_BRIDGE',
  );
});
