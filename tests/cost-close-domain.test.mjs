import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createActualCostLedgerEntry,
  createCostCloseSnapshot,
  createLandedCostSnapshot,
  createMarginActualizationSnapshot,
  createPostCloseAdjustment,
  createSupplyCommitmentSnapshot,
} from '../src/modules/order-economics/public.mjs';

const t0 = '2026-08-09T00:00:00.000Z';
const t1 = '2026-08-09T01:00:00.000Z';
const t2 = '2026-08-09T02:00:00.000Z';
const t3 = '2026-08-09T03:00:00.000Z';
const order = Object.freeze({
  id: 'ORDER-CLOSE-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  orderCommitSnapshotId: 'ORDER-COMMIT-CLOSE-1',
  lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 10, unitPrice: 100 })]),
});
const orderCommit = Object.freeze({
  id: 'ORDER-COMMIT-CLOSE-1', orderId: order.id, orderVersion: order.version, status: 'committed',
  brandId: order.brandId, shopId: order.shopId, currency: order.currency, totalAmount: order.totalAmount,
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  lines: order.lines,
});
const supply = createSupplyCommitmentSnapshot({
  id: 'SUPPLY-CLOSE-1', order, orderCommit, createdAt: t0,
  allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-1' }],
});
const factory = createActualCostLedgerEntry({
  id: 'COST-BASE-1', order, orderCommit, supplyCommitment: supply,
  costType: 'factory', amount: 600, currency: 'EUR', sourceRef: 'FACTORY-INVOICE', occurredAt: t0, recordedAt: t0,
});
const baseLanded = createLandedCostSnapshot({ id: 'LANDED-BASE-1', order, orderCommit, costEntries: [factory], createdAt: t0 });
const baseMargin = createMarginActualizationSnapshot({ id: 'MARGIN-BASE-1', order, orderCommit, landedCost: baseLanded, createdAt: t0 });
const close = createCostCloseSnapshot({
  id: 'CLOSE-1', order, orderCommit, landedCost: baseLanded, marginActualization: baseMargin, closedAt: t1,
});

test('cost close freezes exact landed cost and margin truth for an order commit', () => {
  assert.equal(close.status, 'closed');
  assert.equal(close.orderCommitSnapshotId, orderCommit.id);
  assert.equal(close.landedCostSnapshotId, baseLanded.id);
  assert.equal(close.marginActualizationSnapshotId, baseMargin.id);
  assert.deepEqual(close.costEntryIds, [factory.id]);
  assert.equal(close.totalLandedCost, 600);
  assert.equal(close.netRevenue, 1000);
  assert.equal(close.contributionMarginAmount, 400);
  assert.equal(close.contributionMarginPercent, 40);
  assert.equal(close.closedAt, t1);
  assert.match(close.contentHash, /^[a-f0-9]{64}$/);
});

test('post-close adjustment creates a new landed cost and margin version without rewriting the close', () => {
  const freight = createActualCostLedgerEntry({
    id: 'COST-LATE-1', order, orderCommit, supplyCommitment: supply,
    costType: 'freight', amount: 50, currency: 'EUR', sourceRef: 'LATE-FREIGHT', occurredAt: t0, recordedAt: t2,
  });
  const landed = createLandedCostSnapshot({ id: 'LANDED-LATE-1', order, orderCommit, costEntries: [factory, freight], createdAt: t2 });
  const margin = createMarginActualizationSnapshot({ id: 'MARGIN-LATE-1', order, orderCommit, landedCost: landed, createdAt: t2 });
  const adjustment = createPostCloseAdjustment({
    id: 'ADJUST-1', order, orderCommit, costClose: close,
    actualCostEntry: freight, priorLandedCost: baseLanded, landedCost: landed,
    priorMarginActualization: baseMargin, marginActualization: margin,
    reason: 'Freight invoice arrived after close', recordedAt: t2,
  });

  assert.equal(adjustment.status, 'recorded');
  assert.equal(adjustment.costCloseSnapshotId, close.id);
  assert.equal(adjustment.previousAdjustmentId, null);
  assert.equal(adjustment.priorLandedCostSnapshotId, baseLanded.id);
  assert.equal(adjustment.landedCostSnapshotId, landed.id);
  assert.equal(adjustment.priorMarginActualizationSnapshotId, baseMargin.id);
  assert.equal(adjustment.marginActualizationSnapshotId, margin.id);
  assert.equal(adjustment.costDeltaAmount, 50);
  assert.equal(adjustment.marginDeltaAmount, -50);
  assert.equal(close.totalLandedCost, 600);
  assert.equal(close.contributionMarginAmount, 400);
});

test('post-close adjustments form a linear immutable re-actualization chain', () => {
  const freight = createActualCostLedgerEntry({
    id: 'COST-LATE-A', order, orderCommit, supplyCommitment: supply,
    costType: 'freight', amount: 50, currency: 'EUR', sourceRef: 'LATE-FREIGHT', occurredAt: t0, recordedAt: t2,
  });
  const landedA = createLandedCostSnapshot({ id: 'LANDED-LATE-A', order, orderCommit, costEntries: [factory, freight], createdAt: t2 });
  const marginA = createMarginActualizationSnapshot({ id: 'MARGIN-LATE-A', order, orderCommit, landedCost: landedA, createdAt: t2 });
  const adjustmentA = createPostCloseAdjustment({
    id: 'ADJUST-A', order, orderCommit, costClose: close,
    actualCostEntry: freight, priorLandedCost: baseLanded, landedCost: landedA,
    priorMarginActualization: baseMargin, marginActualization: marginA,
    reason: 'Late freight', recordedAt: t2,
  });

  const credit = createActualCostLedgerEntry({
    id: 'COST-LATE-B', order, orderCommit, supplyCommitment: supply,
    costType: 'quality', amount: -20, currency: 'EUR', sourceRef: 'QUALITY-CREDIT', occurredAt: t0, recordedAt: t3,
  });
  const landedB = createLandedCostSnapshot({ id: 'LANDED-LATE-B', order, orderCommit, costEntries: [factory, freight, credit], createdAt: t3 });
  const marginB = createMarginActualizationSnapshot({ id: 'MARGIN-LATE-B', order, orderCommit, landedCost: landedB, createdAt: t3 });
  const adjustmentB = createPostCloseAdjustment({
    id: 'ADJUST-B', order, orderCommit, costClose: close, previousAdjustment: adjustmentA,
    actualCostEntry: credit, priorLandedCost: landedA, landedCost: landedB,
    priorMarginActualization: marginA, marginActualization: marginB,
    reason: 'Supplier quality credit after close', recordedAt: t3,
  });

  assert.equal(adjustmentB.previousAdjustmentId, adjustmentA.id);
  assert.equal(adjustmentB.costDeltaAmount, -20);
  assert.equal(adjustmentB.marginDeltaAmount, 20);
  assert.equal(marginB.contributionMarginAmount, 370);
});

test('cost close refuses incomplete supply lineage', () => {
  const legacyLanded = Object.freeze({ ...baseLanded, id: 'LANDED-INCOMPLETE', supplyLineageComplete: false });
  const legacyMargin = Object.freeze({ ...baseMargin, id: 'MARGIN-INCOMPLETE', landedCostSnapshotId: legacyLanded.id, supplyLineageComplete: false });
  assert.throws(
    () => createCostCloseSnapshot({ id: 'CLOSE-X', order, orderCommit, landedCost: legacyLanded, marginActualization: legacyMargin, closedAt: t1 }),
    (error) => error?.code === 'COST_CLOSE_SUPPLY_LINEAGE_INCOMPLETE',
  );
});

test('first post-close adjustment must start from the frozen close basis', () => {
  const freight = createActualCostLedgerEntry({
    id: 'COST-LATE-X', order, orderCommit, supplyCommitment: supply,
    costType: 'freight', amount: 50, currency: 'EUR', sourceRef: 'LATE', occurredAt: t0, recordedAt: t2,
  });
  const landed = createLandedCostSnapshot({ id: 'LANDED-LATE-X', order, orderCommit, costEntries: [factory, freight], createdAt: t2 });
  const margin = createMarginActualizationSnapshot({ id: 'MARGIN-LATE-X', order, orderCommit, landedCost: landed, createdAt: t2 });
  assert.throws(
    () => createPostCloseAdjustment({
      id: 'ADJUST-X', order, orderCommit, costClose: close,
      actualCostEntry: freight, priorLandedCost: landed, landedCost: landed,
      priorMarginActualization: margin, marginActualization: margin,
      reason: 'Bad baseline', recordedAt: t2,
    }),
    (error) => error?.code === 'POST_CLOSE_BASELINE_MISMATCH',
  );
});
