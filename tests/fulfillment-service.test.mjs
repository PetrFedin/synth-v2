import test from 'node:test';
import assert from 'node:assert/strict';
import { createFulfillmentService } from '../src/application/fulfillment-service.mjs';

function fixture() {
  const memberships = new Map([
    ['brand-1:brand-sales', { id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' }],
    ['brand-1:brand-finance', { id: 'm2', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-finance', role: 'finance', status: 'active' }],
    ['shop-1:shop-buyer', { id: 'm3', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' }],
  ]);
  const order = {
    id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', currency: 'EUR',
    status: 'attached', version: 2, orderCommitSnapshotId: 'commit-1',
  };
  const orderCommit = {
    id: 'commit-1', orderId: order.id, orderVersion: 2, brandId: order.brandId, shopId: order.shopId,
    currency: order.currency, status: 'committed', lines: [{ sku: 'SKU-1', quantity: 2, unitPrice: 100 }],
  };
  const supply = {
    id: 'supply-1', orderId: order.id, orderCommitSnapshotId: orderCommit.id, brandId: order.brandId, shopId: order.shopId,
    currency: order.currency, status: 'committed',
    allocations: [{ sku: 'SKU-1', quantity: 2, sourceType: 'inventory', sourceRef: 'inventory-main', expectedAvailabilityAt: null }],
  };
  const state = {
    memberships, order, orderCommit, supply,
    plans: new Map(), shipments: new Map(), receipts: new Map(), discrepancies: new Map(), commands: new Map(), outbox: [],
  };
  const store = {
    async transaction(work) {
      const tx = {
        getMembership: async (orgId, userId) => state.memberships.get(`${orgId}:${userId}`),
        getOrder: async (id) => id === state.order.id ? state.order : undefined,
        getOrderCommitSnapshot: async (id) => id === state.orderCommit.id ? state.orderCommit : undefined,
        getSupplyCommitment: async (id) => id === state.supply.id ? state.supply : undefined,
        listReservations: async () => [{ orderId: state.order.id, orderCommitSnapshotId: state.orderCommit.id, sku: 'SKU-1', quantity: 2, lineageVersion: 2 }],
        insertFulfillmentPlan: async (value) => state.plans.set(value.id, value),
        getFulfillmentPlan: async (id) => state.plans.get(id),
        listShipmentNotices: async (planId) => [...state.shipments.values()].filter((value) => value.fulfillmentPlanSnapshotId === planId),
        insertShipmentNotice: async (value) => state.shipments.set(value.id, value),
        getShipmentNotice: async (id) => state.shipments.get(id),
        listReceipts: async (shipmentId) => [...state.receipts.values()].filter((value) => value.shipmentNoticeSnapshotId === shipmentId),
        insertReceipt: async (value) => state.receipts.set(value.id, value),
        getReceipt: async (id) => state.receipts.get(id),
        insertReceiptDiscrepancy: async (value) => state.discrepancies.set(value.id, value),
        getReceiptDiscrepancy: async (id) => state.discrepancies.get(id),
        getCommand: async (id) => state.commands.get(id),
        insertCommand: async (value) => state.commands.set(value.id, value),
        appendOutbox: async (event) => state.outbox.push(event),
      };
      return work(tx);
    },
  };
  let sequence = 0;
  const service = createFulfillmentService({ store, clock: () => '2026-08-10T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

const location = (id, name, countryCode, city) => ({ locationId: id, name, countryCode, city, addressLine1: '1 Main Street' });

test('brand controls plan/ASN while retailer controls receipt and both can read logistics', async () => {
  const { state, service } = fixture();
  const plan = await service.createFulfillmentPlan('cmd-plan', 'brand-sales', 'order-1', {
    supplyCommitmentSnapshotId: 'supply-1',
    shipFrom: location('origin-1', 'Origin', 'TR', 'Istanbul'),
    shipTo: location('dc-1', 'Retail DC', 'DE', 'Berlin'),
    plannedShipAt: '2026-08-11T00:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
  });
  const shipment = await service.createShipmentNotice('cmd-asn', 'brand-sales', plan.id, {
    shipmentNumber: 'ASN-100', carrier: 'DHL', serviceLevel: 'road', lines: [{ lineId: 'line-0001', quantity: 2 }],
    shippedAt: '2026-08-11T02:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
  });

  await assert.rejects(
    service.recordReceipt('cmd-forbidden', 'brand-sales', shipment.id, {
      receiptReference: 'GRN-1', receivedBy: 'Retail DC', receiptComplete: true,
      lines: [{ lineId: 'line-0001', receivedQuantity: 2 }], receivedAt: '2026-08-12T00:00:00.000Z',
    }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED' || error.code === 'CAPABILITY_DENIED',
  );

  const result = await service.recordReceipt('cmd-receipt', 'shop-buyer', shipment.id, {
    receiptReference: 'GRN-1', receivedBy: 'Retail DC', receiptComplete: true,
    lines: [{ lineId: 'line-0001', receivedQuantity: 2 }], receivedAt: '2026-08-12T00:00:00.000Z',
  });
  assert.equal(result.discrepancy.status, 'clear');
  assert.equal(result.discrepancy.issueCount, 0);
  assert.equal((await service.getFulfillmentPlanForActor('brand-finance', plan.id)).id, plan.id);
  assert.equal((await service.getReceiptForActor('shop-buyer', result.receipt.id)).id, result.receipt.id);
  assert.equal(state.outbox.length, 4);
});

test('idempotent replay re-authorizes current retailer membership', async () => {
  const { state, service } = fixture();
  const plan = await service.createFulfillmentPlan('cmd-plan', 'brand-sales', 'order-1', {
    supplyCommitmentSnapshotId: 'supply-1',
    shipFrom: location('origin-1', 'Origin', 'TR', 'Istanbul'), shipTo: location('dc-1', 'Retail DC', 'DE', 'Berlin'),
    plannedShipAt: '2026-08-11T00:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
  });
  const shipment = await service.createShipmentNotice('cmd-asn', 'brand-sales', plan.id, {
    shipmentNumber: 'ASN-100', carrier: 'DHL', serviceLevel: 'road', lines: [{ lineId: 'line-0001', quantity: 2 }],
    shippedAt: '2026-08-11T02:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
  });
  const input = {
    receiptReference: 'GRN-1', receivedBy: 'Retail DC', receiptComplete: true,
    lines: [{ lineId: 'line-0001', receivedQuantity: 2 }], receivedAt: '2026-08-12T00:00:00.000Z',
  };
  const first = await service.recordReceipt('cmd-receipt', 'shop-buyer', shipment.id, input);
  const replay = await service.recordReceipt('cmd-receipt', 'shop-buyer', shipment.id, input);
  assert.equal(replay.receipt.id, first.receipt.id);
  assert.equal(state.receipts.size, 1);

  state.memberships.set('shop-1:shop-buyer', { ...state.memberships.get('shop-1:shop-buyer'), status: 'revoked' });
  await assert.rejects(service.recordReceipt('cmd-receipt', 'shop-buyer', shipment.id, input), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});
