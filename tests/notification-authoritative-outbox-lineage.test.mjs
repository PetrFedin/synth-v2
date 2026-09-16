import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

const sourceStore = Object.freeze({
  readOutbox: async () => [],
  snapshot: async () => ({
    memberships: [],
    selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{}] }],
    orders: [],
    deals: [],
  }),
});

function claimedEvent({ id = 'event-real-001', type = 'selection.submitted' } = {}) {
  return Object.freeze({
    id,
    type,
    aggregateId: 'selection-1',
    occurredAt: '2026-09-16T12:00:00.000Z',
    payload: Object.freeze({
      eventId: 'event-fake-999',
      eventType: 'fake.event',
    }),
  });
}

function claimedRecord({ id, type, attemptCount = 1 } = {}) {
  return Object.freeze({
    event: claimedEvent({ id, type }),
    status: 'pending',
    publishedAt: null,
    attemptCount,
  });
}

function statefulProjectionStore({ eventId = 'event-real-001', eventType = 'selection.submitted', failNotificationOnce = false } = {}) {
  const projections = new Map();
  const notifications = [];
  const calls = {
    claims: [],
    failedClaims: [],
    deletedClaims: [],
    insertedProjections: [],
  };
  let claimAttempt = 0;
  let shouldFailNotification = failNotificationOnce;

  return {
    calls,
    projections,
    notifications,
    snapshot: async () => ({
      notifications: Object.freeze([...notifications]),
      projections: Object.freeze([...projections.values()]),
      commands: Object.freeze([]),
    }),
    async claimUnprojectedOutbox(input) {
      calls.claims.push(input);
      claimAttempt += 1;
      return [claimedRecord({ id: eventId, type: eventType, attemptCount: claimAttempt })];
    },
    async failProjectionClaim(input) {
      calls.failedClaims.push(input);
      return true;
    },
    async recordProjectionFailure() {
      return false;
    },
    async transaction(work) {
      return work({
        hasProjection: async (id) => projections.has(id),
        getNotificationByDedupeKey: async (dedupeKey) => notifications.find((item) => item.dedupeKey === dedupeKey),
        async insertNotification(notification) {
          if (shouldFailNotification) {
            shouldFailNotification = false;
            throw new Error('synthetic transient projection failure');
          }
          notifications.push(notification);
        },
        async insertProjection(projection) {
          assert.equal(projections.has(projection.eventId), false, 'duplicate logical projection must not be inserted');
          projections.set(projection.eventId, projection);
          calls.insertedProjections.push(projection);
        },
        async deleteProjectionClaim(id) {
          calls.deletedClaims.push(id);
        },
      });
    },
  };
}

test('PostgreSQL claim uses authoritative outbox id/type when JSON lineage is spoofed or missing', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/WITH candidates AS MATERIALIZED/.test(sql)) {
        return {
          rows: [
            {
              event_id: 'event-real-001',
              event_type: 'selection.submitted',
              event: {
                id: 'event-fake-999',
                type: 'fake.event',
                aggregateId: 'selection-1',
                occurredAt: '2026-09-16T12:00:00.000Z',
                payload: { eventId: 'payload-fake', eventType: 'payload.fake' },
              },
              status: 'pending',
              published_at: null,
              attempt_count: 1,
            },
            {
              event_id: 'event-real-002',
              event_type: 'selection.submitted',
              event: {
                aggregateId: 'selection-1',
                occurredAt: '2026-09-16T12:00:01.000Z',
                payload: {},
              },
              status: 'pending',
              published_at: null,
              attempt_count: 1,
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const store = createPostgresNotificationProjectionStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query is not expected while claiming'); },
    },
  });

  const records = await store.claimUnprojectedOutbox({
    workerId: 'worker-lineage',
    claimedAt: '2026-09-16T12:00:00.000Z',
    leaseExpiresAt: '2026-09-16T12:00:30.000Z',
    limit: 10,
  });

  assert.match(queries[1].sql, /source\.id AS event_id/);
  assert.match(queries[1].sql, /source\.event_type/);
  assert.equal(records[0].event.id, 'event-real-001');
  assert.equal(records[0].event.type, 'selection.submitted');
  assert.equal(records[0].event.aggregateId, 'selection-1');
  assert.deepEqual(records[0].event.payload, { eventId: 'payload-fake', eventType: 'payload.fake' });
  assert.equal(records[1].event.id, 'event-real-002');
  assert.equal(records[1].event.type, 'selection.submitted');
  assert.equal(records[1].event.aggregateId, 'selection-1');
});

test('duplicate replay keeps exactly one logical notification projection', async () => {
  const projectionStore = statefulProjectionStore();
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-replay',
    clock: () => '2026-09-16T12:00:00.000Z',
    nextId: () => 'notification-1',
  });

  const first = await service.projectPending();
  const second = await service.projectPending();

  assert.equal(first[0].status, 'projected');
  assert.equal(second[0].status, 'already-projected');
  assert.equal(projectionStore.projections.size, 1);
  assert.equal(projectionStore.notifications.length, 1);
  assert.equal(projectionStore.calls.insertedProjections.length, 1);
  assert.deepEqual(projectionStore.calls.deletedClaims, ['event-real-001', 'event-real-001']);
});

test('projection failure is rescheduled against the authoritative event id, never payload lineage', async () => {
  const projectionStore = statefulProjectionStore({
    eventId: 'event-real-failure',
    failNotificationOnce: true,
  });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-failure',
    projectionRetryDelayMs: 5_000,
    maxProjectionAttempts: 3,
    clock: () => '2026-09-16T12:00:00.000Z',
    nextId: () => 'notification-failure',
  });

  const result = await service.projectPending();

  assert.equal(result[0].status, 'failed');
  assert.equal(result[0].rescheduled, true);
  assert.equal(result[0].eventId, 'event-real-failure');
  assert.equal(projectionStore.calls.failedClaims.length, 1);
  assert.deepEqual(projectionStore.calls.failedClaims[0], {
    eventId: 'event-real-failure',
    workerId: 'worker-failure',
    errorCode: 'INTERNAL_ERROR',
    retryAt: '2026-09-16T12:00:05.000Z',
  });
  assert.notEqual(projectionStore.calls.failedClaims[0].eventId, 'event-fake-999');
});

test('failure then retry succeeds once with the same authoritative event lineage', async () => {
  const projectionStore = statefulProjectionStore({
    eventId: 'event-real-retry',
    eventType: 'selection.submitted',
    failNotificationOnce: true,
  });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-retry',
    projectionRetryDelayMs: 5_000,
    maxProjectionAttempts: 3,
    clock: () => '2026-09-16T12:00:00.000Z',
    nextId: () => 'notification-retry',
  });

  const first = await service.projectPending();
  const second = await service.projectPending();

  assert.equal(first[0].status, 'failed');
  assert.equal(first[0].rescheduled, true);
  assert.equal(second[0].status, 'projected');
  assert.equal(second[0].eventId, 'event-real-retry');
  assert.equal(projectionStore.projections.size, 1);
  assert.equal(projectionStore.notifications.length, 1);
  assert.equal(projectionStore.notifications[0].sourceEventId, 'event-real-retry');
  assert.equal(projectionStore.calls.insertedProjections.length, 1);
  assert.equal(projectionStore.calls.insertedProjections[0].eventId, 'event-real-retry');
  assert.equal(projectionStore.calls.insertedProjections[0].eventType, 'selection.submitted');
  assert.deepEqual(projectionStore.calls.failedClaims.map((item) => item.eventId), ['event-real-retry']);
  assert.deepEqual(projectionStore.calls.deletedClaims, ['event-real-retry']);
});
