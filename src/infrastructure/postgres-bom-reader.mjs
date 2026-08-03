import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const BOM_READ_ROLES = Object.freeze(['owner', 'admin', 'finance']);

export function createPostgresBomReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) {
      return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN });
    },
    getForActor(actorId, sku) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT bom.payload
             FROM boms AS bom
            WHERE bom.sku = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = bom.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [sku, actorId, BOM_READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterSku, filters }) {
  const params = [actorId, BOM_READ_ROLES];
  const clauses = [
    `EXISTS (
       SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = $1
          AND membership.organisation_id = bom.brand_id
          AND membership.status = 'active'
          AND membership.role = ANY($2::text[])
     )`,
  ];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`bom.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`bom.status = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(bom.sku) LIKE $${params.length} ESCAPE '\\' OR lower(sku.payload->>'name') LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterSku) { params.push(afterSku); clauses.push(`bom.sku > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT bom.payload, bom.sku
       FROM boms AS bom
       JOIN catalog_skus AS sku ON sku.sku = bom.sku
      WHERE ${clauses.join(' AND ')}
      ORDER BY bom.sku ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextSku: rows.at(-1).sku } : {}),
  });
}

function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
