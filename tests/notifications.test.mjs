import test from 'node:test';
import assert from 'node:assert/strict';
import { domainEvent } from '../src/core/events.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createMemoryNotificationProjectionStore } from '../src/infrastructure/notification-projection-store.mjs';
import { createNotificationService } from '../src/application/notification-service.mjs';

function event(id, type, aggregateId, payload = {}) {
  return domainEvent({ id, type, aggregateId, occurredAt: 'now', payload, metadata: { actorId: 'actor', commandId: `cmd-${id}` } });
}

async function fixture() {
  let id = 0;
  const sourceStore = createMemoryWholesaleStore();
  const projectionStore = createMemoryNotificationProjectionStore();
  await sourceStore.transaction((tx) => {
    tx.insertMembership(createMembership({ id: 'm-brand', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-user', role: 'viewer', createdAt: 'now' }));
    tx.insertMembership(createMembership({ id: 'm-shop', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-user', role: 'viewer', createdAt: 'now' }));
    tx.insertSelection(Object.freeze({ id: 'selection-1', brandId: 'brand-1', shopId: 'shop-1', lines: Object.freeze([{ sku: 'SKU-1' }]), version: 1 }));
    tx.insertOrder(Object.freeze({ id: 'order-1', cycleId: 'cycle-1', brandId: 'brand-1', shopId: 'shop-1', version: 1 }));
    tx.insertDeal(Object.freeze({ id: 'deal-1', orderId: 'order-1', brandId: 'brand-1', shopId: 'shop-1' }));
    tx.appendOutbox(event('event-selection', 'selection.submitted', 'selection-1', { lineCount: 1 }));
    tx.appendOutbox(event('event-order', 'order.terms-accepted', 'order-1', { organisationId: 'shop-1', status: 'draft' }));
    tx.appendOutbox(event('event-deal', 'deal-space.opened', 'deal-1', { orderId: 'order-1' }));
    tx.appendOutbox(event('event-ignored', 'campaign.created', 'campaign-1'));
  });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    clock: () => '2026-07-30T21:00:00.000Z',
    nextId: (prefix) => `${prefix}_${++id}`,
  });
  return { sourceStore, projectionStore, service };
}

test('outbox projection creates correctly routed notifications and checkpoints every event', async () => {
  const { sourceStore, projectionStore, service } = await fixture();
  await service.projectPending();
  const snapshot = projectionStore.snapshot();
  assert.equal(snapshot.notifications.length, 4);
  assert.equal(snapshot.projections.length, 4);
  assert.equal(snapshot.notifications.filter((item) => item.recipientOrganisationId === 'brand-1').length, 3);
  assert.equal(snapshot.notifications.filter((item) => item.recipientOrganisationId === 'shop-1').length, 1);
  assert.equal(sourceStore.readOutbox('pending').length, 4, 'notification projection must not impersonate external outbox publication');
});

test('projection is idempotent and creates no duplicate notifications', async () => {
  const { projectionStore, service } = await fixture();
  await service.projectPending();
  await service.projectPending();
  const snapshot = projectionStore.snapshot();
  assert.equal(snapshot.notifications.length, 4);
  assert.equal(new Set(snapshot.notifications.map((item) => item.dedupeKey)).size, 4);
});

test('recipient member can read notification while another organisation cannot', async () => {
  const { projectionStore, service } = await fixture();
  await service.projectPending();
  const brandNotification = (await service.listForActor('brand-user'))[0];
  const read = await service.markRead('cmd-read', 'brand-user', brandNotification.id);
  assert.equal(read.status, 'read');
  assert.equal(read.readBy, 'brand-user');
  await assert.rejects(
    service.markRead('cmd-foreign-read', 'shop-user', brandNotification.id),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.equal(projectionStore.snapshot().commands.some((item) => item.id === 'cmd-foreign-read'), false);
});
