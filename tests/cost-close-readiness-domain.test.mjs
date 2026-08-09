import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createActualCostLedgerEntry,
  createLandedCostSnapshot,
  createMarginActualizationSnapshot,
  createSupplyCommitmentSnapshot,
} from '../src/modules/order-economics/public.mjs';
import {
  createCostCloseReadinessSnapshot,
  createReadinessBoundCostCloseSnapshot,
} from '../src/modules/order-economics/cost-close-readiness.mjs';

const t0 = '2026-08-09T00:00:00.000Z';
const t1 = '2026-08-09T01:00:00.000Z';
const order = Object.freeze({
  id: 'ORDER-READY-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  orderCommitSnapshotId: 'COMMIT-READY-1',
  lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 10, unitPrice: 100 })]),
});
const orderCommit = Object.freeze({
  id: 'COMMIT-READY-1', orderId: order.id, orderVersion: order.version, status: 'committed',
  brandId: order.brandId, shopId: order.shopId, currency: order.currency, totalAmount: order.totalAmount,
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1', lines: order.lines,
});
const supply = createSupplyCommitmentSnapshot({
  id: 'SUPPLY-READY-1', order, orderCommit, createdAt: t0,
  allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-1' }],
});

function cost(id, costType, amount) {
  return createActualCostLedgerEntry({
    id, order, orderCommit, supplyCommitment: supply, costType, amount, currency: 'EUR', sourceRef: id, occurredAt: t0, recordedAt: t0,
  });
}
function economics(entries, suffix = 'BASE') {
  const landed = createLandedCostSnapshot({ id: `LANDED-${suffix}`, order, orderCommit, costEntries: entries, createdAt: t0 });
  const margin = createMarginActualizationSnapshot({ id: `MARGIN-${suffix}`, order, orderCommit, landedCost: landed, createdAt: t0 });
  return { landed, margin };
}
function requirement(type, status, evidenceEntryIds = [], waiverReason = null) {
  return { type, status, evidenceEntryIds, waiverReason };
}

const factory = cost('COST-FACTORY', 'factory', 500);
const freight = cost('COST-FREIGHT', 'freight', 60);
const duty = cost('COST-DUTY', 'duty', 40);
const baseEntries = [factory, freight, duty];
const { landed, margin } = economics(baseEntries);

test('readiness derives READY_TO_CLOSE only when all required buckets are completed or explicitly waived', () => {
  const readiness = createCostCloseReadinessSnapshot({
    id: 'READY-1', order, orderCommit, landedCost: landed, marginActualization: margin, costEntries: baseEntries, evaluatedAt: t1,
    requirements: [
      requirement('factory', 'complete', [factory.id]),
      requirement('freight', 'complete', [freight.id]),
      requirement('duty', 'complete', [duty.id]),
      requirement('credits', 'waived', [], 'No open claims, rebates or supplier credits'),
    ],
  });

  assert.equal(readiness.status, 'READY_TO_CLOSE');
  assert.deepEqual(readiness.blockingReasons, []);
  assert.equal(readiness.landedCostSnapshotId, landed.id);
  assert.equal(readiness.marginActualizationSnapshotId, margin.id);
  assert.match(readiness.contentHash, /^[a-f0-9]{64}$/);

  const close = createReadinessBoundCostCloseSnapshot({
    id: 'CLOSE-READY-1', order, orderCommit, landedCost: landed, marginActualization: margin, readiness, closedAt: t1,
  });
  assert.equal(close.costCloseReadinessSnapshotId, readiness.id);
  assert.equal(close.readinessContentHash, readiness.contentHash);
  assert.equal(close.totalLandedCost, 600);
  assert.equal(close.contributionMarginAmount, 400);
});

test('readiness state machine reports the highest-priority unresolved cost bucket', () => {
  const readiness = createCostCloseReadinessSnapshot({
    id: 'READY-WAIT', order, orderCommit, landedCost: landed, marginActualization: margin, costEntries: baseEntries, evaluatedAt: t1,
    requirements: [
      requirement('factory', 'complete', [factory.id]),
      requirement('freight', 'pending'),
      requirement('duty', 'pending'),
      requirement('credits', 'waived', [], 'No open credits'),
    ],
  });
  assert.equal(readiness.status, 'WAITING_FOR_FREIGHT');
  assert.deepEqual(readiness.blockingReasons, ['freight', 'duty']);
  assert.throws(
    () => createReadinessBoundCostCloseSnapshot({ id: 'CLOSE-NOT-READY', order, orderCommit, landedCost: landed, marginActualization: margin, readiness, closedAt: t1 }),
    (error) => error?.code === 'COST_CLOSE_NOT_READY',
  );
});

test('readiness evidence must match the reconciled economic bucket', () => {
  assert.throws(
    () => createCostCloseReadinessSnapshot({
      id: 'READY-BAD-EVIDENCE', order, orderCommit, landedCost: landed, marginActualization: margin, costEntries: baseEntries, evaluatedAt: t1,
      requirements: [
        requirement('factory', 'complete', [factory.id]),
        requirement('freight', 'complete', [factory.id]),
        requirement('duty', 'complete', [duty.id]),
        requirement('credits', 'waived', [], 'No open credits'),
      ],
    }),
    (error) => error?.code === 'COST_CLOSE_READINESS_EVIDENCE_TYPE_MISMATCH',
  );
});

test('credits complete requires a negative actual-cost entry; no-credit case must be explicitly waived', () => {
  const credit = cost('COST-CREDIT', 'quality', -20);
  const entries = [...baseEntries, credit];
  const adjusted = economics(entries, 'CREDIT');
  const readiness = createCostCloseReadinessSnapshot({
    id: 'READY-CREDIT', order, orderCommit, landedCost: adjusted.landed, marginActualization: adjusted.margin, costEntries: entries, evaluatedAt: t1,
    requirements: [
      requirement('factory', 'complete', [factory.id]),
      requirement('freight', 'complete', [freight.id]),
      requirement('duty', 'complete', [duty.id]),
      requirement('credits', 'complete', [credit.id]),
    ],
  });
  assert.equal(readiness.status, 'READY_TO_CLOSE');
  assert.equal(adjusted.landed.totalCost, 580);
});

test('readiness refuses a stale landed-cost snapshot when ledger changed after actualization', () => {
  const lateWarehouse = cost('COST-LATE-WAREHOUSE', 'warehouse', 10);
  assert.throws(
    () => createCostCloseReadinessSnapshot({
      id: 'READY-STALE', order, orderCommit, landedCost: landed, marginActualization: margin,
      costEntries: [...baseEntries, lateWarehouse], evaluatedAt: t1,
      requirements: [
        requirement('factory', 'complete', [factory.id]),
        requirement('freight', 'complete', [freight.id]),
        requirement('duty', 'complete', [duty.id]),
        requirement('credits', 'waived', [], 'No open credits'),
      ],
    }),
    (error) => error?.code === 'COST_CLOSE_READINESS_STALE_LANDED_COST',
  );
});
