import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresSourcingStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getSupplierByCode(supplierCode) {
      const result = await pool.query('SELECT payload FROM suppliers WHERE supplier_code = $1', [supplierCode]);
      return result.rows[0]?.payload;
    },
    async getRfqByCode(rfqCode) {
      const result = await pool.query('SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1', [rfqCode]);
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
    async getSku(sku) {
      const result = await client.query('SELECT payload FROM catalog_skus WHERE sku = $1 FOR SHARE', [sku]);
      return result.rows[0]?.payload;
    },
    async getBomBySku(sku) {
      const result = await client.query('SELECT payload FROM boms WHERE sku = $1 FOR SHARE', [sku]);
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
      const result = await client.query('SELECT payload FROM sourcing_rfqs WHERE rfq_code = $1 FOR UPDATE', [rfqCode]);
      return result.rows[0]?.payload;
    },
    async insertSupplier(supplier) {
      try {
        await client.query(
          `INSERT INTO suppliers
             (id, supplier_code, brand_id, status, country_code, currency, lead_time_days, minimum_order_quantity,
              audit_expires_at, version, payload, created_at, updated_at, qualified_at, suspended_at, archived_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11::jsonb,
                   $12::timestamptz, $13::timestamptz, $14::timestamptz, $15::timestamptz, $16::timestamptz)`,
          supplierParameters(supplier),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'SUPPLIER_ALREADY_EXISTS', 'Supplier code already exists', { supplierCode: supplier.supplierCode });
        throw error;
      }
    },
    async saveSupplier(supplier, expectedVersion) {
      invariant(supplier.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Supplier version must increment exactly once');
      const result = await client.query(
        `UPDATE suppliers
            SET status = $4, country_code = $5, currency = $6, lead_time_days = $7, minimum_order_quantity = $8,
                audit_expires_at = $9::timestamptz, version = $10, payload = $11::jsonb,
                created_at = $12::timestamptz, updated_at = $13::timestamptz,
                qualified_at = $14::timestamptz, suspended_at = $15::timestamptz, archived_at = $16::timestamptz
          WHERE id = $1 AND supplier_code = $2 AND brand_id = $3 AND version = $17`,
        [...supplierParameters(supplier), expectedVersion],
      );
      invariant(result.rowCount === 1, 'SUPPLIER_CONCURRENCY_CONFLICT', 'Supplier concurrency conflict', { supplierCode: supplier.supplierCode, expectedVersion });
    },
    // Portal access is stored beside the supplier it belongs to, because the two are always read and
    // revoked together: a supplier moved to the archive must not leave people able to sign in to it.
    async getAccountByEmail(email) {
      const result = await client.query('SELECT id, email FROM auth_users WHERE email_normalized = lower($1)', [email]);
      return result.rows[0] ? { id: result.rows[0].id, email: result.rows[0].email } : undefined;
    },
    async getPortalGrant(supplierCode, userId) {
      const result = await client.query('SELECT payload FROM supplier_portal_grants WHERE supplier_code = $1 AND user_id = $2 FOR UPDATE', [supplierCode, userId]);
      return result.rows[0]?.payload;
    },
    async insertPortalGrant(grant) {
      try {
        await client.query(
          `INSERT INTO supplier_portal_grants
             (id, brand_id, supplier_code, user_id, invited_email, status, granted_by, granted_at, revoked_by,
              revoked_at, version, payload, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10::timestamptz, $11, $12::jsonb, $13::timestamptz, $14::timestamptz)`,
          grantParameters(grant),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'SUPPLIER_PORTAL_GRANT_EXISTS', 'This person already has portal access to that supplier', { supplierCode: grant.supplierCode, userId: grant.userId });
        throw error;
      }
    },
    async savePortalGrant(grant, expectedVersion) {
      invariant(grant.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Grant version must increment exactly once');
      // Named parameters of its own rather than the insert's list: an UPDATE that skips half of them
      // leaves PostgreSQL unable to infer the types of the ones it never mentions, and the statement
      // fails before it reaches a row. It writes who granted and when as well as the status, because
      // re-opening access to someone whose access was revoked is a new grant on the same row.
      const result = await client.query(
        `UPDATE supplier_portal_grants
            SET status = $4, granted_by = $5, granted_at = $6::timestamptz, revoked_by = $7,
                revoked_at = $8::timestamptz, version = $9, payload = $10::jsonb, updated_at = $11::timestamptz
          WHERE id = $1 AND supplier_code = $2 AND user_id = $3 AND version = $12`,
        [
          grant.id, grant.supplierCode, grant.userId, grant.status, grant.grantedBy, grant.grantedAt,
          grant.revokedBy, grant.revokedAt, grant.version, JSON.stringify(grant),
          grant.revokedAt ?? grant.grantedAt, expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'SUPPLIER_PORTAL_GRANT_CONFLICT', 'Portal grant concurrency conflict', { supplierCode: grant.supplierCode, expectedVersion });
    },
    async insertRfq(rfq) {
      try {
        await client.query(
          `INSERT INTO sourcing_rfqs
             (id, rfq_code, brand_id, sku, sku_version, bom_version, status, target_quantity, response_due_at,
              delivery_due_at, selected_supplier_code, version, payload, created_at, updated_at, issued_at,
              awarded_at, allocated_at, cancelled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12,
                   $13::jsonb, $14::timestamptz, $15::timestamptz, $16::timestamptz, $17::timestamptz,
                   $18::timestamptz, $19::timestamptz)`,
          rfqParameters(rfq),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'RFQ_ALREADY_EXISTS', 'RFQ code already exists', { rfqCode: rfq.rfqCode });
        throw error;
      }
    },
    async saveRfq(rfq, expectedVersion) {
      invariant(rfq.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'RFQ version must increment exactly once');
      const result = await client.query(
        `UPDATE sourcing_rfqs
            SET sku_version = $5, bom_version = $6, status = $7, target_quantity = $8,
                response_due_at = $9::timestamptz, delivery_due_at = $10::timestamptz,
                selected_supplier_code = $11, version = $12, payload = $13::jsonb,
                created_at = $14::timestamptz, updated_at = $15::timestamptz,
                issued_at = $16::timestamptz, awarded_at = $17::timestamptz,
                allocated_at = $18::timestamptz, cancelled_at = $19::timestamptz
          WHERE id = $1 AND rfq_code = $2 AND brand_id = $3 AND sku = $4 AND version = $20`,
        [...rfqParameters(rfq), expectedVersion],
      );
      invariant(result.rowCount === 1, 'RFQ_CONCURRENCY_CONFLICT', 'RFQ concurrency conflict', { rfqCode: rfq.rfqCode, expectedVersion });
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

function supplierParameters(supplier) {
  return [
    supplier.id, supplier.supplierCode, supplier.brandId, supplier.status, supplier.countryCode, supplier.currency,
    supplier.leadTimeDays, supplier.minimumOrderQuantity, supplier.auditExpiresAt, supplier.version,
    JSON.stringify(supplier), supplier.createdAt, supplier.updatedAt, supplier.qualifiedAt, supplier.suspendedAt,
    supplier.archivedAt,
  ];
}
function rfqParameters(rfq) {
  return [
    rfq.id, rfq.rfqCode, rfq.brandId, rfq.sku, rfq.skuVersion, rfq.bomVersion, rfq.status,
    rfq.targetQuantity, rfq.responseDueAt, rfq.deliveryDueAt, rfq.selectedSupplierCode, rfq.version,
    JSON.stringify(rfq), rfq.createdAt, rfq.updatedAt, rfq.issuedAt, rfq.awardedAt, rfq.allocatedAt, rfq.cancelledAt,
  ];
}

function grantParameters(grant) {
  return [
    grant.id, grant.brandId, grant.supplierCode, grant.userId, grant.invitedEmail, grant.status, grant.grantedBy,
    grant.grantedAt, grant.revokedBy, grant.revokedAt, grant.version, JSON.stringify(grant), grant.grantedAt,
    grant.revokedAt ?? grant.grantedAt,
  ];
}
