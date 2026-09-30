import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductCertificationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },

    async getStyle(styleId) {
      if (!styleId) return undefined;
      const result = await client.query('SELECT id, brand_id, style_code FROM product_styles WHERE id = $1 FOR SHARE', [styleId]);
      const row = result.rows[0];
      return row ? Object.freeze({ id: row.id, brandId: row.brand_id, styleCode: row.style_code }) : undefined;
    },

    async getCertificateByNumber(styleId, certificateNumber) {
      const result = await client.query('SELECT payload FROM product_certifications WHERE style_id = $1 AND certificate_number = $2 FOR UPDATE', [styleId, certificateNumber]);
      return result.rows[0]?.payload;
    },
    async getCertificationById(id) {
      if (!id) return undefined;
      const result = await client.query('SELECT payload FROM product_certifications WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload;
    },
    async listCertificationsForStyle(styleId) {
      const result = await client.query(
        'SELECT payload FROM product_certifications WHERE style_id = $1 ORDER BY created_at DESC, certificate_number',
        [styleId],
      );
      return result.rows.map((row) => row.payload);
    },

    async insertCertification(value) {
      try {
        await client.query(
          `INSERT INTO product_certifications (
             id, style_id, brand_id, certification_type, certificate_number, issuing_body,
             status, valid_from, valid_to, supersedes_certification_id,
             version, payload, created_at, created_by, updated_at, updated_by,
             issued_at, superseded_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,
             $13::timestamptz,$14,$15::timestamptz,$16,$17::timestamptz,$18::timestamptz
           )`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') {
          invariant(false, 'PRODUCT_CERTIFICATION_ALREADY_EXISTS', 'Certificate number already exists for this style', {
            styleId: value.styleId, certificateNumber: value.certificateNumber,
          });
        }
        throw error;
      }
    },
    async saveCertification(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Product Certification version must increment exactly once');
      const result = await client.query(
        `UPDATE product_certifications
            SET status = $3, supersedes_certification_id = $4,
                version = $5, payload = $6::jsonb, updated_at = $7::timestamptz, updated_by = $8,
                issued_at = $9::timestamptz, superseded_at = $10::timestamptz
          WHERE id = $1 AND style_id = $2 AND version = $11`,
        [value.id, value.styleId, value.status, value.supersedesCertificationId,
          value.version, JSON.stringify(value), value.updatedAt, value.updatedBy,
          value.issuedAt, value.supersededAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'PRODUCT_CERTIFICATION_CONCURRENCY_CONFLICT', 'Product Certification concurrency conflict', { certificateNumber: value.certificateNumber, expectedVersion });
    },

    getCommand: (id) => getRegisteredCommand(client, 'product-certification', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'product-certification', value),
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

function parameters(value) {
  return [
    value.id, value.styleId, value.brandId, value.certificationType, value.certificateNumber, value.issuingBody,
    value.status, value.validFrom, value.validTo, value.supersedesCertificationId,
    value.version, JSON.stringify(value), value.createdAt, value.createdBy, value.updatedAt, value.updatedBy,
    value.issuedAt, value.supersededAt,
  ];
}
