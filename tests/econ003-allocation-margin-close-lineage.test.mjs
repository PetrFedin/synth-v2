import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAllocationAwareCostCloseReadinessSnapshot,
  createAllocationAwareMarginActualizationSnapshot,
  createAllocationAwareReadinessBoundCostCloseSnapshot,
  createPendingPostCloseMarginActualizationSnapshot,
} from '../src/modules/order-economics/allocation-close-lineage.mjs';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';

function fixture({ canonical = true } = {}) {
  const order = Object.freeze({ id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'attached', version: 1, orderCommitSnapshotId: 'commit-1' });
  const lines = canonical
    ? [{ orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', quantity: 1, unitPrice: 100 }]
    : [{ sku: 'SKU-X', quantity: 1, unitPrice: 100 }];
  const orderCommit = Object.freeze({ id: 'commit-1', orderId: 'order-1', orderVersion: 1, brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed', totalAmount: 100, lines: Object.freeze(lines.map(Object.freeze)) });
  const landedCost = Object.freeze({ id: 'landed-1', orderId: 'order-1', orderVersion: 1, orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotIds: Object.freeze(['supply-1']), supplyLineageComplete: true, currency: 'EUR', costEntryIds: Object.freeze(['cost-1']), componentTotals: Object.freeze({ factory: 40 }), totalCost: 40, status: 'actual', contentHash: 'a'.repeat(64), createdAt: '2026-08-30T10:00:00.000Z' });
  const costAllocation = Object.freeze({ id: 'allocation-1', orderId: 'order-1', orderVersion: 1, orderCommitSnapshotId: 'commit-1', landedCostSnapshotId: 'landed-1', policyVersionId: 'policy-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', lineageMode: 'product-sku-v2', costEntryIds: Object.freeze(['cost-1']), allocations: Object.freeze([]), skuEconomics: Object.freeze([]), allocatedTotal: 40, status: 'actual', createdAt: '2026-08-30T10:01:00.000Z', contentHash: 'b'.repeat(64) });
  const costEntries = [Object.freeze({ id: 'cost-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', entryKind: 'actual', costType: 'factory', amount: 40, currency: 'EUR' })];
  return { order, orderCommit, landedCost, costAllocation, costEntries };
}

function waivedRequirements() {
  return ['factory', 'freight', 'duty', 'credits'].map((type) => Object.freeze({ type, status: 'waived', evidenceEntryIds: [], waiverReason: `verified-${type}` }));
}

test('canonical ProductSku margin requires and pins the exact immutable cost allocation run', () => {
  const f = fixture();
  assert.throws(() => createAllocationAwareMarginActualizationSnapshot({ id: 'margin-missing', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, createdAt: '2026-08-30T10:02:00.000Z' }), (error) => error.code === 'MARGIN_COST_ALLOCATION_REQUIRED');
  const margin = createAllocationAwareMarginActualizationSnapshot({ id: 'margin-1', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, costAllocation: f.costAllocation, createdAt: '2026-08-30T10:02:00.000Z' });
  assert.equal(margin.allocationStatus, 'current');
  assert.equal(margin.costAllocationRunSnapshotId, 'allocation-1');
  assert.equal(margin.costAllocationRunContentHash, f.costAllocation.contentHash);
  assert.equal(margin.costAllocationPolicyVersionId, 'policy-1');
  assert.equal(margin.costAllocationLineageMode, 'product-sku-v2');
  assert.notEqual(margin.contentHash, margin.aggregateContentHash);
});

test('canonical margin rejects allocation from a different landed-cost basis', () => {
  const f = fixture();
  assert.throws(() => createAllocationAwareMarginActualizationSnapshot({
    id: 'margin-1', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost,
    costAllocation: Object.freeze({ ...f.costAllocation, landedCostSnapshotId: 'landed-other' }), createdAt: '2026-08-30T10:02:00.000Z',
  }), (error) => error.code === 'MARGIN_COST_ALLOCATION_LANDED_MISMATCH');
});

test('legacy economics stays explicit and never invents ProductSku allocation ids', () => {
  const f = fixture({ canonical: false });
  const margin = createAllocationAwareMarginActualizationSnapshot({ id: 'margin-legacy', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, createdAt: '2026-08-30T10:02:00.000Z' });
  assert.equal(margin.allocationStatus, 'legacy-not-applicable');
  assert.equal(margin.costAllocationRunSnapshotId, null);
  assert.equal(margin.costAllocationRunContentHash, null);
  assert.equal(margin.costAllocationLineageMode, null);
});

test('readiness and close freeze the same canonical allocation id, hash and policy', () => {
  const f = fixture();
  const margin = createAllocationAwareMarginActualizationSnapshot({ id: 'margin-1', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, costAllocation: f.costAllocation, createdAt: '2026-08-30T10:02:00.000Z' });
  const readiness = createAllocationAwareCostCloseReadinessSnapshot({ id: 'ready-1', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, marginActualization: margin, costEntries: f.costEntries, requirements: waivedRequirements(), evaluatedAt: '2026-08-30T10:03:00.000Z' });
  assert.equal(readiness.status, 'READY_TO_CLOSE');
  assert.equal(readiness.costAllocationRunSnapshotId, f.costAllocation.id);
  assert.equal(readiness.costAllocationRunContentHash, f.costAllocation.contentHash);
  const close = createAllocationAwareReadinessBoundCostCloseSnapshot({ id: 'close-1', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, marginActualization: margin, readiness, closedAt: '2026-08-30T10:04:00.000Z' });
  assert.equal(close.allocationStatus, 'current');
  assert.equal(close.costAllocationRunSnapshotId, f.costAllocation.id);
  assert.equal(close.costAllocationRunContentHash, f.costAllocation.contentHash);
  assert.equal(close.costAllocationPolicyVersionId, 'policy-1');
});

test('post-close canonical margin is explicitly pending reallocation and cannot be used for another close', () => {
  const f = fixture();
  const pending = createPendingPostCloseMarginActualizationSnapshot({ id: 'margin-post-close', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, createdAt: '2026-08-30T10:05:00.000Z' });
  assert.equal(pending.allocationStatus, 'pending-post-close');
  assert.equal(pending.costAllocationRunSnapshotId, null);
  assert.throws(() => createAllocationAwareCostCloseReadinessSnapshot({ id: 'ready-pending', order: f.order, orderCommit: f.orderCommit, landedCost: f.landedCost, marginActualization: pending, costEntries: f.costEntries, requirements: waivedRequirements(), evaluatedAt: '2026-08-30T10:06:00.000Z' }), (error) => error.code === 'COST_CLOSE_READINESS_COST_ALLOCATION_NOT_CURRENT');
});

test('margin HTTP route carries explicit costAllocationRunSnapshotId to the service', () => {
  let received = null;
  const routes = createOrderEconomicsRoutes({ orderEconomics: {
    actualizeMargin(...args) { received = args; return args; },
  } });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/orders/order-1/margin/actualize'));
  assert.ok(route);
  route.execute({ commandId: 'cmd-1', actorId: 'finance-1', params: ['order-1'], query: {}, body: { landedCostSnapshotId: 'landed-1', costAllocationRunSnapshotId: 'allocation-1' } });
  assert.deepEqual(received, ['cmd-1', 'finance-1', 'order-1', 'landed-1', 'allocation-1']);
});
