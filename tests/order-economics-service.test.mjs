import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderEconomicsService } from '../src/application/order-economics-service.mjs';

const at = '2026-08-09T00:00:00.000Z';
const actorId = 'USER-1';
const order = Object.freeze({
  id: 'ORDER-1', version: 4, status: 'attached', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  orderCommitSnapshotId: 'ORDER-COMMIT-1', commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 10, unitPrice: 100 })]),
});
const orderCommit = Object.freeze({
  id: 'ORDER-COMMIT-1', orderId: 'ORDER-1', orderVersion: 4, status: 'committed', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', totalAmount: 1000,
  commercialPublicationId: 'PUB-1', priceListVersionId: 'PRICE-1', buyerCatalogVersionId: 'BUYER-CAT-1',
  lines: Object.freeze([Object.freeze({ sku: 'SKU-1', quantity: 10, unitPrice: 100 })]),
});
const membership = Object.freeze({ id: 'MEM-1', organisationId: 'BRAND-1', organisationType: 'brand', userId: actorId, role: 'owner', status: 'active', createdAt: at });

function createHarness({ committed = orderCommit } = {}) {
  const state = {
    commands: new Map(), outbox: [], supply: [], fxRates: [], costs: [], landed: [], margins: [],
    orderCommitReads: 0,
  };
  const tx = {
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => state.commands.set(value.id, value),
    getOrder: async (id) => id === order.id ? order : undefined,
    getOrderCommitSnapshot: async (id) => { state.orderCommitReads += 1; return id === committed?.id ? committed : undefined; },
    getMembership: async (organisationId, userId) => organisationId === 'BRAND-1' && userId === actorId ? membership : undefined,
    insertSupplyCommitment: async (value) => state.supply.push(value),
    getSupplyCommitment: async (id) => state.supply.find((value) => value.id === id),
    insertFxRateSnapshot: async (value) => state.fxRates.push(value),
    getFxRateSnapshot: async (id) => state.fxRates.find((value) => value.id === id),
    getActualCostEntry: async (id) => state.costs.find((value) => value.id === id),
    getActualCostReversal: async (originalEntryId) => state.costs.find((value) => value.reversalOfEntryId === originalEntryId),
    insertActualCostEntry: async (value) => state.costs.push(value),
    listActualCostEntries: async () => [...state.costs],
    insertLandedCostSnapshot: async (value) => state.landed.push(value),
    getLandedCostSnapshot: async (id) => state.landed.find((value) => value.id === id),
    insertMarginActualizationSnapshot: async (value) => state.margins.push(value),
    getMarginActualizationSnapshot: async (id) => state.margins.find((value) => value.id === id),
    appendOutbox: async (event) => state.outbox.push(event),
  };
  let sequence = 0;
  const service = createOrderEconomicsService({
    economicsStore: { transaction: (work) => work(tx) },
    clock: () => at,
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { service, state };
}

test('service pins supply, cost, landed cost and margin to the immutable order commit snapshot', async () => {
  const { service, state } = createHarness();
  const supply = await service.createSupplyCommitment('CMD-1', actorId, order.id, {
    allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-1' }],
  });
  const cost = await service.recordActualCost('CMD-2', actorId, order.id, {
    supplyCommitmentSnapshotId: supply.id,
    costType: 'factory', amount: 600, currency: 'EUR', sourceRef: 'SUPPLIER-INVOICE-1', occurredAt: at,
  });
  const landed = await service.actualizeLandedCost('CMD-3', actorId, order.id);
  const margin = await service.actualizeMargin('CMD-4', actorId, order.id, landed.id);

  assert.equal(supply.orderCommitSnapshotId, 'ORDER-COMMIT-1');
  assert.equal(cost.orderCommitSnapshotId, 'ORDER-COMMIT-1');
  assert.equal(cost.supplyCommitmentSnapshotId, supply.id);
  assert.equal(cost.entryKind, 'actual');
  assert.equal(cost.reversalOfEntryId, null);
  assert.equal(landed.orderCommitSnapshotId, 'ORDER-COMMIT-1');
  assert.deepEqual(landed.supplyCommitmentSnapshotIds, [supply.id]);
  assert.equal(landed.supplyLineageComplete, true);
  assert.equal(margin.orderCommitSnapshotId, 'ORDER-COMMIT-1');
  assert.deepEqual(margin.supplyCommitmentSnapshotIds, [supply.id]);
  assert.equal(margin.supplyLineageComplete, true);
  assert.equal(margin.netRevenue, 1000);
  assert.equal(margin.landedCost, 600);
  assert.equal(margin.contributionMarginAmount, 400);
  assert.ok(state.orderCommitReads >= 4);
  assert.equal(state.outbox.filter((event) => event.payload?.orderCommitSnapshotId === 'ORDER-COMMIT-1').length, 4);
});

test('service corrects actual cost atomically by reversal and replacement, then landed cost nets to replacement', async () => {
  const { service, state } = createHarness();
  const supply = await service.createSupplyCommitment('CMD-SUPPLY-CORR', actorId, order.id, {
    allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-CORR' }],
  });
  const original = await service.recordActualCost('CMD-ORIGINAL', actorId, order.id, {
    supplyCommitmentSnapshotId: supply.id,
    costType: 'factory', amount: 600, currency: 'EUR', sourceRef: 'INVOICE-OLD', occurredAt: at,
  });
  const correction = await service.correctActualCost('CMD-CORRECTION', actorId, order.id, original.id, {
    reason: 'Supplier issued corrected invoice',
    supplyCommitmentSnapshotId: supply.id,
    costType: 'factory', amount: 450, currency: 'EUR', sourceRef: 'INVOICE-NEW', occurredAt: at,
  });
  const landed = await service.actualizeLandedCost('CMD-CORRECTED-LC', actorId, order.id);
  const margin = await service.actualizeMargin('CMD-CORRECTED-MARGIN', actorId, order.id, landed.id);

  assert.equal(correction.originalEntryId, original.id);
  assert.equal(correction.reversal.entryKind, 'reversal');
  assert.equal(correction.reversal.reversalOfEntryId, original.id);
  assert.equal(correction.reversal.amount, -600);
  assert.equal(correction.reversal.supplyCommitmentSnapshotId, supply.id);
  assert.equal(correction.replacement.entryKind, 'actual');
  assert.equal(correction.replacement.amount, 450);
  assert.equal(correction.replacement.correctionId, correction.correctionId);
  assert.equal(correction.replacement.correctionReason, 'Supplier issued corrected invoice');
  assert.equal(landed.totalCost, 450);
  assert.equal(margin.contributionMarginAmount, 550);
  assert.equal(state.costs.length, 3);
  assert.ok(state.outbox.some((event) => event.type === 'actual-cost.reversed' && event.payload?.reversalOfEntryId === original.id));
  assert.ok(state.outbox.some((event) => event.type === 'actual-cost.corrected' && event.payload?.replacementEntryId === correction.replacement.id));

  await assert.rejects(
    () => service.correctActualCost('CMD-CORRECTION-AGAIN', actorId, order.id, original.id, {
      reason: 'Attempted duplicate correction',
      supplyCommitmentSnapshotId: supply.id,
      costType: 'factory', amount: 440, currency: 'EUR', sourceRef: 'INVOICE-NEWER', occurredAt: at,
    }),
    (error) => error?.code === 'ACTUAL_COST_ALREADY_CORRECTED',
  );
});

test('service records immutable FX basis and converts cross-currency actual cost before landed cost', async () => {
  const { service, state } = createHarness();
  const supply = await service.createSupplyCommitment('CMD-SUPPLY', actorId, order.id, {
    allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-FX' }],
  });
  const fx = await service.createFxRateSnapshot('CMD-FX', actorId, order.id, {
    sourceCurrency: 'USD', rate: 0.92, rateType: 'invoice', sourceRef: 'FX-SOURCE-1', effectiveAt: at,
  });
  const cost = await service.recordActualCost('CMD-USD', actorId, order.id, {
    supplyCommitmentSnapshotId: supply.id,
    costType: 'freight', amount: 100, currency: 'USD', fxRateSnapshotId: fx.id, sourceRef: 'FREIGHT-USD', occurredAt: at,
  });
  const landed = await service.actualizeLandedCost('CMD-USD-LC', actorId, order.id);

  assert.equal(state.fxRates.length, 1);
  assert.equal(fx.orderCommitSnapshotId, 'ORDER-COMMIT-1');
  assert.equal(fx.sourceCurrency, 'USD');
  assert.equal(fx.targetCurrency, 'EUR');
  assert.equal(cost.supplyCommitmentSnapshotId, supply.id);
  assert.equal(cost.sourceAmount, 100);
  assert.equal(cost.sourceCurrency, 'USD');
  assert.equal(cost.fxRateSnapshotId, fx.id);
  assert.equal(cost.amount, 92);
  assert.equal(cost.currency, 'EUR');
  assert.equal(landed.totalCost, 92);
  assert.deepEqual(landed.supplyCommitmentSnapshotIds, [supply.id]);
  assert.equal(landed.supplyLineageComplete, true);
  assert.ok(state.outbox.some((event) => event.type === 'fx-rate.snapshot-recorded' && event.payload?.orderCommitSnapshotId === 'ORDER-COMMIT-1'));
});

test('service refuses execution when the pinned order commit snapshot cannot be loaded', async () => {
  const { service } = createHarness({ committed: null });
  await assert.rejects(
    () => service.recordActualCost('CMD-X', actorId, order.id, { supplyCommitmentSnapshotId: 'SUPPLY-X', costType: 'factory', amount: 10, currency: 'EUR', sourceRef: 'INV-X', occurredAt: at }),
    (error) => error?.code === 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
  );
});

test('landed cost ignores legacy cost rows that are not pinned to the current order commit', async () => {
  const { service, state } = createHarness();
  state.costs.push(Object.freeze({
    id: 'LEGACY-COST', orderId: order.id, orderVersion: order.version, brandId: order.brandId, shopId: order.shopId,
    costType: 'freight', amount: 900, currency: 'EUR', sku: null, sourceRef: 'LEGACY', occurredAt: at, recordedAt: at,
  }));
  const supply = await service.createSupplyCommitment('CMD-SUPPLY', actorId, order.id, {
    allocations: [{ sku: 'SKU-1', quantity: 10, sourceType: 'production', sourceRef: 'PO-CURRENT' }],
  });
  await service.recordActualCost('CMD-COST', actorId, order.id, {
    supplyCommitmentSnapshotId: supply.id,
    costType: 'factory', amount: 400, currency: 'EUR', sourceRef: 'CURRENT', occurredAt: at,
  });
  const landed = await service.actualizeLandedCost('CMD-LC', actorId, order.id);
  assert.equal(landed.totalCost, 400);
  assert.deepEqual(landed.costEntryIds, ['actual-cost-3']);
  assert.deepEqual(landed.supplyCommitmentSnapshotIds, [supply.id]);
  assert.equal(landed.supplyLineageComplete, true);
});
