import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresMaterialColourStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction: (work) => withPostgresTransaction(pool, work, { createView: view }) });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query('SELECT organisation_id AS "organisationId", user_id AS "userId", role, status, (SELECT type FROM organisations WHERE id = $1) AS "organisationType" FROM memberships WHERE organisation_id = $1 AND user_id = $2', [organisationId, userId]);
      return result.rows[0] ?? null;
    },
    async getMaterialByCode(code) {
      const result = await client.query('SELECT payload FROM materials WHERE code = $1', [code]);
      return result.rows[0]?.payload ?? null;
    },
    // Цвет берётся из governed-справочника целиком, вместе с версией: код без записи в справочнике —
    // не цвет, а строка, и именно из-за таких строк «Midnight Navy» нельзя было ни найти, ни сверить.
    async resolveGovernedColour(code) {
      const result = await client.query(
        `SELECT entry.id AS "entryId", entry.version, entry.code
           FROM mdm_entries AS entry
           JOIN mdm_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
          WHERE dictionary.code = 'colour.colour' AND entry.code = $1`,
        [String(code ?? '').trim().toUpperCase()],
      );
      const row = result.rows[0];
      return row ? Object.freeze({ entryId: row.entryId, version: Number(row.version), code: row.code }) : null;
    },
    async nextColourPosition(materialCode) {
      const result = await client.query('SELECT COALESCE(max(position), 0) + 1 AS next FROM material_colours WHERE material_code = $1', [materialCode]);
      return Number(result.rows[0].next);
    },
    async getMaterialColourById(id) {
      const result = await client.query('SELECT payload FROM material_colours WHERE id = $1', [id]);
      return result.rows[0]?.payload ?? null;
    },
    async getLabDipById(id) {
      const result = await client.query('SELECT payload FROM lab_dips WHERE id = $1 FOR UPDATE', [id]);
      return result.rows[0]?.payload ?? null;
    },
    async insertMaterialColour(value) {
      try {
        await client.query(
          `INSERT INTO material_colours (id,material_code,brand_id,colour_entry_id,colour_entry_version,colour_code,supplier_colour_reference,position,status,created_at,created_by,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12::jsonb)`,
          [value.id, value.materialCode, value.brandId, value.colourEntryId, value.colourEntryVersion, value.colourCode,
            value.supplierColourReference, value.position, value.status, value.createdAt, value.createdBy, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'MATERIAL_COLOUR_ALREADY_LISTED', 'This colour is already in the material palette', { materialCode: value.materialCode, colourCode: value.colourCode });
        throw error;
      }
    },
    async insertLabDip(value) {
      try {
        await client.query(
          `INSERT INTO lab_dips (id,brand_id,material_code,material_colour_id,colour_entry_id,colour_entry_version,colour_code,campaign_id,dip_reference,supplier_code,status,submission_round,valid_from,valid_to,notes,requested_at,requested_by,submitted_at,submitted_by,decided_at,decided_by,decision_note,version,created_at,updated_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz,$15,$16::timestamptz,$17,$18::timestamptz,$19,$20::timestamptz,$21,$22,$23,$24::timestamptz,$25::timestamptz,$26::jsonb)`,
          [value.id, value.brandId, value.materialCode, value.materialColourId, value.colourEntryId, value.colourEntryVersion, value.colourCode,
            value.campaignId, value.dipReference, value.supplierCode, value.status, value.submissionRound,
            value.validFrom, value.validTo, value.notes, value.requestedAt, value.requestedBy,
            value.submittedAt, value.submittedBy, value.decidedAt, value.decidedBy, value.decisionNote,
            value.version, value.createdAt, value.updatedAt, JSON.stringify(value)],
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'LAB_DIP_ALREADY_RECORDED', 'This lab dip reference is already recorded for this brand', { dipReference: value.dipReference });
        throw error;
      }
    },
    async saveLabDip(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Lab dip version must increment exactly once');
      const result = await client.query(
        `UPDATE lab_dips
            SET status = $3, submission_round = $4, submitted_at = $5::timestamptz, submitted_by = $6,
                decided_at = $7::timestamptz, decided_by = $8, decision_note = $9,
                version = $10, updated_at = $11::timestamptz, payload = $12::jsonb
          WHERE id = $1 AND version = $2`,
        [value.id, expectedVersion, value.status, value.submissionRound, value.submittedAt, value.submittedBy,
          value.decidedAt, value.decidedBy, value.decisionNote, value.version, value.updatedAt, JSON.stringify(value)],
      );
      invariant(result.rowCount === 1, 'LAB_DIP_CONCURRENCY_CONFLICT', 'This lab dip was changed by another operation', { dipReference: value.dipReference, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, status, event, published_at)
         VALUES ($1, $2, $3, 'pending', $4::jsonb, NULL)`,
        [event.id, event.type, event.aggregateId, JSON.stringify(event)],
      );
    },
  });
}
