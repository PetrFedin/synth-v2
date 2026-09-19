import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MAX_LIMIT = 200;

// The reading side of the portal. There is no brand filter and no role check here, because the caller
// is not a member of anything: the grant is the whole of their standing, and the two views already
// resolve it. An account with no grant sees an empty list, which is also what an account whose grant
// was revoked sees — the portal never distinguishes "nothing addressed to you" from "no longer yours".
/** @param {{ pool?: any }} [options] */
export function createPostgresSupplierPortalReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'SUPPLIER_PORTAL_POOL_REQUIRED', 'PostgreSQL pool is required');

  function page(view, order, actorId, { limit, supplierCode }) {
    return withPostgresTransaction(pool, async (queryable) => {
      const params = [actorId, Math.min(limit, MAX_LIMIT) + 1];
      let filter = '';
      if (supplierCode) { params.push(supplierCode); filter = ` AND portal.supplier_code = $${params.length}`; }
      const result = await queryable.query(
        `SELECT portal.payload FROM ${view} AS portal WHERE portal.user_id = $1${filter} ORDER BY ${order} LIMIT $2`,
        params,
      );
      const rows = result.rows.map((row) => row.payload);
      const hasMore = rows.length > limit;
      return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
    }, { begin: SNAPSHOT_BEGIN });
  }

  return Object.freeze({
    rfqsForActor: (actorId, options) => page('supplier_portal_rfq_workspace', 'portal.response_due_at ASC, portal.rfq_code ASC', actorId, options),
    ordersForActor: (actorId, options) => page('supplier_portal_order_workspace', 'portal.delivery_due_at ASC, portal.production_order_number ASC', actorId, options),
    suppliersForActor(actorId) {
      return withPostgresTransaction(pool, async (queryable) => {
        const result = await queryable.query(
          `SELECT access.payload ->> 'supplierCode' AS supplier_code,
                  access.payload ->> 'contactName' AS contact_name,
                  supplier.payload ->> 'legalName' AS legal_name,
                  brand.payload ->> 'name' AS brand_name,
                  access.brand_id
             FROM supplier_portal_grants AS access
             JOIN suppliers AS supplier
               ON supplier.brand_id = access.brand_id AND supplier.supplier_code = access.supplier_code
             JOIN organisations AS brand ON brand.id = access.brand_id
            WHERE access.user_id = $1 AND access.status = 'active'
            ORDER BY access.supplier_code ASC`,
          [actorId],
        );
        return result.rows.map((row) => Object.freeze({
          supplierCode: row.supplier_code,
          contactName: row.contact_name,
          legalName: row.legal_name,
          brandId: row.brand_id,
          brandName: row.brand_name,
        }));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
