import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCostAllocationPolicyVersion,
  createCostAllocationRun,
} from '../src/modules/order-economics/cost-allocation.mjs';

const at = '2026-08-09T00:00:00.000Z';
const order = Object.freeze({
  id: 'ORDER-ALLOC-1', version: 3, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR',
  orderCommitSnapshotId: 'COMMIT-ALLOC-1',
});
const commit = Object.freeze({
  id: 'COMMIT-ALLOC-1', orderId: order.id, orderVersion: order.version, status: 'committed',
  brandId: order.brandId, shopId: order.shopId, currency: order.currency,
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-A', quantity: 1, unitPrice: 100 }),
    Object.freeze({ sku: 'SKU-B', quantity: 3, unitPrice: 200 }),
  ]),
});
const policy = createCostAllocationPolicyVersion({
  id: 'POLICY-1', brandId: order.brandId, name: 'Default actual landed cost', version: 1,
  defaultBasis: 'net_value',
  rules: [
    { costType: 'freight', basis: 'unit' },
    { costType: 'duty', basis: 'net_value' },
    { costType: 'warehouse', basis: 'custom' },
  ],
  createdAt: at,
});

function cost(id, costType, amount, sku = null) {
  return Object.freeze({
    id, orderId: order.id, orderCommitSnapshotId: commit.id, costType, amount,
    currency: 'EUR', sku, entryKind: 'actual', sourceRef: id,
  });
}

function landed(entries, totalCost = entries.reduce((sum, entry) => sum + entry.amount, 0)) {
  return Object.freeze({
    id: 'LANDED-1', orderId: order.id, orderCommitSnapshotId: commit.id,
    currency: 'EUR', totalCost, costEntryIds: Object.freeze(entries.map((entry) => entry.id)),
  });
}

test('cost allocation policy is immutable, versioned and deterministic', () => {
  assert.equal(policy.status, 'approved');
  assert.equal(policy.defaultBasis, 'net_value');
  assert.deepEqual(policy.rules, [
    { costType: 'duty', basis: 'net_value' },
    { costType: 'freight', basis: 'unit' },
    { costType: 'warehouse', basis: 'custom' },
  ]);
  assert.match(policy.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(policy));
  assert.ok(Object.isFrozen(policy.rules));
});

test('allocation run applies direct, unit, net value and custom bases without rounding drift', () => {
  const entries = [
    cost('COST-DIRECT', 'factory', 200, 'SKU-A'),
    cost('COST-FREIGHT', 'freight', 100),
    cost('COST-DUTY', 'duty', 40),
    cost('COST-WAREHOUSE', 'warehouse', 30),
  ];
  const run = createCostAllocationRun({
    id: 'RUN-1', order, orderCommit: commit, landedCost: landed(entries, 370), costEntries: entries, policy,
    customWeightsByCostEntryId: { 'COST-WAREHOUSE': { 'SKU-A': 2, 'SKU-B': 1 } },
    createdAt: at,
  });

  assert.equal(run.allocatedTotal, 370);
  assert.equal(run.allocations.filter((row) => row.costEntryId === 'COST-DIRECT').length, 1);
  assert.deepEqual(
    run.allocations.filter((row) => row.costEntryId === 'COST-FREIGHT').map(({ sku, basis, allocatedAmount }) => ({ sku, basis, allocatedAmount })),
    [
      { sku: 'SKU-A', basis: 'unit', allocatedAmount: 25 },
      { sku: 'SKU-B', basis: 'unit', allocatedAmount: 75 },
    ],
  );
  assert.deepEqual(
    run.allocations.filter((row) => row.costEntryId === 'COST-DUTY').map(({ sku, basis, allocatedAmount }) => ({ sku, basis, allocatedAmount })),
    [
      { sku: 'SKU-A', basis: 'net_value', allocatedAmount: 5.7143 },
      { sku: 'SKU-B', basis: 'net_value', allocatedAmount: 34.2857 },
    ],
  );
  assert.deepEqual(
    run.allocations.filter((row) => row.costEntryId === 'COST-WAREHOUSE').map(({ sku, allocatedAmount }) => ({ sku, allocatedAmount })),
    [
      { sku: 'SKU-A', allocatedAmount: 20 },
      { sku: 'SKU-B', allocatedAmount: 10 },
    ],
  );

  assert.deepEqual(run.skuEconomics, [
    {
      sku: 'SKU-A', quantity: 1, netRevenue: 100, allocatedLandedCost: 250.7143,
      contributionMarginAmount: -150.7143, contributionMarginPercent: -150.7143, currency: 'EUR',
    },
    {
      sku: 'SKU-B', quantity: 3, netRevenue: 600, allocatedLandedCost: 119.2857,
      contributionMarginAmount: 480.7143, contributionMarginPercent: 80.1191, currency: 'EUR',
    },
  ]);
  assert.match(run.contentHash, /^[a-f0-9]{64}$/);
});

test('allocation handles negative credit and preserves exact landed-cost total', () => {
  const entries = [
    cost('COST-FACTORY', 'factory', 500),
    cost('COST-CREDIT', 'quality', -20),
  ];
  const run = createCostAllocationRun({
    id: 'RUN-CREDIT', order, orderCommit: commit, landedCost: landed(entries, 480), costEntries: entries,
    policy: createCostAllocationPolicyVersion({
      id: 'POLICY-CREDIT', brandId: order.brandId, name: 'Credit policy', version: 1,
      defaultBasis: 'net_value', rules: [], createdAt: at,
    }),
    createdAt: at,
  });
  assert.equal(run.allocatedTotal, 480);
  assert.equal(run.allocations.filter((row) => row.costEntryId === 'COST-CREDIT').reduce((sum, row) => sum + row.allocatedAmount, 0), -20);
});

test('allocation refuses stale landed-cost basis when ledger changed', () => {
  const original = cost('COST-1', 'freight', 100);
  const late = cost('COST-2', 'duty', 10);
  assert.throws(
    () => createCostAllocationRun({
      id: 'RUN-STALE', order, orderCommit: commit, landedCost: landed([original], 100),
      costEntries: [original, late], policy, createdAt: at,
    }),
    (error) => error?.code === 'COST_ALLOCATION_STALE_LANDED_COST',
  );
});

test('direct allocation refuses SKU outside the committed order', () => {
  const entry = cost('COST-UNKNOWN-SKU', 'factory', 10, 'SKU-X');
  assert.throws(
    () => createCostAllocationRun({
      id: 'RUN-BAD-SKU', order, orderCommit: commit, landedCost: landed([entry], 10),
      costEntries: [entry], policy, createdAt: at,
    }),
    (error) => error?.code === 'COST_ALLOCATION_DIRECT_SKU_REQUIRED',
  );
});

test('custom allocation rejects weights for SKU outside the committed order', () => {
  const entry = cost('COST-CUSTOM', 'warehouse', 30);
  assert.throws(
    () => createCostAllocationRun({
      id: 'RUN-BAD-CUSTOM', order, orderCommit: commit, landedCost: landed([entry], 30),
      costEntries: [entry], policy,
      customWeightsByCostEntryId: { 'COST-CUSTOM': { 'SKU-A': 1, 'SKU-X': 1 } },
      createdAt: at,
    }),
    (error) => error?.code === 'COST_ALLOCATION_CUSTOM_SKU_INVALID',
  );
});
