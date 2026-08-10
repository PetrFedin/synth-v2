import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhysicalActualCostService } from '../src/application/physical-actual-cost-service.mjs';

function fixture() {
  const memberships = new Map([
    ['brand-1:finance-1', { id: 'm-fin', organisationId: 'brand-1', organisationType: 'brand', userId: 'finance-1', role: 'finance', status: 'active' }],
    ['brand-1:sales-1', { id: 'm-sales', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'sales', status: 'active' }],
    ['shop-1:buyer-1', { id: 'm-buyer', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'buyer', status: 'active' }],
  ]);
  const order = Object.freeze({ id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'attached', version: 2, orderCommitSnapshotId: 'commit-1', totalAmount: 200 });
  const orderCommit = Object.freeze({
    id: 'commit-1', orderId: 'order-1', orderVersion: 2, brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed',
    commercialPublicationId: 'pub-1', priceListVersionId: 'price-1', buyerCatalogVersionId: 'catalog-1',
    lines: Object.freeze([{ sku: 'SKU-1', quantity: 2, unitPrice: 100 }]),
  });
  const supply = Object.freeze({ id: 'supply-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR', status: 'committed' });
  const shipment = Object.freeze({
    id: 'asn-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1', fulfillmentPlanSnapshotId: 'plan-1',
    brandId: 'brand-1', shopId: 'shop-1', status: 'shipped',
    lines: Object.freeze([{ lineId: 'line-0001', sku: 'SKU-1', quantity: 2, sourceType: 'inventory', sourceRef: 'inventory-main' }]),
  });
  const receipt = Object.freeze({
    id: 'receipt-1', shipmentNoticeSnapshotId: 'asn-1', fulfillmentPlanSnapshotId: 'plan-1', orderCommitSnapshotId: 'commit-1',
    orderId: 'order-1', brandId: 'brand-1', shopId: 'shop-1', receiptComplete: true,
  });
  const discrepancy = Object.freeze({
    id: 'disc-1', shipmentNoticeSnapshotId: 'asn-1', fulfillmentPlanSnapshotId: 'plan-1', orderCommitSnapshotId: 'commit-1',
    orderId: 'order-1', brandId: 'brand-1', shopId: 'shop-1', latestReceiptSnapshotId: 'receipt-1', receiptSnapshotIds: Object.freeze(['receipt-1']), status: 'open',
  });
  const state = { memberships, order, orderCommit, supply, shipment, receipt, discrepancy, command: new Map(), entries: [], outbox: [], costClose: null };
  const store = {
    transaction: async (work) => work({
      getCommand: async (id) => state.command.get(id),
      insertCommand: async (value) => state.command.set(value.id, value),
      getMembership: async (orgId, actorId) => state.memberships.get(`${orgId}:${actorId}`),
      getShipmentNotice: async (id) => id === state.shipment.id ? state.shipment : undefined,
      getOrder: async (id) => id === state.order.id ? state.order : undefined,
      getOrderCommitSnapshot: async (id) => id === state.orderCommit.id ? state.orderCommit : undefined,
      getSupplyCommitment: async (id) => id === state.supply.id ? state.supply : undefined,
      getFxRateSnapshot: async () => undefined,
      getReceipt: async (id) => id === state.receipt.id ? state.receipt : undefined,
      getReceiptDiscrepancy: async (id) => id === state.discrepancy.id ? state.discrepancy : undefined,
      getCostCloseByOrderCommitSnapshotId: async () => state.costClose,
      insertPhysicalActualCostEntry: async (entry) => state.entries.push(entry),
      appendOutbox: async (event) => state.outbox.push(event),
    }),
  };
  let sequence = 0;
  const service = createPhysicalActualCostService({ store, clock: () => '2026-08-10T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

const freight = Object.freeze({
  costType: 'freight', amount: 30, currency: 'EUR', sku: 'SKU-1', sourceRef: 'DHL-INV-100', occurredAt: '2026-08-13T14:00:00.000Z',
});

test('finance records shipment-linked cost into canonical actual-cost ledger shape', async () => {
  const { state, service } = fixture();
  const entry = await service.recordPhysicalActualCost('cmd-1', 'finance-1', 'asn-1', freight);
  assert.equal(entry.orderCommitSnapshotId, 'commit-1');
  assert.equal(entry.supplyCommitmentSnapshotId, 'supply-1');
  assert.equal(entry.physicalLineageVersion, 2);
  assert.equal(entry.fulfillmentPlanSnapshotId, 'plan-1');
  assert.equal(entry.shipmentNoticeSnapshotId, 'asn-1');
  assert.equal(entry.receiptSnapshotId, null);
  assert.equal(entry.amount, 30);
  assert.equal(state.entries.length, 1);
  assert.equal(state.outbox[0].type, 'actual-cost.recorded');
  assert.equal(state.outbox[0].payload.shipmentNoticeSnapshotId, 'asn-1');
});

test('quality cost derives exact receipt evidence from discrepancy snapshot', async () => {
  const { service } = fixture();
  const entry = await service.recordPhysicalActualCost('cmd-quality', 'finance-1', 'asn-1', {
    costType: 'quality', amount: 12.5, currency: 'EUR', sku: 'SKU-1', sourceRef: 'QC-CLAIM-1', occurredAt: '2026-08-14T08:00:00.000Z',
    receiptDiscrepancySnapshotId: 'disc-1',
  });
  assert.equal(entry.receiptSnapshotId, 'receipt-1');
  assert.equal(entry.receiptDiscrepancySnapshotId, 'disc-1');
});

test('physical cost is finance-authorized, SKU-scoped and blocked after cost close', async () => {
  const { state, service } = fixture();
  await assert.rejects(service.recordPhysicalActualCost('cmd-sales', 'sales-1', 'asn-1', freight), (error) => error.code === 'CAPABILITY_DENIED');
  await assert.rejects(service.recordPhysicalActualCost('cmd-buyer', 'buyer-1', 'asn-1', freight), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
  await assert.rejects(service.recordPhysicalActualCost('cmd-sku', 'finance-1', 'asn-1', { ...freight, sku: 'SKU-X' }), (error) => error.code === 'PHYSICAL_ACTUAL_COST_SKU_NOT_SHIPPED');
  await assert.rejects(service.recordPhysicalActualCost('cmd-quality', 'finance-1', 'asn-1', { ...freight, costType: 'quality' }), (error) => error.code === 'PHYSICAL_ACTUAL_COST_RECEIPT_REQUIRED');
  state.costClose = { id: 'close-1' };
  await assert.rejects(service.recordPhysicalActualCost('cmd-closed', 'finance-1', 'asn-1', freight), (error) => error.code === 'COST_CLOSE_REQUIRES_POST_CLOSE_ADJUSTMENT');
});

test('idempotent replay re-authorizes current finance membership', async () => {
  const { state, service } = fixture();
  const first = await service.recordPhysicalActualCost('cmd-replay', 'finance-1', 'asn-1', freight);
  const replay = await service.recordPhysicalActualCost('cmd-replay', 'finance-1', 'asn-1', freight);
  assert.equal(replay.id, first.id);
  assert.equal(state.entries.length, 1);
  state.memberships.set('brand-1:finance-1', { ...state.memberships.get('brand-1:finance-1'), status: 'revoked' });
  await assert.rejects(service.recordPhysicalActualCost('cmd-replay', 'finance-1', 'asn-1', freight), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});
