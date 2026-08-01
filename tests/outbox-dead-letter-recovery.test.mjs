import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';

const event = Object.freeze({
  id: 'event-1',
  type: 'order.created',
  aggregateId: 'order-1',
  occurredAt: '2026-08-02T00:00:00.000Z',
  payload: Object.freeze({}),
});

function recoveryFixture({ found = true } = {}) {
  const queries = [];
  let released = 0;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/SELECT dead_letter\.event_id/.test(sql)) {
        return found ? { rows: [{ event_id: 'event-1', attempt_count: 10, error_code: 'UPSTREAM_FAILED', event }] } : { rows: [] };
      }
      if (/UPDATE outbox_events/.test(sql)) return { rowCount: 1, rows: [] };
      if (/DELETE FROM outbox_dead_letters/.test(sql)) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() { released += 1; },
  };
  return {
    queries,
    get released() { return released; },
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query not expected'); },
    },
  };
}

test('dead-letter recovery locks the event, resets it to pending and appends operator audit', async () => {
  const fixture = recoveryFixture();
  const store = createPostgresOutboxPublicationStore({ pool: fixture.pool });
  const result = await store.requeueDeadLetter({
    eventId: 'event-1',
    actorId: 'operator-1',
    reason: '  Upstream mapping was corrected  ',
    requeuedAt: '2026-08-02T12:00:00Z',
  });

  assert.deepEqual(result, {
    requeued: true,
    eventId: 'event-1',
    actorId: 'operator-1',
    reason: 'Upstream mapping was corrected',
    requeuedAt: '2026-08-02T12:00:00.000Z',
    previousAttemptCount: 10,
    previousErrorCode: 'UPSTREAM_FAILED',
  });
  assert.equal(fixture.queries[0].sql, 'BEGIN');
  assert.match(fixture.queries[1].sql, /FOR UPDATE OF dead_letter, source/);
  assert.match(fixture.queries[2].sql, /DELETE FROM outbox_publication_claims/);
  assert.match(fixture.queries[3].sql, /SET status = 'pending'/);
  assert.match(fixture.queries[4].sql, /DELETE FROM outbox_dead_letters/);
  assert.match(fixture.queries[5].sql, /VALUES \(\$1, 'requeued'/);
  assert.deepEqual(fixture.queries[5].params, [
    'event-1',
    10,
    'UPSTREAM_FAILED',
    'operator-1',
    'Upstream mapping was corrected',
    '2026-08-02T12:00:00.000Z',
    event,
  ]);
  assert.equal(fixture.queries[6].sql, 'COMMIT');
  assert.equal(fixture.released, 1);
});

test('missing or already-recovered event is a no-op inside the transaction', async () => {
  const fixture = recoveryFixture({ found: false });
  const result = await createPostgresOutboxPublicationStore({ pool: fixture.pool }).requeueDeadLetter({
    eventId: 'event-1',
    actorId: 'operator-1',
    reason: 'Retry after investigation',
    requeuedAt: '2026-08-02T12:00:00.000Z',
  });

  assert.deepEqual(result, { requeued: false, eventId: 'event-1' });
  assert.deepEqual(fixture.queries.map((query) => query.sql), [
    'BEGIN',
    fixture.queries[1].sql,
    'COMMIT',
  ]);
  assert.equal(fixture.released, 1);
});

test('terminal publication writes current dead-letter state and append-only audit together', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/WITH owned AS/.test(sql)) return { rowCount: 1, rows: [{ event_id: 'event-1' }] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query not expected'); },
    },
  });

  assert.equal(await store.deadLetter({
    eventId: 'event-1',
    workerId: 'worker-1',
    claimToken: 'claim-1',
    errorCode: 'UPSTREAM_FAILED',
    failedAt: '2026-08-02T12:00:00.000Z',
  }), true);
  assert.match(queries[1].sql, /ON CONFLICT \(event_id\) DO UPDATE/);
  assert.match(queries[1].sql, /INSERT INTO outbox_dead_letter_audit/);
  assert.match(queries[1].sql, /'dead-lettered'/);
});

test('recovery input is validated before a database connection is checked out', async () => {
  let connects = 0;
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { connects += 1; },
      async query() {},
    },
  });
  await assert.rejects(
    () => store.requeueDeadLetter({
      eventId: 'event-1',
      actorId: ' operator-1 ',
      reason: 'Retry',
      requeuedAt: '2026-08-02T12:00:00.000Z',
    }),
    (error) => error.code === 'OUTBOX_RECOVERY_ACTOR_INVALID',
  );
  assert.equal(connects, 0);
});
