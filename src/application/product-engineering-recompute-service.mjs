import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import {
  createRecomputeExecutionReceipt,
  createRecomputeOrchestrationReceipt,
  createRecomputePlan,
  createStaleDependencySet,
  evaluateRecomputeAdmission,
} from '../modules/product-engineering/recompute-orchestration.mjs';

const AUTOMATIC_IMPACT_AUTHORITIES = Object.freeze({
  measurements:'measurement',
  tech_pack:'tech_pack',
  sourcing:'sourcing_rfq',
  cost:'cost_close',
  product_readiness:'product_readiness',
  commercial_publication:'commercial_publication',
});

const AUTOMATIC_OPERATIONS = Object.freeze({
  material: Object.freeze(new Set(['material.recompute','material.revalidate'])),
  measurement: Object.freeze(new Set(['measurement.recompute','measurement.revalidate'])),
  tech_pack: Object.freeze(new Set(['tech_pack.recompute','tech_pack.revalidate'])),
  product_readiness: Object.freeze(new Set(['product_readiness.recompute','product_readiness.reassess'])),
  commercial_projection: Object.freeze(new Set(['commercial_projection.recompute','commercial_projection.reproject'])),
  commercial_publication: Object.freeze(new Set(['commercial_publication.recompute','commercial_publication.republish'])),
  cost_close: Object.freeze(new Set(['cost.recompute','cost_close.recompute'])),
  sourcing_rfq: Object.freeze(new Set(['sourcing.recompute','sourcing_rfq.recompute'])),
});

/**
 * Durable Product Engineering recompute/re-review control plane.
 *
 * It persists exact plans and receipts but never performs a generic write into
 * downstream bounded contexts. Automatic steps can be completed only with an
 * independently verified owning-authority result reference.
 *
 * @param {{
 *   store?:any,
 *   productEngineering?:any,
 *   resultVerifier?:any,
 *   clock?:()=>string,
 *   nextId?:(prefix:string)=>string
 * }} [options]
 */
export function createProductEngineeringRecomputeService(options = {}) {
  const {
    store,
    productEngineering,
    resultVerifier,
    clock = () => new Date().toISOString(),
    nextId = (prefix) => `${prefix}_${randomUUID()}`,
  } = options;
  invariant(store && typeof store.transaction === 'function' && typeof store.getPlanWorkspace === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_STORE_REQUIRED', 'Recompute orchestration store is required');
  invariant(productEngineering && typeof productEngineering.getChangeCaseForActor === 'function' && typeof productEngineering.getChangeImpactReceiptForActor === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_PRODUCT_ENGINEERING_REQUIRED', 'Product Engineering change-case service is required');
  invariant(resultVerifier && typeof resultVerifier.verify === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_VERIFIER_REQUIRED', 'Owning-authority result verifier is required');

  async function replayExisting(commandId, fingerprint) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every recompute mutation requires commandId');
    const previous = await store.getCommand?.(commandId);
    if (!previous) return null;
    invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
    return previous.result;
  }

  async function runCommand(commandId, actorId, fingerprint, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every recompute mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id:commandId, fingerprint, actorId, result, completedAt:now() }));
      return result;
    });
  }

  return Object.freeze({
    async createPlan(commandId, actorId, changeCaseId, input = {}) {
      assertObject(input,'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_INPUT_INVALID');
      invariant(typeof input.triggerImpactId === 'string' && input.triggerImpactId.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_IMPACT_REQUIRED', 'Exact trigger impact is required');
      invariant(Array.isArray(input.dependencies) && input.dependencies.length >= 1, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCIES_REQUIRED', 'At least one exact dependency is required');
      const fingerprint = `createProductEngineeringRecomputePlan:${actorId}:${changeCaseId}:${canonicalJson({triggerImpactId:input.triggerImpactId,dependencies:input.dependencies})}`;
      const workspace = await productEngineering.getChangeCaseForActor(actorId, changeCaseId);
      const replay = await replayExisting(commandId, fingerprint);
      if (replay !== null) return replay;
      const triggerReceipt = await productEngineering.getChangeImpactReceiptForActor(actorId, input.triggerImpactId);
      invariant(triggerReceipt.changeCaseId === changeCaseId, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_MISMATCH', 'Trigger receipt belongs to another change case');
      const impactById = new Map((workspace.impacts ?? []).map((impact)=>[impact.id,impact]));

      const dependencies = input.dependencies.map((dependency) => {
        assertObject(dependency,'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_INVALID');
        const impact = impactById.get(dependency.impactId);
        invariant(impact, 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_NOT_IN_CASE', 'Dependency impact does not belong to the exact change case', { impactId:dependency.impactId, changeCaseId });
        invariant(impact.status === 'pending' || impact.status === 'acknowledged', 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_ALREADY_CLOSED', 'Only an unresolved impact can enter a recompute plan', { impactId:impact.id, status:impact.status });
        invariant(dependency.requiredAction === impact.requiredAction, 'PRODUCT_ENGINEERING_RECOMPUTE_ACTION_MISMATCH', 'Dependency action must match the exact change impact', { impactId:impact.id, expected:impact.requiredAction, actual:dependency.requiredAction });
        invariant(dependency.severity === impact.severity, 'PRODUCT_ENGINEERING_RECOMPUTE_SEVERITY_MISMATCH', 'Dependency severity must match the exact change impact', { impactId:impact.id, expected:impact.severity, actual:dependency.severity });
        invariant(sameReference(dependency.source, triggerReceipt.resultReference), 'PRODUCT_ENGINEERING_RECOMPUTE_SOURCE_MISMATCH', 'Every stale dependency must originate from the exact verified correction reference', { impactId:impact.id });
        if (dependency.mode === 'automatic') {
          const expectedAuthority = AUTOMATIC_IMPACT_AUTHORITIES[impact.area];
          invariant(expectedAuthority && dependency.target?.authority === expectedAuthority, 'PRODUCT_ENGINEERING_RECOMPUTE_AUTOMATIC_AUTHORITY_MISMATCH', 'Automatic target authority must match the exact impact area policy', { impactId:impact.id, area:impact.area, expectedAuthority:expectedAuthority ?? null, actualAuthority:dependency.target?.authority ?? null });
          const allowed = AUTOMATIC_OPERATIONS[dependency.target?.authority];
          invariant(allowed?.has(dependency.operation), 'PRODUCT_ENGINEERING_RECOMPUTE_AUTOMATIC_OPERATION_UNSUPPORTED', 'Automatic operation is not allowlisted for the owning authority', { authority:dependency.target?.authority, operation:dependency.operation });
        }
        return dependency;
      });

      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exactTriggerReceipt = required(await tx.getChangeImpactReceiptByImpact(input.triggerImpactId), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RECEIPT_NOT_FOUND', { impactId:input.triggerImpactId });
        invariant(exactTriggerReceipt.receiptHash === triggerReceipt.receiptHash && exactTriggerReceipt.changeCaseId === changeCaseId, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_CHANGED', 'Trigger correction receipt changed before plan persistence', { impactId:input.triggerImpactId });
        for (const dependency of dependencies) {
          const exactImpact = required(await tx.getChangeImpactForUpdate(dependency.impactId), 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_NOT_IN_CASE', { impactId:dependency.impactId });
          invariant(exactImpact.changeCaseId === changeCaseId, 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_NOT_IN_CASE', 'Dependency impact belongs to another change case', { impactId:dependency.impactId, changeCaseId });
          invariant(exactImpact.status === 'pending' || exactImpact.status === 'acknowledged', 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_ALREADY_CLOSED', 'Only an unresolved impact can enter a recompute plan', { impactId:exactImpact.id, status:exactImpact.status });
          invariant(exactImpact.requiredAction === dependency.requiredAction && exactImpact.severity === dependency.severity, 'PRODUCT_ENGINEERING_RECOMPUTE_IMPACT_CHANGED', 'Dependency impact semantics changed before plan persistence', { impactId:exactImpact.id });
        }
        const staleSet = createStaleDependencySet({
          id:nextId('engineering-recompute-set'),
          changeCase:workspace.changeCase,
          triggerReceipt:exactTriggerReceipt,
          dependencies,
          detectedAt:now(),
          detectedBy:actorId,
        });
        const existing = await tx.getDependencySetByTrigger(changeCaseId, triggerReceipt.id);
        if (existing) {
          invariant(existing.dependencySetHash === staleSet.dependencySetHash, 'PRODUCT_ENGINEERING_RECOMPUTE_TRIGGER_CONFLICT', 'Trigger receipt already owns a different immutable dependency set', { triggerReceiptId:triggerReceipt.id });
          const existingPlan = await tx.getPlanByDependencySet(existing.id);
          if (existingPlan) return deepFreeze({ dependencySet:existing, plan:existingPlan });
        } else {
          await tx.insertDependencySet(staleSet);
        }
        const exactSet = existing ?? staleSet;
        const plan = createRecomputePlan({
          id:nextId('engineering-recompute-plan'),
          staleDependencySet:exactSet,
          createdAt:now(),
          createdBy:actorId,
        });
        await tx.insertPlan(plan);
        return deepFreeze({ dependencySet:exactSet, plan });
      });
    },

    async getPlanForActor(actorId, planId) {
      const workspace = required(await store.getPlanWorkspace(planId), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', { planId });
      await productEngineering.getChangeCaseForActor(actorId, workspace.plan.changeCaseId);
      return workspace;
    },

    async completeStep(commandId, actorId, planId, stepId, input = {}) {
      assertObject(input,'PRODUCT_ENGINEERING_RECOMPUTE_STEP_INPUT_INVALID');
      const fingerprintInput = {
        status:input.status,
        evidence:input.evidence ?? [],
        resultReference:input.resultReference ?? null,
        errorCode:input.errorCode ?? null,
      };
      const fingerprint = `completeProductEngineeringRecomputeStep:${actorId}:${planId}:${stepId}:${canonicalJson(fingerprintInput)}`;
      const workspace = required(await store.getPlanWorkspace(planId), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', { planId });
      await productEngineering.getChangeCaseForActor(actorId, workspace.plan.changeCaseId);
      const replay = await replayExisting(commandId, fingerprint);
      if (replay !== null) return replay;
      const step = workspace.plan.steps.find((candidate)=>candidate.id===stepId);
      invariant(step, 'PRODUCT_ENGINEERING_RECOMPUTE_STEP_NOT_FOUND', 'Recompute step is not in the exact plan', { planId, stepId });
      invariant(workspace.plan.status === 'open', 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_OPEN', 'Only an open recompute plan accepts step results', { planId, status:workspace.plan.status });
      const succeeded = new Set(workspace.executionReceipts.filter((receipt)=>receipt.status==='succeeded').map((receipt)=>receipt.stepId));
      const missingParents = step.dependsOn.filter((parent)=>!succeeded.has(parent));
      invariant(missingParents.length===0, 'PRODUCT_ENGINEERING_RECOMPUTE_STEP_DEPENDENCY_BLOCKED', 'Recompute step cannot complete before all exact parent steps succeed', { stepId, missingParents });

      const status = input.status;
      invariant(['succeeded','blocked','failed'].includes(status), 'PRODUCT_ENGINEERING_RECOMPUTE_STATUS_INVALID', 'Recompute execution status is invalid');
      let resultVerification = null;
      if (status === 'succeeded' && input.resultReference) {
        resultVerification = await resultVerifier.verify(actorId, input.resultReference);
      }
      if (status === 'succeeded' && step.mode === 'automatic') {
        invariant(input.resultReference, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_REQUIRED', 'Automatic step requires an exact owning-authority result');
        invariant(input.resultReference.authority === step.owningAuthority, 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_AUTHORITY_MISMATCH', 'Automatic result authority must match the exact plan step', { expected:step.owningAuthority, actual:input.resultReference.authority });
      }

      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const exactPlan = required(await tx.getPlanForUpdate(planId), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', { planId });
        invariant(exactPlan.status === 'open', 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_OPEN', 'Only an open recompute plan accepts step results', { planId, status:exactPlan.status });
        const existing = await tx.getExecutionReceiptByStep(planId,stepId);
        invariant(!existing, 'PRODUCT_ENGINEERING_RECOMPUTE_STEP_ALREADY_TERMINAL', 'Recompute step already has an immutable terminal receipt', { planId, stepId });
        const receipts = await tx.listExecutionReceipts(planId);
        const exactSucceeded = new Set(receipts.filter((receipt)=>receipt.status==='succeeded').map((receipt)=>receipt.stepId));
        const exactStep = exactPlan.steps.find((candidate)=>candidate.id===stepId);
        const exactMissingParents = exactStep.dependsOn.filter((parent)=>!exactSucceeded.has(parent));
        invariant(exactMissingParents.length===0, 'PRODUCT_ENGINEERING_RECOMPUTE_STEP_DEPENDENCY_BLOCKED', 'Recompute step cannot complete before all exact parent steps succeed', { stepId, missingParents:exactMissingParents });
        const startedAt = input.startedAt ?? now();
        const completedAt = input.completedAt ?? now();
        const receipt = createRecomputeExecutionReceipt({
          id:nextId('engineering-recompute-execution'),
          plan:exactPlan,
          stepId,
          commandId,
          idempotencyKey:`${planId}:${stepId}`,
          status,
          evidence:input.evidence ?? [],
          resultReference:input.resultReference ?? null,
          resultVerification,
          errorCode:input.errorCode ?? null,
          startedAt,
          completedAt,
        });
        await tx.insertExecutionReceipt(receipt);
        return receipt;
      });
    },

    async sealPlan(commandId, actorId, planId) {
      const workspace = required(await store.getPlanWorkspace(planId), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', { planId });
      const fingerprint = `sealProductEngineeringRecomputePlan:${actorId}:${planId}:${workspace.plan.planHash}`;
      await productEngineering.getChangeCaseForActor(actorId, workspace.plan.changeCaseId);
      const replay = await replayExisting(commandId, fingerprint);
      if (replay !== null) return replay;
      return runCommand(commandId, actorId, fingerprint, async (tx) => {
        const plan = required(await tx.getPlanForUpdate(planId), 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', { planId });
        const existing = await tx.getOrchestrationReceiptByPlan(planId);
        if (existing) return existing;
        invariant(plan.status === 'open', 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_OPEN', 'Only an open plan can be sealed', { planId, status:plan.status });
        const executionReceipts = await tx.listExecutionReceipts(planId);
        const admission = evaluateRecomputeAdmission({ plan, executionReceipts });
        const receipt = createRecomputeOrchestrationReceipt({
          id:nextId('engineering-recompute-orchestration'),
          plan,
          executionReceipts,
          admission,
          completedAt:now(),
          completedBy:actorId,
        });
        await tx.insertOrchestrationReceipt(receipt);
        await tx.markPlanCompleted(planId,receipt.completedAt,actorId);
        return receipt;
      });
    },
  });

  function now() {
    const value = clock();
    invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'PRODUCT_ENGINEERING_RECOMPUTE_CLOCK_INVALID', 'Recompute clock is invalid');
    return new Date(value).toISOString();
  }
}

/** @param {any} left @param {any} right */
function sameReference(left,right) {
  if (!left || !right) return false;
  return left.authority===right.authority
    && left.entityId===right.entityId
    && String(left.version ?? '')===String(right.version ?? '')
    && (left.contentHash ?? null)===(right.contentHash ?? null);
}
/** @param {any} value @param {string} code */
function assertObject(value,code){invariant(value&&typeof value==='object'&&!Array.isArray(value),code,'Object input is required');}
/** @param {any} value @param {string} code @param {any} details */
function required(value,code,details){invariant(value,code,'Required recompute entity not found',details);return value;}
/** @param {any} value */
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
