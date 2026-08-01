import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpOutboxPublisher, verifyOutboxSignature } from '../src/infrastructure/http-outbox-publisher.mjs';

const secret = '0123456789abcdef0123456789abcdef';
const now = Date.parse('2026-08-02T00:00:00.000Z');
const event = Object.freeze({
  id: 'event-1',
  type: 'order.created',
  aggregateId: 'order-1',
  occurredAt: '2026-08-02T00:00:00.000Z',
  payload: Object.freeze({ total: 100 }),
});

test('HTTP publisher signs the exact body and sends idempotent delivery metadata', async () => {
  let request;
  const publisher = createHttpOutboxPublisher({
    endpoint: 'https://events.example.test/syntha',
    secret,
    clock: () => now,
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(null, { status: 204 });
    },
  });

  assert.deepEqual(await publisher.publish(event, { attemptCount: 3 }), { status: 204 });
  assert.equal(request.url, 'https://events.example.test/syntha');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.headers['idempotency-key'], 'event-1');
  assert.equal(request.init.headers['x-syntha-delivery-attempt'], '3');
  assert.equal(request.init.headers['x-syntha-timestamp'], String(Math.floor(now / 1_000)));
  assert.equal(verifyOutboxSignature({
    secret,
    timestamp: request.init.headers['x-syntha-timestamp'],
    body: request.init.body,
    signature: request.init.headers['x-syntha-signature'],
    now,
  }), true);
  assert.equal(verifyOutboxSignature({
    secret,
    timestamp: request.init.headers['x-syntha-timestamp'],
    body: `${request.init.body} `,
    signature: request.init.headers['x-syntha-signature'],
    now,
  }), false);
});

test('signature verification rejects stale replay attempts', () => {
  const timestamp = String(Math.floor(now / 1_000));
  const body = JSON.stringify(event);
  let signature;
  const publisher = createHttpOutboxPublisher({
    endpoint: 'https://events.example.test/syntha',
    secret,
    clock: () => now,
    fetchImpl: async (_url, init) => {
      signature = init.headers['x-syntha-signature'];
      return new Response(null, { status: 204 });
    },
  });
  return publisher.publish(event).then(() => {
    assert.equal(verifyOutboxSignature({ secret, timestamp, body, signature, now: now + 301_000 }), false);
  });
});

test('signature verification rejects malformed, oversized and millisecond inputs before comparison', async () => {
  let request;
  const publisher = createHttpOutboxPublisher({
    endpoint: 'https://events.example.test/syntha',
    secret,
    clock: () => now,
    fetchImpl: async (_url, init) => {
      request = init;
      return new Response(null, { status: 204 });
    },
  });
  await publisher.publish(event);
  const valid = {
    secret,
    timestamp: request.headers['x-syntha-timestamp'],
    body: request.body,
    signature: request.headers['x-syntha-signature'],
    now,
  };

  assert.equal(verifyOutboxSignature({ ...valid, timestamp: String(now) }), false);
  assert.equal(verifyOutboxSignature({ ...valid, signature: 'v1=not-hex' }), false);
  assert.equal(verifyOutboxSignature({ ...valid, signature: `v1=${'a'.repeat(65)}` }), false);
  assert.equal(verifyOutboxSignature({ ...valid, signature: `V1=${'a'.repeat(64)}` }), false);
  assert.equal(verifyOutboxSignature({ ...valid, toleranceSeconds: -1 }), false);
});

test('HTTP status determines retryability without exposing response content', async () => {
  for (const [status, retryable] of [[400, false], [429, true], [503, true]]) {
    const publisher = createHttpOutboxPublisher({
      endpoint: 'https://events.example.test/syntha',
      secret,
      fetchImpl: async () => new Response('sensitive upstream error', { status }),
    });
    await assert.rejects(
      () => publisher.publish(event),
      (error) => error.code === `OUTBOX_WEBHOOK_HTTP_${status}` && error.retryable === retryable && !error.message.includes('sensitive'),
    );
  }
});

test('publisher rejects weak secrets and insecure non-local endpoints', () => {
  assert.throws(
    () => createHttpOutboxPublisher({ endpoint: 'https://events.example.test', secret: 'short' }),
    (error) => error.code === 'OUTBOX_WEBHOOK_SECRET_INVALID',
  );
  assert.throws(
    () => createHttpOutboxPublisher({ endpoint: 'http://events.example.test', secret }),
    (error) => error.code === 'OUTBOX_WEBHOOK_URL_INSECURE',
  );
  assert.doesNotThrow(() => createHttpOutboxPublisher({
    endpoint: 'http://127.0.0.1:9999/events',
    secret,
    allowInsecureLocalhost: true,
    fetchImpl: async () => new Response(null, { status: 204 }),
  }));
});
