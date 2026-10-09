import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import {
  createRecomputeExecutionReceipt,
  createRecomputeOrchestrationReceipt,
  evaluateRecomputeAdmission,
} from '../modules/product-engineering/public.mjs';

/**
 * Exact operation allowlist. Product Engineering receives callable adapters only
 * for explicitly registered authority+operation pairs; there is no generic store,
 * repository or mutation callback.
 * @param {Record<string, (actorId: string, request: any) => Promise<any>>} adapters
 */
export function createAllowlistedProductEngineeringRecomputeDispatcher(adapters = {}) {
  invariant(adapters && typeof adapters === 'object' && !Array.isArray(adapters), 'PRODUCT_ENGINEERING_RECOMPUTE_ADAPTERS_INVALID', 'Recompute adapters must be an operation map');
  const registered = new Map();
  for (const [key, adapter] of Object.entries(adapters)) {
    invariant(/^[a-z][a-z0-9_.-]{1,159}:[a-z][a-z0-9_.-]{1,159}$/.test(key), 'PRODUCT_ENGINEERING_RECOMPUTE_ADAPTER_KEY_INVALID', 'Recompute adapter key must be authority:operation', { key });
    invariant(typeof adapter === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_ADAPTER_INVALID', 'Recompute adapter must be callable', { key });
    registered.set(key, adapter);
  }
  return Object.freeze({
    supportedOperations: Object.freeze([...registered.keys()].sort()),
    async dispatch(actorId, request) {
      invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED', 'Recompute dispatch requires actor id');
      invariant(request?.step?.owningAuthority && request?.step?.operation, 'PRODUCT_ENGINEERING_RECOMPUTE_DISPATCH_INPUT_INVALID', 'Exact recompute step is required');
      const key = `${request.step.owningAuthority}:${request.step.operation}`;
      const adapter = registered.get(key);
      invariant(adapter, 'PRODUCT_ENGINEERING_RECOMPUTE_OPERATION_UNSUPPORTED', 'No allowlisted owning-authority adapter exists for this recompute operation', { key, supportedOperations: [...registered.keys()].sort() });
      return adapter(actorId, Object.freeze({
        planId: request.plan.id,
        planHash: request.plan.planHash,
        stepId: request.step.id,
        authority: request.step.owningAuthority,
        operation: request.step.operation,
        inputReference: request.step.inputReference,
        sourceReference: request.step.sourceReference,
        idempotencyKey: request.idempotencyKey,
      }));
    },
  });
}

/** @param {any} options */
export function createProductEngineeringRecomputeOrchestrationService(options = {}) {
  const {
    store,
    dispatcher,
    resultVerifier,
    workerId = 'product-engineering-recompute-worker',
    clock = () => new Date().toISOString(),
    retryDelayMs = 5000,
    leaseMs = 60000,
    nextId = prefix => `${prefix}_${randomUUID()}`,
  } = options;
  invariant(store && typeof store.persistPlan === 'function' && typeof store.claim === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_STORE_REQUIRED', 'Recompute persistence store is required');
  invariant(dispatcher && typeof dispatcher.dispatch === 'function', 'PRODUCT_ENGINEERING_RECOMPUTE_DISPATCHER_REQUIRED', 'Allowlisted recompute dispatcher is required');
  invariant(resultVerifier && typeof resultVerifier.verify === 'function', 'PRODUCT_ENGINEERING_RESULT_VERIFIER_REQUIRED', 'Independent result verifier is required');

  async function persistPlan(staleDependencySet, plan) {
    invariant(plan?.dependencySetId === staleDependencySet?.id, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_SET_MISMATCH', 'Plan does not belong to the exact stale dependency set');
    return store.persistPlan(staleDependencySet, plan);
  }

  async function processPending(options = {}) {
    const { actorId, limit = 10 } = /** @type {any} */ (options);
    invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED', 'Worker requires an actor authorised to read owning authorities');
    const claimed = await store.claim({ workerId, limit, leaseMs, claimedAt: now() });
    const results = [];
    for (const job of claimed) {
      const startedAt = now();
      try {
        const plan = await store.getPlan(job.planId);
        invariant(plan, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', 'Recompute plan not found', { planId: job.planId });
        const step = plan.steps.find(candidate => candidate.id === job.stepId);
        invariant(step?.mode === 'automatic', 'PRODUCT_ENGINEERING_RECOMPUTE_JOB_STEP_INVALID', 'Durable worker may execute automatic steps only', { planId: job.planId, stepId: job.stepId });
        const dispatched = await dispatcher.dispatch(actorId, { plan, step, idempotencyKey: job.dedupeKey });
        const resultReference = dispatched?.resultReference ?? dispatched;
        invariant(resultReference && typeof resultReference === 'object' && !Array.isArray(resultReference), 'PRODUCT_ENGINEERING_RECOMPUTE_RESULT_REQUIRED', 'Owning authority must return an exact canonical result reference');
        const resultVerification = await resultVerifier.verify(actorId, resultReference);
        const evidence = Array.isArray(dispatched?.evidence)
          ? dispatched.evidence
          : [{ kind: 'owning_authority_dispatch', authority: step.owningAuthority, operation: step.operation, jobId: job.id }];
        const receipt = createRecomputeExecutionReceipt({
          id: nextId('recompute-execution'),
          plan,
          stepId: step.id,
          commandId: `recompute:${plan.id}:${step.id}`,
          idempotencyKey: job.dedupeKey,
          status: 'succeeded',
          evidence,
          resultReference,
          resultVerification,
          startedAt,
          completedAt: now(),
        });
        const completed = await store.completeWithReceipt({
          jobId: job.id,
          workerId,
          receipt,
          result: { resultReference, verificationHash: resultVerification.verificationHash },
          completedAt: receipt.completedAt,
        });
        results.push(Object.freeze({ jobId: job.id, planId: plan.id, stepId: step.id, status: completed.job.status, receiptHash: receipt.receiptHash }));
      } catch (error) {
        const code = errorCode(error);
        const retryAt = new Date(Date.parse(now()) + retryDelayMs * Math.min(16, 2 ** Math.max(0, job.attemptCount - 1))).toISOString();
        const failed = await store.fail({ jobId: job.id, workerId, errorCode: code, retryAt, failedAt: now() });
        results.push(Object.freeze({ jobId: job.id, planId: job.planId, stepId: job.stepId, status: failed.status, errorCode: code }));
      }
    }
    return Object.freeze(results);
  }

  async function completeEvidenceStep(options = {}) {
    const { planId, stepId, actorId, commandId, idempotencyKey, evidence, startedAt = now(), completedAt = now() } = /** @type {any} */ (options);
    const plan = await store.getPlan(planId);
    invariant(plan, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', 'Recompute plan not found', { planId });
    const step = plan.steps.find(candidate => candidate.id === stepId);
    invariant(step && step.mode !== 'automatic', 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_STEP_INVALID', 'Only human-review or external-evidence steps may be completed by evidence');
    invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_ACTOR_REQUIRED', 'Evidence completion requires the exact reviewing actor');
    invariant(Array.isArray(evidence) && evidence.length > 0, 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_REQUIRED', 'Evidence completion requires explicit evidence');
    // The evidence path must honour the same DAG dependencies as automatic workers.
    // No manual/external receipt may bypass an outstanding parent step.
    const ready = await store.listReadyEvidenceSteps(planId);
    invariant(ready.some(candidate => candidate.id === stepId), 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_NOT_READY', 'Evidence step is already completed or its dependencies are not yet admitted', { planId, stepId });
    const receipt = createRecomputeExecutionReceipt({
      id: nextId('recompute-execution'), plan, stepId, commandId, idempotencyKey,
      status: 'succeeded', evidence, startedAt, completedAt,
    });
    await store.recordExecutionReceipt(receipt);
    return receipt;
  }

  async function listAwaitingEvidence(planId) {
    invariant(typeof planId === 'string' && planId, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_ID_REQUIRED', 'Recompute plan id is required');
    return store.listReadyEvidenceSteps(planId);
  }

  async function sealPlan(options = {}) {
    const { planId, actorId } = /** @type {any} */ (options);
    const existing = await store.getOrchestrationReceipt(planId);
    if (existing) return existing;
    const plan = await store.getPlan(planId);
    invariant(plan, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_FOUND', 'Recompute plan not found', { planId });
    const executionReceipts = await store.listExecutionReceipts(planId);
    const admission = evaluateRecomputeAdmission({ plan, executionReceipts });
    const receipt = createRecomputeOrchestrationReceipt({
      id: nextId('recompute-orchestration'), plan, executionReceipts, admission,
      completedAt: now(), completedBy: actorId,
    });
    return store.recordOrchestrationReceipt(receipt);
  }

  function now() {
    const value = clock();
    invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'PRODUCT_ENGINEERING_RECOMPUTE_CLOCK_INVALID', 'Recompute clock is invalid');
    return new Date(value).toISOString();
  }

  return Object.freeze({ persistPlan, processPending, completeEvidenceStep, listAwaitingEvidence, sealPlan });
}

function errorCode(error) { return typeof error?.code === 'string' && error.code ? error.code : 'PRODUCT_ENGINEERING_RECOMPUTE_JOB_FAILED'; }
