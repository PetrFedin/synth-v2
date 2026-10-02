import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

// The writing side of the portal (S-01). It is one transaction over the three things a supplier's
// answer touches — the grant that gives the standing, the request or order it changes, and the
// outbox — and nothing else. Locks are taken in the order the brand's own commands take them (the
// aggregate, then the supplier, then the grant), so a supplier answering and a brand awarding the
// same request wait for each other instead of deadlocking.
/** @param {{ pool?: any }} [options] */
export function createPostgresSupplierPortalStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    // Unlocked: it only says which brand the grant belongs to, so the aggregate can be locked first.
    async findActiveGrant(userId, supplierCode) {
      const result = await client.query(
        `SELECT payload FROM supplier_portal_grants WHERE user_id = $1 AND supplier_code = $2 AND status = 'active'`, [userId, supplierCode]);
      return result.rows[0]?.payload;
    },
    async lockActiveGrant(userId, supplierCode) {
      const result = await client.query(
        `SELECT payload FROM supplier_portal_grants WHERE user_id = $1 AND supplier_code = $2 AND status = 'active' FOR SHARE`, [userId, supplierCode]);
      return result.rows[0]?.payload;
    },
    async getSupplier(brandId, supplierCode) {
      const result = await client.query('SELECT payload FROM suppliers WHERE brand_id = $1 AND supplier_code = $2 FOR SHARE', [brandId, supplierCode]);
      return result.rows[0]?.payload;
    },
    async getRfqForUpdate(rfqCode) {
      const result = await client.query('SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1 FOR UPDATE', [rfqCode]);
      return result.rows[0]?.payload;
    },
    async saveRfq(rfq, expectedVersion) {
      invariant(rfq.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'RFQ version must increment exactly once');
      const result = await client.query(
        `UPDATE sourcing_rfqs
            SET status = $3, version = $4, payload = $5::jsonb, updated_at = $6::timestamptz
          WHERE id = $1 AND rfq_code = $2 AND version = $7`,
        [rfq.id, rfq.rfqCode, rfq.status, rfq.version, JSON.stringify(rfq), rfq.updatedAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'RFQ_CONCURRENCY_CONFLICT', 'RFQ concurrency conflict', { rfqCode: rfq.rfqCode, expectedVersion });
    },
    async getProductionOrderForUpdate(productionOrderNumber) {
      const result = await client.query('SELECT payload FROM production_orders WHERE production_order_number = $1 FOR UPDATE', [productionOrderNumber]);
      return result.rows[0]?.payload;
    },
    async saveProductionOrder(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Production Order version must increment exactly once');
      const result = await client.query(
        `UPDATE production_orders
            SET status = $4, version = $5, payload = $6::jsonb, issued_at = $7::timestamptz,
                confirmed_at = $8::timestamptz, cancelled_at = $9::timestamptz, updated_at = $10::timestamptz
          WHERE id = $1 AND production_order_number = $2 AND brand_id = $3 AND version = $11`,
        [value.id, value.productionOrderNumber, value.brandId, value.status, value.version, JSON.stringify(value),
          value.issuedAt, value.confirmedAt, value.cancelledAt, value.updatedAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCTION_ORDER_CONCURRENCY_CONFLICT', 'Production Order concurrency conflict',
        { productionOrderNumber: value.productionOrderNumber, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query(
          `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
           VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
          [event.id, event.type, event.aggregateId, JSON.stringify(event)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}
