import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderLineDoorAllocationService } from '../src/application/order-line-door-allocation-service.mjs';

function fixture() {
  const memberships = new Map([
    ['brand-1:brand-sales', { id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' }],
    ['shop-1:shop-buyer', { id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' }],
  ]);
  const order = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', lines: [{ sku: 'SKU-1', quantity: 10 }] };
  const doors = new Map([
    ['door-a', { id: 'door-a', shopId: 'shop-1', status: 'active' }],
    ['door-inactive', { id: 'door-inactive', shopId: 'shop-1', status: 'inactive' }],
    ['door-other-shop', { id: 'door-other-shop', shopId: 'shop-2', status: 'active' }],
  ]);
  const state = { allocations: new Map(), commands: new Map(), outbox: [] };
  const key = (orderId, lineNo, doorId) => `${orderId}:${lineNo}:${doorId}`;
  const store = {
    async transaction(work) {
      const tx = {
        getMembership: async (orgId, userId) => memberships.get(`${orgId}:${userId}`),
        getOrder: async (id) => (id === order.id ? order : undefined),
        getRetailDoor: async (id) => doors.get(id),
        listOrderLineDoorAllocations: async (orderId) => [...state.allocations.values()].filter((value) => value.orderId === orderId),
        upsertOrderLineDoorAllocation: async (value) => state.allocations.set(key(value.orderId, value.lineNo, value.retailDoorId), value),
        deleteOrderLineDoorAllocation: async ({ orderId, lineNo, retailDoorId }) => state.allocations.delete(key(orderId, lineNo, retailDoorId)),
        getCommand: async (id) => state.commands.get(id),
        insertCommand: async (value) => state.commands.set(value.id, value),
        appendOutbox: async (event) => state.outbox.push(event),
      };
      return work(tx);
    },
  };
  let sequence = 0;
  const service = createOrderLineDoorAllocationService({ store, clock: () => '2026-09-30T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

test('the shop allocates its own order across its own doors', async () => {
  const { service } = fixture();
  const allocation = await service.setOrderLineDoorAllocation('cmd-1', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 6 });
  assert.equal(allocation.quantity, 6);
  const view = await service.getOrderLineDoorAllocationsForActor('brand-sales', 'order-1');
  assert.equal(view.allocations.length, 1);
});

test('the brand cannot allocate the shop\'s own order to its doors', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineDoorAllocation('cmd-1', 'brand-sales', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 6 }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('a door from another shop is refused', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineDoorAllocation('cmd-1', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-other-shop', quantity: 1 }),
    (error) => error.code === 'ORDER_LINE_DOOR_ALLOCATION_DOOR_ORGANISATION_MISMATCH',
  );
});

test('an inactive door is refused', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.setOrderLineDoorAllocation('cmd-1', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-inactive', quantity: 1 }),
    (error) => error.code === 'ORDER_LINE_DOOR_ALLOCATION_DOOR_INACTIVE',
  );
});

test('allocations across doors cannot exceed the ordered quantity', async () => {
  const { state, service } = fixture();
  await service.setOrderLineDoorAllocation('cmd-1', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 8 });
  await assert.rejects(
    () => service.setOrderLineDoorAllocation('cmd-2', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 11 }),
    (error) => error.code === 'ORDER_LINE_DOOR_ALLOCATION_EXCEEDS_ORDERED_QUANTITY',
  );
  assert.equal(state.allocations.size, 1);
});

test('a zero quantity clears an existing allocation', async () => {
  const { state, service } = fixture();
  await service.setOrderLineDoorAllocation('cmd-1', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 5 });
  const cleared = await service.setOrderLineDoorAllocation('cmd-2', 'shop-buyer', 'order-1', { lineNo: 1, retailDoorId: 'door-a', quantity: 0 });
  assert.equal(cleared.quantity, null);
  assert.equal(state.allocations.size, 0);
});
