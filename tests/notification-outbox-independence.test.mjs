import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

function projectionStore() {
  const projected = new Set();
  const notifications = [];
  return {
    snapshot() {
      return { notifications, projections: [...projected].map((eventId) => ({ eventId })), commands: [] };
    },
    async transaction(work) {
      return work({
        hasProjection: (eventId) => projected.has(eventId),
        getNotificationByDedupeKey: (dedupeKey) => notifications.find((item) => item.dedupeKey === dedupeKey),
        insertNotification: (notification) => notifications.push(notification),
        insertProjection: (projection) => projected.add(projection.eventId),
        getCommand: () => undefined,
        getNotification: () => undefined,
        insertCommand() {},
      });
    },
  };
}

const record = Object.freeze({
  event: Object.freeze({
    id: 'event-published',
    type: 'selection.submitted',
    aggregateId: 'selection-1',
    occurredAt: '2026-08-02T00:00:00.000Z',
    payload: Object.freeze({}),
  }),
  status: 'published',
  publishedAt: '2026-08-02T00:00:01.000Z',
});

test('memory projection consumes already-published outbox events', async () => {
  const requestedStatuses = [];
  const sourceStore = {
    readOutbox(status) {
      requestedStatuses.push(status);
      return status === 'published' ? [record] : [];
    },
    snapshot() {
      return {
        memberships: [],
        selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{ sku: 'SKU-1' }] }],
        orders: [],
        deals: [],
      };
    },
  };
  const projections = projectionStore();
  const service = createNotificationService({
    sourceStore,
    projectionStore: projections,
    clock: () => '2026-08-02T00:00:02.000Z',
    nextId: () => 'notification-1',
  });

  const result = await service.projectPending({ limit: 10 });
  assert.deepEqual(requestedStatuses.sort(), ['pending', 'published']);
  assert.equal(result[0].eventId, 'event-published');
  assert.equal(result[0].status, 'projected');
  assert.equal(projections.snapshot().notifications.length, 1);
});

test('PostgreSQL projection query does not filter on external publication status', async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return { rows: [] };
    },
    async connect() { throw new Error('transaction not expected'); },
  };
  const store = createPostgresNotificationProjectionStore({ pool });
  await store.readUnprojectedOutbox(25);
  assert.match(captured.sql, /FROM outbox_events AS source/);
  assert.match(captured.sql, /NOT EXISTS[\s\S]*notification_projections/);
  assert.doesNotMatch(captured.sql, /source\.status\s*=\s*'pending'/);
  assert.deepEqual(captured.params, [25]);
});
