import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresSeasonPaletteStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
  });
}

function view(client) {
  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await client.query(
        "SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 AND status = 'active'",
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
    async getCampaign(campaignId) {
      const result = await client.query('SELECT id, brand_id, payload FROM campaigns WHERE id = $1 FOR SHARE', [campaignId]);
      const row = result.rows[0];
      return row ? { id: row.id, brandId: row.brand_id, ...row.payload } : undefined;
    },
    // Запись справочника читается **вместе с версией**: палитра закрепляет именно ту редакцию
    // цвета, которую утвердили, и читать «последнюю» здесь было бы подменой решения.
    async getColourEntry(code) {
      const result = await client.query(
        `SELECT id, dictionary_id, code, version, status
           FROM mdm_entries
          WHERE dictionary_id = 'mdm-dictionary:colour-colour' AND code = $1
          FOR SHARE`,
        [code],
      );
      const row = result.rows[0];
      return row ? { id: row.id, dictionaryId: row.dictionary_id, code: row.code, version: row.version, status: row.status } : undefined;
    },
    async listPalette(campaignId) {
      const result = await client.query(
        'SELECT payload FROM season_colour_palettes WHERE campaign_id = $1 ORDER BY position, colour_code',
        [campaignId],
      );
      return result.rows.map((row) => row.payload);
    },
    async insertPaletteEntry(value) {
      try {
        await client.query(
          `INSERT INTO season_colour_palettes
             (id, brand_id, campaign_id, colour_entry_id, colour_entry_version, colour_code, position, created_at, created_by, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10::jsonb)`,
          [value.id, value.brandId, value.campaignId, value.colourEntryId, value.colourEntryVersion,
            value.colourCode, value.position, value.createdAt, value.createdBy, JSON.stringify(value)],
        );
      } catch (error) {
        // Один цвет в сезоне один раз, и одна позиция занята одним цветом: обе уникальности держит
        // база, а наружу они идут отказом, который называет, что именно повторилось.
        if (error?.code === '23505') {
          invariant(false, 'SEASON_PALETTE_ENTRY_EXISTS',
            'This colour, or this position, is already taken in the season palette',
            { campaignId: value.campaignId, colourCode: value.colourCode, position: value.position });
        }
        throw error;
      }
    },
  });
}
