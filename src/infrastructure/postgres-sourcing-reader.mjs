import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const SOURCING_READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresSourcingReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    supplierPageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => supplierPage(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    supplierGetForActor(actorId, supplierCode) { return getForActor(pool, actorId, 'suppliers', 'supplier_code', supplierCode); },
    rfqPageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => rfqPage(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    rfqGetForActor(actorId, rfqCode) { return getForActor(pool, actorId, 'sourcing_rfqs', 'rfq_code', rfqCode); },
  });
}

async function getForActor(pool, actorId, table, codeColumn, code) {
  return withPostgresTransaction(pool, async (queryable) => {
    const result = await queryable.query(
      `SELECT aggregate.payload
         FROM ${table} AS aggregate
        WHERE aggregate.${codeColumn} = $1
          AND EXISTS (
            SELECT 1 FROM memberships AS membership
             WHERE membership.user_id = $2
               AND membership.organisation_id = aggregate.brand_id
               AND membership.status = 'active'
               AND membership.role = ANY($3::text[])
          )`,
      [code, actorId, SOURCING_READ_ROLES],
    );
    return result.rows[0]?.payload;
  }, { begin: SNAPSHOT_BEGIN });
}

async function supplierPage(queryable, actorId, { limit, afterCode, filters }) {
  const params = [actorId, SOURCING_READ_ROLES];
  const clauses = [membershipClause('supplier')];
  if (filters.brandId) add(params, clauses, 'supplier.brand_id', '=', filters.brandId);
  if (filters.status) add(params, clauses, 'supplier.status', '=', filters.status);
  if (filters.countryCode) add(params, clauses, 'supplier.country_code', '=', filters.countryCode);
  if (filters.category) {
    params.push(JSON.stringify([filters.category]));
    clauses.push(`supplier.payload -> 'categories' @> $${params.length}::jsonb`);
  }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(supplier.supplier_code) LIKE $${params.length} ESCAPE '\\' OR lower(supplier.payload->>'legalName') LIKE $${params.length} ESCAPE '\\' OR lower(supplier.payload->>'email') LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterCode) add(params, clauses, 'supplier.supplier_code', '>', afterCode);
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT supplier.payload, supplier.supplier_code AS code
       FROM suppliers AS supplier
      WHERE ${clauses.join(' AND ')}
      ORDER BY supplier.supplier_code ASC
      LIMIT $${params.length}`,
    params,
  );
  return pageResult(result.rows, limit);
}

async function rfqPage(queryable, actorId, { limit, afterCode, filters, referenceTime }) {
  const params = [actorId, SOURCING_READ_ROLES];
  const clauses = [membershipClause('rfq')];
  if (filters.brandId) add(params, clauses, 'rfq.brand_id', '=', filters.brandId);
  if (filters.status) add(params, clauses, 'rfq.status', '=', filters.status);
  if (filters.sku) add(params, clauses, 'rfq.sku', '=', filters.sku);
  if (filters.supplierCode) {
    params.push(filters.supplierCode);
    clauses.push(`rfq.payload -> 'supplierCodes' ? $${params.length}`);
  }
  if (filters.overdue !== undefined) {
    params.push(referenceTime);
    const overdue = `((rfq.status IN ('issued','quoted') AND rfq.response_due_at < $${params.length}::timestamptz) OR (rfq.status = 'awarded' AND rfq.delivery_due_at < $${params.length}::timestamptz))`;
    clauses.push(filters.overdue ? overdue : `NOT ${overdue}`);
  }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(rfq.rfq_code) LIKE $${params.length} ESCAPE '\\' OR lower(rfq.sku) LIKE $${params.length} ESCAPE '\\' OR lower(COALESCE(rfq.selected_supplier_code, '')) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterCode) add(params, clauses, 'rfq.rfq_code', '>', afterCode);
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT rfq.payload, rfq.rfq_code AS code
       FROM sourcing_rfqs AS rfq
      WHERE ${clauses.join(' AND ')}
      ORDER BY rfq.rfq_code ASC
      LIMIT $${params.length}`,
    params,
  );
  return pageResult(result.rows, limit);
}

function membershipClause(alias) {
  return `EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = ${alias}.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`;
}
function add(params, clauses, column, operator, value) { params.push(value); clauses.push(`${column} ${operator} $${params.length}`); }
function pageResult(rows, limit) { const items = rows.slice(0, limit); return Object.freeze({ items: Object.freeze(items.map((row) => row.payload)), hasMore: rows.length > limit, ...(rows.length > limit ? { nextCode: items.at(-1).code } : {}) }); }
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
