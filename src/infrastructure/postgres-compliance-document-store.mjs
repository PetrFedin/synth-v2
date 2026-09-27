import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresComplianceDocumentStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },

    async getLegalEntityWithLatestVersion(legalEntityId) {
      if (!legalEntityId) return undefined;
      const entityResult = await client.query('SELECT id, organisation_id, entity_code, status, version FROM legal_entities WHERE id = $1 FOR SHARE', [legalEntityId]);
      if (!entityResult.rows[0]) return undefined;
      const versionResult = await client.query('SELECT id, version_no FROM legal_entity_versions WHERE legal_entity_id = $1 ORDER BY version_no DESC LIMIT 1 FOR SHARE', [legalEntityId]);
      const row = entityResult.rows[0];
      return Object.freeze({
        id: row.id,
        organisationId: row.organisation_id,
        entityCode: row.entity_code,
        status: row.status,
        version: row.version,
        currentVersionId: versionResult.rows[0]?.id ?? null,
        currentVersionNo: versionResult.rows[0]?.version_no ?? null,
      });
    },

    async legalEntityExists(legalEntityId) {
      if (!legalEntityId) return false;
      const result = await client.query('SELECT 1 FROM legal_entities WHERE id = $1', [legalEntityId]);
      return result.rowCount === 1;
    },

    async getDocumentByNumber(organisationId, documentNumber) {
      const result = await client.query('SELECT payload FROM compliance_documents WHERE organisation_id = $1 AND document_number = $2 FOR UPDATE', [organisationId, documentNumber]);
      return result.rows[0]?.payload;
    },
    async getDocumentById(id) {
      if (!id) return undefined;
      const result = await client.query('SELECT payload FROM compliance_documents WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload;
    },
    async listDocuments(organisationId) {
      const result = await client.query(
        'SELECT payload FROM compliance_documents WHERE organisation_id = $1 ORDER BY created_at DESC, document_number',
        [organisationId],
      );
      return result.rows.map((row) => row.payload);
    },

    async insertDocument(value) {
      try {
        await client.query(
          `INSERT INTO compliance_documents (
             id, organisation_id, document_number, document_type,
             issuer_legal_entity_id, issuer_legal_entity_version_id, counterparty_legal_entity_id,
             status, edo_status, valid_from, valid_to, supersedes_document_id,
             version, payload, created_at, created_by, updated_at, updated_by,
             issued_at, superseded_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,
             $15::timestamptz,$16,$17::timestamptz,$18,$19::timestamptz,$20::timestamptz
           )`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') {
          invariant(false, 'COMPLIANCE_DOCUMENT_ALREADY_EXISTS', 'Compliance Document number already exists', {
            organisationId: value.organisationId, documentNumber: value.documentNumber,
          });
        }
        throw error;
      }
    },
    async saveDocument(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Compliance Document version must increment exactly once');
      const result = await client.query(
        `UPDATE compliance_documents
            SET status = $3, edo_status = $4, supersedes_document_id = $5,
                version = $6, payload = $7::jsonb, updated_at = $8::timestamptz, updated_by = $9,
                issued_at = $10::timestamptz, superseded_at = $11::timestamptz
          WHERE id = $1 AND organisation_id = $2 AND version = $12`,
        [value.id, value.organisationId, value.status, value.edoStatus, value.supersedesDocumentId,
          value.version, JSON.stringify(value), value.updatedAt, value.updatedBy,
          value.issuedAt, value.supersededAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'COMPLIANCE_DOCUMENT_CONCURRENCY_CONFLICT', 'Compliance Document concurrency conflict', { documentNumber: value.documentNumber, expectedVersion });
    },

    getCommand: (id) => getRegisteredCommand(client, 'compliance-document', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'compliance-document', value),
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
    value.id, value.organisationId, value.documentNumber, value.documentType,
    value.issuerLegalEntityId, value.issuerLegalEntityVersionId, value.counterpartyLegalEntityId,
    value.status, value.edoStatus, value.validFrom, value.validTo, value.supersedesDocumentId,
    value.version, JSON.stringify(value), value.createdAt, value.createdBy, value.updatedAt, value.updatedBy,
    value.issuedAt, value.supersededAt,
  ];
}
