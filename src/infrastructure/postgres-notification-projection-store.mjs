import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const MAX_BATCH_LIMIT = 1000;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;
const MAX_PAGE_LIMIT = 200;

export function createPostgresNotificationProjectionStore({ pool }) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  function transaction(work) {
    return withPostgresTransaction(pool, work, { createView: transactionView });
  }

  return Object.freeze({
    transaction,
    async claimUnprojectedOutbox({ workerId, claimedAt, leaseExpiresAt, limit }) {
      validateClaim({ workerId, claimedAt, leaseExpiresAt, limit });
      return withPostgresTransaction(pool, async (client) => {
        const result = await client.query(
          `WITH candidates AS MATERIALIZED (
             SELECT source.id
               FROM outbox_events AS source
              WHERE NOT EXISTS (
                      SELECT 1
                        FROM notification_projections AS projected
                       WHERE projected.event_id = source.id
                    )
                AND NOT EXISTS (
                      SELECT 1
                        FROM notification_projection_claims AS active_claim
                       WHERE active_claim.event_id = source.id
                         AND active_claim.lease_expires_at > $2
                    )
              ORDER BY source.event->>'occurredAt', source.id
              LIMIT $4
              FOR UPDATE OF source SKIP LOCKED
           ), claimed AS (
             INSERT INTO notification_projection_claims
               (event_id, worker_id, claimed_at, lease_expires_at, attempt_count, last_error_code)
             SELECT candidate.id, $1, $2, $3, 1, NULL
               FROM candidates AS candidate
             ON CONFLICT (event_id) DO UPDATE SET
               worker_id = EXCLUDED.worker_id,
               claimed_at = EXCLUDED.claimed_at,
               lease_expires_at = EXCLUDED.lease_expires_at,
               attempt_count = notification_projection_claims.attempt_count + 1,
               last_error_code = NULL
             WHERE notification_projection_claims.lease_expires_at <= $2
             RETURNING event_id, attempt_count
           )
           SELECT source.event, source.status, source.published_at, claimed.attempt_count
             FROM claimed
             JOIN outbox_events AS source ON source.id = claimed.event_id
            ORDER BY source.event->>'occurredAt', source.id`,
          [workerId, claimedAt, leaseExpiresAt, limit],
        );
        return Object.freeze(result.rows.map(outboxRecordFromRow));
      });
    },
    async failProjectionClaim({ eventId, workerId, errorCode, retryAt }) {
      invariant(typeof eventId === 'string' && eventId.length > 0, 'NOTIFICATION_EVENT_INVALID', 'Projection claim requires an event id');
      invariant(typeof workerId === 'string' && workerId.length > 0, 'NOTIFICATION_WORKER_ID_INVALID', 'Projection worker id is required');
      invariant(typeof errorCode === 'string' && errorCode.length > 0, 'NOTIFICATION_FAILURE_CODE_INVALID', 'Projection failure code is required');
      invariant(isTimestamp(retryAt), 'NOTIFICATION_RETRY_AT_INVALID', 'Projection retry timestamp is invalid');
      const result = await pool.query(
        `UPDATE notification_projection_claims
            SET lease_expires_at = $4,
                last_error_code = $3
          WHERE event_id = $1
            AND worker_id = $2`,
        [eventId, workerId, errorCode, retryAt],
      );
      return result.rowCount === 1;
    },
    async readUnprojectedOutbox(limit) {
      validateBatchLimit(limit);
      const result = await pool.query(
        `SELECT source.event, source.status, source.published_at
           FROM outbox_events AS source
          WHERE NOT EXISTS (
              SELECT 1
                FROM notification_projections AS projected
               WHERE projected.event_id = source.id
            )
          ORDER BY source.event->>'occurredAt', source.id
          LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => outboxRecordFromRow({ ...row, attempt_count: 1 }));
    },
    async listForOrganisations(organisationIds, { limit = DEFAULT_LIST_LIMIT } = {}) {
      invariant(Array.isArray(organisationIds), 'NOTIFICATION_ORGANISATIONS_INVALID', 'Notification organisation ids must be an array');
      invariant(
        Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_LIST_LIMIT,
        'NOTIFICATION_LIMIT_INVALID',
        `Notification limit must be an integer from 1 to ${MAX_LIST_LIMIT}`,
        { min: 1, max: MAX_LIST_LIMIT },
      );
      const ids = normalizeOrganisationIds(organisationIds);
      if (!ids.length) return Object.freeze([]);
      const result = await pool.query(
        `SELECT payload
           FROM notifications
          WHERE recipient_organisation_id = ANY($1::text[])
          ORDER BY (status = 'unread') DESC,
                   created_at DESC,
                   id DESC
          LIMIT $2`,
        [ids, limit],
      );
      return Object.freeze(result.rows.map((row) => row.payload));
    },
    async pageForOrganisations(organisationIds, { limit, after } = {}) {
      invariant(Array.isArray(organisationIds), 'NOTIFICATION_ORGANISATIONS_INVALID', 'Notification organisation ids must be an array');
      invariant(
        Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT,
        'NOTIFICATION_PAGE_LIMIT_INVALID',
        `Notification page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`,
        { min: 1, max: MAX_PAGE_LIMIT },
      );
      validatePagePosition(after);
      const ids = normalizeOrganisationIds(organisationIds);
      if (!ids.length) return emptyPage();
      const fetchLimit = limit + 1;
      const result = after
        ? await pool.query(
            `SELECT payload, created_at, id
               FROM notifications
              WHERE recipient_organisation_id = ANY($1::text[])
                AND (created_at, id) < ($2::timestamptz, $3::text)
              ORDER BY created_at DESC, id DESC
              LIMIT $4`,
            [ids, after.createdAt, after.id, fetchLimit],
          )
        : await pool.query(
            `SELECT payload, created_at, id
               FROM notifications
              WHERE recipient_organisation_id = ANY($1::text[])
              ORDER BY created_at DESC, id DESC
              LIMIT $2`,
            [ids, fetchLimit],
          );
      const hasMore = result.rows.length > limit;
      const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
      return Object.freeze({
        items: Object.freeze(rows.map((row) => row.payload)),
        hasMore,
      });
    },
    recordProjectionFailure({ event, errorCode, failedAt, attemptCount = 1 }) {
      invariant(event?.id && event?.type, 'NOTIFICATION_EVENT_INVALID', 'Projection failure requires an event');
      invariant(typeof errorCode === 'string' && errorCode.length > 0, 'NOTIFICATION_FAILURE_CODE_INVALID', 'Projection failure code is required');
      invariant(isTimestamp(failedAt), 'NOTIFICATION_FAILED_AT_INVALID', 'Projection failure timestamp is invalid');
      invariant(Number.isSafeInteger(attemptCount) && attemptCount >= 1, 'NOTIFICATION_ATTEMPT_COUNT_INVALID', 'Projection attempt count must be positive');
      return transaction(async (tx) => {
        if (await tx.hasProjection(event.id)) {
          await tx.deleteProjectionClaim(event.id);
          return false;
        }
        await tx.insertProjection(Object.freeze({
          eventId: event.id,
          eventType: event.type,
          status: 'failed',
          errorCode,
          attemptCount,
          notificationIds: Object.freeze([]),
          projectedAt: failedAt,
        }));
        await tx.deleteProjectionClaim(event.id);
        return true;
      });
    },
    async snapshot() {
      const [notifications, projections, commands] = await Promise.all([
        payloadRows(pool, 'notifications'),
        payloadRows(pool, 'notification_projections'),
        commandRows(pool),
      ]);
      return Object.freeze({ notifications, projections, commands });
    },
  });
}

function transactionView(client) {
  return Object.freeze({
    async getNotification(id) {
      const result = await client.query('SELECT payload FROM notifications WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload;
    },
    getNotificationByDedupeKey: (dedupeKey) => getPayload(client, 'notifications', 'dedupe_key', dedupeKey),
    async getActiveMembership(organisationId, actorId) {
      const result = await client.query(
        `SELECT payload
           FROM memberships
          WHERE organisation_id = $1
            AND user_id = $2
            AND status = 'active'
          LIMIT 1
          FOR SHARE`,
        [organisationId, actorId],
      );
      return result.rows[0]?.payload;
    },
    async insertNotification(notification) {
      try {
        await client.query(
          `INSERT INTO notifications
            (id, dedupe_key, source_event_id, recipient_organisation_id, type, status, version, created_at, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            notification.id,
            notification.dedupeKey,
            notification.sourceEventId,
            notification.recipientOrganisationId,
            notification.type,
            notification.status,
            notification.version,
            notification.createdAt,
            JSON.stringify(notification),
          ],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'NOTIFICATION_DEDUPE_CONFLICT', 'Notification already projected', { dedupeKey: notification.dedupeKey });
        throw error;
      }
    },
    async saveNotification(notification, expectedVersion) {
      invariant(notification.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE notifications
         SET status = $1, version = $2, payload = $3::jsonb
         WHERE id = $4 AND version = $5`,
        [notification.status, notification.version, JSON.stringify(notification), notification.id, expectedVersion],
      );
      invariant(result.rowCount === 1, 'NOTIFICATION_CONCURRENCY_CONFLICT', 'Notification version conflict', {
        notificationId: notification.id,
        expectedVersion,
      });
    },
    async hasProjection(eventId) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`notification-projection:${eventId}`],
      );
      const result = await client.query('SELECT 1 FROM notification_projections WHERE event_id = $1', [eventId]);
      return result.rowCount > 0;
    },
    async insertProjection(projection) {
      try {
        await client.query(
          `INSERT INTO notification_projections (event_id, event_type, payload)
           VALUES ($1, $2, $3::jsonb)`,
          [projection.eventId, projection.eventType, JSON.stringify(projection)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'NOTIFICATION_PROJECTION_EXISTS', 'Event is already projected', { eventId: projection.eventId });
        throw error;
      }
    },
    async deleteProjectionClaim(eventId) {
      await client.query('DELETE FROM notification_projection_claims WHERE event_id = $1', [eventId]);
    },
    async getCommand(id) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`notification-command:${id}`],
      );
      const result = await client.query(
        'SELECT id, fingerprint, actor_id, result, completed_at FROM notification_commands WHERE id = $1',
        [id],
      );
      return commandFromRow(result.rows[0]);
    },
    async insertCommand(command) {
      try {
        await client.query(
          `INSERT INTO notification_commands (id, fingerprint, actor_id, result, completed_at)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [command.id, command.fingerprint, command.actorId, JSON.stringify(command.result), command.completedAt],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: command.id });
        throw error;
      }
    },
  });
}

function validateClaim({ workerId, claimedAt, leaseExpiresAt, limit }) {
  invariant(typeof workerId === 'string' && workerId.length > 0, 'NOTIFICATION_WORKER_ID_INVALID', 'Projection worker id is required');
  invariant(isTimestamp(claimedAt), 'NOTIFICATION_CLAIMED_AT_INVALID', 'Projection claim timestamp is invalid');
  invariant(isTimestamp(leaseExpiresAt), 'NOTIFICATION_LEASE_EXPIRES_AT_INVALID', 'Projection lease timestamp is invalid');
  invariant(Date.parse(leaseExpiresAt) > Date.parse(claimedAt), 'NOTIFICATION_LEASE_INVALID', 'Projection lease must expire after it is claimed');
  validateBatchLimit(limit);
}

function validateBatchLimit(limit) {
  invariant(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_BATCH_LIMIT,
    'NOTIFICATION_BATCH_LIMIT_INVALID',
    `Notification batch limit must be an integer from 1 to ${MAX_BATCH_LIMIT}`,
  );
}

function validatePagePosition(after) {
  invariant(
    after === undefined || after === null || (
      typeof after === 'object'
      && typeof after.createdAt === 'string'
      && Number.isFinite(Date.parse(after.createdAt))
      && typeof after.id === 'string'
      && after.id.length >= 1
      && after.id.length <= 160
    ),
    'NOTIFICATION_CURSOR_INVALID',
    'Notification page position is invalid',
  );
}

function normalizeOrganisationIds(organisationIds) {
  return [...new Set(organisationIds.filter((id) => typeof id === 'string' && id.length > 0))];
}

function emptyPage() {
  return Object.freeze({ items: Object.freeze([]), hasMore: false });
}

function outboxRecordFromRow(row) {
  return Object.freeze({
    event: row.event,
    status: row.status,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at ?? null,
    attemptCount: Number(row.attempt_count ?? 1),
  });
}

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

async function getPayload(queryable, table, column, value) {
  const result = await queryable.query(`SELECT payload FROM ${table} WHERE ${column} = $1`, [value]);
  return result.rows[0]?.payload;
}

async function payloadRows(queryable, table) {
  const orderColumn = table === 'notification_projections' ? 'event_id' : 'id';
  const result = await queryable.query(`SELECT payload FROM ${table} ORDER BY ${orderColumn}`);
  return result.rows.map((row) => row.payload);
}

async function commandRows(queryable) {
  const result = await queryable.query(
    'SELECT id, fingerprint, actor_id, result, completed_at FROM notification_commands ORDER BY id',
  );
  return result.rows.map(commandFromRow);
}

function commandFromRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    fingerprint: row.fingerprint,
    actorId: row.actor_id,
    result: row.result,
    completedAt: row.completed_at.toISOString?.() ?? row.completed_at,
  });
}
