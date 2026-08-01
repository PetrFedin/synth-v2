import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const MAX_BATCH_LIMIT = 1_000;
const MAX_DEAD_LETTER_LIMIT = 1_000;
const MAX_RECOVERY_REASON_LENGTH = 500;

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
           ), recorded AS (
             INSERT INTO outbox_dead_letters
               (event_id, event_type, aggregate_id, attempt_count, error_code, failed_at, event)
             SELECT id, event_type, aggregate_id, attempt_count, $4, $5, event
               FROM updated
             ON CONFLICT (event_id) DO UPDATE SET
               event_type = EXCLUDED.event_type,
               aggregate_id = EXCLUDED.aggregate_id,
               attempt_count = EXCLUDED.attempt_count,
               error_code = EXCLUDED.error_code,
               failed_at = EXCLUDED.failed_at,
               event = EXCLUDED.event
             RETURNING event_id, attempt_count, error_code, failed_at, event
           ), audited AS (
             INSERT INTO outbox_dead_letter_audit
               (event_id, action, attempt_count, error_code, actor_id, reason, occurred_at, event)
             SELECT event_id, 'dead-lettered', attempt_count, error_code, NULL, NULL, failed_at, event
               FROM recorded
             RETURNING event_id
           )
           SELECT event_id FROM audited`,
          [eventId, workerId, claimToken, errorCode, failedAt],
        );
        return result.rowCount === 1;
      });
    },

    async requeueDeadLetter({ eventId, actorId, reason, requeuedAt }) {
      const recovery = validateRecovery({ eventId, actorId, reason, requeuedAt });
      return withPostgresTransaction(pool, async (client) => {
        const selected = await client.query(
          `SELECT dead_letter.event_id,
                  dead_letter.attempt_count,
                  dead_letter.error_code,
                  dead_letter.event
             FROM outbox_dead_letters AS dead_letter
             JOIN outbox_events AS source ON source.id = dead_letter.event_id
            WHERE dead_letter.event_id = $1
              AND source.status = 'dead-letter'
            FOR UPDATE OF dead_letter, source`,
          [recovery.eventId],
        );
        const current = selected.rows[0];
        if (!current) {
          return Object.freeze({ requeued: false, eventId: recovery.eventId });
        }

        await client.query('DELETE FROM outbox_publication_claims WHERE event_id = $1', [recovery.eventId]);
        const updated = await client.query(
          `UPDATE outbox_events
              SET status = 'pending',
                  published_at = NULL
            WHERE id = $1
              AND status = 'dead-letter'`,
          [recovery.eventId],
        );
        invariant(updated.rowCount === 1, 'OUTBOX_DEAD_LETTER_STATE_CONFLICT', 'Dead-letter event changed during recovery', { eventId: recovery.eventId });

        const removed = await client.query('DELETE FROM outbox_dead_letters WHERE event_id = $1', [recovery.eventId]);
        invariant(removed.rowCount === 1, 'OUTBOX_DEAD_LETTER_STATE_CONFLICT', 'Dead-letter record changed during recovery', { eventId: recovery.eventId });

        await client.query(
          `INSERT INTO outbox_dead_letter_audit
             (event_id, action, attempt_count, error_code, actor_id, reason, occurred_at, event)
           VALUES ($1, 'requeued', $2, $3, $4, $5, $6, $7)`,
          [
            recovery.eventId,
            Number(current.attempt_count),
            current.error_code,
            recovery.actorId,
            recovery.reason,
            recovery.requeuedAt,
            current.event,
          ],
        );

        return Object.freeze({
          requeued: true,
          eventId: recovery.eventId,
          actorId: recovery.actorId,
          reason: recovery.reason,
          requeuedAt: recovery.requeuedAt,
          previousAttemptCount: Number(current.attempt_count),
          previousErrorCode: current.error_code,
        });
      });
    },

    async listDeadLetters({ limit = 100 } = {}) {
      validateListLimit(limit);
      const result = await pool.query(
        `SELECT event_id, event_type, aggregate_id, attempt_count, error_code, failed_at, event
           FROM outbox_dead_letters
          ORDER BY failed_at DESC, event_id DESC
          LIMIT $1`,
        [limit],
      );
      return Object.freeze(result.rows.map(deadLetterFromRow));
    },

    async listDeadLetterAudit({ eventId, limit = 100 } = {}) {
      validateListLimit(limit);
      if (eventId !== undefined) validateEventId(eventId);
      const result = await pool.query(
        `SELECT id, event_id, action, attempt_count, error_code, actor_id, reason, occurred_at, event
           FROM outbox_dead_letter_audit
          WHERE ($1::text IS NULL OR event_id = $1)
          ORDER BY occurred_at DESC, id DESC
          LIMIT $2`,
        [eventId ?? null, limit],
      );
      return Object.freeze(result.rows.map(deadLetterAuditFromRow));
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
  validateEventId(eventId);
  invariant(typeof workerId === 'string' && workerId.length >= 1 && workerId.length <= 160, 'OUTBOX_WORKER_ID_INVALID', 'Outbox worker id is invalid');
  invariant(typeof claimToken === 'string' && claimToken.length >= 1 && claimToken.length <= 160, 'OUTBOX_CLAIM_TOKEN_INVALID', 'Outbox claim token is invalid');
}

function validateRecovery({ eventId, actorId, reason, requeuedAt }) {
  validateEventId(eventId);
  invariant(typeof actorId === 'string' && actorId === actorId.trim() && actorId.length >= 1 && actorId.length <= 160, 'OUTBOX_RECOVERY_ACTOR_INVALID', 'Outbox recovery actor id is invalid');
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  invariant(normalizedReason.length >= 1 && normalizedReason.length <= MAX_RECOVERY_REASON_LENGTH, 'OUTBOX_RECOVERY_REASON_INVALID', `Outbox recovery reason must contain from 1 to ${MAX_RECOVERY_REASON_LENGTH} characters`);
  invariant(isTimestamp(requeuedAt), 'OUTBOX_REQUEUED_AT_INVALID', 'Outbox recovery timestamp is invalid');
  return Object.freeze({ eventId, actorId, reason: normalizedReason, requeuedAt: new Date(Date.parse(requeuedAt)).toISOString() });
}

function validateEventId(eventId) {
  invariant(typeof eventId === 'string' && eventId === eventId.trim() && eventId.length >= 1 && eventId.length <= 160, 'OUTBOX_EVENT_ID_INVALID', 'Outbox event id is invalid');
}

function validateListLimit(limit) {
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_DEAD_LETTER_LIMIT, 'OUTBOX_DEAD_LETTER_LIMIT_INVALID', `Dead-letter limit must be an integer from 1 to ${MAX_DEAD_LETTER_LIMIT}`);
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

function deadLetterAuditFromRow(row) {
  return Object.freeze({
    id: Number(row.id),
    eventId: row.event_id,
    action: row.action,
    attemptCount: Number(row.attempt_count),
    errorCode: row.error_code,
    actorId: row.actor_id ?? null,
    reason: row.reason ?? null,
    occurredAt: row.occurred_at?.toISOString?.() ?? row.occurred_at,
    event: row.event,
  });
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
