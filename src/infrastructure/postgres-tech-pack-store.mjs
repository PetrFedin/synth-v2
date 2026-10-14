import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresTechPackStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    // Canonical issuance reads its sources and writes the issued snapshot in
    // one SERIALIZABLE transaction, preventing newer source phantoms from
    // being silently accepted during a concurrent change.
    canonicalTransaction: (work) => withPostgresTransaction(pool, work, {
      createView: view, begin: 'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    }),
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
    // All reads are made through the SAME issuing client. The caller must
    // already hold the Tech Pack FOR UPDATE lock and current membership.
    async getCanonicalIssueSources(pack) {
      const found = await client.query(
        'SELECT product_sku_id FROM tech_packs WHERE tech_pack_code=$1 AND brand_id=$2 AND sku=$3 FOR SHARE',
        [pack.techPackCode, pack.brandId, pack.sku],
      );
      invariant(found.rowCount === 1, 'TECH_PACK_CANONICAL_CONTEXT_MISSING',
        'Exact stored Tech Pack identity is not available');
      const productSkuId = found.rows[0].product_sku_id ?? null;
      if (!productSkuId) return { productSkuId: null };
      const productResult = await client.query(
        `SELECT id, sku_code, brand_id, style_version_id, colorway_id, size_value_id, content_hash
           FROM product_skus WHERE id=$1 AND brand_id=$2 FOR SHARE`,
        [productSkuId, pack.brandId],
      );
      const product = productResult.rows[0];
      if (!product) return { productSkuId, productSku: null };
      const sizeResult = await client.query(
        'SELECT id, brand_id, size_scale_version_id FROM product_size_values WHERE id=$1 AND brand_id=$2 FOR SHARE',
        [product.size_value_id, pack.brandId],
      );
      const size = sizeResult.rows[0];
      const bomResult = await client.query(
        `SELECT id, sku, brand_id, status, version, product_sku_id, payload
           FROM boms WHERE product_sku_id=$1 AND brand_id=$2
           ORDER BY version DESC, id DESC LIMIT 1 FOR SHARE`,
        [productSkuId, pack.brandId],
      );
      const chartResult = await client.query(
        `SELECT id, sku, brand_id, status, version, style_version_id,
                colorway_id, size_scale_version_id, payload
           FROM measurement_charts
          WHERE brand_id=$1 AND style_version_id=$2 AND colorway_id=$3
            AND size_scale_version_id=$4
          ORDER BY version DESC, id DESC LIMIT 1 FOR SHARE`,
        [pack.brandId, product.style_version_id, product.colorway_id,
          size?.size_scale_version_id ?? null],
      );
      // As with the read-only preflight, select the latest PPS round and
      // check approval + supplier AFTER selection. Older approved samples
      // cannot override a more recent rejected or reassigned PPS.
      const sampleResult = await client.query(
        `SELECT sample_code, sku, brand_id, status, sample_type, version,
                product_sku_id, supplier_code, payload
           FROM samples
          WHERE product_sku_id=$1 AND brand_id=$2 AND sample_type='pre-production'
          ORDER BY round DESC, version DESC, sample_code DESC LIMIT 1 FOR SHARE`,
        [productSkuId, pack.brandId],
      );
      const bom = bomResult.rows[0], chart = chartResult.rows[0], sample = sampleResult.rows[0];
      return {
        productSkuId,
        productSku: {
          id: product.id, skuCode: product.sku_code, brandId: product.brand_id,
          styleVersionId: product.style_version_id, colorwayId: product.colorway_id,
          sizeValueId: product.size_value_id, contentHash: product.content_hash,
        },
        sizeValue: size ? { id: size.id, brandId: size.brand_id,
          sizeScaleVersionId: size.size_scale_version_id } : null,
        bom: bom ? { id: bom.id, sku: bom.sku, brandId: bom.brand_id,
          status: bom.status, version: bom.version, productSkuId: bom.product_sku_id,
          payload: bom.payload } : null,
        chart: chart ? { id: chart.id, sku: chart.sku, brandId: chart.brand_id,
          status: chart.status, version: chart.version,
          styleVersionId: chart.style_version_id, colorwayId: chart.colorway_id,
          sizeScaleVersionId: chart.size_scale_version_id, payload: chart.payload } : null,
        sample: sample ? { sampleCode: sample.sample_code, sku: sample.sku,
          brandId: sample.brand_id, status: sample.status, sampleType: sample.sample_type,
          version: sample.version, productSkuId: sample.product_sku_id,
          supplierCode: sample.supplier_code, payload: sample.payload } : null,
      };
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
    async insertTechPackOperation(value) {
      try {
        await insertOperation(client, value);
      } catch (error) {
        // Two operations cannot hold the same place in the sequence, or the same code within one
        // pack. A raw constraint name means nothing to whoever tripped it.
        if (error?.code === '23505') {
          invariant(false, 'TECH_PACK_OPERATION_ALREADY_EXISTS',
            'That sequence number or operation code is already used in this tech pack',
            { sequence: value.sequence, operationCode: value.operationCode });
        }
        throw error;
      }
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

async function insertOperation(client, value) {
await client.query(
    `INSERT INTO tech_pack_operations
       (id, tech_pack_code, brand_id, sequence, operation_code, name_ru, name_en, equipment, machine_class, standard_minutes, notes, payload, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)`,
    [value.id, value.techPackCode, value.brandId, value.sequence, value.operationCode, value.nameRu, value.nameEn,
     value.equipment, value.machineClass, value.standardMinutes, value.notes, JSON.stringify(value), value.createdAt, value.createdBy],
  );
}
