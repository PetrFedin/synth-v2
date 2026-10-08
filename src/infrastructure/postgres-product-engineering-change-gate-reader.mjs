import { invariant } from '../core/errors.mjs';

/** @param {{pool?:any}} [options] */
export function createPostgresProductEngineeringChangeGateReader({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function', 'PRODUCT_ENGINEERING_CHANGE_GATE_POOL_REQUIRED', 'Change-impact gate reader requires PostgreSQL pool');

  return Object.freeze({
    async listPendingImpactsForStyleVersion(styleVersionId) {
      invariant(typeof styleVersionId === 'string' && styleVersionId.trim(), 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_STYLE_VERSION_REQUIRED', 'Exact StyleVersion is required');
      const result = await pool.query(
        `SELECT impact.*
           FROM product_style_versions style_version
           JOIN product_engineering_change_cases change_case
             ON change_case.style_id = style_version.style_id
            AND change_case.brand_id = style_version.brand_id
           JOIN product_engineering_change_impacts impact
             ON impact.change_case_id = change_case.id
          WHERE style_version.id = $1
            AND change_case.status <> 'resolved'
            AND impact.status = 'pending'
          ORDER BY CASE impact.severity WHEN 'blocking' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                   impact.area, impact.entity_id, impact.id`,
        [styleVersionId],
      );
      return Object.freeze(result.rows.map(mapImpact));
    },
  });
}

function mapImpact(row) {
  return Object.freeze({
    id: row.id,
    changeCaseId: row.change_case_id,
    impactKind: row.impact_kind,
    entityId: row.entity_id,
    entityVersion: row.entity_version,
    area: row.area,
    requiredAction: row.required_action,
    severity: row.severity,
    evidenceStatus: row.evidence_status,
    basis: deepFreeze(row.basis),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by,
  });
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
