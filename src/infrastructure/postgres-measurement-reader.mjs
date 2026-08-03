import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MEASUREMENT_READ_ROLES = Object.freeze(['owner', 'admin', 'sales']);

export function createPostgresMeasurementReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) {
      return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN });
    },
    getForActor(actorId, sku) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT chart.payload
             FROM measurement_charts AS chart
            WHERE chart.sku = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = chart.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [sku, actorId, MEASUREMENT_READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterSku, filters }) {
  const params = [actorId, MEASUREMENT_READ_ROLES];
  const clauses = [
    `EXISTS (
       SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = $1
          AND membership.organisation_id = chart.brand_id
          AND membership.status = 'active'
          AND membership.role = ANY($2::text[])
     )`,
  ];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`chart.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`chart.status = $${params.length}`); }
  if (filters.unit) { params.push(filters.unit); clauses.push(`chart.unit = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(chart.sku) LIKE $${params.length} ESCAPE '\\' OR lower(sku.payload->>'name') LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterSku) { params.push(afterSku); clauses.push(`chart.sku > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT chart.payload, chart.sku
       FROM measurement_charts AS chart
       JOIN catalog_skus AS sku ON sku.sku = chart.sku
      WHERE ${clauses.join(' AND ')}
      ORDER BY chart.sku ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({ items: Object.freeze(rows.map((row) => row.payload)), hasMore: result.rows.length > limit, ...(result.rows.length > limit ? { nextSku: rows.at(-1).sku } : {}) });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
