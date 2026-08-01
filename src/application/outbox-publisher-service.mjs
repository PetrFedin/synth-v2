import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';

const DEFAULT_BATCH_LIMIT = 25;
const MAX_BATCH_LIMIT = 100;
const DEFAULT_PARALLELISM = 4;
const MAX_PARALLELISM = 16;
const DEFAULT_LEASE_MS = 300_000;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 10;

export function createOutboxPublisherService({
  store,
  publisher,
  clock = () => new Date().toISOString(),
  workerId = defaultWorkerId(),
  nextClaimToken = () => `outbox-claim:${randomUUID()}`,
  leaseMs = DEFAULT_LEASE_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  invariant(store && typeof store.claimPending === 'function', 'OUTBOX_STORE_INVALID', 'Outbox publication store is required');
  invariant(typeof store.acknowledgePublished === 'function', 'OUTBOX_STORE_INVALID', 'Outbox store must acknowledge publication');
  invariant(typeof store.reschedule === 'function', 'OUTBOX_STORE_INVALID', 'Outbox store must reschedule failed publication');
  invariant(typeof store.deadLetter === 'function', 'OUTBOX_STORE_INVALID', 'Outbox store must dead-letter exhausted publication');
  const publish = resolvePublisher(publisher);
  invariant(typeof clock === 'function', 'OUTBOX_CLOCK_INVALID', 'Outbox clock is required');
  invariant(typeof workerId === 'string' && workerId.length >= 1 && workerId.length <= 160, 'OUTBOX_WORKER_ID_INVALID', 'Outbox worker id is invalid');
  invariant(typeof nextClaimToken === 'function', 'OUTBOX_CLAIM_TOKEN_FACTORY_INVALID', 'Outbox claim token factory is required');
  invariant(Number.isSafeInteger(leaseMs) && leaseMs >= 30_000 && leaseMs <= 3_600_000, 'OUTBOX_LEASE_MS_INVALID', 'Outbox lease must be between 30 seconds and one hour');
  invariant(Number.isSafeInteger(retryDelayMs) && retryDelayMs >= 100 && retryDelayMs <= 3_600_000, 'OUTBOX_RETRY_DELAY_INVALID', 'Outbox retry delay is invalid');
  invariant(Number.isSafeInteger(maxRetryDelayMs) && maxRetryDelayMs >= retryDelayMs && maxRetryDelayMs <= 86_400_000, 'OUTBOX_MAX_RETRY_DELAY_INVALID', 'Outbox maximum retry delay is invalid');
  invariant(Number.isSafeInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 100, 'OUTBOX_MAX_ATTEMPTS_INVALID', 'Outbox maximum attempts is invalid');

  return Object.freeze({
    async publishPending({ limit = DEFAULT_BATCH_LIMIT, parallelism = DEFAULT_PARALLELISM } = {}) {
      validateBatch({ limit, parallelism });
      const claimedAt = now();
      const claimToken = String(nextClaimToken()).trim();
      invariant(claimToken.length >= 1 && claimToken.length <= 160, 'OUTBOX_CLAIM_TOKEN_INVALID', 'Outbox claim token is invalid');
      const records = await store.claimPending({
        workerId,
        claimToken,
        claimedAt,
        leaseExpiresAt: addMilliseconds(claimedAt, leaseMs),
        limit,
      });
      if (!records.length) return Object.freeze([]);
      return processInAggregateOrder(records, parallelism, publishRecord);
    },

    listDeadLetters(options) {
      invariant(typeof store.listDeadLetters === 'function', 'OUTBOX_DEAD_LETTER_READER_UNAVAILABLE', 'Outbox dead-letter reader is unavailable');
      return store.listDeadLetters(options);
    },
  });

  async function publishRecord(record) {
    const event = record?.event;
    invariant(event?.id && event?.type, 'OUTBOX_EVENT_INVALID', 'Outbox publication record requires an event');
    const ownership = {
      eventId: event.id,
      workerId: record.workerId ?? workerId,
      claimToken: record.claimToken,
    };

    try {
      await publish(event);
      const publishedAt = now();
      const acknowledged = await store.acknowledgePublished({ ...ownership, publishedAt });
      if (!acknowledged) {
        return Object.freeze({
          eventId: event.id,
          eventType: event.type,
          aggregateId: event.aggregateId ?? null,
          attemptCount: record.attemptCount,
          status: 'lease-lost',
          delivered: true,
          retryable: true,
          errorCode: 'OUTBOX_ACKNOWLEDGEMENT_LOST',
        });
      }
      return Object.freeze({
        eventId: event.id,
        eventType: event.type,
        aggregateId: event.aggregateId ?? null,
        attemptCount: record.attemptCount,
        status: 'published',
        delivered: true,
        retryable: false,
        publishedAt,
      });
    } catch (error) {
      const errorCode = publicationErrorCode(error);
      const terminal = error?.retryable === false || record.attemptCount >= maxAttempts;
      if (terminal) {
        const failedAt = now();
        const checkpointed = await store.deadLetter({ ...ownership, errorCode, failedAt });
        return Object.freeze({
          eventId: event.id,
          eventType: event.type,
          aggregateId: event.aggregateId ?? null,
          attemptCount: record.attemptCount,
          status: checkpointed ? 'dead-letter' : 'lease-lost',
          delivered: false,
          retryable: !checkpointed,
          checkpointed,
          errorCode,
          failedAt,
        });
      }

      const failedAt = now();
      const retryAt = addMilliseconds(failedAt, retryDelay(record.attemptCount));
      const rescheduled = await store.reschedule({ ...ownership, errorCode, retryAt });
      return Object.freeze({
        eventId: event.id,
        eventType: event.type,
        aggregateId: event.aggregateId ?? null,
        attemptCount: record.attemptCount,
        status: rescheduled ? 'failed' : 'lease-lost',
        delivered: false,
        retryable: true,
        rescheduled,
        errorCode,
        retryAt,
      });
    }
  }

  function retryDelay(attemptCount) {
    const exponent = Math.max(0, Math.min(30, Number(attemptCount || 1) - 1));
    return Math.min(maxRetryDelayMs, retryDelayMs * (2 ** exponent));
  }

  function now() {
    const value = clock();
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    invariant(Number.isFinite(timestamp), 'OUTBOX_CLOCK_INVALID', 'Outbox clock returned an invalid timestamp');
    return new Date(timestamp).toISOString();
  }
}

function resolvePublisher(publisher) {
  if (typeof publisher === 'function') return publisher;
  invariant(publisher && typeof publisher.publish === 'function', 'OUTBOX_PUBLISHER_INVALID', 'Outbox publisher must expose publish(event)');
  return publisher.publish.bind(publisher);
}

async function processInAggregateOrder(records, parallelism, processRecord) {
  const lanes = [];
  const byAggregate = new Map();
  records.forEach((record, index) => {
    const key = String(record?.event?.aggregateId ?? record?.event?.id ?? index);
    let lane = byAggregate.get(key);
    if (!lane) {
      lane = [];
      byAggregate.set(key, lane);
      lanes.push(lane);
    }
    lane.push({ record, index });
  });

  const results = new Array(records.length);
  let nextLane = 0;
  async function runWorker() {
    while (nextLane < lanes.length) {
      const lane = lanes[nextLane];
      nextLane += 1;
      for (const entry of lane) results[entry.index] = await processRecord(entry.record);
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallelism, lanes.length) }, () => runWorker()));
  return Object.freeze(results);
}

function validateBatch({ limit, parallelism }) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_BATCH_LIMIT, 'OUTBOX_BATCH_LIMIT_INVALID', `Outbox batch limit must be an integer from 1 to ${MAX_BATCH_LIMIT}`);
  invariant(Number.isSafeInteger(parallelism) && parallelism >= 1 && parallelism <= MAX_PARALLELISM, 'OUTBOX_PARALLELISM_INVALID', `Outbox parallelism must be an integer from 1 to ${MAX_PARALLELISM}`);
}

function publicationErrorCode(error) {
  const candidate = typeof error?.code === 'string' ? error.code.trim() : '';
  return candidate.length >= 1 && candidate.length <= 160 ? candidate : 'OUTBOX_PUBLISH_FAILED';
}

function addMilliseconds(timestamp, milliseconds) {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function defaultWorkerId() {
  return `outbox-worker:${randomUUID()}`;
}
