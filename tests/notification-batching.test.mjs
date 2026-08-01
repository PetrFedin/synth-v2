import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';

function projectionStore({ records = [] } = {}) {
  const projected = new Set();
  const notifications = [];
  return {
    reads: 0,
    async readUnprojectedOutbox(limit) {
      this.reads += 1;
      return records.filter((record) => !projected.has(record.event.id)).slice(0, limit);
    },
    snapshot() {
      return {
        notifications,
        projections: [...projected].map((eventId) => ({ eventId })),
        commands: [],
      };
    },
    async transaction(work) {
      return work({
        hasProjection: (id) => projected.has(id),
        getNotificationByDedupeKey: () => undefined,
        insertNotification: (notification) => notifications.push(notification),
        insertProjection: (projection) => projected.add(projection.eventId),
        getCommand: () => undefined,
        getNotification: () => undefined,
        insertCommand() {},
      });
    },
  };
}

function event(id, aggregateId = 'selection-1') {
  return { event: { id, type: 'selection.submitted', aggregateId, payload: {} } };
}

test('projection reads one bounded batch and snapshots source only once', async () => {
  let snapshots = 0;
  const sourceStore = {
    readOutbox: async () => [],
    snapshot: async () => {
      snapshots += 1;
      return { memberships: [], selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{}] }] };
    },
  };
  const projections = projectionStore({ records: [event('e1'), event('e2'), event('e3')] });
  const service = createNotificationService({
    sourceStore,
    projectionStore: projections,
    clock: () => '2026-08-01T00:00:00.000Z',
  });
  const result = await service.projectPending({ limit: 2 });
  assert.equal(result.length, 2);
  assert.equal(snapshots, 1);
  assert.equal(projections.reads, 1);
});

test('poison events do not prevent later events in the same batch', async () => {
  const sourceStore = {
    readOutbox: async () => [],
    snapshot: async () => ({ memberships: [], selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{}] }] }),
  };
  const projections = projectionStore({ records: [event('bad', 'missing'), event('good')] });
  const service = createNotificationService({
    sourceStore,
    projectionStore: projections,
    clock: () => '2026-08-01T00:00:00.000Z',
  });
  const result = await service.projectPending({ limit: 10 });
  assert.deepEqual(result.map((item) => item.status), ['failed', 'projected']);
  assert.equal(result[0].errorCode, 'SELECTION_NOT_FOUND');
});

test('fallback path excludes projected records before applying the limit', async () => {
  const records = [event('e1'), event('e2'), event('e3')];
  const sourceStore = {
    readOutbox: async () => records,
    snapshot: async () => ({ memberships: [], selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{}] }] }),
  };
  const projections = projectionStore();
  delete projections.readUnprojectedOutbox;
  projections.snapshot = () => ({ notifications: [], projections: [{ eventId: 'e1' }], commands: [] });
  const service = createNotificationService({
    sourceStore,
    projectionStore: projections,
    clock: () => '2026-08-01T00:00:00.000Z',
  });
  const result = await service.projectPending({ limit: 1 });
  assert.equal(result[0].eventId, 'e2');
});

test('batch limits are validated', async () => {
  const sourceStore = { readOutbox: async () => [], snapshot: async () => ({ memberships: [] }) };
  const service = createNotificationService({ sourceStore, projectionStore: projectionStore() });
  await assert.rejects(
    () => service.projectPending({ limit: 0 }),
    (error) => error.code === 'NOTIFICATION_BATCH_LIMIT_INVALID',
  );
  await assert.rejects(
    () => service.projectPending({ limit: 1001 }),
    (error) => error.code === 'NOTIFICATION_BATCH_LIMIT_INVALID',
  );
});
