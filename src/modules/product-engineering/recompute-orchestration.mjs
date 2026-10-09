import crypto from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const RECOMPUTE_EXECUTION_MODES = Object.freeze(['automatic','human_review','external_evidence']);
export const RECOMPUTE_EXECUTION_STATUSES = Object.freeze(['succeeded','blocked','failed']);
const SEVERITIES = Object.freeze(['medium','high','blocking']);
const HASH = /^[0-9a-f]{64}$/;

/**
 * Creates the exact stale dependency set that is allowed to drive orchestration.
 * The caller must supply observed/versioned dependency edges; this function never
 * invents downstream relationships from names, areas or heuristics.
 */
/** @param {any} options */
export function createStaleDependencySet({
  id,
  changeCase,
  triggerReceipt,
  dependencies,
  detectedAt,
  detectedBy,
} = {}) {
  invariant(changeCase?.id && changeCase?.brandId && changeCase?.styleId, 'PRODUCT_ENGINEERING_RECOMPUTE_CHANGE_CASE_REQUIRED', 'Exact change case is required');
  invariant(triggerReceipt?.changeCaseId === changeCase.id, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_MISMATCH', 'Trigger receipt must belong to the exact change case');
  invariant(triggerReceipt.disposition === 'resolved', 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_NOT_RESOLVED', 'Recompute orchestration requires a resolved correction receipt');
  invariant(triggerReceipt.resultReference && triggerReceipt.resultVerification, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_UNVERIFIED', 'Recompute orchestration requires a verified canonical correction');
  hash(triggerReceipt.receiptHash, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_RECEIPT_HASH_INVALID');
  hash(triggerReceipt.resultVerification.verificationHash, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_VERIFICATION_HASH_INVALID');
  invariant(Array.isArray(dependencies) && dependencies.length >= 1, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCIES_REQUIRED', 'At least one exact stale dependency is required');

  const normalized = dependencies.map(normalizeDependency).sort((a,b)=>a.id.localeCompare(b.id));
  const ids = new Set();
  for (const dependency of normalized) {
    invariant(!ids.has(dependency.id), 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_DUPLICATE', 'Stale dependency id is duplicated', { dependencyId: dependency.id });
    ids.add(dependency.id);
  }
  for (const dependency of normalized) {
    for (const parent of dependency.dependsOn) {
      invariant(ids.has(parent), 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_PARENT_MISSING', 'Dependency parent is not present in the exact stale set', { dependencyId: dependency.id, parent });
      invariant(parent !== dependency.id, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_SELF', 'A stale dependency cannot depend on itself', { dependencyId: dependency.id });
    }
  }

  const basis = deepFreeze({
    id: required(id, 'PRODUCT_ENGINEERING_RECOMPUTE_SET_ID_REQUIRED'),
    changeCaseId: changeCase.id,
    brandId: changeCase.brandId,
    styleId: changeCase.styleId,
    triggerReceiptId: triggerReceipt.id,
    triggerReceiptHash: triggerReceipt.receiptHash,
    triggerResultReference: clone(triggerReceipt.resultReference),
    triggerVerificationHash: triggerReceipt.resultVerification.verificationHash,
    dependencies: normalized,
    detectedAt: timestamp(detectedAt),
    detectedBy: actor(detectedBy),
  });
  return deepFreeze({ ...basis, dependencySetHash: sha(basis) });
}

/**
 * Builds a deterministic DAG plan. Topological levels are canonical: within each
 * level steps are sorted by dependency id, making replay independent of input order.
 */
/** @param {any} options */
export function createRecomputePlan({ id, staleDependencySet, createdAt, createdBy } = {}) {
  invariant(staleDependencySet?.id && Array.isArray(staleDependencySet.dependencies), 'PRODUCT_ENGINEERING_RECOMPUTE_SET_REQUIRED', 'Stale dependency set is required');
  hash(staleDependencySet.dependencySetHash, 'PRODUCT_ENGINEERING_RECOMPUTE_SET_HASH_INVALID');

  const steps = staleDependencySet.dependencies.map((dependency)=>deepFreeze({
    id: dependency.id,
    dependencyId: dependency.id,
    impactId: dependency.impactId,
    owningAuthority: dependency.target.authority,
    operation: dependency.operation,
    mode: dependency.mode,
    severity: dependency.severity,
    inputReference: dependency.target,
    sourceReference: dependency.source,
    dependsOn: dependency.dependsOn,
    evidence: dependency.evidence,
  }));
  const levels = topologicalLevels(steps);
  const basis = deepFreeze({
    id: required(id, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_ID_REQUIRED'),
    changeCaseId: staleDependencySet.changeCaseId,
    brandId: staleDependencySet.brandId,
    styleId: staleDependencySet.styleId,
    triggerReceiptId: staleDependencySet.triggerReceiptId,
    triggerReceiptHash: staleDependencySet.triggerReceiptHash,
    dependencySetId: staleDependencySet.id,
    dependencySetHash: staleDependencySet.dependencySetHash,
    steps,
    levels,
    createdAt: timestamp(createdAt),
    createdBy: actor(createdBy),
  });
  return deepFreeze({ ...basis, planHash: sha(basis) });
}

/**
 * Immutable proof of one bounded orchestration step.
 * The receipt records the requested operation and the independently verified result;
 * it does not grant Product Engineering mutation authority in the owning context.
 */
/** @param {any} options */
export function createRecomputeExecutionReceipt({
  id,
  plan,
  stepId,
  commandId,
  idempotencyKey,
  status,
  evidence,
  resultReference = null,
  resultVerification = null,
  errorCode = null,
  startedAt,
  completedAt,
} = {}) {
  invariant(plan?.id && Array.isArray(plan.steps), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_REQUIRED', 'Recompute plan is required');
  hash(plan.planHash, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_HASH_INVALID');
  const step = plan.steps.find((candidate)=>candidate.id===stepId);
  invariant(step, 'PRODUCT_ENGINEERING_RECOMPUTE_STEP_NOT_FOUND', 'Recompute step is not in the exact plan', { stepId });
  invariant(RECOMPUTE_EXECUTION_STATUSES.includes(status), 'PRODUCT_ENGINEERING_RECOMPUTE_STATUS_INVALID', 'Recompute execution status is invalid', { status });
  invariant(Array.isArray(evidence), 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_INVALID', 'Recompute execution evidence must be an array');

  const normalizedResult = resultReference === null ? null : exactReference(resultReference, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_REFERENCE_INVALID');
  const normalizedVerification = resultVerification === null ? null : clone(resultVerification);
  if (status === 'succeeded' && step.mode === 'automatic') {
    invariant(normalizedResult, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_REQUIRED', 'Successful automatic recompute requires a canonical result reference');
    invariant(normalizedVerification && normalizedVerification.authority === normalizedResult.authority, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED', 'Automatic recompute result requires independent owning-authority verification');
    hash(normalizedVerification.verificationHash, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED');
    invariant(normalizedVerification.requested?.entityId === normalizedResult.entityId, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED', 'Verification does not match the exact recompute result reference');
    invariant(String(normalizedVerification.requested?.version ?? '') === String(normalizedResult.version ?? ''), 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED', 'Verification version does not match the exact recompute result reference');
    invariant((normalizedVerification.requested?.contentHash ?? null) === (normalizedResult.contentHash ?? null), 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED', 'Verification hash reference does not match the exact recompute result reference');
  }
  if (status === 'succeeded' && step.mode !== 'automatic') {
    invariant(evidence.length >= 1, 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_REQUIRED', 'Human review or external evidence completion requires explicit evidence');
  }
  if (status !== 'succeeded') {
    invariant(typeof errorCode === 'string' && errorCode.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_FAILURE_CODE_REQUIRED', 'Blocked/failed recompute execution requires an error code');
  }

  const basis = deepFreeze({
    id: required(id, 'PRODUCT_ENGINEERING_RECOMPUTE_EXECUTION_ID_REQUIRED'),
    planId: plan.id,
    planHash: plan.planHash,
    stepId: step.id,
    dependencyId: step.dependencyId,
    owningAuthority: step.owningAuthority,
    operation: step.operation,
    mode: step.mode,
    commandId: required(commandId, 'PRODUCT_ENGINEERING_RECOMPUTE_COMMAND_ID_REQUIRED'),
    idempotencyKey: required(idempotencyKey, 'PRODUCT_ENGINEERING_RECOMPUTE_IDEMPOTENCY_KEY_REQUIRED'),
    inputReference: step.inputReference,
    status,
    evidence: deepFreeze(structuredClone(evidence)),
    resultReference: normalizedResult,
    resultVerification: normalizedVerification,
    errorCode: status === 'succeeded' ? null : errorCode.trim(),
    startedAt: timestamp(startedAt),
    completedAt: timestamp(completedAt),
  });
  invariant(Date.parse(basis.completedAt) >= Date.parse(basis.startedAt), 'PRODUCT_ENGINEERING_RECOMPUTE_TIME_ORDER_INVALID', 'Recompute completion cannot precede start');
  return deepFreeze({ ...basis, receiptHash: sha(basis) });
}

/** @param {any} options */
export function evaluateRecomputeAdmission({ plan, executionReceipts } = {}) {
  invariant(plan?.id && Array.isArray(plan.steps), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_REQUIRED', 'Recompute plan is required');
  invariant(Array.isArray(executionReceipts), 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPTS_INVALID', 'Execution receipts must be an array');
  const byStep = new Map();
  for (const receipt of executionReceipts) {
    invariant(receipt?.planId === plan.id && receipt?.planHash === plan.planHash, 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPT_PLAN_MISMATCH', 'Execution receipt does not belong to the exact plan');
    hash(receipt.receiptHash, 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPT_HASH_INVALID');
    invariant(!byStep.has(receipt.stepId), 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPT_DUPLICATE', 'Only one terminal execution receipt is allowed per plan step', { stepId: receipt.stepId });
    byStep.set(receipt.stepId, receipt);
  }
  const pendingStepIds = [];
  const failedStepIds = [];
  for (const step of plan.steps) {
    const receipt = byStep.get(step.id);
    if (!receipt) pendingStepIds.push(step.id);
    else if (receipt.status !== 'succeeded') failedStepIds.push(step.id);
  }
  const basis = deepFreeze({
    planId: plan.id,
    planHash: plan.planHash,
    admitted: pendingStepIds.length===0 && failedStepIds.length===0,
    pendingStepIds: Object.freeze(pendingStepIds),
    failedStepIds: Object.freeze(failedStepIds),
    successfulReceiptHashes: Object.freeze(plan.steps.map((step)=>byStep.get(step.id)?.receiptHash ?? null).filter(Boolean)),
  });
  return deepFreeze({ ...basis, admissionHash: sha(basis) });
}

/** @param {any} options */
export function createRecomputeOrchestrationReceipt({ id, plan, executionReceipts, admission, completedAt, completedBy } = {}) {
  invariant(admission?.planId === plan?.id && admission?.planHash === plan?.planHash, 'PRODUCT_ENGINEERING_RECOMPUTE_ADMISSION_MISMATCH', 'Admission result must belong to the exact recompute plan');
  invariant(admission.admitted === true, 'PRODUCT_ENGINEERING_RECOMPUTE_NOT_ADMITTED', 'Orchestration receipt can be sealed only after every exact plan step succeeds');
  const ordered = [...executionReceipts].sort((a,b)=>a.stepId.localeCompare(b.stepId));
  invariant(ordered.length === plan.steps.length, 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPTS_INCOMPLETE', 'Orchestration receipt requires one execution receipt for every plan step');
  const basis = deepFreeze({
    id: required(id, 'PRODUCT_ENGINEERING_RECOMPUTE_ORCHESTRATION_ID_REQUIRED'),
    planId: plan.id,
    planHash: plan.planHash,
    dependencySetId: plan.dependencySetId,
    dependencySetHash: plan.dependencySetHash,
    changeCaseId: plan.changeCaseId,
    triggerReceiptId: plan.triggerReceiptId,
    triggerReceiptHash: plan.triggerReceiptHash,
    executionReceiptHashes: Object.freeze(ordered.map((receipt)=>receipt.receiptHash)),
    admissionHash: admission.admissionHash,
    completedAt: timestamp(completedAt),
    completedBy: actor(completedBy),
  });
  return deepFreeze({ ...basis, receiptHash: sha(basis) });
}

function normalizeDependency(value) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_INVALID', 'Stale dependency must be an object');
  invariant(RECOMPUTE_EXECUTION_MODES.includes(value.mode), 'PRODUCT_ENGINEERING_RECOMPUTE_MODE_INVALID', 'Recompute execution mode is invalid', { mode:value.mode });
  invariant(SEVERITIES.includes(value.severity), 'PRODUCT_ENGINEERING_RECOMPUTE_SEVERITY_INVALID', 'Stale dependency severity is invalid', { severity:value.severity });
  invariant(['direct','derived','policy'].includes(value.dependencyKind), 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_KIND_INVALID', 'Dependency kind is invalid');
  invariant(typeof value.reason === 'string' && value.reason.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_REASON_REQUIRED', 'Stale dependency reason is required');
  invariant(typeof value.requiredAction === 'string' && value.requiredAction.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_ACTION_REQUIRED', 'Required action is required');
  invariant(typeof value.operation === 'string' && /^[a-z][a-z0-9_.-]{1,159}$/.test(value.operation), 'PRODUCT_ENGINEERING_RECOMPUTE_OPERATION_INVALID', 'Owning-domain operation code is invalid');
  invariant(Array.isArray(value.evidence) && value.evidence.length >= 1, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_EVIDENCE_REQUIRED', 'Exact stale dependency requires evidence');
  invariant(Array.isArray(value.dependsOn ?? []), 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDS_ON_INVALID', 'dependsOn must be an array');
  return deepFreeze({
    id: required(value.id, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_ID_REQUIRED'),
    impactId: required(value.impactId, 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_ID_REQUIRED'),
    source: exactReference(value.source, 'PRODUCT_ENGINEERING_RECOMPUTE_SOURCE_REFERENCE_INVALID'),
    target: exactReference(value.target, 'PRODUCT_ENGINEERING_RECOMPUTE_TARGET_REFERENCE_INVALID'),
    dependencyKind: value.dependencyKind,
    reason: value.reason.trim(),
    requiredAction: value.requiredAction.trim(),
    severity: value.severity,
    mode: value.mode,
    operation: value.operation,
    dependsOn: Object.freeze([...(value.dependsOn ?? [])].map((item)=>required(item, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDS_ON_INVALID')).sort()),
    evidence: deepFreeze(structuredClone(value.evidence)),
  });
}

function exactReference(value, code) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Exact authority reference is required');
  invariant(typeof value.authority === 'string' && /^[a-z][a-z0-9_.-]{1,159}$/.test(value.authority), code, 'Reference authority is invalid');
  invariant(typeof value.entityId === 'string' && value.entityId.trim(), code, 'Reference entity id is required');
  const version = value.version===undefined || value.version===null ? null : String(value.version);
  const contentHash = value.contentHash===undefined || value.contentHash===null ? null : value.contentHash;
  invariant(version!==null || contentHash!==null, code, 'Exact reference requires version or content hash');
  if (contentHash!==null) hash(contentHash, code);
  return deepFreeze({ authority:value.authority, entityId:value.entityId.trim(), version, contentHash });
}

function topologicalLevels(steps) {
  const byId = new Map(steps.map((step)=>[step.id,step]));
  const remaining = new Set(byId.keys());
  const completed = new Set();
  const levels = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id)=>byId.get(id).dependsOn.every((parent)=>completed.has(parent))).sort();
    invariant(ready.length>0, 'PRODUCT_ENGINEERING_RECOMPUTE_DAG_CYCLE', 'Recompute dependency graph contains a cycle');
    levels.push(Object.freeze(ready));
    for (const id of ready) { remaining.delete(id); completed.add(id); }
  }
  return Object.freeze(levels);
}

function sha(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function hash(value, code) { invariant(typeof value==='string' && HASH.test(value), code, 'SHA-256 hash is invalid'); return value; }
function required(value, code) { invariant(typeof value==='string' && value.trim() && value.length<=200, code, 'Identifier is required'); return value.trim(); }
function actor(value) { return required(value, 'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED'); }
function timestamp(value) { const date=new Date(value); invariant(Number.isFinite(date.getTime()), 'PRODUCT_ENGINEERING_RECOMPUTE_TIME_INVALID', 'Recompute timestamp is invalid'); return date.toISOString(); }
function clone(value) { return deepFreeze(structuredClone(value)); }
function deepFreeze(value) { if(!value || typeof value!=='object' || Object.isFrozen(value)) return value; Object.freeze(value); for(const nested of Object.values(value)) deepFreeze(nested); return value; }
