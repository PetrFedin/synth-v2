import test from 'node:test';
import assert from 'node:assert/strict';
import { createCostAllocationRun } from '../src/modules/order-economics/cost-allocation.mjs';
import { createCostAllocationRoutes } from '../src/http/cost-allocation-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function executionFixture({ lines, costEntries, totalCost, defaultBasis = 'unit', rules = [] }) {
  const order = Object.freeze({
    id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR',
    status: 'attached', version: 1, orderCommitSnapshotId: 'commit-1',
  });
  const orderCommit = Object.freeze({
    id: 'commit-1', orderId: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR',
    status: 'committed', orderVersion: 1, lines: Object.freeze(lines.map((line) => Object.freeze(line))),
  });
  const landedCost = Object.freeze({
    id: 'landed-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', currency: 'EUR',
    totalCost, costEntryIds: Object.freeze(costEntries.map((entry) => entry.id)),
  });
  const policy = Object.freeze({
    id: 'policy-1', brandId: 'brand-1', status: 'approved', defaultBasis,
    rules: Object.freeze(rules.map((rule) => Object.freeze(rule))),
  });
  return { order, orderCommit, landedCost, policy, costEntries };
}

function runFixture(fixture, overrides = {}) {
  return createCostAllocationRun({
    id: 'run-1', ...fixture, createdAt: '2026-08-29T12:00:00.000Z', ...overrides,
  });
}

test('canonical cost allocation keeps same-display-SKU ProductSku order lines separate', () => {
  const costEntries = [
    Object.freeze({ id: 'cost-physical', orderCommitSnapshotId: 'commit-1', costType: 'freight', amount: 30, currency: 'EUR', orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X' }),
    Object.freeze({ id: 'cost-aggregate', orderCommitSnapshotId: 'commit-1', costType: 'factory', amount: 20, currency: 'EUR', sku: null }),
  ];
  const fixture = executionFixture({
    lines: [
      { orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
      { orderLineNo: 2, productSkuId: 'ps-2', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
    ],
    costEntries,
    totalCost: 50,
  });

  const run = runFixture(fixture);
  assert.equal(run.lineageMode, 'product-sku-v2');
  assert.equal(run.allocations.length, 3);
  assert.deepEqual(
    run.allocations.map(({ costEntryId, orderLineNo, productSkuId, sku, allocatedAmount }) => ({ costEntryId, orderLineNo, productSkuId, sku, allocatedAmount })),
    [
      { costEntryId: 'cost-aggregate', orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', allocatedAmount: 10 },
      { costEntryId: 'cost-aggregate', orderLineNo: 2, productSkuId: 'ps-2', sku: 'SKU-X', allocatedAmount: 10 },
      { costEntryId: 'cost-physical', orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', allocatedAmount: 30 },
    ],
  );
  assert.deepEqual(
    run.skuEconomics.map(({ orderLineNo, productSkuId, allocatedLandedCost }) => ({ orderLineNo, productSkuId, allocatedLandedCost })),
    [
      { orderLineNo: 1, productSkuId: 'ps-1', allocatedLandedCost: 40 },
      { orderLineNo: 2, productSkuId: 'ps-2', allocatedLandedCost: 10 },
    ],
  );
});

test('canonical allocation never resolves a legacy textual-SKU ActualCost directly', () => {
  const costEntries = [Object.freeze({ id: 'legacy-text-cost', orderCommitSnapshotId: 'commit-1', costType: 'factory', amount: 20, currency: 'EUR', sku: 'SKU-X' })];
  const fixture = executionFixture({
    lines: [
      { orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
      { orderLineNo: 2, productSkuId: 'ps-2', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
    ],
    costEntries,
    totalCost: 20,
  });

  const run = runFixture(fixture);
  assert.deepEqual(run.allocations.map((row) => [row.orderLineNo, row.productSkuId, row.basis, row.allocatedAmount]), [
    [1, 'ps-1', 'unit', 10],
    [2, 'ps-2', 'unit', 10],
  ]);
});

test('physical-v2 direct allocation fails closed when the exact ProductSku pair is not in the commit', () => {
  const costEntries = [Object.freeze({ id: 'cost-forged', orderCommitSnapshotId: 'commit-1', costType: 'freight', amount: 10, currency: 'EUR', orderLineNo: 1, productSkuId: 'ps-forged', sku: 'SKU-X' })];
  const fixture = executionFixture({
    lines: [{ orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', quantity: 1, unitPrice: 100 }],
    costEntries,
    totalCost: 10,
  });
  assert.throws(() => runFixture(fixture), (error) => error.code === 'COST_ALLOCATION_DIRECT_PRODUCT_SKU_REQUIRED');
});

test('canonical custom allocation accepts exact line weights and rejects textual-SKU weights', () => {
  const costEntries = [Object.freeze({ id: 'cost-custom', orderCommitSnapshotId: 'commit-1', costType: 'duty', amount: 40, currency: 'EUR', sku: null })];
  const fixture = executionFixture({
    lines: [
      { orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
      { orderLineNo: 2, productSkuId: 'ps-2', sku: 'SKU-X', quantity: 1, unitPrice: 100 },
    ],
    costEntries,
    totalCost: 40,
    defaultBasis: 'custom',
  });

  const run = runFixture(fixture, {
    customLineWeightsByCostEntryId: {
      'cost-custom': [
        { orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', weight: 1 },
        { orderLineNo: 2, productSkuId: 'ps-2', sku: 'SKU-X', weight: 3 },
      ],
    },
  });
  assert.deepEqual(run.allocations.map((row) => [row.orderLineNo, row.productSkuId, row.allocatedAmount]), [
    [1, 'ps-1', 10],
    [2, 'ps-2', 30],
  ]);

  assert.throws(() => runFixture(fixture, {
    customWeightsByCostEntryId: { 'cost-custom': { 'SKU-X': 1 } },
  }), (error) => error.code === 'COST_ALLOCATION_LEGACY_CUSTOM_WEIGHTS_FORBIDDEN');
});

test('pre-ProductSku order commits retain explicit legacy textual-SKU allocation without invented ids', () => {
  const costEntries = [
    Object.freeze({ id: 'legacy-direct', orderCommitSnapshotId: 'commit-1', costType: 'freight', amount: 10, currency: 'EUR', sku: 'SKU-A' }),
    Object.freeze({ id: 'legacy-aggregate', orderCommitSnapshotId: 'commit-1', costType: 'factory', amount: 20, currency: 'EUR', sku: null }),
  ];
  const fixture = executionFixture({
    lines: [
      { sku: 'SKU-A', quantity: 1, unitPrice: 100 },
      { sku: 'SKU-B', quantity: 1, unitPrice: 100 },
    ],
    costEntries,
    totalCost: 30,
  });
  const run = runFixture(fixture);
  assert.equal(run.lineageMode, 'legacy');
  assert.ok(run.allocations.every((row) => row.orderLineNo === null && row.productSkuId === null));
  assert.ok(run.skuEconomics.every((row) => row.orderLineNo === null && row.productSkuId === null));
});

test('cost allocation HTTP/OpenAPI expose exact custom weights while composed v2 version stays stable', () => {
  let received = null;
  const routes = createCostAllocationRoutes({
    costAllocation: {
      allocateLandedCost(_commandId, _actorId, _orderId, body) { received = body; return body; },
    },
  });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/orders/order-1/cost-allocation-runs'));
  assert.ok(route);
  const body = {
    landedCostSnapshotId: 'landed-1',
    policyVersionId: 'policy-1',
    customLineWeightsByCostEntryId: {
      'cost-1': [{ orderLineNo: 1, productSkuId: 'ps-1', sku: 'SKU-X', weight: 1 }],
    },
  };
  assert.deepEqual(route.execute({ commandId: 'cmd-1', actorId: 'finance-1', params: ['order-1'], query: {}, body }), body);
  assert.equal(received, body);
  assert.throws(() => route.execute({
    commandId: 'cmd-2', actorId: 'finance-1', params: ['order-1'], query: {},
    body: { ...body, customLineWeightsByCostEntryId: { 'cost-1': [{ orderLineNo: 1, productSkuId: 'ps-1', weight: 1, unsafe: true }] } },
  }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');

  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  const schemas = wholesaleV2ExtendedOpenApi.components.schemas;
  assert.ok(schemas.CostAllocationRunInput.properties.customLineWeightsByCostEntryId);
  assert.ok(schemas.CostAllocationRow.required.includes('orderLineNo'));
  assert.ok(schemas.CostAllocationRow.required.includes('productSkuId'));
  assert.ok(schemas.SkuEconomics.required.includes('orderLineNo'));
  assert.ok(schemas.SkuEconomics.required.includes('productSkuId'));
  assert.ok(schemas.CostAllocationRunSnapshot.required.includes('lineageMode'));
});
