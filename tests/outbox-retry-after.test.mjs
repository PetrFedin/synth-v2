import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxPublisherService } from '../src/application/outbox-publisher-service.mjs';

const failedAt = '2026-08-02T00:00:00.000Z';

function record(attemptCount = 1) {
  return Object.freeze({
    event: Object.freeze({
      id: 'event-1',
      type: 'order.created',
      aggregateId: 'order-1',
      occurredAt: failedAt,
      payload: Object.freeze({}),
    }),
    workerId: 'worker-1',
    claimToken: 'claim-1',
    attemptCount,
  });
}

function storeFor(current) {
  const retries = [];
  return {
    retries,
    async claimPending() { return [current]; },
    async acknowledgePublished() { return true; },
    async reschedule(input) { retries.push(input); return true; },
    async deadLetter() { return true; },
  };
}

function failingPublisher(retryAfter) {
  return async () => {
    const error = new Error('rate limited');
    error.code = 'OUTBOX_WEBHOOK_HTTP_429';
    error.retryable = true;
    error.retryAfter = retryAfter;
    throw error;
  };
}

test('numeric Retry-After extends exponential backoff without exceeding configured maximum', async () => {
  const store = storeFor(record());
  const service = createOutboxPublisherService({
    store,
    publisher: failingPublisher('120'),
    clock: () => failedAt,
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    retryDelayMs: 5_000,
    maxRetryDelayMs: 300_000,
  });

  const [result] = await service.publishPending();
  assert.equal(result.retryAfterApplied, true);
  assert.equal(result.retryDelayMs, 120_000);
  assert.equal(result.retryAt, '2026-08-02T00:02:00.000Z');
  assert.equal(store.retries[0].retryAt, result.retryAt);
});

test('HTTP-date Retry-After is honored and capped by the retry policy', async () => {
  const store = storeFor(record());
  const service = createOutboxPublisherService({
    store,
    publisher: failingPublisher('Sun, 02 Aug 2026 00:10:00 GMT'),
    clock: () => failedAt,
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    retryDelayMs: 5_000,
    maxRetryDelayMs: 60_000,
  });

  const [result] = await service.publishPending();
  assert.equal(result.retryAfterApplied, true);
  assert.equal(result.retryDelayMs, 60_000);
  assert.equal(result.retryAt, '2026-08-02T00:01:00.000Z');
});

test('malformed Retry-After falls back to exponential backoff', async () => {
  const store = storeFor(record(2));
  const service = createOutboxPublisherService({
    store,
    publisher: failingPublisher('not-a-retry-date'),
    clock: () => failedAt,
    workerId: 'worker-1',
    nextClaimToken: () => 'claim-1',
    retryDelayMs: 5_000,
    maxRetryDelayMs: 300_000,
  });

  const [result] = await service.publishPending();
  assert.equal(result.retryAfterApplied, false);
  assert.equal(result.retryDelayMs, 10_000);
  assert.equal(result.retryAt, '2026-08-02T00:00:10.000Z');
});
