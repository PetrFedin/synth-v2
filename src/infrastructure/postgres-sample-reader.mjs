import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const SAMPLE_READ_ROLES = Object.freeze(['owner', 'admin', 'sales']);

export function createPostgresSampleReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, sampleCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT sample.payload
             FROM samples AS sample
            WHERE sample.sample_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = sample.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [sampleCode, actorId, SAMPLE_READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterSampleCode, filters, referenceTime }) {
  const params = [actorId, SAMPLE_READ_ROLES];
  const clauses = [
    `EXISTS (
       SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = $1
          AND membership.organisation_id = sample.brand_id
          AND membership.status = 'active'
          AND membership.role = ANY($2::text[])
     )`,
  ];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`sample.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`sample.status = $${params.length}`); }
  if (filters.sampleType) { params.push(filters.sampleType); clauses.push(`sample.sample_type = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`sample.sku = $${params.length}`); }
  if (filters.overdue !== undefined) {
    params.push(referenceTime);
    const overdue = `(sample.status IN ('requested','in-production') AND sample.due_at < $${params.length}::timestamptz)`;
    clauses.push(filters.overdue ? overdue : `NOT ${overdue}`);
  }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(sample.sample_code) LIKE $${params.length} ESCAPE '\\' OR lower(sample.sku) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(sample.supplier_code, '')) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(sample.payload->>'supplierName', '')) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterSampleCode) { params.push(afterSampleCode); clauses.push(`sample.sample_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT sample.payload, sample.sample_code
       FROM samples AS sample
      WHERE ${clauses.join(' AND ')}
      ORDER BY sample.sample_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({ items: Object.freeze(rows.map((row) => row.payload)), hasMore: result.rows.length > limit, ...(result.rows.length > limit ? { nextSampleCode: rows.at(-1).sample_code } : {}) });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
