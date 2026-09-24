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
    // The same access rule, over the attribute differences rather than the events. Filters are
    // optional and narrow the same page: an auditor asks "who touched the price, and when", and
    // asking that should not mean reading a season of events to find three rows.
    attributesForActor(actorId, subjectId, { limit, before, attribute, actor, from, to }) {
      return withPostgresTransaction(pool, async (queryable) => {
        const params = [actorId, subjectId, limit + 1];
        const clauses = [];
        if (before) { params.push(before); clauses.push(`AND history.occurred_at < $${params.length}`); }
        if (attribute) { params.push(attribute); clauses.push(`AND history.attribute = $${params.length}`); }
        if (actor) { params.push(actor); clauses.push(`AND history.payload ->> 'actorId' = $${params.length}`); }
        if (from) { params.push(from); clauses.push(`AND history.occurred_at >= $${params.length}`); }
        if (to) { params.push(to); clauses.push(`AND history.occurred_at <= $${params.length}`); }
        const result = await queryable.query(
          `SELECT history.payload
             FROM object_attribute_history_workspace AS history
            WHERE history.subject_id = $2
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $1
                   AND membership.organisation_id = history.brand_id
                   AND membership.status = 'active'
              ) ${clauses.join(' ')}
            ORDER BY history.occurred_at DESC NULLS LAST, history.id DESC, history.attribute
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
