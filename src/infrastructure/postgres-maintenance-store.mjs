import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const LOCK_NAME = 'syntha-v2-retention-maintenance';

export function createPostgresMaintenanceStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    async cleanup(cutoffs) {
      validateCutoffs(cutoffs);
      return withPostgresTransaction(pool, async (client) => {
        const lock = await client.query(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
          [LOCK_NAME],
        );
        if (!lock.rows[0]?.acquired) {
          return Object.freeze({ acquired: false, counts: Object.freeze({}) });
        }

        const counts = {};
        counts.commands = await deleteCount(client, 'DELETE FROM commands WHERE completed_at < $1', [cutoffs.commandsBefore]);
        counts.catalogCommands = await deleteCount(client, 'DELETE FROM catalog_commands WHERE completed_at < $1', [cutoffs.commandsBefore]);
        counts.notificationCommands = await deleteCount(client, 'DELETE FROM notification_commands WHERE completed_at < $1', [cutoffs.commandsBefore]);
        counts.commandRegistry = await deleteCount(
          client,
          `DELETE FROM command_registry AS registry
            WHERE registry.completed_at < $1
              AND NOT EXISTS (SELECT 1 FROM commands AS command WHERE command.id = registry.id)
              AND NOT EXISTS (SELECT 1 FROM catalog_commands AS command WHERE command.id = registry.id)
              AND NOT EXISTS (SELECT 1 FROM notification_commands AS command WHERE command.id = registry.id)`,
          [cutoffs.commandsBefore],
        );
        counts.authAudit = await deleteCount(client, 'DELETE FROM auth_login_audit WHERE occurred_at < $1', [cutoffs.authAuditBefore]);
        counts.loginThrottles = await deleteCount(
          client,
          `DELETE FROM auth_login_throttles
            WHERE updated_at < $1
              AND (blocked_until IS NULL OR blocked_until < $2)`,
          [cutoffs.throttlesBefore, cutoffs.now],
        );
        counts.authSessions = await deleteCount(
          client,
          `DELETE FROM auth_sessions
            WHERE expires_at <= $1
               OR (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_at < $2)`,
          [cutoffs.now, cutoffs.revokedSessionsBefore],
        );

        const wholesaleOutbox = await client.query(
          `WITH eligible AS MATERIALIZED (
             SELECT source.id
               FROM outbox_events AS source
              WHERE source.status = 'published'
                AND source.published_at IS NOT NULL
                AND source.published_at < $1
                AND EXISTS (
                  SELECT 1
                    FROM notification_projections AS projected
                   WHERE projected.event_id = source.id
                )
           ), deleted_projections AS (
             DELETE FROM notification_projections AS projected
              USING eligible
              WHERE projected.event_id = eligible.id
              RETURNING projected.event_id
           ), deleted_outbox AS (
             DELETE FROM outbox_events AS source
              USING eligible
              WHERE source.id = eligible.id
              RETURNING source.id
           )
           SELECT
             (SELECT count(*)::integer FROM deleted_projections) AS projections,
             (SELECT count(*)::integer FROM deleted_outbox) AS outbox`,
          [cutoffs.outboxBefore],
        );
        counts.notificationProjections = integer(wholesaleOutbox.rows[0]?.projections);
        counts.outboxEvents = integer(wholesaleOutbox.rows[0]?.outbox);

        const terminalOutbox = await client.query(
          `WITH terminal AS MATERIALIZED (
             SELECT source.id
               FROM outbox_events AS source
               JOIN outbox_dead_letters AS dead_letter ON dead_letter.event_id = source.id
              WHERE source.status = 'dead-letter'
                AND source.published_at IS NULL
                AND dead_letter.failed_at < $1
           ), deleted_projections AS (
             DELETE FROM notification_projections AS projected
              USING terminal
              WHERE projected.event_id = terminal.id
              RETURNING projected.event_id
           ), deleted_outbox AS (
             DELETE FROM outbox_events AS source
              USING terminal
              WHERE source.id = terminal.id
              RETURNING source.id
           )
           SELECT
             (SELECT count(*)::integer FROM deleted_projections) AS projections,
             (SELECT count(*)::integer FROM deleted_outbox) AS outbox`,
          [cutoffs.outboxBefore],
        );
        counts.deadLetterNotificationProjections = integer(terminalOutbox.rows[0]?.projections);
        counts.deadLetterOutboxEvents = integer(terminalOutbox.rows[0]?.outbox);
        counts.outboxDeadLetterAudit = await deleteCount(
          client,
          'DELETE FROM outbox_dead_letter_audit WHERE occurred_at < $1',
          [cutoffs.outboxBefore],
        );

        counts.catalogOutboxEvents = await deleteCount(
          client,
          `DELETE FROM catalog_outbox_events
            WHERE status = 'published'
              AND published_at IS NOT NULL
              AND published_at < $1`,
          [cutoffs.outboxBefore],
        );

        return Object.freeze({ acquired: true, counts: Object.freeze(counts) });
      });
    },
  });
}

async function deleteCount(client, sql, params) {
  const result = await client.query(sql, params);
  return integer(result.rowCount);
}

function validateCutoffs(cutoffs) {
  invariant(cutoffs && typeof cutoffs === 'object', 'MAINTENANCE_CUTOFFS_INVALID', 'Maintenance cutoffs are required');
  for (const field of ['now', 'commandsBefore', 'authAuditBefore', 'throttlesBefore', 'revokedSessionsBefore', 'outboxBefore']) {
    invariant(typeof cutoffs[field] === 'string' && Number.isFinite(Date.parse(cutoffs[field])), 'MAINTENANCE_CUTOFF_INVALID', 'Maintenance cutoff must be a valid timestamp', { field });
  }
}

function integer(value) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
