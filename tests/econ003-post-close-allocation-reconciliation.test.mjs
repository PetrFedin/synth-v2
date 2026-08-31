import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAllocationAwareMarginActualizationSnapshot,
  createPendingPostCloseMarginActualizationSnapshot,
} from '../src/modules/order-economics/allocation-close-lineage.mjs';
import { createPostCloseAllocationReconciliation } from '../src/modules/order-economics/post-close-allocation-reconciliation.mjs';
import { createPostCloseAllocationReconciliationService } from '../src/application/post-close-allocation-reconciliation-service.mjs';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const actorId = 'FINANCE-1';

function fixture() {
  const order = Object.freeze({
    id: 'ORDER-RECON-1', version: 1, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1',
    currency: 'EUR', totalAmount: 100, orderCommitSnapshotId: 'COMMIT-RECON-1',
  });
  const orderCommit = Object.freeze({
    id: 'COMMIT-RECON-1', orderId: order.id, orderVersion: 1, status: 'committed',
    brandId: order.brandId, shopId: order.shopId, currency: order.currency, totalAmount: 100,
    lines: Object.freeze([
      Object.freeze({ orderLineNo: 1, productSkuId: 'PSKU-1', sku: 'SKU-1', quantity: 1, unitPrice: 100 }),
    ]),
  });
  const closedLanded = Object.freeze({
    id: 'LANDED-CLOSED-1', orderId: order.id, orderVersion: 1, orderCommitSnapshotId: orderCommit.id,
    supplyCommitmentSnapshotIds: Object.freeze(['SUPPLY-1']), supplyLineageComplete: true,
    currency: 'EUR', costEntryIds: Object.freeze(['COST-BASE-1']), componentTotals: Object.freeze({ factory: 40 }),
    totalCost: 40, status: 'actual', contentHash: '1'.repeat(64), createdAt: '2026-08-31T00:00:00.000Z',
  });
  const closedAllocation = Object.freeze({
    id: 'ALLOCATION-CLOSED-1', orderId: order.id, orderVersion: 1, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: closedLanded.id, policyVersionId: 'POLICY-1', brandId: order.brandId, shopId: order.shopId,
    currency: 'EUR', lineageMode: 'product-sku-v2', costEntryIds: Object.freeze(['COST-BASE-1']),
    allocations: Object.freeze([]), skuEconomics: Object.freeze([]), allocatedTotal: 40, status: 'actual',
    createdAt: '2026-08-31T00:01:00.000Z', contentHash: '2'.repeat(64),
  });
  const closedMargin = createAllocationAwareMarginActualizationSnapshot({
    id: 'MARGIN-CLOSED-1', order, orderCommit, landedCost: closedLanded, costAllocation: closedAllocation,
    createdAt: '2026-08-31T00:02:00.000Z',
  });
  const costClose = Object.freeze({
    id: 'CLOSE-1', orderId: order.id, orderVersion: 1, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: closedLanded.id, marginActualizationSnapshotId: closedMargin.id,
    costCloseReadinessSnapshotId: 'READY-1', currency: 'EUR', totalLandedCost: 40,
    netRevenue: 100, contributionMarginAmount: 60, contributionMarginPercent: 60,
    allocationStatus: 'current', costAllocationRunSnapshotId: closedAllocation.id,
    costAllocationRunContentHash: closedAllocation.contentHash, costAllocationPolicyVersionId: closedAllocation.policyVersionId,
    costAllocationLineageMode: 'product-sku-v2', status: 'closed', closedAt: '2026-08-31T00:03:00.000Z',
    contentHash: '3'.repeat(64),
  });
  const adjustedLanded = Object.freeze({
    id: 'LANDED-ADJUSTED-1', orderId: order.id, orderVersion: 1, orderCommitSnapshotId: orderCommit.id,
    supplyCommitmentSnapshotIds: Object.freeze(['SUPPLY-1']), supplyLineageComplete: true,
    currency: 'EUR', costEntryIds: Object.freeze(['COST-BASE-1', 'COST-LATE-1']),
    componentTotals: Object.freeze({ factory: 40, freight: 10 }), totalCost: 50, status: 'actual',
    contentHash: '4'.repeat(64), createdAt: '2026-08-31T00:04:00.000Z',
  });
  const pendingMargin = createPendingPostCloseMarginActualizationSnapshot({
    id: 'MARGIN-PENDING-1', order, orderCommit, landedCost: adjustedLanded,
    createdAt: '2026-08-31T00:05:00.000Z',
  });
  const postCloseAdjustment = Object.freeze({
    id: 'ADJUSTMENT-1', costCloseSnapshotId: costClose.id, previousAdjustmentId: null,
    orderId: order.id, orderCommitSnapshotId: orderCommit.id, actualCostEntryId: 'COST-LATE-1',
    priorLandedCostSnapshotId: closedLanded.id, landedCostSnapshotId: adjustedLanded.id,
    priorMarginActualizationSnapshotId: closedMargin.id, marginActualizationSnapshotId: pendingMargin.id,
    costDeltaAmount: 10, marginDeltaAmount: -10, reason: 'late freight invoice',
    previousAllocationStatus: 'current', resultingAllocationStatus: 'pending-post-close',
    closedCostAllocationRunSnapshotId: closedAllocation.id,
    closedCostAllocationRunContentHash: closedAllocation.contentHash,
    status: 'recorded', recordedAt: '2026-08-31T00:05:00.000Z', contentHash: '5'.repeat(64),
  });
  const adjustedAllocation = Object.freeze({
    id: 'ALLOCATION-ADJUSTED-1', orderId: order.id, orderVersion: 1, orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: adjustedLanded.id, policyVersionId: 'POLICY-1', brandId: order.brandId, shopId: order.shopId,
    currency: 'EUR', lineageMode: 'product-sku-v2', costEntryIds: Object.freeze(['COST-BASE-1', 'COST-LATE-1']),
    allocations: Object.freeze([]), skuEconomics: Object.freeze([]), allocatedTotal: 50, status: 'actual',
    createdAt: '2026-08-31T00:06:00.000Z', contentHash: '6'.repeat(64),
  });
  const membership = Object.freeze({
    id: 'MEM-1', organisationId: order.brandId, organisationType: 'brand', userId: actorId,
    role: 'finance', status: 'active', createdAt: '2026-08-01T00:00:00.000Z',
  });
  return {
    order, orderCommit, closedLanded, closedAllocation, closedMargin, costClose,
    adjustedLanded, pendingMargin, postCloseAdjustment, adjustedAllocation, membership,
  };
}

test('canonical post-close reconciliation binds exact allocation and changes provenance without changing aggregate economics', () => {
  const f = fixture();
  const { reconciliation, marginActualization } = createPostCloseAllocationReconciliation({
    reconciliationId: 'RECON-1', marginActualizationId: 'MARGIN-RECONCILED-1',
    order: f.order, orderCommit: f.orderCommit, costClose: f.costClose,
    postCloseAdjustment: f.postCloseAdjustment, pendingMarginActualization: f.pendingMargin,
    landedCost: f.adjustedLanded, costAllocation: f.adjustedAllocation,
    reconciledAt: '2026-08-31T00:07:00.000Z',
  });

  assert.equal(reconciliation.postCloseAdjustmentId, f.postCloseAdjustment.id);
  assert.equal(reconciliation.pendingMarginActualizationSnapshotId, f.pendingMargin.id);
  assert.equal(reconciliation.costAllocationRunSnapshotId, f.adjustedAllocation.id);
  assert.equal(reconciliation.costAllocationRunContentHash, f.adjustedAllocation.contentHash);
  assert.equal(reconciliation.costAllocationPolicyVersionId, 'POLICY-1');
  assert.equal(reconciliation.previousAllocationStatus, 'pending-post-close');
  assert.equal(reconciliation.resultingAllocationStatus, 'current');
  assert.equal(reconciliation.status, 'reconciled');

  assert.equal(marginActualization.allocationStatus, 'current');
  assert.equal(marginActualization.costAllocationRunSnapshotId, f.adjustedAllocation.id);
  assert.equal(marginActualization.aggregateContentHash, f.pendingMargin.aggregateContentHash);
  assert.equal(marginActualization.netRevenue, f.pendingMargin.netRevenue);
  assert.equal(marginActualization.landedCost, f.pendingMargin.landedCost);
  assert.equal(marginActualization.contributionMarginAmount, f.pendingMargin.contributionMarginAmount);
  assert.equal(marginActualization.contributionMarginPercent, f.pendingMargin.contributionMarginPercent);
});

test('post-close reconciliation rejects allocation from another landed-cost basis', () => {
  const f = fixture();
  assert.throws(() => createPostCloseAllocationReconciliation({
    reconciliationId: 'RECON-BAD', marginActualizationId: 'MARGIN-BAD',
    order: f.order, orderCommit: f.orderCommit, costClose: f.costClose,
    postCloseAdjustment: f.postCloseAdjustment, pendingMarginActualization: f.pendingMargin,
    landedCost: f.adjustedLanded,
    costAllocation: Object.freeze({ ...f.adjustedAllocation, landedCostSnapshotId: 'LANDED-OTHER' }),
    reconciledAt: '2026-08-31T00:07:00.000Z',
  }), (error) => error.code === 'MARGIN_COST_ALLOCATION_LANDED_MISMATCH');
});

test('reconciliation service persists one immutable reconciliation, emits provenance events and replays idempotently', async () => {
  const f = fixture();
  const commands = new Map();
  const insertedMargins = [];
  const insertedReconciliations = [];
  const outbox = [];
  const reconciliationsByAdjustment = new Map();
  let sequence = 0;
  const tx = {
    getCommand: async (id) => commands.get(id),
    insertCommand: async (value) => commands.set(value.id, value),
    getOrder: async (id) => id === f.order.id ? f.order : undefined,
    getMembership: async (organisationId, userId) => organisationId === f.order.brandId && userId === actorId ? f.membership : undefined,
    getOrderCommitSnapshot: async (id) => id === f.orderCommit.id ? f.orderCommit : undefined,
    lockCostCloseByOrderCommitSnapshotId: async (id) => id === f.orderCommit.id ? f.costClose : undefined,
    getPostCloseAdjustment: async (id) => id === f.postCloseAdjustment.id ? f.postCloseAdjustment : undefined,
    getLatestPostCloseAdjustment: async (id) => id === f.costClose.id ? f.postCloseAdjustment : undefined,
    getPostCloseAllocationReconciliationByAdjustmentId: async (id) => reconciliationsByAdjustment.get(id),
    getLandedCostSnapshot: async (id) => id === f.adjustedLanded.id ? f.adjustedLanded : undefined,
    getMarginActualizationSnapshot: async (id) => id === f.pendingMargin.id ? f.pendingMargin : undefined,
    getCostAllocationRunSnapshot: async (id) => id === f.adjustedAllocation.id ? f.adjustedAllocation : undefined,
    insertMarginActualizationSnapshot: async (value) => insertedMargins.push(value),
    insertPostCloseAllocationReconciliation: async (value) => {
      insertedReconciliations.push(value);
      reconciliationsByAdjustment.set(value.postCloseAdjustmentId, value);
    },
    appendOutbox: async (event) => outbox.push(event),
  };
  const service = createPostCloseAllocationReconciliationService({
    economicsStore: { transaction: (work) => work(tx) },
    clock: () => '2026-08-31T00:07:00.000Z',
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });

  const first = await service.reconcilePostCloseAllocation('CMD-RECON-1', actorId, f.order.id, f.postCloseAdjustment.id, f.adjustedAllocation.id);
  const replay = await service.reconcilePostCloseAllocation('CMD-RECON-1', actorId, f.order.id, f.postCloseAdjustment.id, f.adjustedAllocation.id);

  assert.equal(first.marginActualization.allocationStatus, 'current');
  assert.equal(first.marginActualization.costAllocationRunSnapshotId, f.adjustedAllocation.id);
  assert.equal(first.reconciliation.postCloseAdjustmentId, f.postCloseAdjustment.id);
  assert.equal(replay.reconciliation.id, first.reconciliation.id);
  assert.equal(insertedMargins.length, 1);
  assert.equal(insertedReconciliations.length, 1);
  assert.deepEqual(outbox.map((event) => event.type), ['margin.actualized', 'cost-close.allocation-reconciled']);
  assert.equal(outbox[1].payload.costAllocationRunSnapshotId, f.adjustedAllocation.id);
});

test('reconciliation service refuses a stale adjustment even when its allocation is otherwise valid', async () => {
  const f = fixture();
  const later = Object.freeze({ ...f.postCloseAdjustment, id: 'ADJUSTMENT-LATER', recordedAt: '2026-08-31T00:08:00.000Z' });
  const tx = {
    getCommand: async () => undefined,
    getOrder: async () => f.order,
    getMembership: async () => f.membership,
    getOrderCommitSnapshot: async () => f.orderCommit,
    lockCostCloseByOrderCommitSnapshotId: async () => f.costClose,
    getPostCloseAdjustment: async () => f.postCloseAdjustment,
    getLatestPostCloseAdjustment: async () => later,
  };
  const service = createPostCloseAllocationReconciliationService({
    economicsStore: { transaction: (work) => work(tx) },
    clock: () => '2026-08-31T00:09:00.000Z',
  });

  await assert.rejects(
    () => service.reconcilePostCloseAllocation('CMD-STALE', actorId, f.order.id, f.postCloseAdjustment.id, f.adjustedAllocation.id),
    (error) => error.code === 'POST_CLOSE_ALLOCATION_RECONCILIATION_NOT_LATEST',
  );
});

test('HTTP route forwards exact adjustment and allocation identities', () => {
  let received = null;
  const routes = createOrderEconomicsRoutes({ orderEconomics: {
    reconcilePostCloseAllocation(...args) { received = args; return args; },
  } });
  const path = '/v2/orders/ORDER-1/cost-close/adjustments/ADJ-1/allocation-reconcile';
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test(path));
  assert.ok(route);
  route.execute({
    commandId: 'CMD-1', actorId: 'ACTOR-1', params: ['ORDER-1', 'ADJ-1'], query: {},
    body: { costAllocationRunSnapshotId: 'ALLOCATION-1' },
  });
  assert.deepEqual(received, ['CMD-1', 'ACTOR-1', 'ORDER-1', 'ADJ-1', 'ALLOCATION-1']);
});

test('authoritative OpenAPI exposes reconciliation contract without changing v2 version', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  const path = wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile'];
  assert.ok(path?.post);
  assert.equal(path.post.operationId, 'reconcilePostCloseAllocation');
  const schemas = wholesaleV2ExtendedOpenApi.components.schemas;
  assert.ok(schemas.PostCloseAllocationReconciliationInput.properties.costAllocationRunSnapshotId);
  assert.ok(schemas.PostCloseAllocationReconciliationSnapshot.properties.marginActualizationSnapshotId);
  assert.ok(schemas.PostCloseAllocationReconciliationResult.properties.reconciliation);
  const position = schemas.OrderEconomicsPosition;
  for (const field of [
    'postCloseAllocationReconciliationSnapshotId', 'allocationStatus', 'costAllocationRunSnapshotId',
    'costAllocationRunContentHash', 'costAllocationPolicyVersionId', 'costAllocationLineageMode',
  ]) {
    assert.ok(position.properties[field], `OrderEconomicsPosition must expose ${field}`);
    assert.ok(position.required.includes(field), `OrderEconomicsPosition must require ${field}`);
  }
});
