import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

// Governed reference data is global: a colour family or a point of measurement means the same thing
// to every brand on the platform. There is nothing brand-scoped to filter by here, so the only gate
// is that the reader is a member of something -- an account with no membership sees no libraries,
// the same way it sees no workspace.
/** @param {{ pool?: any }} [options] */
export function createPostgresLibraryReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'LIBRARY_READER_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    listForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT library.payload
             FROM mdm_library_workspace AS library
            WHERE EXISTS (
              SELECT 1 FROM memberships AS membership
               WHERE membership.user_id = $1 AND membership.status = 'active'
            )
            ORDER BY library.code ASC`,
          [actorId],
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },

    entriesForActor(actorId, dictionaryCode, { limit, after, query }) {
      return withPostgresTransaction(pool, async (queryable) => {
        const params = [actorId, dictionaryCode, limit + 1];
        let filter = '';
        if (after) { params.push(after); filter += ` AND entry.payload ->> 'code' > $${params.length}`; }
        if (query) {
          params.push(`%${query}%`);
          filter += ` AND (entry.payload ->> 'code' ILIKE $${params.length}`
            + ` OR entry.payload ->> 'nameRu' ILIKE $${params.length}`
            + ` OR entry.payload ->> 'nameEn' ILIKE $${params.length})`;
        }
        const result = await queryable.query(
          `SELECT entry.payload
             FROM mdm_library_entry_workspace AS entry
            WHERE entry.dictionary_code = $2
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $1 AND membership.status = 'active'
              )${filter}
            ORDER BY entry.payload ->> 'code' ASC
            LIMIT $3`,
          params,
        );
        const rows = result.rows.map((row) => row.payload);
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        return { items, nextCursor: hasMore ? items.at(-1)?.code ?? null : null };
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
