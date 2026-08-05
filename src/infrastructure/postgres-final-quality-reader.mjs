import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner', 'admin', 'sales', 'finance']);

export function createPostgresFinalQualityReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, inspectionCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT inspection.payload
             FROM quality_inspections AS inspection
            WHERE inspection.inspection_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = inspection.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [inspectionCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
    getShipmentReleaseForActor(actorId, releaseCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT release.payload
             FROM quality_shipment_releases AS release
            WHERE release.release_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = release.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [releaseCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterInspectionCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = inspection.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`inspection.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`inspection.status = $${params.length}`); }
  if (filters.supplierCode) { params.push(filters.supplierCode); clauses.push(`inspection.supplier_code = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`inspection.sku = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(inspection.inspection_code) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.execution_code) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.production_order_number) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.sku) LIKE $${params.length} ESCAPE '\\' OR lower(inspection.supplier_code) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterInspectionCode) { params.push(afterInspectionCode); clauses.push(`inspection.inspection_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT inspection.payload, inspection.inspection_code
       FROM quality_inspections AS inspection
      WHERE ${clauses.join(' AND ')}
      ORDER BY inspection.inspection_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextInspectionCode: rows.at(-1).inspection_code } : {}),
  });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
