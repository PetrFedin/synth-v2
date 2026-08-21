import { invariant } from '../core/errors.mjs';
import { createPostgresProductIdentityReader } from './postgres-product-identity-reader.mjs';

export function createPostgresProductReadinessSourceReader({ pool, productIdentityReader = null } = {}) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const productReader = productIdentityReader ?? createPostgresProductIdentityReader({ pool });

  async function getStyleVersion(styleVersionId) {
    const result = await pool.query(
      `SELECT id, style_id, brand_id, version_no, content_hash
         FROM product_style_versions
        WHERE id = $1`,
      [styleVersionId],
    );
    return result.rows[0] ? mapStyleVersionIdentity(result.rows[0]) : undefined;
  }

  return Object.freeze({
    async getMembership(organisationId, userId) {
      const result = await pool.query('SELECT payload FROM memberships WHERE organisation_id = $1 AND user_id = $2', [organisationId, userId]);
      return result.rows[0]?.payload;
    },

    getStyleVersion,

    async loadAssessmentContext(styleVersionId) {
      const styleVersion = await getStyleVersion(styleVersionId);
      if (!styleVersion) return undefined;
      const aggregate = await productReader.getStyleAggregate(styleVersion.styleId, styleVersion.versionNo);
      invariant(aggregate?.styleVersion?.id === styleVersionId, 'PRODUCT_READINESS_STYLE_VERSION_RESOLUTION_FAILED', 'Exact Product Style Version aggregate could not be resolved', { styleVersionId });

      const evidenceResult = await pool.query(
        `SELECT product_sku.id AS product_sku_id,
                product_sku.sku_code,
                bom.id AS bom_id,
                bom.status AS bom_status,
                bom.version AS bom_version,
                sample.sample_code,
                sample.status AS sample_status,
                sample.sample_type,
                sample.round AS sample_round,
                sample.version AS sample_version,
                sample.decision_at AS sample_decision_at,
                tech.tech_pack_code,
                tech.status AS tech_pack_status,
                tech.revision AS tech_pack_revision,
                tech.version AS tech_pack_version,
                tech.acknowledged_at AS tech_pack_acknowledged_at,
                rfq.rfq_code,
                rfq.status AS sourcing_status,
                rfq.version AS sourcing_version,
                rfq.selected_supplier_code,
                rfq.allocated_at AS sourcing_allocated_at,
                production.production_order_number,
                production.status AS production_status,
                production.version AS production_version,
                production.confirmed_at AS production_confirmed_at,
                quality.inspection_code,
                quality.status AS quality_status,
                quality.version AS quality_version,
                quality.released_at AS quality_released_at
           FROM product_skus AS product_sku
           LEFT JOIN LATERAL (
             SELECT id, status, version
               FROM boms
              WHERE product_sku_id = product_sku.id
              ORDER BY version DESC, id DESC
              LIMIT 1
           ) AS bom ON true
           LEFT JOIN LATERAL (
             SELECT sample_code, status, sample_type, round, version, decision_at
               FROM samples
              WHERE product_sku_id = product_sku.id
                AND sample_type = 'pre-production'
              ORDER BY round DESC, version DESC, sample_code DESC
              LIMIT 1
           ) AS sample ON true
           LEFT JOIN LATERAL (
             SELECT tech_pack_code, status, revision, version, acknowledged_at
               FROM tech_packs
              WHERE product_sku_id = product_sku.id
              ORDER BY revision DESC, version DESC, tech_pack_code DESC
              LIMIT 1
           ) AS tech ON true
           LEFT JOIN LATERAL (
             SELECT rfq_code, status, version, selected_supplier_code, allocated_at
               FROM sourcing_rfqs
              WHERE product_sku_id = product_sku.id
              ORDER BY version DESC, rfq_code DESC
              LIMIT 1
           ) AS rfq ON true
           LEFT JOIN LATERAL (
             SELECT production_order_number, status, version, confirmed_at
               FROM production_orders
              WHERE product_sku_id = product_sku.id
              ORDER BY version DESC, production_order_number DESC
              LIMIT 1
           ) AS production ON true
           LEFT JOIN LATERAL (
             SELECT inspection_code, status, version, released_at
               FROM quality_inspections
              WHERE product_sku_id = product_sku.id
              ORDER BY version DESC, inspection_code DESC
              LIMIT 1
           ) AS quality ON true
          WHERE product_sku.style_version_id = $1
          ORDER BY product_sku.sku_code`,
        [styleVersionId],
      );

      const measurementResult = await pool.query(
        `SELECT chart.id,
                chart.style_version_id,
                chart.colorway_id,
                chart.size_scale_version_id,
                chart.status,
                chart.version,
                chart.measurement_unit_entry_id,
                chart.measurement_unit_entry_version,
                chart.base_size_value_id,
                chart.published_at,
                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'sizeValueId', chart_size.size_value_id,
                      'sizeCode', chart_size.size_code,
                      'position', chart_size.position
                    ) ORDER BY chart_size.position
                  ) FILTER (WHERE chart_size.size_value_id IS NOT NULL),
                  '[]'::jsonb
                ) AS sizes
           FROM measurement_charts AS chart
           LEFT JOIN measurement_chart_sizes AS chart_size
             ON chart_size.chart_id = chart.id
          WHERE chart.style_version_id = $1
            AND chart.colorway_id IS NOT NULL
            AND chart.size_scale_version_id IS NOT NULL
          GROUP BY chart.id,
                   chart.style_version_id,
                   chart.colorway_id,
                   chart.size_scale_version_id,
                   chart.status,
                   chart.version,
                   chart.measurement_unit_entry_id,
                   chart.measurement_unit_entry_version,
                   chart.base_size_value_id,
                   chart.published_at
          ORDER BY chart.colorway_id, chart.size_scale_version_id, chart.id`,
        [styleVersionId],
      );

      return Object.freeze({
        styleVersion,
        product: aggregate,
        measurementEvidence: Object.freeze(measurementResult.rows.map(mapMeasurementEvidence)),
        technicalEvidence: Object.freeze(evidenceResult.rows.map(mapTechnicalEvidence)),
      });
    },
  });
}

function mapStyleVersionIdentity(row) {
  return Object.freeze({
    id: row.id,
    styleId: row.style_id,
    brandId: row.brand_id,
    versionNo: row.version_no,
    contentHash: row.content_hash,
  });
}

function mapMeasurementEvidence(row) {
  const sizes = Array.isArray(row.sizes) ? row.sizes : [];
  return Object.freeze({
    id: row.id,
    styleVersionId: row.style_version_id,
    colorwayId: row.colorway_id,
    sizeScaleVersionId: row.size_scale_version_id,
    status: row.status,
    version: row.version,
    measurementUnitRef: row.measurement_unit_entry_id ? Object.freeze({ entryId: row.measurement_unit_entry_id, version: row.measurement_unit_entry_version }) : null,
    baseSizeValueId: row.base_size_value_id,
    sizeValueIds: Object.freeze(sizes.map((value) => value.sizeValueId).filter(Boolean)),
    sizes: Object.freeze(sizes.map((value) => Object.freeze({ sizeValueId: value.sizeValueId, sizeCode: value.sizeCode, position: value.position }))),
    publishedAt: iso(row.published_at),
  });
}

function mapTechnicalEvidence(row) {
  return Object.freeze({
    productSkuId: row.product_sku_id,
    skuCode: row.sku_code,
    bom: row.bom_id ? Object.freeze({ id: row.bom_id, status: row.bom_status, version: row.bom_version }) : null,
    sample: row.sample_code ? Object.freeze({ sampleCode: row.sample_code, status: row.sample_status, sampleType: row.sample_type, round: row.sample_round, version: row.sample_version, decisionAt: iso(row.sample_decision_at) }) : null,
    techPack: row.tech_pack_code ? Object.freeze({ techPackCode: row.tech_pack_code, status: row.tech_pack_status, revision: row.tech_pack_revision, version: row.tech_pack_version, acknowledgedAt: iso(row.tech_pack_acknowledged_at) }) : null,
    sourcing: row.rfq_code ? Object.freeze({ rfqCode: row.rfq_code, status: row.sourcing_status, version: row.sourcing_version, selectedSupplierCode: row.selected_supplier_code, allocatedAt: iso(row.sourcing_allocated_at) }) : null,
    productionOrder: row.production_order_number ? Object.freeze({ productionOrderNumber: row.production_order_number, status: row.production_status, version: row.production_version, confirmedAt: iso(row.production_confirmed_at) }) : null,
    quality: row.inspection_code ? Object.freeze({ inspectionCode: row.inspection_code, status: row.quality_status, version: row.quality_version, releasedAt: iso(row.quality_released_at) }) : null,
  });
}

function iso(value) { if (value === null || value === undefined) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
