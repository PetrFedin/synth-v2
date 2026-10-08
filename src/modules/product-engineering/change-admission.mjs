import { invariant } from '../../core/errors.mjs';

export const ENGINEERING_CHANGE_ADMISSION_POLICIES = Object.freeze({
  commercial_projection: Object.freeze(['commercial_publication','product_readiness']),
  commercial_publication: Object.freeze(['commercial_publication','product_readiness']),
  sourcing_release: Object.freeze(['sourcing','bom','tech_pack']),
  production_order_issue: Object.freeze(['production','tech_pack','supplier_acknowledgement','quality']),
  production_order_confirm: Object.freeze(['production','tech_pack','supplier_acknowledgement','quality']),
  cost_close: Object.freeze(['cost']),
});

/** @param {{operation?:string, styleVersionId?:string, pendingImpacts?:any[]}} [options] */
export function evaluateEngineeringChangeAdmission({ operation, styleVersionId, pendingImpacts = [] } = {}) {
  const areas = ENGINEERING_CHANGE_ADMISSION_POLICIES[operation];
  invariant(areas, 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_OPERATION_INVALID', 'Unknown Product Engineering change-admission operation', { operation });
  invariant(typeof styleVersionId === 'string' && styleVersionId.trim(), 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_STYLE_VERSION_REQUIRED', 'Change admission requires an exact StyleVersion');
  invariant(Array.isArray(pendingImpacts), 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_IMPACTS_INVALID', 'Change admission impacts must be an array');

  const blockers = pendingImpacts
    .filter((row) => row?.status === 'pending' && row?.evidenceStatus === 'policy_required' && areas.includes(row.area))
    .map((row) => deepFreeze({
      changeCaseId: row.changeCaseId,
      impactId: row.id,
      area: row.area,
      requiredAction: row.requiredAction,
      severity: row.severity,
      entityId: row.entityId,
      entityVersion: row.entityVersion ?? null,
      basis: structuredClone(row.basis ?? {}),
    }))
    .sort((a, b) => [a.area,a.entityId,a.impactId].join('|').localeCompare([b.area,b.entityId,b.impactId].join('|')));

  return deepFreeze({
    operation,
    styleVersionId,
    requiredAreas: [...areas],
    admitted: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
  });
}

/** @param {any} decision */
export function assertEngineeringChangeAdmission(decision) {
  invariant(decision?.admitted === true, 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_BLOCKED', 'Unresolved Product Engineering change requirements block this canonical operation', {
    operation: decision?.operation ?? null,
    styleVersionId: decision?.styleVersionId ?? null,
    blockerCount: decision?.blockerCount ?? null,
    blockers: decision?.blockers ?? [],
  });
  return decision;
}

/** @param {any} value */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
