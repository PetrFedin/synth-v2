import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresTechPackStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getTechPackByCode(code) {
      const result = await pool.query('SELECT payload FROM tech_packs WHERE tech_pack_code = $1', [code]);
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
      const result = await client.query("SELECT payload FROM boms WHERE sku = $1 AND status = 'published' FOR SHARE", [sku]);
      return result.rows[0]?.payload;
    },
    async getMeasurementBySku(sku) {
      const result = await client.query("SELECT payload FROM measurement_charts WHERE sku = $1 AND status = 'published' FOR SHARE", [sku]);
      return result.rows[0]?.payload;
    },
    async getApprovedPpsBySkuAndSupplier(sku, supplierCode) {
      const result = await client.query(
        `SELECT payload
           FROM samples
          WHERE sku = $1
            AND supplier_code = $2
            AND sample_type = 'pre-production'
            AND status = 'approved'
          ORDER BY decision_at DESC, sample_code DESC
          LIMIT 1
          FOR SHARE`,
        [sku, supplierCode],
      );
      return result.rows[0]?.payload;
    },
    async getTechPackByCode(code) {
      const result = await client.query('SELECT payload FROM tech_packs WHERE tech_pack_code = $1 FOR UPDATE', [code]);
      return result.rows[0]?.payload;
    },
    async getActiveTechPackBySku(sku) {
      const result = await client.query("SELECT payload FROM tech_packs WHERE sku = $1 AND status IN ('issued','acknowledged') FOR UPDATE", [sku]);
      return result.rows[0]?.payload;
    },
    async getTechPackBySource(sourceCode) {
      const result = await client.query('SELECT payload FROM tech_packs WHERE source_tech_pack_code = $1 FOR UPDATE', [sourceCode]);
      return result.rows[0]?.payload;
    },
    async insertTechPack(value) {
      try {
        await client.query(
          `INSERT INTO tech_packs
             (id, tech_pack_code, sku, brand_id, sku_version, revision, status, supplier_code,
              source_tech_pack_code, version, payload, created_at, updated_at, issued_at, acknowledged_at, withdrawn_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15::timestamptz,$16::timestamptz)`,
          parameters(value),
        );
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'TECH_PACK_ALREADY_EXISTS', 'Tech pack code, revision, source or active issue already exists', { techPackCode: value.techPackCode, sku: value.sku, revision: value.revision });
        throw error;
      }
    },
    async saveTechPack(value, expectedVersion) {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE tech_packs
            SET sku_version=$4, status=$5, supplier_code=$6, version=$7, payload=$8::jsonb,
                updated_at=$9::timestamptz, issued_at=$10::timestamptz, acknowledged_at=$11::timestamptz, withdrawn_at=$12::timestamptz
          WHERE id=$1 AND tech_pack_code=$2 AND brand_id=$3 AND version=$13`,
        [value.id, value.techPackCode, value.brandId, value.skuVersion, value.status, value.supplierCode, value.version, JSON.stringify(value), value.updatedAt, value.issuedAt, value.acknowledgedAt, value.withdrawnAt, expectedVersion],
      );
      invariant(result.rowCount === 1, 'TECH_PACK_CONCURRENCY_CONFLICT', 'Tech pack concurrency conflict', { techPackCode: value.techPackCode, expectedVersion });
    },
    getCommand: (id) => getRegisteredCommand(client, 'catalog', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'catalog', value),
    async appendOutbox(event) {
      try {
        await client.query("INSERT INTO outbox_events (id,event_type,aggregate_id,status,event,published_at) VALUES ($1,$2,$3,'pending',$4::jsonb,NULL)", [event.id, event.type, event.aggregateId, JSON.stringify(event)]);
      } catch (error) {
        if (error?.code === '23505') invariant(false, 'OUTBOX_EVENT_ALREADY_EXISTS', 'Outbox event already exists', { eventId: event.id });
        throw error;
      }
    },
  });
}

function parameters(value) {
  return [value.id, value.techPackCode, value.sku, value.brandId, value.skuVersion, value.revision, value.status, value.supplierCode, value.sourceTechPackCode, value.version, JSON.stringify(value), value.createdAt, value.updatedAt, value.issuedAt, value.acknowledgedAt, value.withdrawnAt];
}
