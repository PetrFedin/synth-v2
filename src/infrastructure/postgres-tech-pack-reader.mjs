import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresTechPackReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, techPackCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT pack.payload
             FROM tech_packs AS pack
            WHERE pack.tech_pack_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = pack.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [techPackCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterTechPackCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = pack.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`pack.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`pack.status = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`pack.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(pack.tech_pack_code) LIKE $${params.length} ESCAPE '\\' OR lower(pack.sku) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(pack.supplier_code, '')) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(pack.payload->>'title', '')) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterTechPackCode) { params.push(afterTechPackCode); clauses.push(`pack.tech_pack_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT pack.payload, pack.tech_pack_code
       FROM tech_packs AS pack
      WHERE ${clauses.join(' AND ')}
      ORDER BY pack.tech_pack_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({ items: Object.freeze(rows.map((row) => row.payload)), hasMore: result.rows.length > limit, ...(result.rows.length > limit ? { nextTechPackCode: rows.at(-1).tech_pack_code } : {}) });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
