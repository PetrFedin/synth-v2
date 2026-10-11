import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const READ_ROLES = rolesWithCapability(CAPABILITIES.TECH_PACK_READ);
const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

/**
 * One snapshot, no legacy SKU fallback. All evidence is resolved from the
 * stored product_sku_id and its exact owning Product Identity references.
 */
export function createPostgresTechPackCanonicalPreflightReader({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'TECH_PACK_PREFLIGHT_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    forActor(actorId, code) {
      return withPostgresTransaction(pool, async (db) => {
        const result = await db.query(
          `SELECT pack.tech_pack_code, pack.brand_id, pack.supplier_code,
                  pack.product_sku_id,
                  sku.brand_id AS sku_brand_id,
                  sku.style_version_id, sku.colorway_id, size_value.size_scale_version_id,
                  bom.id AS bom_id, bom.status AS bom_status,
                  bom.version AS bom_version, bom.product_sku_id AS bom_product_sku_id,
                  chart.id AS chart_id, chart.status AS chart_status,
                  chart.version AS chart_version,
                  chart.style_version_id AS chart_style_version_id,
                  chart.colorway_id AS chart_colorway_id,
                  chart.size_scale_version_id AS chart_size_scale_version_id,
                  sample.sample_code, sample.status AS sample_status,
                  sample.sample_type, sample.version AS sample_version,
                  sample.product_sku_id AS sample_product_sku_id,
                  sample.supplier_code AS sample_supplier_code
             FROM tech_packs AS pack
             LEFT JOIN product_skus AS sku
               ON sku.id = pack.product_sku_id AND sku.brand_id = pack.brand_id
             LEFT JOIN product_size_values AS size_value
               ON size_value.id = sku.size_value_id AND size_value.brand_id = pack.brand_id
             LEFT JOIN LATERAL (
               SELECT id, status, version, product_sku_id
                 FROM boms
                WHERE product_sku_id = pack.product_sku_id AND brand_id = pack.brand_id
                ORDER BY version DESC, id DESC LIMIT 1
             ) AS bom ON true
             LEFT JOIN LATERAL (
               SELECT id, status, version, style_version_id, colorway_id, size_scale_version_id
                 FROM measurement_charts
                WHERE brand_id = pack.brand_id
                  AND style_version_id = sku.style_version_id
                  AND colorway_id = sku.colorway_id
                  AND size_scale_version_id = size_value.size_scale_version_id
                ORDER BY version DESC, id DESC LIMIT 1
             ) AS chart ON true
             LEFT JOIN LATERAL (
               SELECT sample_code, status, sample_type, version, product_sku_id, supplier_code
                 FROM samples
                WHERE product_sku_id = pack.product_sku_id
                  AND brand_id = pack.brand_id
                  AND sample_type = 'pre-production'
                ORDER BY round DESC, version DESC, sample_code DESC LIMIT 1
             ) AS sample ON true
            WHERE pack.tech_pack_code = $1
              AND EXISTS (
                SELECT 1 FROM memberships AS m
                 WHERE m.user_id = $2 AND m.organisation_id = pack.brand_id
                   AND m.status = 'active' AND m.role = ANY($3::text[])
              )`,
          [code, actorId, READ_ROLES],
        );
        if (!result.rows.length) return undefined;
        const r=result.rows[0];
        return Object.freeze(Object.fromEntries(Object.entries({
          techPackCode:r.tech_pack_code, brandId:r.brand_id,
          supplierCode:r.supplier_code, productSkuId:r.product_sku_id,
          skuBrandId:r.sku_brand_id, styleVersionId:r.style_version_id,
          colorwayId:r.colorway_id, sizeScaleVersionId:r.size_scale_version_id,
          bomId:r.bom_id, bomStatus:r.bom_status, bomVersion:r.bom_version,
          bomProductSkuId:r.bom_product_sku_id,
          chartId:r.chart_id, chartStatus:r.chart_status, chartVersion:r.chart_version,
          chartStyleVersionId:r.chart_style_version_id, chartColorwayId:r.chart_colorway_id,
          chartSizeScaleVersionId:r.chart_size_scale_version_id,
          sampleCode:r.sample_code, sampleStatus:r.sample_status,
          sampleType:r.sample_type, sampleVersion:r.sample_version,
          sampleProductSkuId:r.sample_product_sku_id,
          sampleSupplierCode:r.sample_supplier_code,
        }).map(([key,value])=>[key,value??null])));
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
