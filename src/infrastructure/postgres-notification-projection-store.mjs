import { invariant } from '../core/errors.mjs';

export function createPostgresNotificationProjectionStore({ pool }) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(transactionView(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    transaction,
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
    getNotification: (id) => getPayload(client, 'notifications', 'id', id),
    getNotificationByDedupeKey: (dedupeKey) => getPayload(client, 'notifications', 'dedupe_key', dedupeKey),
    async insertNotification(notification) {
      try {
        await client.query(
          `INSERT INTO notifications
            (id, dedupe_key, source_event_id, recipient_organisation_id, type, status, version, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
          [
            notification.id,
            notification.dedupeKey,
            notification.sourceEventId,
            notification.recipientOrganisationId,
            notification.type,
            notification.status,
            notification.version,
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
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventId]);
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
    async getCommand(id) {
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
