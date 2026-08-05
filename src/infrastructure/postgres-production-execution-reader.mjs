import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresProductionExecutionReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, executionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT execution.payload
             FROM production_executions AS execution
            WHERE execution.execution_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = execution.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [executionCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterExecutionCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = execution.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`execution.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`execution.status = $${params.length}`); }
  if (filters.supplierCode) { params.push(filters.supplierCode); clauses.push(`execution.supplier_code = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`execution.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(execution.execution_code) LIKE $${params.length} ESCAPE '\\' OR lower(execution.production_order_number) LIKE $${params.length} ESCAPE '\\' OR lower(execution.sku) LIKE $${params.length} ESCAPE '\\' OR lower(execution.supplier_code) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterExecutionCode) { params.push(afterExecutionCode); clauses.push(`execution.execution_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT execution.payload, execution.execution_code
       FROM production_executions AS execution
      WHERE ${clauses.join(' AND ')}
      ORDER BY execution.execution_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextExecutionCode: rows.at(-1).execution_code } : {}),
  });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
