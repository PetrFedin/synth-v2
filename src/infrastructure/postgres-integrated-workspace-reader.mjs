import { invariant } from '../core/errors.mjs';
import { createPostgresWorkspaceReader } from './postgres-workspace-reader.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function createPostgresIntegratedWorkspaceReader({ pool }) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const base = createPostgresWorkspaceReader({ pool });
  return Object.freeze({
    readForActor: base.readForActor,
    pageForActor: base.pageForActor,
    readSupplementForActor(actorId, { limit = 200 } = {}) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 500, 'WORKSPACE_LIMIT_INVALID', 'Workspace limit must be an integer from 1 to 500');
      return withPostgresTransaction(pool, async (client) => {
        const membershipResult = await client.query(
          `SELECT organisation_id
             FROM memberships
            WHERE user_id = $1 AND status = 'active'
            ORDER BY organisation_id`,
          [actorId],
        );
        const organisationIds = [...new Set(membershipResult.rows.map((row) => row.organisation_id))];
        if (!organisationIds.length) return emptySupplement();

        const eventResult = await client.query(
          `SELECT DISTINCT e.payload
             FROM calendar_events e
             LEFT JOIN calendar_event_participants p ON p.event_id = e.id
            WHERE e.owner_organisation_id = ANY($1::text[])
               OR (e.visibility = 'trade' AND p.organisation_id = ANY($1::text[]))
            ORDER BY e.payload->>'startsAt' ASC NULLS LAST
            LIMIT $2`,
          [organisationIds, limit],
        );
        const threadResult = await client.query(
          `SELECT payload
             FROM collaboration_threads
            WHERE owner_organisation_id = ANY($1::text[])
            ORDER BY updated_at DESC, id
            LIMIT $2`,
          [organisationIds, limit],
        );
        const eventIds = eventResult.rows.map((row) => row.payload.id);
        const threadIds = threadResult.rows.map((row) => row.payload.id);
        const [participantResult, reminderResult, messageResult] = await Promise.all([
          eventIds.length
            ? client.query(
              `SELECT payload FROM calendar_event_participants
                WHERE event_id = ANY($1::text[])
                ORDER BY event_id, organisation_id
                LIMIT $2`,
              [eventIds, limit],
            )
            : { rows: [] },
          eventIds.length
            ? client.query(
              `SELECT payload FROM calendar_event_reminders
                WHERE event_id = ANY($1::text[]) AND recipient_user_id = $2
                ORDER BY minutes_before, id
                LIMIT $3`,
              [eventIds, actorId, limit],
            )
            : { rows: [] },
          threadIds.length
            ? client.query(
              `SELECT payload FROM collaboration_messages
                WHERE thread_id = ANY($1::text[])
                ORDER BY created_at, id
                LIMIT $2`,
              [threadIds, limit],
            )
            : { rows: [] },
        ]);
        return Object.freeze({
          calendarEvents: freezeRows(eventResult.rows),
          calendarParticipants: freezeRows(participantResult.rows),
          calendarReminders: freezeRows(reminderResult.rows),
          collaborationThreads: freezeRows(threadResult.rows),
          collaborationMessages: freezeRows(messageResult.rows),
        });
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

function freezeRows(rows) {
  return Object.freeze(rows.map((row) => immutableCopy(row.payload)));
}
function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
function emptySupplement() {
  return Object.freeze({
    calendarEvents: Object.freeze([]),
    calendarParticipants: Object.freeze([]),
    calendarReminders: Object.freeze([]),
    collaborationThreads: Object.freeze([]),
    collaborationMessages: Object.freeze([]),
  });
}
