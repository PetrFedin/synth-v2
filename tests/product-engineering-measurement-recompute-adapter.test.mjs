import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementPublishedRevisionRecomputeAdapter } from '../src/application/product-engineering-measurement-recompute-adapter.mjs';

const prior = Object.freeze({
  id:'review-1',mode:'human_review',owningAuthority:'measurement',
  operation:'measurement.review_revised_chart',
  inputReference:{authority:'measurement',entityId:'measurement-1',version:'2'},
});
const request = Object.freeze({
  authority:'measurement',operation:'measurement.verify_published_revision',
  inputReference:{authority:'measurement',entityId:'measurement-1',version:'2'},
  prerequisiteSteps:[prior],
});
function chart(overrides={}) {
 return {id:'measurement-1',sku:null,styleVersionId:'style-version-1',colorwayId:'colorway-1',
   sizeScaleVersionId:'size-scale-1',status:'published',publishedAt:'2026-10-11T00:00:00Z',version:4,...overrides};
}
test('Measurement verification returns exact published revision without mutating authority',async()=>{
 let reads=0;
 const adapter=createMeasurementPublishedRevisionRecomputeAdapter({measurements:{
   getCanonicalForActor:async(actor,id)=>{reads++;assert.equal(actor,'reviewer-1');assert.equal(id,'measurement-1');return chart();}
 }});
 const result=await adapter('reviewer-1',request);
 assert.deepEqual(result.resultReference,{authority:'measurement',entityId:'measurement-1',version:'4'});
 assert.equal(result.evidence[0].reviewedPredecessorStepId,'review-1');
 assert.equal(reads,1);
});
test('Measurement verification rejects missing reviewed predecessor before reading chart',async()=>{
 let reads=0;
 const adapter=createMeasurementPublishedRevisionRecomputeAdapter({measurements:{
  getCanonicalForActor:async()=>{reads++;return chart();}
 }});
 await assert.rejects(adapter('reviewer-1',{...request,prerequisiteSteps:[]}),e=>e.code==='PRODUCT_ENGINEERING_MEASUREMENT_REVIEW_REQUIRED');
 assert.equal(reads,0);
});
test('Measurement verification refuses draft and non-advanced published snapshots',async()=>{
 for(const candidate of [chart({status:'draft',publishedAt:null}),chart({version:2}),chart({sku:'LEGACY'})]){
  const adapter=createMeasurementPublishedRevisionRecomputeAdapter({measurements:{getCanonicalForActor:async()=>candidate}});
  await assert.rejects(adapter('reviewer-1',request));
 }
});
test('Measurement verification refuses a different operation or mismatched review identity',async()=>{
 const adapter=createMeasurementPublishedRevisionRecomputeAdapter({measurements:{getCanonicalForActor:async()=>chart()}});
 await assert.rejects(adapter('reviewer-1',{...request,operation:'measurement.update_chart'}),e=>e.code==='PRODUCT_ENGINEERING_MEASUREMENT_OPERATION_INVALID');
 await assert.rejects(adapter('reviewer-1',{...request,prerequisiteSteps:[{...prior,inputReference:{authority:'measurement',entityId:'other',version:'2'}}]}),e=>e.code==='PRODUCT_ENGINEERING_MEASUREMENT_REVIEW_REQUIRED');
});
