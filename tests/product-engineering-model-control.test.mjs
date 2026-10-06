import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createModelControlPlane,
  createModelQualification,
  createModelRoutePolicy,
} from '../src/modules/product-engineering/model-control.mjs';

const HASH='a'.repeat(64);
const NOW='2026-10-06T12:00:00.000Z';

function qualification(overrides={}){
  return createModelQualification({
    id:'qual-primary',
    provider:'provider-a',
    model:'vision-1',
    purpose:'garment_interpretation',
    promptVersion:'garment-v1',
    schemaVersion:'ontology-v1',
    benchmarkHash:'b'.repeat(64),
    metrics:{closureF1:.96,unknownRecall:.98,hallucinationRate:.007},
    qualifiedAt:'2026-10-01T00:00:00.000Z',
    qualifiedBy:'ml-governance',
    expiresAt:'2026-12-01T00:00:00.000Z',
    ...overrides,
  });
}

test('route exposes only active exact qualified model/prompt/schema combinations',()=>{
  const plane=createModelControlPlane({
    providers:{'provider-a':{execute:async()=>({output:{}})}},
    qualifications:[
      qualification(),
      qualification({id:'suspended',model:'vision-2',status:'suspended'}),
      qualification({id:'expired',model:'vision-3',expiresAt:'2026-10-02T00:00:00.000Z'}),
    ],
    policies:[createModelRoutePolicy({
      purpose:'garment_interpretation',
      candidates:[
        {provider:'provider-a',model:'vision-2'},
        {provider:'provider-a',model:'vision-3'},
        {provider:'provider-a',model:'vision-1'},
      ],
    })],
    clock:()=>NOW,
  });
  const route=plane.describeRoute({purpose:'garment_interpretation',promptVersion:'garment-v1',schemaVersion:'ontology-v1'});
  assert.deepEqual(route.map(x=>x.model),['vision-1']);
  assert.equal(route[0].qualificationId,'qual-primary');
});

test('execution hashes output and fails over only on retryable provider errors',async()=>{
  let primaryCalls=0;
  const plane=createModelControlPlane({
    providers:{
      'provider-a':{execute:async()=>{primaryCalls++; const error=new Error('temporary'); error.code='PROVIDER_BUSY'; error.retryable=true; throw error;}},
      'provider-b':{execute:async(request)=>({output:{category:'blazer',sourceRequest:request.requestId},usage:{inputTokens:12,outputTokens:4}})},
    },
    qualifications:[
      qualification(),
      qualification({id:'qual-fallback',provider:'provider-b',model:'vision-2'}),
    ],
    policies:[createModelRoutePolicy({
      purpose:'garment_interpretation',
      candidates:[{provider:'provider-a',model:'vision-1'},{provider:'provider-b',model:'vision-2'}],
      maxAttempts:2,
    })],
    clock:()=>NOW,
  });
  const result=await plane.execute({
    purpose:'garment_interpretation',
    promptVersion:'garment-v1',
    schemaVersion:'ontology-v1',
    input:{assets:['media-1']},
    inputHash:HASH,
    requestId:'req-1',
  });
  assert.equal(primaryCalls,1);
  assert.equal(result.provider,'provider-b');
  assert.equal(result.model,'vision-2');
  assert.equal(result.attempts.length,2);
  assert.equal(result.attempts[0].status,'failed');
  assert.equal(result.attempts[1].status,'succeeded');
  assert.match(result.outputHash,/^[0-9a-f]{64}$/);
});

test('unqualified or expired route fails closed before any provider call',async()=>{
  let calls=0;
  const plane=createModelControlPlane({
    providers:{'provider-a':{execute:async()=>{calls++; return {output:{}};}}},
    qualifications:[qualification({status:'suspended'})],
    policies:[createModelRoutePolicy({purpose:'garment_interpretation',candidates:[{provider:'provider-a',model:'vision-1'}]})],
    clock:()=>NOW,
  });
  await assert.rejects(
    ()=>plane.execute({purpose:'garment_interpretation',promptVersion:'garment-v1',schemaVersion:'ontology-v1',input:{},inputHash:HASH,requestId:'req-2'}),
    error=>error.code==='AI_MODEL_NO_QUALIFIED_ROUTE',
  );
  assert.equal(calls,0);
});

test('qualification is exact to prompt and output schema version',()=>{
  const plane=createModelControlPlane({
    providers:{'provider-a':{execute:async()=>({output:{}})}},
    qualifications:[qualification()],
    policies:[createModelRoutePolicy({purpose:'garment_interpretation',candidates:[{provider:'provider-a',model:'vision-1'}]})],
    clock:()=>NOW,
  });
  assert.deepEqual(plane.describeRoute({purpose:'garment_interpretation',promptVersion:'garment-v2',schemaVersion:'ontology-v1'}),[]);
  assert.deepEqual(plane.describeRoute({purpose:'garment_interpretation',promptVersion:'garment-v1',schemaVersion:'ontology-v2'}),[]);
});
