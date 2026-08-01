import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxPublisherService } from '../src/application/outbox-publisher-service.mjs';
import { createPostgresOutboxPublicationStore } from '../src/infrastructure/postgres-outbox-publication-store.mjs';

function event(id, aggregateId = id) {
  return Object.freeze({
    id,
    type: 'order.created',
    aggregateId,
    occurredAt: '2026-08-02T00:00:00.000Z',
    payload: Object.freeze({}),
  });
}

function publicationRecord(id, aggregateId = id, attemptCount = 1) {
  return Object.freeze({
    event: event(id, aggregateId),
    status: 'pending',
    publishedAt: null,
    workerId: 'worker-1',
    claimToken: 'claim-1',
    attemptCount,
  });
}

function serviceStore(records, overrides = {}) {
  const calls = { claims: [], acknowledgements: [], retries: [], deadLetters: [] };
  return {
    calls,
    async claimPending(input) { calls.claims.push(input); return records; },
    async acknowledgePublished(input) { calls.acknowledgements.push(input); return true; },
    async reschedule(input) { calls.retries.push(input); return true; },
    async deadLetter(input) { calls.deadLetters.push(input); return true; },
    async listDeadLetters() { return []; },
    ...overrides,
  };
}

test('PostgreSQL claims pending outbox rows with lease ownership and SKIP LOCKED', async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/WITH candidates AS MATERIALIZED/.test(sql)) {
        return {
          rows: [{
            event: event('event-1'),
            status: 'pending',
            published_at: null,
            worker_id: 'worker-1',
            claim_token: 'claim-1',
            attempt_count: 2,
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { return client; },
      async query() { throw new Error('pool.query not expected'); },
    },
  });

  const records = await store.claimPending({
    workerId: 'worker-1',
    claimToken: 'claim-1',
    claimedAt: '2026-08-02T00:00:00.000Z',
    leaseExpiresAt: '2026-08-02T00:05:00.000Z',
    limit: 25,
  });

  assert.equal(queries[0].sql, 'BEGIN');
  assert.match(queries[1].sql, /source\.status = 'pending'/);
  assert.match(queries[1].sql, /FOR UPDATE OF source SKIP LOCKED/);
  assert.match(queries[1].sql, /outbox_publication_claims/);
  assert.match(queries[1].sql, /claim_token = EXCLUDED\.claim_token/);
  assert.match(queries[1].sql, /attempt_count = outbox_publication_claims\.attempt_count \+ 1/);
  assert.deepEqual(queries[1].params, [
    'worker-1',
    '2026-08-02T00:00:00.000Z',
    '2026-08-02T00:05:00.000Z',
    'claim-1',
    25,
  ]);
  assert.equal(queries[2].sql, 'COMMIT');
  assert.equal(queries[3].sql, 'RELEASE');
  assert.equal(records[0].attemptCount, 2);
  assert.equal(records[0].claimToken, 'claim-1');
});

test('acknowledgement is conditional on worker and unguessable claim token', async () => {
  const queries = [];
  const store = createPostgresOutboxPublicationStore({
    pool: {
      async connect() { throw new Error('connect not expected'); },
      async query(sql, params) { queries.push({ sql, params }); return { rowCount: 1, rows: [{ id: 'event-1' }] }; },
    },
  });

  assert.equal(await store.acknowledgePublished({
    eventId: 'event-1',
    workerId: 'worker-1',
    claimToken: 'claim-1',
    publishedAt: '2026-08-02T00:00:01.000Z',
  }), true);
  assert.match(queries[0].sql, /worker_id = \$2/);
  assert.match(queries[0].sql, /claim_token = \$3/);
  assert.match(queries[0].sql, /source\.status = 'pending'/);
  assert.deepEqual(queries[0].params, ['event-1', 'worker-1', 'claim-1', '2026-08-02T00:00:01.000Z']);
});

test('publisher preserves ordering inside an aggregate while processing independent aggregates concurrently', async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const trace = [];
  const records = [
    publicationRecord('event-a1', 'order-a'),
    publicationRecord('event-a2', 'order-a'),
    publicationRecord('event-b1', 'order-b'),
  ];
  const store = serviceStore(records);
  const service = createOutboxPublisherService({
    store,
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    clock: () => '2026-08-02T00:00:00.000Z',
    publisher: async (current) => {
      trace.push(`start:${current.id}`);
      if (current.id === 'event-a1') await firstGate;
      trace.push(`end:${current.id}`);
    },
  });

  const pending = service.publishPending({ parallelism: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(trace.includes('start:event-a1'));
  assert.ok(trace.includes('start:event-b1'));
  assert.equal(trace.includes('start:event-a2'), false);
  releaseFirst();
  const results = await pending;

  assert.ok(trace.indexOf('end:event-a1') < trace.indexOf('start:event-a2'));
  assert.deepEqual(results.map((result) => result.status), ['published', 'published', 'published']);
  assert.equal(store.calls.acknowledgements.length, 3);
});

test('retryable publication failures use bounded exponential backoff', async () => {
  const store = serviceStore([publicationRecord('event-1', 'order-1', 3)]);
  const failure = new Error('temporary upstream failure');
  failure.code = 'UPSTREAM_UNAVAILABLE';
  failure.retryable = true;
  const service = createOutboxPublisherService({
    store,
    publisher: async () => { throw failure; },
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    retryDelayMs: 5_000,
    maxRetryDelayMs: 60_000,
    maxAttempts: 5,
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const [result] = await service.publishPending();
  assert.equal(result.status, 'failed');
  assert.equal(result.retryable, true);
  assert.equal(result.retryAt, '2026-08-02T00:00:20.000Z');
  assert.equal(store.calls.deadLetters.length, 0);
  assert.equal(store.calls.retries[0].errorCode, 'UPSTREAM_UNAVAILABLE');
});

test('non-retryable and exhausted failures are atomically dead-lettered', async () => {
  const store = serviceStore([publicationRecord('event-1', 'order-1', 10)]);
  const service = createOutboxPublisherService({
    store,
    publisher: async () => { throw new Error('persistent failure'); },
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    maxAttempts: 10,
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const [result] = await service.publishPending();
  assert.equal(result.status, 'dead-letter');
  assert.equal(result.retryable, false);
  assert.equal(store.calls.retries.length, 0);
  assert.equal(store.calls.deadLetters[0].eventId, 'event-1');
});

test('acknowledgement failures retain delivered=true and never enter publication retry handling', async () => {
  const store = serviceStore([publicationRecord('event-1')], {
    async acknowledgePublished() {
      const error = new Error('database unavailable after delivery');
      error.code = 'DATABASE_UNAVAILABLE';
      throw error;
    },
  });
  const service = createOutboxPublisherService({
    store,
    publisher: async () => undefined,
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    clock: () => '2026-08-02T00:00:00.000Z',
  });

  const [result] = await service.publishPending();
  assert.equal(result.status, 'acknowledgement-failed');
  assert.equal(result.delivered, true);
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, 'DATABASE_UNAVAILABLE');
  assert.equal(store.calls.retries.length, 0);
  assert.equal(store.calls.deadLetters.length, 0);
});
