import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductEngineeringResultVerifier,
  createProductEngineeringVerifiedImpactClosureService,
} from '../src/application/product-engineering-result-verifier-service.mjs';

test('material result reference is independently verified against exact canonical version',async()=>{
  const verifier=createProductEngineeringResultVerifier({
    materials:{getForActor:async(actorId,code)=>{
      assert.equal(actorId,'actor-1');
      assert.equal(code,'MAT-001');
      return {code:'MAT-001',version:7,contentHash:'a'.repeat(64)};
    }},
  });
  const proof=await verifier.verify('actor-1',{authority:'material',entityId:'MAT-001',version:7});
  assert.equal(proof.verifier,'materials.getForActor');
  assert.equal(proof.observed.entityId,'MAT-001');
  assert.equal(proof.observed.version,'7');
  assert.match(proof.verificationHash,/^[0-9a-f]{64}$/);
});

test('verification fails closed on stale version, wrong identity, and unsupported authority',async()=>{
  const verifier=createProductEngineeringResultVerifier({
    materials:{getForActor:async()=>({code:'MAT-001',version:8})},
  });
  await assert.rejects(()=>verifier.verify('actor-1',{authority:'material',entityId:'MAT-001',version:7}),e=>e.code==='PRODUCT_ENGINEERING_RESULT_VERSION_MISMATCH');
  await assert.rejects(()=>verifier.verify('actor-1',{authority:'material',entityId:'MAT-002',version:8}),e=>e.code==='PRODUCT_ENGINEERING_RESULT_IDENTITY_MISMATCH');
  await assert.rejects(()=>verifier.verify('actor-1',{authority:'production_order',entityId:'PO-1',version:2}),e=>e.code==='PRODUCT_ENGINEERING_RESULT_AUTHORITY_UNSUPPORTED');
});

test('policy-required closure injects independent proof before Product Engineering receipt creation',async()=>{
  let closedInput=null;
  const productEngineering={
    getChangeImpactForActor:async()=>({id:'impact-1',status:'pending',evidenceStatus:'policy_required'}),
    closeChangeImpact:async(_commandId,_actorId,_impactId,input)=>{closedInput=input;return {ok:true};},
  };
  const resultVerifier={
    verify:async()=>({verifier:'materials.getForActor',authority:'material',requested:{entityId:'MAT-001',version:'7',contentHash:null},observed:{authority:'material',entityId:'MAT-001',version:'7',contentHash:null},verificationHash:'b'.repeat(64)}),
  };
  const service=createProductEngineeringVerifiedImpactClosureService({productEngineering,resultVerifier});
  await service.closeChangeImpact('cmd-1','actor-1','impact-1',{
    expectedVersion:1,
    disposition:'resolved',
    reason:'revalidated',
    evidence:[{kind:'review'}],
    resultReference:{authority:'material',entityId:'MAT-001',version:7},
  });
  assert.equal(closedInput.verification.authority,'material');
  assert.match(closedInput.verification.verificationHash,/^[0-9a-f]{64}$/);
});
