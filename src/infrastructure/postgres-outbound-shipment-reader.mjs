import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const READ_ROLES = Object.freeze(['owner','admin','sales','finance']);

export function createPostgresOutboundShipmentReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    pageForActor(actorId, options) { return withPostgresTransaction(pool, (queryable) => page(queryable, actorId, options), { begin: SNAPSHOT_BEGIN }); },
    getForActor(actorId, shipmentCode) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT shipment.payload
             FROM outbound_shipments AS shipment
            WHERE shipment.shipment_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS membership
                 WHERE membership.user_id = $2
                   AND membership.organisation_id = shipment.brand_id
                   AND membership.status = 'active'
                   AND membership.role = ANY($3::text[])
              )`,
          [shipmentCode, actorId, READ_ROLES],
        );
        return result.rows[0]?.payload;
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}

async function page(queryable, actorId, { limit, afterShipmentCode, filters }) {
  const params = [actorId, READ_ROLES];
  const clauses = [`EXISTS (
    SELECT 1 FROM memberships AS membership
     WHERE membership.user_id = $1
       AND membership.organisation_id = shipment.brand_id
       AND membership.status = 'active'
       AND membership.role = ANY($2::text[])
  )`];
  if (filters.brandId) { params.push(filters.brandId); clauses.push(`shipment.brand_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); clauses.push(`shipment.status = $${params.length}`); }
  if (filters.supplierCode) { params.push(filters.supplierCode); clauses.push(`shipment.supplier_code = $${params.length}`); }
  if (filters.sku) { params.push(filters.sku); clauses.push(`shipment.sku = $${params.length}`); }
  if (filters.carrierCode) { params.push(filters.carrierCode); clauses.push(`shipment.payload #>> '{booking,carrierCode}' = $${params.length}`); }
  if (filters.q) {
    params.push(`${escapeLike(filters.q.toLowerCase())}%`);
    clauses.push(`(lower(shipment.shipment_code) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.release_code) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.inspection_code) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.execution_code) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.production_order_number) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.sku) LIKE $${params.length} ESCAPE '\\' OR lower(shipment.supplier_code) LIKE $${params.length} ESCAPE '\\' OR lower(coalesce(shipment.tracking_number,'')) LIKE $${params.length} ESCAPE '\\')`);
  }
  if (afterShipmentCode) { params.push(afterShipmentCode); clauses.push(`shipment.shipment_code > $${params.length}`); }
  params.push(limit + 1);
  const result = await queryable.query(
    `SELECT shipment.payload, shipment.shipment_code
       FROM outbound_shipments AS shipment
      WHERE ${clauses.join(' AND ')}
      ORDER BY shipment.shipment_code ASC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore: result.rows.length > limit,
    ...(result.rows.length > limit ? { nextShipmentCode: rows.at(-1).shipment_code } : {}),
  });
}
function escapeLike(value) { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }
