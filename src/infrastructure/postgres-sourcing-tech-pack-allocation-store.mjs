import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSourcingTechPackAllocationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    async getRfqByCode(rfqCode) {
      const result = await client.query('SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1 FOR UPDATE', [rfqCode]);
      return result.rows[0]?.payload;
    },
    async getSupplierByCode(supplierCode) {
      if (!supplierCode) return undefined;
      const result = await client.query('SELECT payload FROM suppliers WHERE supplier_code = $1 FOR SHARE', [supplierCode]);
      return result.rows[0]?.payload;
    },
    async getAcknowledgedTechPack(sku, brandId, supplierCode) {
      if (!supplierCode) return undefined;
      const result = await client.query(
        `SELECT payload
           FROM tech_packs
          WHERE sku = $1
            AND brand_id = $2
            AND supplier_code = $3
            AND status = 'acknowledged'
          ORDER BY revision DESC
          LIMIT 1
          FOR SHARE`,
        [sku, brandId, supplierCode],
      );
      return result.rows[0]?.payload;
    },
    async saveAllocatedRfq(rfq, expectedVersion) {
      invariant(rfq.status === 'allocated' && rfq.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Allocated RFQ version must increment exactly once');
      const allocation = rfq.allocation;
      const result = await client.query(
        `UPDATE sourcing_rfqs
            SET status = 'allocated',
                version = $5,
                payload = $6::jsonb,
                updated_at = $7::timestamptz,
                allocated_at = $8::timestamptz,
                tech_pack_gate_enforced = TRUE,
                tech_pack_code = $9,
                tech_pack_revision = $10,
                tech_pack_version = $11,
                tech_pack_issued_version = $12,
                tech_pack_acknowledged_at = $13::timestamptz,
                tech_pack_acknowledgement_reference = $14
          WHERE id = $1
            AND rfq_code = $2
            AND brand_id = $3
            AND sku = $4
            AND status = 'awarded'
            AND version = $15`,
        [
          rfq.id, rfq.rfqCode, rfq.brandId, rfq.sku, rfq.version, JSON.stringify(rfq), rfq.updatedAt, rfq.allocatedAt,
          allocation.techPackCode, allocation.techPackRevision, allocation.techPackVersion, allocation.techPackIssuedVersion,
          allocation.techPackAcknowledgedAt, allocation.techPackAcknowledgementReference, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'RFQ_CONCURRENCY_CONFLICT', 'RFQ allocation concurrency conflict', { rfqCode: rfq.rfqCode, expectedVersion });
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
