import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const MAX_BATCH_LIMIT = 1_000;
const MAX_DEAD_LETTER_LIMIT = 1_000;

export function createPostgresOutboxPublicationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    async claimPending({ workerId, claimToken, claimedAt, leaseExpiresAt, limit }) {
      validateClaim({ workerId, claimToken, claimedAt, leaseExpiresAt, limit });
      return withPostgresTransaction(pool, async (client) => {
        const result = await client.query(
          `WITH candidates AS MATERIALIZED (
             SELECT source.id
               FROM outbox_events AS source
              WHERE source.status = 'pending'
                AND NOT EXISTS (
                      SELECT 1
                        FROM outbox_publication_claims AS existing_claim
                       WHERE existing_claim.event_id = source.id
                         AND (
                           existing_claim.lease_expires_at > $2
                           OR existing_claim.next_attempt_at > $2
                         )
                    )
              ORDER BY source.event->>'occurredAt', source.id
              LIMIT $5
              FOR UPDATE OF source SKIP LOCKED
           ), claimed AS (
             INSERT INTO outbox_publication_claims
               (event_id, worker_id, claim_token, claimed_at, lease_expires_at, next_attempt_at, attempt_count, last_error_code)
             SELECT candidate.id, $1, $4, $2, $3, $2, 1, NULL
               FROM candidates AS candidate
             ON CONFLICT (event_id) DO UPDATE SET
               worker_id = EXCLUDED.worker_id,
               claim_token = EXCLUDED.claim_token,
               claimed_at = EXCLUDED.claimed_at,
               lease_expires_at = EXCLUDED.lease_expires_at,
               next_attempt_at = EXCLUDED.next_attempt_at,
               attempt_count = outbox_publication_claims.attempt_count + 1,
               last_error_code = NULL
             WHERE outbox_publication_claims.lease_expires_at <= $2
               AND outbox_publication_claims.next_attempt_at <= $2
             RETURNING event_id, worker_id, claim_token, attempt_count
           )
           SELECT source.event,
                  source.status,
                  source.published_at,
                  claimed.worker_id,
                  claimed.claim_token,
                  claimed.attempt_count
             FROM claimed
             JOIN outbox_events AS source ON source.id = claimed.event_id
            ORDER BY source.event->>'occurredAt', source.id`,
          [workerId, claimedAt, leaseExpiresAt, claimToken, limit],
        );
        return Object.freeze(result.rows.map(publicationRecordFromRow));
      });
    },

    async acknowledgePublished({ eventId, workerId, claimToken, publishedAt }) {
      validateOwnership({ eventId, workerId, claimToken });
      invariant(isTimestamp(publishedAt), 'OUTBOX_PUBLISHED_AT_INVALID', 'Outbox publication timestamp is invalid');
      const result = await pool.query(
        `WITH owned AS (
           DELETE FROM outbox_publication_claims
            WHERE event_id = $1
              AND worker_id = $2
              AND claim_token = $3
            RETURNING event_id
         ), updated AS (
           UPDATE outbox_events AS source
              SET status = 'published',
                  published_at = $4
             FROM owned
            WHERE source.id = owned.event_id
              AND source.status = 'pending'
            RETURNING source.id
         )
         SELECT id FROM updated`,
        [eventId, workerId, claimToken, publishedAt],
      );
      return result.rowCount === 1;
    },

    async reschedule({ eventId, workerId, claimToken, errorCode, retryAt }) {
      validateOwnership({ eventId, workerId, claimToken });
      invariant(typeof errorCode === 'string' && errorCode.length >= 1 && errorCode.length <= 160, 'OUTBOX_FAILURE_CODE_INVALID', 'Outbox publication failure code is invalid');
      invariant(isTimestamp(retryAt), 'OUTBOX_RETRY_AT_INVALID', 'Outbox retry timestamp is invalid');
      const result = await pool.query(
        `UPDATE outbox_publication_claims
            SET lease_expires_at = $5,
                next_attempt_at = $5,
                last_error_code = $4
          WHERE event_id = $1
            AND worker_id = $2
            AND claim_token = $3
            AND $5 > claimed_at`,
        [eventId, workerId, claimToken, errorCode, retryAt],
      );
      return result.rowCount === 1;
    },

    async deadLetter({ eventId, workerId, claimToken, errorCode, failedAt }) {
      validateOwnership({ eventId, workerId, claimToken });
      invariant(typeof errorCode === 'string' && errorCode.length >= 1 && errorCode.length <= 160, 'OUTBOX_FAILURE_CODE_INVALID', 'Outbox publication failure code is invalid');
      invariant(isTimestamp(failedAt), 'OUTBOX_FAILED_AT_INVALID', 'Outbox dead-letter timestamp is invalid');
      return withPostgresTransaction(pool, async (client) => {
        const result = await client.query(
          `WITH owned AS (
             DELETE FROM outbox_publication_claims
              WHERE event_id = $1
                AND worker_id = $2
                AND claim_token = $3
              RETURNING event_id, attempt_count
           ), updated AS (
             UPDATE outbox_events AS source
                SET status = 'dead-letter',
                    published_at = NULL
               FROM owned
              WHERE source.id = owned.event_id
                AND source.status = 'pending'
              RETURNING source.id,
                        source.event_type,
                        source.aggregate_id,
                        source.event,
                        owned.attempt_count
           )
           INSERT INTO outbox_dead_letters
             (event_id, event_type, aggregate_id, attempt_count, error_code, failed_at, event)
           SELECT id, event_type, aggregate_id, attempt_count, $4, $5, event
             FROM updated
           ON CONFLICT (event_id) DO NOTHING
           RETURNING event_id`,
          [eventId, workerId, claimToken, errorCode, failedAt],
        );
        return result.rowCount === 1;
      });
    },

    async listDeadLetters({ limit = 100 } = {}) {
      invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_DEAD_LETTER_LIMIT, 'OUTBOX_DEAD_LETTER_LIMIT_INVALID', `Dead-letter limit must be an integer from 1 to ${MAX_DEAD_LETTER_LIMIT}`);
      const result = await pool.query(
        `SELECT event_id, event_type, aggregate_id, attempt_count, error_code, failed_at, event
           FROM outbox_dead_letters
          ORDER BY failed_at DESC, event_id DESC
          LIMIT $1`,
        [limit],
      );
      return Object.freeze(result.rows.map(deadLetterFromRow));
    },
  });
}

function validateClaim({ workerId, claimToken, claimedAt, leaseExpiresAt, limit }) {
  invariant(typeof workerId === 'string' && workerId.length >= 1 && workerId.length <= 160, 'OUTBOX_WORKER_ID_INVALID', 'Outbox worker id is invalid');
  invariant(typeof claimToken === 'string' && claimToken.length >= 1 && claimToken.length <= 160, 'OUTBOX_CLAIM_TOKEN_INVALID', 'Outbox claim token is invalid');
  invariant(isTimestamp(claimedAt), 'OUTBOX_CLAIMED_AT_INVALID', 'Outbox claim timestamp is invalid');
  invariant(isTimestamp(leaseExpiresAt), 'OUTBOX_LEASE_EXPIRES_AT_INVALID', 'Outbox lease timestamp is invalid');
  invariant(Date.parse(leaseExpiresAt) > Date.parse(claimedAt), 'OUTBOX_LEASE_INVALID', 'Outbox lease must expire after it is claimed');
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_BATCH_LIMIT, 'OUTBOX_BATCH_LIMIT_INVALID', `Outbox batch limit must be an integer from 1 to ${MAX_BATCH_LIMIT}`);
}

function validateOwnership({ eventId, workerId, claimToken }) {
  invariant(typeof eventId === 'string' && eventId.length >= 1 && eventId.length <= 160, 'OUTBOX_EVENT_ID_INVALID', 'Outbox event id is invalid');
  invariant(typeof workerId === 'string' && workerId.length >= 1 && workerId.length <= 160, 'OUTBOX_WORKER_ID_INVALID', 'Outbox worker id is invalid');
  invariant(typeof claimToken === 'string' && claimToken.length >= 1 && claimToken.length <= 160, 'OUTBOX_CLAIM_TOKEN_INVALID', 'Outbox claim token is invalid');
}

function publicationRecordFromRow(row) {
  return Object.freeze({
    event: row.event,
    status: row.status,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at ?? null,
    workerId: row.worker_id,
    claimToken: row.claim_token,
    attemptCount: Number(row.attempt_count),
  });
}

function deadLetterFromRow(row) {
  return Object.freeze({
    eventId: row.event_id,
    eventType: row.event_type,
    aggregateId: row.aggregate_id,
    attemptCount: Number(row.attempt_count),
    errorCode: row.error_code,
    failedAt: row.failed_at?.toISOString?.() ?? row.failed_at,
    event: row.event,
  });
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
