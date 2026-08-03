import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function createPostgresMaterialReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) {
      return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN });
    },
    getForActor(actorId, code) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT m.payload
             FROM materials m
            WHERE m.code = $1
              AND EXISTS (
                SELECT 1 FROM memberships mem
                 WHERE mem.user_id = $2 AND mem.organisation_id = m.brand_id AND mem.status = 'active'
              )`,
          [code, actorId],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterCode, filters }) {
  const params = [actorId];
  const clauses = [
    `EXISTS (
       SELECT 1 FROM memberships mem
        WHERE mem.user_id = $1 AND mem.organisation_id = m.brand_id AND mem.status = 'active'
     )`,
  ];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`m.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`m.status = $${params.length}`); }
  if (filters.type) { params.push(filters.type); clauses.push(`m.material_type = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(m.code) LIKE $${params.length} ESCAPE '\\' OR lower(m.payload->>'name') LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterCode) { params.push(afterCode); clauses.push(`m.code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT m.payload, m.code
       FROM materials m
      WHERE ${clauses.join(' AND ')}
      ORDER BY m.code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextCode: rows.at(-1).code } : {}),
  });
}

function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
