import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostAllocationService } from '../src/application/cost-allocation-service.mjs';

const at = '2026-08-09T00:00:00.000Z';
const actorId = 'USER-1';
const order = Object.freeze({
  id: 'ORDER-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR',
  orderCommitSnapshotId: 'COMMIT-1',
});
const commit = Object.freeze({
  id: 'COMMIT-1', orderId: order.id, orderVersion: order.version, status: 'committed',
  brandId: order.brandId, shopId: order.shopId, currency: order.currency,
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-A', quantity: 1, unitPrice: 100 }),
    Object.freeze({ sku: 'SKU-B', quantity: 3, unitPrice: 200 }),
  ]),
});
const membership = Object.freeze({
  id: 'MEM-1', organisationId: order.brandId, organisationType: 'brand', userId: actorId,
  role: 'owner', status: 'active', createdAt: at,
});

function createHarness() {
  const state = { commands: new Map(), policies: [], runs: [], costs: [], landed: [], outbox: [] };
  const tx = {
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => state.commands.set(value.id, value),
    getMembership: async (organisationId, userId) => organisationId === order.brandId && userId === actorId ? membership : undefined,
    getOrder: async (id) => id === order.id ? order : undefined,
    getOrderCommitSnapshot: async (id) => id === commit.id ? commit : undefined,
    getLandedCostSnapshot: async (id) => state.landed.find((value) => value.id === id),
    listActualCostEntries: async () => [...state.costs],
    getPolicyVersion: async (id) => state.policies.find((value) => value.id === id),
    insertPolicyVersion: async (value) => state.policies.push(value),
    getAllocationRun: async (id) => state.runs.find((value) => value.id === id),
    insertAllocationRun: async (value) => state.runs.push(value),
    appendOutbox: async (event) => state.outbox.push(event),
  };
  let sequence = 0;
  const service = createCostAllocationService({
    store: { transaction: (work) => work(tx) },
    clock: () => at,
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { service, state };
}

test('service creates an approved immutable allocation policy with idempotent command semantics', async () => {
  const { service, state } = createHarness();
  const input = {
    name: 'Default actual cost', version: 1, defaultBasis: 'net_value',
    rules: [{ costType: 'freight', basis: 'unit' }],
  };
  const policy = await service.createPolicyVersion('CMD-POLICY', actorId, order.brandId, input);
  const replay = await service.createPolicyVersion('CMD-POLICY', actorId, order.brandId, input);

  assert.equal(policy.id, replay.id);
  assert.equal(state.policies.length, 1);
  assert.equal(policy.status, 'approved');
  assert.ok(state.outbox.some((event) => event.type === 'cost-allocation.policy-approved' && event.aggregateId === policy.id));
});

test('service allocates exact landed-cost ledger to SKU economics and publishes lineage event', async () => {
  const { service, state } = createHarness();
  const policy = await service.createPolicyVersion('CMD-POLICY', actorId, order.brandId, {
    name: 'Actual allocation', version: 1, defaultBasis: 'net_value',
    rules: [{ costType: 'freight', basis: 'unit' }],
  });
  state.costs.push(
    Object.freeze({ id: 'COST-1', orderId: order.id, orderCommitSnapshotId: commit.id, costType: 'factory', amount: 200, currency: 'EUR', sku: 'SKU-A' }),
    Object.freeze({ id: 'COST-2', orderId: order.id, orderCommitSnapshotId: commit.id, costType: 'freight', amount: 100, currency: 'EUR', sku: null }),
  );
  state.landed.push(Object.freeze({
    id: 'LANDED-1', orderId: order.id, orderCommitSnapshotId: commit.id, currency: 'EUR',
    totalCost: 300, costEntryIds: Object.freeze(['COST-1', 'COST-2']),
  }));

  const run = await service.allocateLandedCost('CMD-ALLOCATE', actorId, order.id, {
    landedCostSnapshotId: 'LANDED-1', policyVersionId: policy.id,
  });

  assert.equal(run.allocatedTotal, 300);
  assert.equal(run.policyVersionId, policy.id);
  assert.deepEqual(run.skuEconomics.map(({ sku, allocatedLandedCost }) => ({ sku, allocatedLandedCost })), [
    { sku: 'SKU-A', allocatedLandedCost: 225 },
    { sku: 'SKU-B', allocatedLandedCost: 75 },
  ]);
  assert.ok(state.outbox.some((event) => event.type === 'cost-allocation.actualized' && event.payload?.landedCostSnapshotId === 'LANDED-1'));
});

test('service rejects command id reuse with different allocation input', async () => {
  const { service } = createHarness();
  await service.createPolicyVersion('CMD-POLICY', actorId, order.brandId, {
    name: 'Policy A', version: 1, defaultBasis: 'unit', rules: [],
  });
  await assert.rejects(
    () => service.createPolicyVersion('CMD-POLICY', actorId, order.brandId, {
      name: 'Policy B', version: 1, defaultBasis: 'unit', rules: [],
    }),
    (error) => error?.code === 'COMMAND_ID_CONFLICT',
  );
});
