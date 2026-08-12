import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresProductReadinessStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: view }),
    async getReadinessSnapshot(id) {
      const result = await pool.query('SELECT * FROM product_readiness_snapshots WHERE id = $1', [id]);
      return result.rows[0] ? mapReadiness(result.rows[0]) : undefined;
    },
    async getCommercialProjection(id) {
      const result = await pool.query('SELECT * FROM commercial_product_projection_versions WHERE id = $1', [id]);
      return result.rows[0] ? mapProjection(result.rows[0]) : undefined;
    },
    async listReadinessByStyleVersion(styleVersionId, { limit = 50 } = {}) {
      const result = await pool.query(
        `SELECT * FROM product_readiness_snapshots
          WHERE style_version_id = $1
          ORDER BY assessed_at DESC, id DESC
          LIMIT $2`,
        [styleVersionId, limit],
      );
      return Object.freeze(result.rows.map(mapReadiness));
    },
    async listCommercialProjectionsByStyleVersion(styleVersionId, { limit = 50 } = {}) {
      const result = await pool.query(
        `SELECT * FROM commercial_product_projection_versions
          WHERE style_version_id = $1
          ORDER BY version_no DESC
          LIMIT $2`,
        [styleVersionId, limit],
      );
      return Object.freeze(result.rows.map(mapProjection));
    },
  });
}

function view(client) {
  return Object.freeze({
    getCommand: (id) => getRegisteredCommand(client, 'product-readiness', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'product-readiness', value),

    async insertReadinessSnapshot(value) {
      await client.query(
        `INSERT INTO product_readiness_snapshots
          (id, style_version_id, brand_id, development_route, readiness_status,
           required_dimension_count, ready_dimension_count, not_applicable_dimension_count, blocked_dimension_count,
           dimensions, technical_snapshot, commercial_preparation_snapshot, content_hash, assessed_at, assessed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15)`,
        [
          value.id,
          value.styleVersionId,
          value.brandId,
          value.developmentRoute,
          value.readinessStatus,
          value.requiredDimensionCount,
          value.readyDimensionCount,
          value.notApplicableDimensionCount,
          value.blockedDimensionCount,
          JSON.stringify(value.dimensions),
          JSON.stringify(value.technicalSnapshot),
          JSON.stringify(value.commercialPreparationSnapshot),
          value.contentHash,
          value.assessedAt,
          value.assessedBy,
        ],
      );
    },

    async getReadinessSnapshotForUpdate(id) {
      const result = await client.query('SELECT * FROM product_readiness_snapshots WHERE id = $1 FOR SHARE', [id]);
      return result.rows[0] ? mapReadiness(result.rows[0]) : undefined;
    },

    async getLatestProjectionForUpdate(styleVersionId) {
      const result = await client.query(
        `SELECT * FROM commercial_product_projection_versions
          WHERE style_version_id = $1
          ORDER BY version_no DESC
          LIMIT 1
          FOR UPDATE`,
        [styleVersionId],
      );
      return result.rows[0] ? mapProjection(result.rows[0]) : undefined;
    },

    async insertCommercialProjection(value) {
      await client.query(
        `INSERT INTO commercial_product_projection_versions
          (id, style_version_id, brand_id, readiness_snapshot_id, version_no, source_projection_id,
           status, payload, content_hash, published_at, published_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [
          value.id,
          value.styleVersionId,
          value.brandId,
          value.readinessSnapshotId,
          value.versionNo,
          value.sourceProjectionId,
          value.status,
          JSON.stringify(value.payload),
          value.contentHash,
          value.publishedAt,
          value.publishedBy,
        ],
      );
    },
  });
}

function mapReadiness(row) {
  return Object.freeze({
    id: row.id,
    styleVersionId: row.style_version_id,
    brandId: row.brand_id,
    developmentRoute: row.development_route,
    readinessStatus: row.readiness_status,
    requiredDimensionCount: row.required_dimension_count,
    readyDimensionCount: row.ready_dimension_count,
    notApplicableDimensionCount: row.not_applicable_dimension_count,
    blockedDimensionCount: row.blocked_dimension_count,
    dimensions: deepFreeze(row.dimensions),
    technicalSnapshot: deepFreeze(row.technical_snapshot),
    commercialPreparationSnapshot: deepFreeze(row.commercial_preparation_snapshot),
    contentHash: row.content_hash,
    assessedAt: iso(row.assessed_at),
    assessedBy: row.assessed_by,
  });
}

function mapProjection(row) {
  return Object.freeze({
    id: row.id,
    styleVersionId: row.style_version_id,
    brandId: row.brand_id,
    readinessSnapshotId: row.readiness_snapshot_id,
    versionNo: row.version_no,
    sourceProjectionId: row.source_projection_id,
    status: row.status,
    payload: deepFreeze(row.payload),
    contentHash: row.content_hash,
    publishedAt: iso(row.published_at),
    publishedBy: row.published_by,
  });
}

function iso(value) { if (value === null || value === undefined) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
