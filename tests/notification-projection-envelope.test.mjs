import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

// outbox_events carries more than one event envelope shape. Domain events written through
// domainEvent() expose `id`/`type` inside the JSON; MDM and Product Identity events expose
// `eventId`/`eventType` instead. The projection key must therefore come from the outbox row itself,
// which is NOT NULL and is what the reader's own anti-join and the claim table already use.
function projectionStore() {
  const projected = new Set();
  const notifications = [];
  return {
    projected,
    notifications,
    snapshot() {
      return { notifications, projections: [...projected].map((eventId) => ({ eventId })), commands: [] };
    },
    async transaction(work) {
      return work({
        hasProjection: (eventId) => projected.has(eventId),
        getNotificationByDedupeKey: (dedupeKey) => notifications.find((item) => item.dedupeKey === dedupeKey),
        insertNotification: (notification) => notifications.push(notification),
        insertProjection: (projection) => {
          assert.ok(projection.eventId, 'projection must carry a non-null event id');
          assert.ok(projection.eventType, 'projection must carry a non-null event type');
          projected.add(projection.eventId);
        },
        getCommand: () => undefined,
        getNotification: () => undefined,
        insertCommand() {},
        deleteProjectionClaim() {},
      });
    },
  };
}

function serviceFor(records) {
  const projections = projectionStore();
  const service = createNotificationService({
    sourceStore: {
      readOutbox: (status) => (status === 'pending' ? records : []),
      snapshot: () => ({ memberships: [], selections: [], orders: [], deals: [] }),
    },
    projectionStore: projections,
    clock: () => '2026-09-17T00:00:00.000Z',
    nextId: () => 'notification-1',
  });
  return { service, projections };
}

test('an event envelope without id or type still projects, keyed by the outbox row', async () => {
  const { service, projections } = serviceFor([{
    eventId: 'mdm-dictionary:assortment-category:v1',
    eventType: 'MdmDictionaryChanged',
    event: {
      eventId: 'mdm-dictionary:assortment-category:v1',
      eventType: 'MdmDictionaryChanged',
      occurredAt: '2026-08-31T00:00:00.000Z',
      code: 'assortment.category',
    },
    status: 'pending',
    publishedAt: null,
  }]);

  const [result] = await service.projectPending({ limit: 10 });

  assert.equal(result.status, 'projected');
  assert.equal(result.eventId, 'mdm-dictionary:assortment-category:v1');
  // Only selection.submitted, order.terms-accepted and deal-space.opened produce notifications, so
  // reference-data events are processed as a no-op rather than becoming user-visible noise.
  assert.deepEqual(result.notificationIds, []);
  assert.equal(projections.notifications.length, 0);
});

test('a reference-data event is projected exactly once', async () => {
  const record = {
    eventId: 'mdm-entry:size-scale:int-alpha:v1',
    eventType: 'MdmEntryChanged',
    event: { eventId: 'mdm-entry:size-scale:int-alpha:v1', eventType: 'MdmEntryChanged', occurredAt: '2026-08-31T00:00:00.000Z' },
    status: 'pending',
    publishedAt: null,
  };
  const { service, projections } = serviceFor([record]);

  const first = await service.projectPending({ limit: 10 });
  const second = await service.projectPending({ limit: 10 });

  assert.equal(first[0].status, 'projected');
  assert.deepEqual(second, []);
  assert.equal(projections.projected.size, 1);
});

test('domain events keep projecting into notifications', async () => {
  const projections = projectionStore();
  const service = createNotificationService({
    sourceStore: {
      readOutbox: (status) => (status === 'pending' ? [{
        eventId: 'event-1',
        eventType: 'selection.submitted',
        event: { id: 'event-1', type: 'selection.submitted', aggregateId: 'selection-1', occurredAt: '2026-09-17T00:00:00.000Z', payload: {} },
        status: 'pending',
        publishedAt: null,
      }] : []),
      snapshot: () => ({ memberships: [], selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{ sku: 'SKU-1' }] }], orders: [], deals: [] }),
    },
    projectionStore: projections,
    clock: () => '2026-09-17T00:00:00.000Z',
    nextId: () => 'notification-1',
  });

  const [result] = await service.projectPending({ limit: 10 });

  assert.equal(result.status, 'projected');
  assert.equal(projections.notifications.length, 1);
  assert.equal(projections.notifications[0].sourceEventId, 'event-1');
});

test('both projection queries select the outbox row key and relational event type', async () => {
  const captured = [];
  const pool = {
    async query(sql) { captured.push(sql); return { rows: [] }; },
    async connect() {
      return { async query(sql) { captured.push(sql); return { rows: [] }; }, release() {} };
    },
  };
  const store = createPostgresNotificationProjectionStore({ pool });
  await store.readUnprojectedOutbox(5);
  await store.claimUnprojectedOutbox({
    workerId: 'worker-1',
    claimedAt: '2026-09-17T00:00:00.000Z',
    leaseExpiresAt: '2026-09-17T00:01:00.000Z',
    limit: 5,
  });

  const selects = captured.filter((sql) => /FROM outbox_events AS source|JOIN outbox_events AS source/.test(sql));
  assert.ok(selects.length >= 2, 'both read paths must query outbox_events');
  for (const sql of selects) {
    assert.match(sql, /SELECT source\.id, source\.event_type, source\.event/);
  }
});
