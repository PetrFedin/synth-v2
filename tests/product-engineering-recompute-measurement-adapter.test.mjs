import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewedMeasurementPublicationAdapter, REVIEWED_MEASUREMENT_PUBLICATION_OPERATION } from '../src/application/product-engineering-recompute-measurement-adapter.mjs';
const H='a'.repeat(64), R='b'.repeat(64);
const request=()=>({authority:'measurement',operation:REVIEWED_MEASUREMENT_PUBLICATION_OPERATION,planId:'plan-1',planHash:H,stepId:'measurement-1',idempotencyKey:`recompute:${H}:measurement-1`,inputReference:{authority:'measurement',entityId:'chart-1',version:'4',contentHash:null},sourceReference:{authority:'material',entityId:'MAT-1',version:'7',contentHash:null}});
const approval=()=>({decision:'accepted',planId:'plan-1',planHash:H,stepId:'measurement-1',reviewerId:'technical-1',receiptHash:R,targetReference:{authority:'measurement',entityId:'chart-1',version:'4',contentHash:null},sourceReference:{authority:'material',entityId:'MAT-1',version:'7',contentHash:null}});
test('review authority is mandatory; there is no bare technical-evidence bypass',()=>{
 assert.throws(()=>createReviewedMeasurementPublicationAdapter({measurements:{publishCanonicalMeasurementChart:async()=>({})}}),e=>e.code==='RECOMPUTE_MEASUREMENT_REVIEW_AUTHORITY_REQUIRED');
});
test('reviewed Measurement publication calls only the exact owning command, returns independently verifiable reference',async()=>{
 const calls=[];
 const adapter=createReviewedMeasurementPublicationAdapter({measurements:{publishCanonicalMeasurementChart:async(...args)=>{calls.push(args);return {id:'chart-1',status:'published',version:5};}},reviewApprovalAuthority:{requireAcceptedForStep:async(actor,ctx)=>{calls.push(['review',actor,ctx]);return approval();}}});
 const result=await adapter('actor-1',request());
 assert.equal(calls.length,2);assert.equal(calls[0][0],'review');assert.deepEqual(calls[1],[`recompute:${H}:measurement-1`,'actor-1','chart-1',{expectedVersion:4}]);
 assert.deepEqual(result.resultReference,{authority:'measurement',entityId:'chart-1',version:5});
 assert.equal(result.evidence[0].reviewReceiptHash,R);
});
test('rejected or wrong-target review fails closed before any owning mutation',async()=>{
 let calls=0;
 const adapter=createReviewedMeasurementPublicationAdapter({measurements:{publishCanonicalMeasurementChart:async()=>{calls++;return {id:'chart-1',status:'published',version:5};}},reviewApprovalAuthority:{requireAcceptedForStep:async()=>({...approval(),targetReference:{...approval().targetReference,entityId:'OTHER'}})}});
 await assert.rejects(adapter('actor-1',request()),e=>e.code==='RECOMPUTE_MEASUREMENT_REVIEW_NOT_ADMITTED');
 assert.equal(calls,0);
});
test('wrong command id, authority and hash-only target cannot trigger publication',async()=>{
 let calls=0;
 const adapter=createReviewedMeasurementPublicationAdapter({measurements:{publishCanonicalMeasurementChart:async()=>{calls++;}},reviewApprovalAuthority:{requireAcceptedForStep:async()=>approval()}});
 for(const input of [{...request(),idempotencyKey:'another-key'},{...request(),operation:'measurement.write_any'},{...request(),inputReference:{authority:'measurement',entityId:'chart-1',version:'4',contentHash:R}}])await assert.rejects(adapter('actor-1',input));
 assert.equal(calls,0);
});
test('mismatched owning publication result never becomes a canonical success',async()=>{
 const adapter=createReviewedMeasurementPublicationAdapter({measurements:{publishCanonicalMeasurementChart:async()=>({id:'chart-1',status:'published',version:4})},reviewApprovalAuthority:{requireAcceptedForStep:async()=>approval()}});
 await assert.rejects(adapter('actor-1',request()),e=>e.code==='RECOMPUTE_MEASUREMENT_PUBLICATION_RESULT_INVALID');
});
