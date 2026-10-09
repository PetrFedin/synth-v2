import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStaleDependencySet,
  createRecomputePlan,
  createRecomputeExecutionReceipt,
  evaluateRecomputeAdmission,
  createRecomputeOrchestrationReceipt,
} from '../src/modules/product-engineering/recompute-orchestration.mjs';

const NOW='2026-10-08T16:00:00.000Z';
const H=(c)=>c.repeat(64);
const changeCase=Object.freeze({id:'case-1',brandId:'brand-1',styleId:'style-1'});
const triggerReceipt=Object.freeze({
  id:'impact-receipt-1',changeCaseId:'case-1',disposition:'resolved',receiptHash:H('a'),
  resultReference:{authority:'material',entityId:'MAT-001',version:8},
  resultVerification:{authority:'material',requested:{entityId:'MAT-001'},verificationHash:H('b')},
});

function dep(id,{source='MAT-001',target,authority,version,mode='automatic',operation,dependsOn=[],severity='high'}={}) {
  return {
    id,
    impactId:`impact-${id}`,
    source:{authority:'material',entityId:source,version:8},
    target:{authority,entityId:target,version},
    dependencyKind:'derived',
    reason:'Exact downstream snapshot was derived from the superseded material version.',
    requiredAction:mode==='automatic'?'recompute':'re-review',
    severity,mode,operation,dependsOn,
    evidence:[{kind:'lineage',from:'MAT-001@7',to:`${target}@${version}`}],
  };
}

test('stale dependency set and recompute plan are deterministic DAGs with fan-out/fan-in levels',()=>{
  const set=createStaleDependencySet({
    id:'set-1',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[
      dep('commercial',{target:'CP-1',authority:'commercial_projection',version:4,operation:'commercial_projection.recompute',dependsOn:['cost','readiness']}),
      dep('readiness',{target:'READY-1',authority:'product_readiness',version:3,operation:'product_readiness.recompute'}),
      dep('cost',{target:'COST-1',authority:'cost_close',version:5,operation:'cost.recompute'}),
    ],
  });
  const plan=createRecomputePlan({id:'plan-1',staleDependencySet:set,createdAt:NOW,createdBy:'actor-1'});
  assert.deepEqual(plan.levels,[['cost','readiness'],['commercial']]);
  assert.match(set.dependencySetHash,/^[0-9a-f]{64}$/);
  assert.match(plan.planHash,/^[0-9a-f]{64}$/);

  const reordered=createStaleDependencySet({
    id:'set-1',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[
      dep('cost',{target:'COST-1',authority:'cost_close',version:5,operation:'cost.recompute'}),
      dep('commercial',{target:'CP-1',authority:'commercial_projection',version:4,operation:'commercial_projection.recompute',dependsOn:['readiness','cost']}),
      dep('readiness',{target:'READY-1',authority:'product_readiness',version:3,operation:'product_readiness.recompute'}),
    ],
  });
  assert.equal(reordered.dependencySetHash,set.dependencySetHash);
});

test('plan rejects missing parents and cycles rather than guessing execution order',()=>{
  assert.throws(()=>createStaleDependencySet({
    id:'set-x',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[dep('cost',{target:'COST-1',authority:'cost_close',version:5,operation:'cost.recompute',dependsOn:['missing']})],
  }),e=>e.code==='PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_PARENT_MISSING');

  const set=createStaleDependencySet({
    id:'set-cycle',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[
      dep('a',{target:'A',authority:'cost_close',version:1,operation:'cost.recompute',dependsOn:['b']}),
      dep('b',{target:'B',authority:'product_readiness',version:1,operation:'product_readiness.recompute',dependsOn:['a']}),
    ],
  });
  assert.throws(()=>createRecomputePlan({id:'plan-cycle',staleDependencySet:set,createdAt:NOW,createdBy:'actor-1'}),e=>e.code==='PRODUCT_ENGINEERING_RECOMPUTE_DAG_CYCLE');
});

test('automatic step cannot succeed without independently verified canonical result',()=>{
  const set=createStaleDependencySet({
    id:'set-1',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[dep('cost',{target:'COST-1',authority:'cost_close',version:5,operation:'cost.recompute'})],
  });
  const plan=createRecomputePlan({id:'plan-1',staleDependencySet:set,createdAt:NOW,createdBy:'actor-1'});
  assert.throws(()=>createRecomputeExecutionReceipt({
    id:'exec-1',plan,stepId:'cost',commandId:'cmd-1',idempotencyKey:'plan-1:cost',status:'succeeded',evidence:[],
    resultReference:{authority:'cost_close',entityId:'COST-1',version:6},
    startedAt:NOW,completedAt:NOW,
  }),e=>e.code==='PRODUCT_ENGINEERING_RECOMPUTE_RESULT_UNVERIFIED');
});

test('verified execution receipts seal admission and immutable orchestration receipt',()=>{
  const set=createStaleDependencySet({
    id:'set-1',changeCase,triggerReceipt,detectedAt:NOW,detectedBy:'actor-1',
    dependencies:[
      dep('cost',{target:'COST-1',authority:'cost_close',version:5,operation:'cost.recompute'}),
      dep('review',{target:'TP-1',authority:'tech_pack',version:2,mode:'human_review',operation:'tech_pack.review'}),
    ],
  });
  const plan=createRecomputePlan({id:'plan-1',staleDependencySet:set,createdAt:NOW,createdBy:'actor-1'});
  const cost=createRecomputeExecutionReceipt({
    id:'exec-cost',plan,stepId:'cost',commandId:'cmd-cost',idempotencyKey:'plan-1:cost',status:'succeeded',
    evidence:[{kind:'job',id:'job-1'}],
    resultReference:{authority:'cost_close',entityId:'COST-1',version:6},
    resultVerification:{authority:'cost_close',requested:{entityId:'COST-1'},observed:{entityId:'COST-1',version:'6'},verificationHash:H('c')},
    startedAt:NOW,completedAt:'2026-10-08T16:00:01.000Z',
  });
  const review=createRecomputeExecutionReceipt({
    id:'exec-review',plan,stepId:'review',commandId:'cmd-review',idempotencyKey:'plan-1:review',status:'succeeded',
    evidence:[{kind:'human_review',decision:'accepted',reviewer:'tech-1'}],
    startedAt:NOW,completedAt:'2026-10-08T16:00:02.000Z',
  });
  const pending=evaluateRecomputeAdmission({plan,executionReceipts:[cost]});
  assert.equal(pending.admitted,false);
  assert.deepEqual(pending.pendingStepIds,['review']);

  const admission=evaluateRecomputeAdmission({plan,executionReceipts:[review,cost]});
  assert.equal(admission.admitted,true);
  const receipt=createRecomputeOrchestrationReceipt({
    id:'orchestration-1',plan,executionReceipts:[review,cost],admission,
    completedAt:'2026-10-08T16:00:03.000Z',completedBy:'actor-1',
  });
  assert.match(receipt.receiptHash,/^[0-9a-f]{64}$/);
  assert.equal(receipt.planHash,plan.planHash);
  assert.equal(Object.isFrozen(receipt),true);
});
