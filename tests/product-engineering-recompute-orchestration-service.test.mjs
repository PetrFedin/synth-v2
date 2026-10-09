import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaleDependencySet,
  createRecomputePlan,
} from '../src/modules/product-engineering/recompute-orchestration.mjs';
import {
  createAllowlistedProductEngineeringRecomputeDispatcher,
  createProductEngineeringRecomputeOrchestrationService,
} from '../src/application/product-engineering-recompute-orchestration-service.mjs';

const H = value => value.repeat(64);
const NOW = '2026-10-09T12:00:00.000Z';
const changeCase = Object.freeze({ id: 'case-1', brandId: 'brand-1', styleId: 'style-1' });
const triggerReceipt = Object.freeze({
  id: 'impact-receipt-1', changeCaseId: 'case-1', disposition: 'resolved', receiptHash: H('a'),
  resultReference: { authority: 'material', entityId: 'MAT-001', version: 8 },
  resultVerification: { authority: 'material', requested: { entityId: 'MAT-001' }, verificationHash: H('b') },
});

function dependency(id, overrides = {}) {
  return {
    id,
    source: { authority: 'material', entityId: 'MAT-001', version: 8 },
    target: { authority: overrides.authority ?? 'cost_close', entityId: overrides.entityId ?? 'COST-1', version: overrides.version ?? 5 },
    dependencyKind: 'derived',
    reason: 'Exact downstream snapshot uses the superseded material version.',
    requiredAction: overrides.mode === 'human_review' ? 're-review' : 'recompute',
    severity: 'high',
    mode: overrides.mode ?? 'automatic',
    operation: overrides.operation ?? 'cost.recompute',
    dependsOn: overrides.dependsOn ?? [],
    evidence: [{ kind: 'lineage', sourceVersion: 7 }],
  };
}

function fixture(dependencies) {
  const set = createStaleDependencySet({
    id: 'set-1', changeCase, triggerReceipt, dependencies, detectedAt: NOW, detectedBy: 'actor-1',
  });
  const plan = createRecomputePlan({ id: 'plan-1', staleDependencySet: set, createdAt: NOW, createdBy: 'actor-1' });
  return { set, plan };
}

test('allowlisted dispatcher exposes exact authority operation pairs and has no generic fallback', async () => {
  const calls = [];
  const dispatcher = createAllowlistedProductEngineeringRecomputeDispatcher({
    'cost_close:cost.recompute': async (actorId, request) => {
      calls.push({ actorId, request });
      return { resultReference: { authority: 'cost_close', entityId: 'COST-1', version: 6 } };
    },
  });
  const { plan } = fixture([dependency('cost')]);
  const result = await dispatcher.dispatch('worker-actor', { plan, step: plan.steps[0], idempotencyKey: 'key-1' });
  assert.equal(result.resultReference.version, 6);
  assert.equal(calls[0].request.operation, 'cost.recompute');
  await assert.rejects(
    dispatcher.dispatch('worker-actor', { plan, step: { ...plan.steps[0], operation: 'cost.generic-write' }, idempotencyKey: 'key-2' }),
    error => error.code === 'PRODUCT_ENGINEERING_RECOMPUTE_OPERATION_UNSUPPORTED',
  );
});

test('automatic job dispatch is independently verified before a successful immutable receipt is persisted', async () => {
  const { set, plan } = fixture([dependency('cost')]);
  let persisted = null;
  let completed = null;
  const store = {
    persistPlan: async (dependencySet, exactPlan) => { persisted = { dependencySet, exactPlan }; return persisted; },
    claim: async () => [{
      id: 'job-1', dedupeKey: `recompute:${plan.planHash}:cost`, planId: plan.id, stepId: 'cost',
      status: 'running', attemptCount: 1,
    }],
    getPlan: async () => plan,
    completeWithReceipt: async input => {
      completed = input;
      return { job: { status: 'completed' }, receipt: input.receipt };
    },
    fail: async () => { throw new Error('job must not fail'); },
    recordExecutionReceipt: async receipt => receipt,
    listReadyEvidenceSteps: async () => [],
    getOrchestrationReceipt: async () => null,
    listExecutionReceipts: async () => [],
    recordOrchestrationReceipt: async receipt => receipt,
  };
  const dispatcher = createAllowlistedProductEngineeringRecomputeDispatcher({
    'cost_close:cost.recompute': async () => ({
      resultReference: { authority: 'cost_close', entityId: 'COST-1', version: 6 },
      evidence: [{ kind: 'recompute_job', id: 'authority-job-1' }],
    }),
  });
  const verifier = {
    verify: async (_actorId, reference) => ({
      verifier: 'orderEconomics.getCostCloseForActor', authority: reference.authority,
      requested: { entityId: reference.entityId, version: String(reference.version), contentHash: null },
      observed: { entityId: reference.entityId, version: String(reference.version), contentHash: null },
      verificationHash: H('c'),
    }),
  };
  let tick = 0;
  const service = createProductEngineeringRecomputeOrchestrationService({
    store, dispatcher, resultVerifier: verifier,
    clock: () => new Date(Date.parse(NOW) + tick++ * 1000).toISOString(),
    nextId: prefix => `${prefix}-1`,
  });
  await service.persistPlan(set, plan);
  const outcome = await service.processPending({ actorId: 'worker-actor', limit: 1 });
  assert.equal(persisted.exactPlan.planHash, plan.planHash);
  assert.equal(outcome[0].status, 'completed');
  assert.equal(completed.receipt.status, 'succeeded');
  assert.equal(completed.receipt.resultVerification.verificationHash, H('c'));
  assert.equal(completed.receipt.owningAuthority, 'cost_close');
});

test('human review is completed only by explicit evidence and the exact admitted plan can then be sealed', async () => {
  const { plan } = fixture([dependency('review', { mode: 'human_review', authority: 'tech_pack', entityId: 'TP-1', operation: 'tech_pack.review' })]);
  const receipts = [];
  let sealed = null;
  const store = {
    persistPlan: async () => ({}), claim: async () => [], getPlan: async () => plan,
    completeWithReceipt: async () => { throw new Error('not automatic'); }, fail: async () => { throw new Error('not automatic'); },
    recordExecutionReceipt: async receipt => { receipts.push(receipt); return receipt; },
    listReadyEvidenceSteps: async () => [plan.steps[0]],
    getOrchestrationReceipt: async () => sealed,
    listExecutionReceipts: async () => receipts,
    recordOrchestrationReceipt: async receipt => { sealed = receipt; return receipt; },
  };
  const service = createProductEngineeringRecomputeOrchestrationService({
    store,
    dispatcher: createAllowlistedProductEngineeringRecomputeDispatcher({}),
    resultVerifier: { verify: async () => { throw new Error('human review does not use canonical result verification'); } },
    clock: () => NOW,
    nextId: prefix => `${prefix}-1`,
  });
  assert.equal((await service.listAwaitingEvidence(plan.id))[0].mode, 'human_review');
  await assert.rejects(
    service.completeEvidenceStep({
      planId: plan.id, stepId: 'not-a-step', actorId: 'technical-designer-1',
      commandId: 'bad-command', idempotencyKey: 'bad-key', evidence: [{ kind: 'review', status: 'accepted' }],
    }),
    error => error.code === 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_STEP_INVALID',
  );
  const receipt = await service.completeEvidenceStep({
    planId: plan.id, stepId: 'review', actorId: 'technical-designer-1', commandId: 'review-command-1',
    idempotencyKey: 'plan-1:review', evidence: [{ kind: 'human_review', decision: 'accepted', reviewer: 'technical-designer-1' }],
  });
  assert.equal(receipt.mode, 'human_review');
  assert.equal(receipt.status, 'succeeded');
  const orchestration = await service.sealPlan({ planId: plan.id, actorId: 'actor-1' });
  assert.equal(orchestration.planHash, plan.planHash);
  assert.match(orchestration.receiptHash, /^[0-9a-f]{64}$/);
});


test('human review cannot bypass an unfinished DAG parent', async () => {
  const { plan } = fixture([
    dependency('cost'),
    dependency('review', { mode: 'human_review', authority: 'tech_pack', entityId: 'TP-1', operation: 'tech_pack.review', dependsOn: ['cost'] }),
  ]);
  let recorded = false;
  const store = {
    persistPlan: async () => ({}),
    claim: async () => [],
    getPlan: async () => plan,
    completeWithReceipt: async () => { throw new Error('not automatic'); },
    fail: async () => { throw new Error('not automatic'); },
    recordExecutionReceipt: async () => { recorded = true; throw new Error('receipt must not be recorded'); },
    listReadyEvidenceSteps: async () => [],
    getOrchestrationReceipt: async () => null,
    listExecutionReceipts: async () => [],
    recordOrchestrationReceipt: async receipt => receipt,
  };
  const service = createProductEngineeringRecomputeOrchestrationService({
    store,
    dispatcher: createAllowlistedProductEngineeringRecomputeDispatcher({}),
    resultVerifier: { verify: async () => { throw new Error('not reached'); } },
    clock: () => NOW,
    nextId: prefix => `${prefix}-1`,
  });

  await assert.rejects(
    service.completeEvidenceStep({
      planId: plan.id,
      stepId: 'review',
      actorId: 'technical-designer-1',
      commandId: 'review-before-parent',
      idempotencyKey: 'plan-1:review-before-parent',
      evidence: [{ kind: 'human_review', decision: 'accepted', reviewer: 'technical-designer-1' }],
    }),
    error => error.code === 'PRODUCT_ENGINEERING_RECOMPUTE_EVIDENCE_NOT_READY',
  );
  assert.equal(recorded, false);
});
