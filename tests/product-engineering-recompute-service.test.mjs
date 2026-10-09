import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringRecomputeService } from '../src/application/product-engineering-recompute-service.mjs';

const H=(c)=>c.repeat(64);
const NOW='2026-10-09T16:30:00.000Z';

function fixture(){
  let dependencySet=null;
  let plan=null;
  let orchestration=null;
  const executions=[];
  const commands=new Map();
  let seq=0;
  const store={
    async getPlanWorkspace(planId){
      if(!plan || plan.id!==planId) return undefined;
      return {
        plan,
        dependencies:dependencySet.dependencies,
        triggerResultReference:dependencySet.triggerResultReference,
        triggerVerificationHash:dependencySet.triggerVerificationHash,
        executionReceipts:[...executions],
        orchestrationReceipt:orchestration,
      };
    },
    async transaction(work){
      return work({
        getCommand:async(id)=>commands.get(id),
        insertCommand:async(value)=>commands.set(value.id,value),
        getDependencySetByTrigger:async()=>dependencySet,
        insertDependencySet:async(value)=>{dependencySet=value;},
        getPlanByDependencySet:async(id)=>plan?.dependencySetId===id?plan:undefined,
        insertPlan:async(value)=>{plan={...value,status:'open',completedAt:null,completedBy:null};},
        getPlanForUpdate:async()=>plan,
        listExecutionReceipts:async()=>[...executions],
        getExecutionReceiptByStep:async(_planId,stepId)=>executions.find(row=>row.stepId===stepId),
        insertExecutionReceipt:async(value)=>executions.push(value),
        getOrchestrationReceiptByPlan:async()=>orchestration,
        insertOrchestrationReceipt:async(value)=>{orchestration=value;},
        markPlanCompleted:async(_id,completedAt,completedBy)=>{plan={...plan,status:'completed',completedAt,completedBy};},
      });
    },
  };
  const changeCase={id:'case-1',brandId:'brand-1',styleId:'style-1',status:'acknowledged'};
  const impacts=[
    {id:'impact-trigger',changeCaseId:'case-1',status:'resolved',requiredAction:'re-review',severity:'high'},
    {id:'impact-ready',changeCaseId:'case-1',status:'pending',requiredAction:'reassess',severity:'high'},
  ];
  const triggerReceipt={
    id:'receipt-trigger',changeCaseId:'case-1',impactId:'impact-trigger',disposition:'resolved',
    resultReference:{authority:'material',entityId:'MAT-1',version:8,contentHash:null},
    resultVerification:{authority:'material',requested:{entityId:'MAT-1'},verificationHash:H('b')},
    receiptHash:H('a'),
  };
  const productEngineering={
    getChangeCaseForActor:async()=>({changeCase,impacts,receipts:[triggerReceipt]}),
    getChangeImpactReceiptForActor:async()=>triggerReceipt,
  };
  const verifier={
    verify:async(_actor,reference)=>({
      verifier:'productReadiness.getReadinessForActor',authority:reference.authority,
      requested:{entityId:reference.entityId,version:String(reference.version),contentHash:null},
      observed:{authority:reference.authority,entityId:reference.entityId,version:String(reference.version),contentHash:null},
      verificationHash:H('c'),
    }),
  };
  const service=createProductEngineeringRecomputeService({
    store,productEngineering,resultVerifier:verifier,clock:()=>NOW,
    nextId:(prefix)=>`${prefix}-${++seq}`,
  });
  return {service,store,productEngineering,verifier,get plan(){return plan;},get executions(){return executions;}};
}

const dependency={
  id:'ready-step',
  impactId:'impact-ready',
  source:{authority:'material',entityId:'MAT-1',version:8,contentHash:null},
  target:{authority:'product_readiness',entityId:'READY-1',version:2},
  dependencyKind:'derived',
  reason:'Readiness snapshot depends on the corrected material.',
  requiredAction:'reassess',
  severity:'high',
  mode:'automatic',
  operation:'product_readiness.reassess',
  dependsOn:[],
  evidence:[{kind:'lineage',from:'MAT-1@7',to:'READY-1@2'}],
};

test('control plane persists exact trigger-bound deterministic plan',async()=>{
  const fx=fixture();
  const created=await fx.service.createPlan('cmd-plan','actor-1','case-1',{
    triggerImpactId:'impact-trigger',
    dependencies:[dependency],
  });
  assert.equal(created.plan.changeCaseId,'case-1');
  assert.equal(created.plan.steps[0].impactId,'impact-ready');
  assert.equal(created.plan.steps[0].owningAuthority,'product_readiness');
  assert.match(created.plan.planHash,/^[0-9a-f]{64}$/);

  const replay=await fx.service.createPlan('cmd-plan','actor-1','case-1',{
    triggerImpactId:'impact-trigger',
    dependencies:[dependency],
  });
  assert.equal(replay.plan.id,created.plan.id);
});

test('automatic step succeeds only after owning authority verification and then plan can seal',async()=>{
  const fx=fixture();
  const created=await fx.service.createPlan('cmd-plan','actor-1','case-1',{triggerImpactId:'impact-trigger',dependencies:[dependency]});
  const receipt=await fx.service.completeStep('cmd-step','actor-1',created.plan.id,'ready-step',{
    status:'succeeded',
    evidence:[{kind:'recompute_job',id:'job-1'}],
    resultReference:{authority:'product_readiness',entityId:'READY-2',version:3},
  });
  assert.equal(receipt.status,'succeeded');
  assert.equal(receipt.resultVerification.authority,'product_readiness');
  assert.match(receipt.receiptHash,/^[0-9a-f]{64}$/);

  const sealed=await fx.service.sealPlan('cmd-seal','actor-1',created.plan.id);
  assert.equal(sealed.planId,created.plan.id);
  assert.match(sealed.admissionHash,/^[0-9a-f]{64}$/);
  assert.match(sealed.receiptHash,/^[0-9a-f]{64}$/);
});

test('plan creation rejects invented impact semantics and unallowlisted automatic operations',async()=>{
  const fx=fixture();
  await assert.rejects(
    ()=>fx.service.createPlan('cmd-bad-1','actor-1','case-1',{triggerImpactId:'impact-trigger',dependencies:[{...dependency,requiredAction:'ignore'}]}),
    error=>error.code==='PRODUCT_ENGINEERING_RECOMPUTE_ACTION_MISMATCH',
  );
  await assert.rejects(
    ()=>fx.service.createPlan('cmd-bad-2','actor-1','case-1',{triggerImpactId:'impact-trigger',dependencies:[{...dependency,operation:'product_readiness.delete'}]}),
    error=>error.code==='PRODUCT_ENGINEERING_RECOMPUTE_AUTOMATIC_OPERATION_UNSUPPORTED',
  );
});
