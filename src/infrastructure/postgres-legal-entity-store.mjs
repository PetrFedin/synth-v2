import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresLegalEntityStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },

    getCommand: (id) => getRegisteredCommand(client, 'legal-entity', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'legal-entity', value),

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

    async getLegalEntity(id) {
      const result = await client.query('SELECT * FROM legal_entities WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapLegalEntity(result.rows[0]) : undefined;
    },
    async getLegalEntityForUpdate(id) {
      const result = await client.query('SELECT * FROM legal_entities WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0] ? mapLegalEntity(result.rows[0]) : undefined;
    },
    async getLegalEntityByOrganisationAndCode(organisationId, entityCode) {
      const result = await client.query('SELECT * FROM legal_entities WHERE organisation_id = $1 AND entity_code = $2 FOR SHARE', [organisationId, entityCode]);
      return result.rows[0] ? mapLegalEntity(result.rows[0]) : undefined;
    },
    async insertLegalEntity(value) {
      await uniqueInsert(client,
        `INSERT INTO legal_entities
           (id, organisation_id, entity_code, status, version, created_at, created_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [value.id, value.organisationId, value.entityCode, value.status, value.version, value.createdAt, value.createdBy, value.updatedAt, value.updatedBy],
        'LEGAL_ENTITY_ALREADY_EXISTS', 'Legal Entity already exists', { organisationId: value.organisationId, entityCode: value.entityCode });
    },
    async saveLegalEntity(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Legal Entity version must increment exactly once');
      const result = await client.query(
        `UPDATE legal_entities
            SET status = $2, version = $3, updated_at = $4, updated_by = $5
          WHERE id = $1 AND version = $6`,
        [value.id, value.status, value.version, value.updatedAt, value.updatedBy, expectedVersion],
      );
      invariant(result.rowCount === 1, 'LEGAL_ENTITY_CONCURRENCY_CONFLICT', 'Legal Entity concurrency conflict', { legalEntityId: value.id, expectedVersion });
    },

    async getLatestLegalEntityVersion(legalEntityId) {
      const result = await client.query('SELECT * FROM legal_entity_versions WHERE legal_entity_id = $1 ORDER BY version_no DESC LIMIT 1', [legalEntityId]);
      return result.rows[0] ? mapLegalEntityVersion(result.rows[0]) : undefined;
    },
    async insertLegalEntityVersion(value) {
      await uniqueInsert(client,
        `INSERT INTO legal_entity_versions
           (id, legal_entity_id, organisation_id, version_no, jurisdiction, name_ru, name_en, requisites, content_hash, source_legal_entity_version_id, created_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)`,
        [value.id, value.legalEntityId, value.organisationId, value.versionNo, value.jurisdiction, value.nameRu, value.nameEn,
          JSON.stringify(value.requisites), value.contentHash, value.sourceLegalEntityVersionId, value.createdAt, value.createdBy],
        'LEGAL_ENTITY_VERSION_ALREADY_EXISTS', 'Legal Entity Version already exists', { legalEntityId: value.legalEntityId, versionNo: value.versionNo });
    },

    async listLegalEntitiesWithLatestVersion(organisationId) {
      const result = await client.query(
        `SELECT entity.*,
                version.id AS version_id, version.version_no, version.jurisdiction,
                version.name_ru AS version_name_ru, version.name_en AS version_name_en,
                version.requisites, version.content_hash, version.source_legal_entity_version_id,
                version.created_at AS version_created_at, version.created_by AS version_created_by
           FROM legal_entities AS entity
           LEFT JOIN LATERAL (
             SELECT * FROM legal_entity_versions
              WHERE legal_entity_id = entity.id
              ORDER BY version_no DESC LIMIT 1
           ) AS version ON true
          WHERE entity.organisation_id = $1
          ORDER BY entity.entity_code`,
        [organisationId],
      );
      return result.rows.map((row) => Object.freeze({
        ...mapLegalEntity(row),
        latestVersion: row.version_id ? mapLegalEntityVersion({
          id: row.version_id, legal_entity_id: row.id, organisation_id: row.organisation_id, version_no: row.version_no,
          jurisdiction: row.jurisdiction, name_ru: row.version_name_ru, name_en: row.version_name_en, requisites: row.requisites,
          content_hash: row.content_hash, source_legal_entity_version_id: row.source_legal_entity_version_id, created_at: row.version_created_at, created_by: row.version_created_by,
        }) : null,
      }));
    },
  });
}

async function uniqueInsert(client, sql, params, code, message, details) {
  try { await client.query(sql, params); }
  catch (error) { if (error?.code === '23505') invariant(false, code, message, details); throw error; }
}

function mapLegalEntity(row) {
  return Object.freeze({
    id: row.id, organisationId: row.organisation_id, entityCode: row.entity_code, status: row.status, version: row.version,
    createdAt: iso(row.created_at), createdBy: row.created_by, updatedAt: iso(row.updated_at), updatedBy: row.updated_by,
  });
}

function mapLegalEntityVersion(row) {
  return Object.freeze({
    id: row.id, legalEntityId: row.legal_entity_id, organisationId: row.organisation_id, versionNo: row.version_no,
    jurisdiction: row.jurisdiction, nameRu: row.name_ru, nameEn: row.name_en, requisites: row.requisites,
    contentHash: row.content_hash, sourceLegalEntityVersionId: row.source_legal_entity_version_id,
    createdAt: iso(row.created_at), createdBy: row.created_by,
  });
}

function iso(value) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
