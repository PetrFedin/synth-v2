import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryService } from '../src/application/inventory-service.mjs';

function fixture() {
  const receipt = Object.freeze({
    id: 'receipt-1', status: 'received', orderId: 'order-1', orderVersion: 2, orderCommitSnapshotId: 'commit-1',
    supplyCommitmentSnapshotId: 'supply-1', fulfillmentPlanSnapshotId: 'plan-1', shipmentNoticeSnapshotId: 'asn-1',
    brandId: 'brand-1', shopId: 'shop-1', receivedAt: '2026-08-10T10:00:00.000Z',
    lines: Object.freeze([Object.freeze({ lineId: 'line-1', sku: 'SKU-A', receivedQuantity: 10, acceptedQuantity: 8, damagedQuantity: 1, rejectedQuantity: 1 })]),
  });
  const shipment = Object.freeze({
    id: 'asn-1', status: 'shipped', fulfillmentPlanSnapshotId: 'plan-1', orderId: 'order-1', orderCommitSnapshotId: 'commit-1',
    supplyCommitmentSnapshotId: 'supply-1', brandId: 'brand-1', shopId: 'shop-1',
  });
  const plan = Object.freeze({
    id: 'plan-1', status: 'planned', orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    brandId: 'brand-1', shopId: 'shop-1', shipTo: Object.freeze({ locationId: 'dc-1' }),
  });
  const state = {
    memberships: new Map([
      ['shop-1:buyer-1', { id: 'm-buyer', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'buyer', status: 'active' }],
      ['shop-1:finance-1', { id: 'm-fin', organisationId: 'shop-1', organisationType: 'shop', userId: 'finance-1', role: 'finance', status: 'active' }],
      ['brand-1:sales-1', { id: 'm-sales', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'sales', status: 'active' }],
    ]),
    receipt, shipment, plan, commands: new Map(), movements: [], outbox: [],
  };
  const tx = {
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => state.commands.set(value.id, value),
    getMembership: async (orgId, userId) => state.memberships.get(`${orgId}:${userId}`),
    lockReceipt: async (id) => id === receipt.id ? receipt : undefined,
    getShipmentNotice: async (id) => id === shipment.id ? shipment : undefined,
    getFulfillmentPlan: async (id) => id === plan.id ? plan : undefined,
    listMovementsForReceipt: async (id) => state.movements.filter((movement) => movement.receiptSnapshotId === id),
    insertMovement: async (movement) => state.movements.push(movement),
    getWarehousePositions: async (shopId, warehouseLocationId, sku) => {
      const matching = state.movements.filter((movement) => movement.shopId === shopId && movement.warehouseLocationId === warehouseLocationId && (!sku || movement.sku === sku));
      const grouped = new Map();
      for (const movement of matching) {
        const value = grouped.get(movement.sku) ?? { shopId, warehouseLocationId, sku: movement.sku, onHandQuantity: 0, availableQuantity: 0, quarantineQuantity: 0, movementCount: 0, latestPostedAt: movement.postedAt };
        value.onHandQuantity += movement.onHandDelta;
        value.availableQuantity += movement.availableDelta;
        value.quarantineQuantity += movement.quarantineDelta;
        value.movementCount += 1;
        value.latestPostedAt = movement.postedAt;
        grouped.set(movement.sku, value);
      }
      return [...grouped.values()];
    },
    appendOutbox: async (event) => state.outbox.push(event),
  };
  const store = { transaction: async (work) => work(tx) };
  let sequence = 0;
  const service = createInventoryService({ store, clock: () => '2026-08-10T10:01:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

test('retailer buyer posts immutable receipt to inventory and command replay is idempotent', async () => {
  const { state, service } = fixture();
  const first = await service.postReceipt('cmd-post-1', 'buyer-1', 'receipt-1');
  assert.equal(first.warehouseLocationId, 'dc-1');
  assert.equal(first.movements.length, 1);
  assert.equal(first.movements[0].onHandDelta, 10);
  assert.equal(first.movements[0].availableDelta, 8);
  assert.equal(first.movements[0].quarantineDelta, 2);
  assert.equal(state.movements.length, 1);
  assert.equal(state.outbox.filter((event) => event.type === 'inventory.movement-posted.v1').length, 1);
  assert.equal(state.outbox.filter((event) => event.type === 'inventory.receipt-posted.v1').length, 1);

  const replay = await service.postReceipt('cmd-post-1', 'buyer-1', 'receipt-1');
  assert.equal(replay.movementIds[0], first.movementIds[0]);
  assert.equal(state.movements.length, 1);
});

test('business duplicate with a different command id is rejected', async () => {
  const { service } = fixture();
  await service.postReceipt('cmd-post-1', 'buyer-1', 'receipt-1');
  await assert.rejects(service.postReceipt('cmd-post-2', 'buyer-1', 'receipt-1'), (error) => error.code === 'INVENTORY_RECEIPT_ALREADY_POSTED');
});

test('inventory posting and warehouse reads are retailer-scoped by capability', async () => {
  const { service } = fixture();
  await assert.rejects(service.postReceipt('cmd-sales', 'sales-1', 'receipt-1'), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
  await service.postReceipt('cmd-post', 'buyer-1', 'receipt-1');

  const buyerView = await service.getWarehousePositionsForActor('buyer-1', 'shop-1', 'dc-1', { sku: 'SKU-A' });
  assert.equal(buyerView.positions[0].onHandQuantity, 10);
  const financeView = await service.getWarehousePositionsForActor('finance-1', 'shop-1', 'dc-1', { sku: 'SKU-A' });
  assert.equal(financeView.positions[0].availableQuantity, 8);
  await assert.rejects(service.getWarehousePositionsForActor('sales-1', 'shop-1', 'dc-1'), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});

test('idempotent replay re-authorizes current retailer membership', async () => {
  const { state, service } = fixture();
  await service.postReceipt('cmd-post', 'buyer-1', 'receipt-1');
  state.memberships.set('shop-1:buyer-1', { ...state.memberships.get('shop-1:buyer-1'), status: 'revoked' });
  await assert.rejects(service.postReceipt('cmd-post', 'buyer-1', 'receipt-1'), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');
});
