import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEngineeringChangeAdmission,
  evaluateEngineeringChangeAdmission,
} from '../src/modules/product-engineering/change-admission.mjs';
import { createProductEngineeringChangeAdmissionService } from '../src/application/product-engineering-change-admission-service.mjs';

function impact(overrides={}) {
  return Object.freeze({
    id:'impact-1',changeCaseId:'case-1',impactKind:'downstream_policy',entityId:'MAT-001',entityVersion:'6',
    area:'cost',requiredAction:'recalculate',severity:'high',evidenceStatus:'policy_required',basis:{receiptId:'receipt-1'},status:'pending',
    ...overrides,
  });
}

test('admission blocks only unresolved policy-required impacts relevant to the exact operation',()=>{
  const cost=evaluateEngineeringChangeAdmission({operation:'cost_close',styleVersionId:'sv-1',pendingImpacts:[
    impact(),
    impact({id:'observed-1',evidenceStatus:'observed'}),
    impact({id:'commercial-1',area:'commercial_publication'}),
    impact({id:'resolved-1',status:'resolved'}),
  ]});
  assert.equal(cost.admitted,false);
  assert.equal(cost.blockerCount,1);
  assert.equal(cost.blockers[0].impactId,'impact-1');
  assert.throws(()=>assertEngineeringChangeAdmission(cost),error=>error.code==='PRODUCT_ENGINEERING_CHANGE_ADMISSION_BLOCKED');

  const commercial=evaluateEngineeringChangeAdmission({operation:'commercial_publication',styleVersionId:'sv-1',pendingImpacts:[impact()]});
  assert.equal(commercial.admitted,true,'cost policy does not invent a commercial blocker');
});

test('downstream operations have explicit bounded area policies',()=>{
  const rows=[
    impact({id:'sourcing',area:'sourcing',severity:'medium'}),
    impact({id:'production',area:'production'}),
    impact({id:'commercial',area:'commercial_publication'}),
  ];
  assert.equal(evaluateEngineeringChangeAdmission({operation:'sourcing_release',styleVersionId:'sv-1',pendingImpacts:rows}).blockerCount,1);
  assert.equal(evaluateEngineeringChangeAdmission({operation:'production_order_issue',styleVersionId:'sv-1',pendingImpacts:rows}).blockerCount,1);
  assert.equal(evaluateEngineeringChangeAdmission({operation:'commercial_projection',styleVersionId:'sv-1',pendingImpacts:rows}).blockerCount,1);
});

test('admission service reads exact StyleVersion impact state and fails closed through shared policy',async()=>{
  const calls=[];
  const reader={async listPendingImpactsForStyleVersion(styleVersionId){calls.push(styleVersionId);return [impact({area:'production'})];}};
  const service=createProductEngineeringChangeAdmissionService({reader});
  const decision=await service.evaluate('sv-1','production_order_confirm');
  assert.equal(decision.admitted,false);
  await assert.rejects(()=>service.assertAdmitted('sv-1','production_order_confirm'),error=>error.code==='PRODUCT_ENGINEERING_CHANGE_ADMISSION_BLOCKED');
  assert.deepEqual(calls,['sv-1','sv-1']);
});
