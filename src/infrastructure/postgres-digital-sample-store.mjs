import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresDigitalSampleStore({ pool } = {}) {
  invariant(typeof pool?.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool required');
  return Object.freeze({
    transaction: work => withPostgresTransaction(pool, work, { createView: digitalSampleTransactionView }),
  });
}

export function digitalSampleTransactionView(client) {
  return Object.freeze({
    async getStyleVersion(id) {
      const { rows } = await client.query(`SELECT v.id, v.style_id, v.brand_id, v.content_hash, s.lifecycle_status
        FROM product_style_versions v JOIN product_styles s ON s.id = v.style_id AND s.brand_id = v.brand_id
        WHERE v.id = $1 FOR SHARE OF v, s`, [id]);
      const row = rows[0];
      return row && {
        id: row.id, styleId: row.style_id, brandId: row.brand_id,
        contentHash: row.content_hash.trim(), lifecycleStatus: row.lifecycle_status,
      };
    },

    async getMembership(brandId, actorId) {
      const { rows } = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2 FOR SHARE',
        [brandId, actorId],
      );
      return rows[0]?.payload;
    },

    async getSeries(id) {
      const { rows } = await client.query(
        'SELECT id, brand_id, style_id, style_version_id FROM digital_sample_series WHERE id = $1 FOR UPDATE',
        [id],
      );
      const row = rows[0];
      return row && {
        id: row.id, brandId: row.brand_id, styleId: row.style_id, styleVersionId: row.style_version_id,
      };
    },

    async latest(seriesId) {
      const { rows } = await client.query(
        'SELECT payload FROM digital_sample_versions WHERE series_id = $1 ORDER BY revision DESC LIMIT 1',
        [seriesId],
      );
      return rows[0]?.payload;
    },

    async getVersion(id) {
      const { rows } = await client.query('SELECT payload FROM digital_sample_versions WHERE id = $1', [id]);
      return rows[0]?.payload;
    },

    async list(styleVersionId, limit, afterId) {
      const { rows } = await client.query(`SELECT DISTINCT ON (series_id) payload FROM digital_sample_versions
        WHERE style_version_id = $1 AND ($3::text IS NULL OR series_id > $3)
        ORDER BY series_id, revision DESC LIMIT $2`, [styleVersionId, limit, afterId]);
      return rows.map(row => row.payload);
    },

    async history(seriesId, limit, afterId) {
      const { rows } = await client.query(`SELECT payload FROM digital_sample_versions
        WHERE series_id = $1 AND ($3::text IS NULL OR revision >
          (SELECT cursor.revision FROM digital_sample_versions cursor WHERE cursor.id = $3 AND cursor.series_id = $1))
        ORDER BY revision, id LIMIT $2`, [seriesId, limit, afterId]);
      return rows.map(row => row.payload);
    },

    async listScenarios(sampleVersionId, limit, afterId) {
      const { rows } = await client.query(`SELECT payload FROM digital_sample_scenarios
        WHERE sample_version_id = $1 AND ($3::text IS NULL OR id > $3) ORDER BY id LIMIT $2`,
      [sampleVersionId, limit, afterId]);
      return rows.map(row => row.payload);
    },

    async insertSeries(value) {
      await client.query(`INSERT INTO digital_sample_series
        (id,brand_id,style_id,style_version_id,created_at,created_by)
        VALUES ($1,$2,$3,$4,$5::timestamptz,$6)`,
      [value.id,value.brandId,value.styleId,value.styleVersionId,value.createdAt,value.createdBy]);
    },

    async insertVersion(value) {
      const { manifestHash, ...body } = value;
      await guardedInsert(() => client.query(`INSERT INTO digital_sample_versions
        (id,series_id,revision,previous_version_id,brand_id,style_id,style_version_id,style_version_hash,
         manifest_hash,canonical_manifest,payload,created_at,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz,$13)`,
      [value.id,value.seriesId,value.revision,value.previousVersionId,value.brandId,value.styleId,
        value.styleVersionId,value.styleVersionContentHash,manifestHash,canonicalJson(body),
        JSON.stringify(value),value.createdAt,value.createdBy]));
    },

    async insertScenario(value) {
      const { manifestHash, ...body } = value;
      await guardedInsert(() => client.query(`INSERT INTO digital_sample_scenarios
        (id,sample_version_id,brand_id,style_id,style_version_id,manifest_hash,canonical_manifest,payload,created_at,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::timestamptz,$10)`,
      [value.id,value.sampleVersionId,value.brandId,value.styleId,value.styleVersionId,manifestHash,
        canonicalJson(body),JSON.stringify(value),value.createdAt,value.createdBy]));
    },

    getCommand: id => getRegisteredCommand(client, 'digital-samples', id),
    insertCommand: value => insertRegisteredCommand(client, 'digital-samples', value),

    async appendOutbox(event) {
      await client.query(`INSERT INTO outbox_events (id,event_type,aggregate_id,status,event,published_at)
        VALUES ($1,$2,$3,'pending',$4::jsonb,NULL)`,
      [event.id,event.type,event.aggregateId,JSON.stringify(event)]);
    },
  });
}

async function guardedInsert(work) {
  try {
    await work();
  } catch (error) {
    if (error?.code === '23505' || error?.code === '40001') {
      invariant(false, 'DIGITAL_SAMPLE_CONCURRENCY_CONFLICT', 'Record changed or revision already exists');
    }
    throw error;
  }
}
