import { createHmac, timingSafeEqual } from 'node:crypto';
import { invariant } from '../core/errors.mjs';

const MIN_SECRET_BYTES = 32;
const MAX_EVENT_ID_LENGTH = 160;
const MAX_EVENT_TYPE_LENGTH = 160;
const TIMESTAMP_PATTERN = /^\d{10,11}$/;
const SIGNATURE_PATTERN = /^v1=[0-9a-f]{64}$/;

export function createHttpOutboxPublisher({
  endpoint,
  secret,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  clock = () => Date.now(),
  allowInsecureLocalhost = false,
} = {}) {
  const url = validateEndpoint(endpoint, allowInsecureLocalhost);
  invariant(typeof secret === 'string' && Buffer.byteLength(secret, 'utf8') >= MIN_SECRET_BYTES, 'OUTBOX_WEBHOOK_SECRET_INVALID', `Outbox webhook secret must contain at least ${MIN_SECRET_BYTES} bytes`);
  invariant(typeof fetchImpl === 'function', 'OUTBOX_WEBHOOK_FETCH_INVALID', 'Outbox webhook fetch implementation is required');
  invariant(Number.isSafeInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120_000, 'OUTBOX_WEBHOOK_TIMEOUT_INVALID', 'Outbox webhook timeout must be between 100ms and 120 seconds');
  invariant(typeof clock === 'function', 'OUTBOX_WEBHOOK_CLOCK_INVALID', 'Outbox webhook clock is required');

  return Object.freeze({
    endpoint: url.toString(),
    timeoutMs,
    async publish(event, { attemptCount = 1 } = {}) {
      validateEvent(event);
      invariant(Number.isSafeInteger(attemptCount) && attemptCount >= 1 && attemptCount <= 100, 'OUTBOX_ATTEMPT_COUNT_INVALID', 'Outbox publication attempt count is invalid');
      const timestamp = timestampSeconds(clock());
      const body = JSON.stringify(event);
      const signature = signPayload({ secret, timestamp, body });
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'user-agent': 'Syntha-V2-Outbox/1.0',
            'idempotency-key': event.id,
            'x-syntha-event-id': event.id,
            'x-syntha-event-type': event.type,
            'x-syntha-delivery-attempt': String(attemptCount),
            'x-syntha-timestamp': timestamp,
            'x-syntha-signature': signature,
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error?.code?.startsWith?.('OUTBOX_WEBHOOK_')) throw error;
        throw publisherError(
          error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'OUTBOX_WEBHOOK_TIMEOUT' : 'OUTBOX_WEBHOOK_NETWORK_ERROR',
          'Outbox webhook request failed',
          true,
          error,
        );
      }

      const status = response.status;
      await response.body?.cancel?.().catch(() => undefined);
      if (status >= 200 && status < 300) return Object.freeze({ status });

      const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
      const error = publisherError(`OUTBOX_WEBHOOK_HTTP_${status}`, `Outbox webhook rejected the event with HTTP ${status}`, retryable);
      const retryAfter = response.headers?.get?.('retry-after');
      if (retryAfter) error.retryAfter = retryAfter;
      throw error;
    },
  });
}

export function verifyOutboxSignature({ secret, timestamp, body, signature, toleranceSeconds = 300, now = Date.now() } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) return false;
  if (typeof timestamp !== 'string' || !TIMESTAMP_PATTERN.test(timestamp)) return false;
  if (typeof body !== 'string' || typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) return false;
  if (!Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 0) return false;
  const timestampSeconds = Number(timestamp);
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isSafeInteger(timestampSeconds) || !Number.isFinite(nowMs)) return false;
  const timestampMs = timestampSeconds * 1_000;
  if (!Number.isSafeInteger(timestampMs)) return false;
  if (Math.abs(nowMs - timestampMs) > toleranceSeconds * 1_000) return false;
  const expectedBytes = Buffer.from(signPayload({ secret, timestamp, body }), 'utf8');
  const actualBytes = Buffer.from(signature, 'utf8');
  return timingSafeEqual(expectedBytes, actualBytes);
}

function validateEndpoint(endpoint, allowInsecureLocalhost) {
  let url;
  try { url = new URL(endpoint); }
  catch { invariant(false, 'OUTBOX_WEBHOOK_URL_INVALID', 'Outbox webhook URL is invalid'); }
  invariant(!url.username && !url.password && !url.hash, 'OUTBOX_WEBHOOK_URL_INVALID', 'Outbox webhook URL must not contain credentials or a fragment');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  invariant(url.protocol === 'https:' || (allowInsecureLocalhost && local && url.protocol === 'http:'), 'OUTBOX_WEBHOOK_URL_INSECURE', 'Outbox webhook URL must use HTTPS');
  return url;
}

function validateEvent(event) {
  invariant(event && typeof event === 'object' && !Array.isArray(event), 'OUTBOX_EVENT_INVALID', 'Outbox event must be an object');
  invariant(typeof event.id === 'string' && event.id.length >= 1 && event.id.length <= MAX_EVENT_ID_LENGTH, 'OUTBOX_EVENT_INVALID', 'Outbox event id is invalid');
  invariant(typeof event.type === 'string' && event.type.length >= 1 && event.type.length <= MAX_EVENT_TYPE_LENGTH, 'OUTBOX_EVENT_INVALID', 'Outbox event type is invalid');
}

function timestampSeconds(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  invariant(Number.isFinite(milliseconds) && milliseconds >= 0, 'OUTBOX_WEBHOOK_CLOCK_INVALID', 'Outbox webhook clock returned an invalid timestamp');
  return String(Math.floor(milliseconds / 1_000));
}

function signPayload({ secret, timestamp, body }) {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`;
}

function publisherError(code, message, retryable, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.retryable = retryable;
  return error;
}
