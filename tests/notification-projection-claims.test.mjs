import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationService } from '../src/application/notification-service.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';

const sourceStore = Object.freeze({
  readOutbox: async () => [],
  snapshot: async () => ({
    memberships: [],
    selections: [{ id: 'selection-1', brandId: 'brand-1', lines: [{}] }],
  }),
});

function outboxRecord(attemptCount = 1) {
  return Object.freeze({
    event: Object.freeze({
      id: 'event-1',
      type: 'selection.submitted',
      aggregateId: 'selection-1',
      payload: Object.freeze({}),
    }),
    status: 'pending',
    publishedAt: null,
    attemptCount,
  });
}

function serviceProjectionStore({ attemptCount = 1, insertError, checkpoint = true } = {}) {
  const calls = { claims: [], failedClaims: [], checkpoints: [], deletedClaims: [] };
  return {
    calls,
    snapshot: async () => ({ notifications: [], projections: [], commands: [] }),
    async claimUnprojectedOutbox(input) {
      calls.claims.push(input);
      return [outboxRecord(attemptCount)];
    },
    async failProjectionClaim(input) {
      calls.failedClaims.push(input);
      return true;
    },
    async recordProjectionFailure(input) {
      calls.checkpoints.push(input);
      return checkpoint;
    },
    async transaction(work) {
      return work({
        hasProjection: async () => false,
        getNotificationByDedupeKey: async () => undefined,
        async insertNotification() {
          if (insertError) throw insertError;
        },
        insertProjection: async () => undefined,
        async deleteProjectionClaim(eventId) { calls.deletedClaims.push(eventId); },
      });
    },
  };
}

test('PostgreSQL claims one ordered batch with expiring leases and SKIP LOCKED', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/WITH candidates AS MATERIALIZED/.test(sql)) {
        return {
          rows: [{
            event: outboxRecord().event,
            status: 'pending',
            published_at: null,
            attempt_count: 2,
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const store = createPostgresNotificationProjectionStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query is not expected while claiming'); },
    },
  });

  const records = await store.claimUnprojectedOutbox({
    workerId: 'worker-1',
    claimedAt: '2026-08-02T00:00:00.000Z',
    leaseExpiresAt: '2026-08-02T00:00:30.000Z',
    limit: 25,
  });

  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries[1].sql, /notification_projection_claims/);
  assert.match(queries[1].sql, /lease_expires_at > \$2/);
  assert.match(queries[1].sql, /FOR UPDATE OF source SKIP LOCKED/);
  assert.match(queries[1].sql, /ON CONFLICT \(event_id\) DO UPDATE/);
  assert.match(queries[1].sql, /attempt_count = notification_projection_claims\.attempt_count \+ 1/);
  assert.deepEqual(queries[1].params, [
    'worker-1',
    '2026-08-02T00:00:00.000Z',
    '2026-08-02T00:00:30.000Z',
    25,
  ]);
  assert.equal(queries[2].sql, 'COMMIT');
  assert.equal(queries[3].sql, 'RELEASE');
  assert.equal(records[0].attemptCount, 2);
});

test('invalid projection leases are rejected before a database checkout', async () => {
  let connects = 0;
  const store = createPostgresNotificationProjectionStore({
    pool: {
      async connect() { connects += 1; },
      async query() { return { rows: [] }; },
    },
  });

  await assert.rejects(
    () => store.claimUnprojectedOutbox({
      workerId: 'worker-1',
      claimedAt: '2026-08-02T00:00:30.000Z',
      leaseExpiresAt: '2026-08-02T00:00:00.000Z',
      limit: 1,
    }),
    (error) => error.code === 'NOTIFICATION_LEASE_INVALID',
  );
  assert.equal(connects, 0);
});

test('notification service claims work and clears the lease in the projection transaction', async () => {
  const projectionStore = serviceProjectionStore();
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-1',
    projectionLeaseMs: 30_000,
    clock: () => '2026-08-02T00:00:00.000Z',
    nextId: () => 'notification-1',
  });

  const result = await service.projectPending({ limit: 10 });

  assert.deepEqual(projectionStore.calls.claims, [{
    workerId: 'worker-1',
    claimedAt: '2026-08-02T00:00:00.000Z',
    leaseExpiresAt: '2026-08-02T00:00:30.000Z',
    limit: 10,
  }]);
  assert.deepEqual(projectionStore.calls.deletedClaims, ['event-1']);
  assert.equal(result[0].status, 'projected');
});

test('transient projection failures are rescheduled without poisoning the batch', async () => {
  const projectionStore = serviceProjectionStore({ insertError: new Error('temporary database failure') });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-1',
    projectionRetryDelayMs: 5_000,
    maxProjectionAttempts: 3,
    clock: () => '2026-08-02T00:00:00.000Z',
    nextId: () => 'notification-1',
  });

  const result = await service.projectPending();

  assert.equal(result[0].errorCode, 'INTERNAL_ERROR');
  assert.equal(result[0].rescheduled, true);
  assert.equal(result[0].retryable, true);
  assert.equal(projectionStore.calls.checkpoints.length, 0);
  assert.deepEqual(projectionStore.calls.failedClaims[0], {
    eventId: 'event-1',
    workerId: 'worker-1',
    errorCode: 'INTERNAL_ERROR',
    retryAt: '2026-08-02T00:00:05.000Z',
  });
});

test('exhausted transient failures are checkpointed as failed projections', async () => {
  const projectionStore = serviceProjectionStore({
    attemptCount: 3,
    insertError: new Error('persistent database failure'),
  });
  const service = createNotificationService({
    sourceStore,
    projectionStore,
    projectionWorkerId: 'worker-1',
    maxProjectionAttempts: 3,
    clock: () => '2026-08-02T00:00:00.000Z',
    nextId: () => 'notification-1',
  });

  const result = await service.projectPending();

  assert.equal(result[0].attemptCount, 3);
  assert.equal(result[0].checkpointed, true);
  assert.equal(result[0].retryable, false);
  assert.equal(projectionStore.calls.failedClaims.length, 0);
  assert.equal(projectionStore.calls.checkpoints[0].attemptCount, 3);
  assert.equal(projectionStore.calls.checkpoints[0].errorCode, 'INTERNAL_ERROR');
});
