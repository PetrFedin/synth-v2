import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderCalendarService } from '../src/application/order-calendar-service.mjs';

function fixture() {
  const memberships = new Map([
    ['brand-1:brand-sales', { id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-sales', role: 'sales', status: 'active' }],
    ['brand-1:brand-viewer', { id: 'm4', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-viewer', role: 'viewer', status: 'active' }],
    ['shop-1:shop-buyer', { id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-buyer', role: 'buyer', status: 'active' }],
  ]);
  const order = { id: 'order-1', brandId: 'brand-1', shopId: 'shop-1', cycleId: 'cycle-1', lines: [{ sku: 'SKU-1', quantity: 10 }] };
  const state = { calendar: new Map(), commands: new Map(), outbox: [] };
  const store = {
    async transaction(work) {
      const tx = {
        getMembership: async (orgId, userId) => memberships.get(`${orgId}:${userId}`),
        getOrder: async (id) => (id === order.id ? order : undefined),
        listCalendarMilestonesByCycle: async (cycleId) => [...state.calendar.values()].filter((value) => value.cycleId === cycleId),
        insertCalendarMilestone: async (value) => {
          if (state.calendar.has(value.id)) throw Object.assign(new Error('duplicate'), { code: 'CALENDAR_MILESTONE_ALREADY_EXISTS' });
          state.calendar.set(value.id, value);
        },
        getCommand: async (id) => state.commands.get(id),
        insertCommand: async (value) => state.commands.set(value.id, value),
        appendOutbox: async (event) => state.outbox.push(event),
      };
      return work(tx);
    },
  };
  let sequence = 0;
  const service = createOrderCalendarService({ store, clock: () => '2026-09-30T00:00:00.000Z', nextId: (prefix) => `${prefix}-${++sequence}` });
  return { state, service };
}

test('either side of the order can add its own milestone', async () => {
  const { service } = fixture();
  const brandMilestone = await service.addOrderCalendarMilestone('cmd-1', 'brand-sales', 'order-1', { title: 'Sample review', startsAt: '2026-10-01T00:00:00.000Z' });
  assert.equal(brandMilestone.ownerOrganisationId, 'brand-1');
  assert.equal(brandMilestone.type, 'order');
  assert.equal(brandMilestone.visibility, 'private');
  const shopMilestone = await service.addOrderCalendarMilestone('cmd-2', 'shop-buyer', 'order-1', { title: 'Delivery window', startsAt: '2026-11-01T00:00:00.000Z', visibility: 'shared' });
  assert.equal(shopMilestone.ownerOrganisationId, 'shop-1');
});

test('a role without order.write cannot add a milestone', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.addOrderCalendarMilestone('cmd-1', 'brand-viewer', 'order-1', { title: 'Should not land', startsAt: '2026-10-01T00:00:00.000Z' }),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});

test('a stranger to both organisations is refused', async () => {
  const { service } = fixture();
  await assert.rejects(
    () => service.addOrderCalendarMilestone('cmd-1', 'nobody', 'order-1', { title: 'x', startsAt: '2026-10-01T00:00:00.000Z' }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  await assert.rejects(
    () => service.getOrderCalendarMilestonesForActor('nobody', 'order-1'),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('an owner sees its own private milestone; the other side does not, unless it is shared', async () => {
  const { service } = fixture();
  await service.addOrderCalendarMilestone('cmd-1', 'brand-sales', 'order-1', { title: 'Private brand note', startsAt: '2026-10-01T00:00:00.000Z' });
  await service.addOrderCalendarMilestone('cmd-2', 'brand-sales', 'order-1', { title: 'Shared reminder', startsAt: '2026-10-02T00:00:00.000Z', visibility: 'shared' });

  const brandView = await service.getOrderCalendarMilestonesForActor('brand-sales', 'order-1');
  assert.deepEqual(brandView.milestones.map((m) => m.title), ['Private brand note', 'Shared reminder']);

  const shopView = await service.getOrderCalendarMilestonesForActor('shop-buyer', 'order-1');
  assert.deepEqual(shopView.milestones.map((m) => m.title), ['Shared reminder']);
});

test('milestones page out ordered by startsAt', async () => {
  const { service } = fixture();
  await service.addOrderCalendarMilestone('cmd-1', 'brand-sales', 'order-1', { title: 'Later', startsAt: '2026-12-01T00:00:00.000Z' });
  const view = await service.getOrderCalendarMilestonesForActor('brand-sales', 'order-1');
  assert.equal(view.orderId, 'order-1');
  assert.equal(view.milestones[0].startsAt, '2026-12-01T00:00:00.000Z');
});
