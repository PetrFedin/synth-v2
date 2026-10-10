import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialPublishedRevisionRecomputeAdapter } from '../src/application/product-engineering-material-recompute-adapter.mjs';

const review={id:'review-material',mode:'human_review',owningAuthority:'material',operation:'material.review_revised_specification',inputReference:{authority:'material',entityId:'MAT-1',version:'2'}};
const request={authority:'material',operation:'material.verify_published_revision',brandId:'brand-1',inputReference:{authority:'material',entityId:'MAT-1',version:'2'},prerequisiteSteps:[review]};
const make=(overrides={})=>({code:'MAT-1',brandId:'brand-1',version:3,status:'published',publishedAt:'2026-10-11T00:00:00.000Z',...overrides});
const adapter=(value,record=[])=>createMaterialPublishedRevisionRecomputeAdapter({materials:{getForActor:async(actor,code)=>{record.push([actor,code]);return value;}}});
test('material verification reads authorised owner and returns exact version without writing',async()=>{
 const calls=[];const result=await adapter(make(),calls)('actor-1',request);
 assert.deepEqual(calls,[['actor-1','MAT-1']]);
 assert.deepEqual(result.resultReference,{authority:'material',entityId:'MAT-1',version:'3'});
 assert.equal(result.evidence[0].reviewedPredecessorStepId,'review-material');
 assert.equal(Object.hasOwn(result.evidence[0],'unitCost'),false);
});
test('material verification requires an exact prior human review and refuses any mutation operation',async()=>{
 const calls=[];const run=adapter(make(),calls);
 await assert.rejects(run('actor-1',{...request,prerequisiteSteps:[]}),e=>e.code==='PRODUCT_ENGINEERING_MATERIAL_REVIEW_REQUIRED');
 await assert.rejects(run('actor-1',{...request,operation:'material.amend_specification'}),e=>e.code==='PRODUCT_ENGINEERING_MATERIAL_OPERATION_INVALID');
 assert.equal(calls.length,0);
});
test('material verification rejects stale, draft, cross-brand and wrong identities',async()=>{
 for(const value of [make({version:2}),make({status:'draft'}),make({brandId:'other'}),make({code:'OTHER'}),make({publishedAt:null})]){
  await assert.rejects(adapter(value)('actor-1',request));
 }
});
test('material verification rejects a mismatched review or missing plan brand',async()=>{
 const run=adapter(make());
 await assert.rejects(run('actor-1',{...request,brandId:null}),e=>e.code==='PRODUCT_ENGINEERING_MATERIAL_BRAND_REQUIRED');
 await assert.rejects(run('actor-1',{...request,prerequisiteSteps:[{...review,inputReference:{authority:'material',entityId:'OTHER',version:'2'}}]}),e=>e.code==='PRODUCT_ENGINEERING_MATERIAL_REVIEW_REQUIRED');
});
