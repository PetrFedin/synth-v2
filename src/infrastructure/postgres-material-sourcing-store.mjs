import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresMaterialSourcingStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getRfqByCode(rfqCode) {
      const result = await pool.query('SELECT payload FROM material_rfqs WHERE rfq_code = $1', [rfqCode]);
      return result.rows[0]?.payload;
    },
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getMaterialByCode(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1 FOR SHARE', [code]);
      return result.rows[0]?.payload;
    },
    async getSupplierByCode(supplierCode) {
      const result = await client.query('SELECT payload FROM suppliers WHERE supplier_code = $1 FOR UPDATE', [supplierCode]);
      return result.rows[0]?.payload;
    },
    async getSuppliersByCodes(codes) {
      if (!Array.isArray(codes) || !codes.length) return [];
      const result = await client.query('SELECT payload FROM suppliers WHERE supplier_code = ANY($1::text[]) ORDER BY supplier_code FOR SHARE', [codes]);
      return result.rows.map((row) => row.payload);
    },
    async getRfqByCode(rfqCode) {
      const result = await client.query('SELECT payload FROM material_rfqs WHERE rfq_code = $1 FOR UPDATE', [rfqCode]);
      return result.rows[0]?.payload;
    },
    async insertRfq(rfq) {
      try {
        await client.query(
          `INSERT INTO material_rfqs
             (id, rfq_code, brand_id, material_code, material_version, status, target_quantity, unit,
              response_due_at, delivery_due_at, selected_supplier_code, version, payload, created_at,
              updated_at, issued_at, awarded_at, allocated_at, cancelled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12,
                   $13::jsonb, $14::timestamptz, $15::timestamptz, $16::timestamptz, $17::timestamptz,
                   $18::timestamptz, $19::timestamptz)`,
          rfqParameters(rfq),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MATERIAL_RFQ_ALREADY_EXISTS', 'Material RFQ code already exists', { rfqCode: rfq.rfqCode });
        throw error;
      }
    },
    async saveRfq(rfq, expectedVersion) {
      invariant(rfq.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Material RFQ version must increment exactly once');
      const result = await client.query(
        `UPDATE material_rfqs
            SET status = $6, target_quantity = $7, unit = $8,
                response_due_at = $9::timestamptz, delivery_due_at = $10::timestamptz,
                selected_supplier_code = $11, version = $12, payload = $13::jsonb,
                created_at = $14::timestamptz, updated_at = $15::timestamptz,
                issued_at = $16::timestamptz, awarded_at = $17::timestamptz,
                allocated_at = $18::timestamptz, cancelled_at = $19::timestamptz
          WHERE id = $1 AND rfq_code = $2 AND brand_id = $3 AND material_code = $4 AND material_version = $5 AND version = $20`,
        [...rfqParameters(rfq), expectedVersion],
      );
      invariant(result.rowCount === 1, 'MATERIAL_RFQ_CONCURRENCY_CONFLICT', 'Material RFQ concurrency conflict', { rfqCode: rfq.rfqCode, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'material-sourcing', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'material-sourcing', value),
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

function rfqParameters(rfq) {
  return [
    rfq.id, rfq.rfqCode, rfq.brandId, rfq.materialCode, rfq.materialVersion, rfq.status,
    rfq.targetQuantity, rfq.unit, rfq.responseDueAt, rfq.deliveryDueAt, rfq.selectedSupplierCode, rfq.version,
    JSON.stringify(rfq), rfq.createdAt, rfq.updatedAt, rfq.issuedAt, rfq.awardedAt, rfq.allocatedAt, rfq.cancelledAt,
  ];
}
