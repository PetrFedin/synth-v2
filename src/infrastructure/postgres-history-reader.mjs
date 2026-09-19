import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

/** @param {{ pool?: any }} [options] */
export function createPostgresHistoryReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'HISTORY_READER_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    // Who may read an object's history is decided by who owns the object, not by what the event
    // happens to carry: an event without a brand of its own is still a change to something that has
    // one, and gating on the event would hide it.
    forActor(actorId, subjectId, { limit, before }) {
      return withPostgresTransaction(pool, async (queryable) => {
        const params = [actorId, subjectId, limit + 1];
        let cursor = '';
        if (before) { params.push(before); cursor = ` AND history.payload ->> 'occurredAt' < $${params.length}`; }
        const result = await queryable.query(
          `SELECT history.payload
             FROM object_history_workspace AS history
            WHERE history.subject_id = $2
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $1
                   AND membership.organisation_id = history.brand_id
                   AND membership.status = 'active'
              )${cursor}
            ORDER BY history.payload ->> 'occurredAt' DESC NULLS LAST, history.id DESC
            LIMIT $3`,
          params,
        );
        const rows = result.rows.map((row) => row.payload);
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        return { items, nextCursor: hasMore ? items.at(-1)?.occurredAt ?? null : null };
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
