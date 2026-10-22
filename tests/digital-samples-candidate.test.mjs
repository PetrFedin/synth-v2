import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertCapability } from '../src/modules/access-control/public.mjs';
import {
  calculateDigitalSampleScenario,
} from '../src/modules/digital-samples/public.mjs';
import { createDigitalSampleService } from '../src/application/digital-sample-service.mjs';
import { createDigitalSampleRoutes } from '../src/http/digital-sample-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const STYLE_HASH='b'.repeat(64);
const SOURCE_HASH='a'.repeat(64);
const manifest=Object.freeze({
  titleRu:'Куртка, цифровой образец',
  titleEn:'Jacket digital sample',
  sourceFileName:'jacket.glb',
  sourceFormat:'glb',
  declaredSha256:SOURCE_HASH,
  declaredByteLength:123456,
  note:'Metadata declaration only',
});

function memoryStore() {
  let state={
    style:{id:'style-version-1',styleId:'style-1',brandId:'brand-1',contentHash:STYLE_HASH,lifecycleStatus:'in_development'},
    membership:{id:'m-1',organisationId:'brand-1',organisationType:'brand',userId:'owner-1',role:'owner',status:'active'},
    commands:new Map(),series:new Map(),versions:new Map(),scenarios:new Map(),outbox:[],
  };
  function view(s){return{
    async getStyleVersion(id){return id===s.style.id?s.style:undefined;},
    async getMembership(org,user){return s.membership.organisationId===org&&s.membership.userId===user?s.membership:undefined;},
    async getCommand(id){return s.commands.get(id);},
    async getSeries(id){return s.series.get(id);},
    async latest(seriesId){return [...s.versions.values()].filter(v=>v.seriesId===seriesId).sort((a,b)=>b.revision-a.revision)[0];},
    async getVersion(id){return s.versions.get(id);},
    async list(styleVersionId,limit,afterId){
      const latest=new Map();
      for(const v of s.versions.values()) if(v.styleVersionId===styleVersionId){
        const old=latest.get(v.seriesId); if(!old||v.revision>old.revision) latest.set(v.seriesId,v);
      }
      return [...latest.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)).filter(v=>afterId===null||v.seriesId>afterId).slice(0,limit);
    },
    async history(seriesId,limit,afterId){
      const rows=[...s.versions.values()].filter(v=>v.seriesId===seriesId).sort((a,b)=>a.revision-b.revision);
      const cursor=afterId?rows.find(v=>v.id===afterId)?.revision??Infinity:0;
      return rows.filter(v=>v.revision>cursor).slice(0,limit);
    },
    async listScenarios(sampleVersionId,limit,afterId){
      return [...s.scenarios.values()].filter(v=>v.sampleVersionId===sampleVersionId)
        .sort((a,b)=>a.id.localeCompare(b.id)).filter(v=>afterId===null||v.id>afterId).slice(0,limit);
    },
    async insertSeries(v){s.series.set(v.id,structuredClone(v));},
    async insertVersion(v){s.versions.set(v.id,structuredClone(v));},
    async insertScenario(v){s.scenarios.set(v.id,structuredClone(v));},
    async appendOutbox(v){s.outbox.push(structuredClone(v));},
    async insertCommand(v){s.commands.set(v.id,structuredClone(v));},
  };}
  return {
    async transaction(work){
      const next=structuredClone(state);
      const result=await work(view(next));
      state=next;
      return result;
    },
    snapshot(){return structuredClone(state);},
    setMembership(value){state={...state,membership:{...state.membership,...value}};},
  };
}

function serviceFixture(){
  const store=memoryStore();
  let n=0;
  const service=createDigitalSampleService({
    store,
    authorizeMembership:assertCapability,
    clock:()=>new Date(Date.UTC(2026,9,23,0,0,n++)).toISOString(),
    nextId:prefix=>`${prefix}-${++n}`,
  });
  return {store,service};
}

test('batch economics separates contribution from fixed-batch cash recovery',()=>{
  const calc=calculateDigitalSampleScenario({
    name:'Base',currency:'EUR',quantity:300,expectedSoldUnits:150,
    unitProductionCost:'72',netUnitPrice:'145',unitSellingCost:'10',
    fixedDevelopmentCost:'5400',minimumOrderQuantity:100,packSize:10,
  });
  assert.equal(calc.result.unitContribution,'63.0000');
  assert.equal(calc.result.salesBreakEvenUnits,'86');
  assert.equal(calc.result.batchCashBreakEvenUnits,'200');
  assert.equal(calc.result.unsoldStockAtProductionCost,'10800.0000');
  assert.equal(calc.result.batchCashResult,'-6750.0000');
  assert.equal(calc.result.reconciliationResidual,'0.0000');
});

test('exact replay is idempotent but revoked membership invalidates the replay',async()=>{
  const {store,service}=serviceFixture();
  const first=await service.create('cmd-create','owner-1','style-version-1',manifest);
  const replay=await service.create('cmd-create','owner-1','style-version-1',manifest);
  assert.equal(replay.id,first.id);
  assert.equal(store.snapshot().versions.size,1);
  assert.equal(store.snapshot().outbox.length,1);
  store.setMembership({status:'revoked'});
  await assert.rejects(
    ()=>service.create('cmd-create','owner-1','style-version-1',manifest),
    error=>error?.code==='DIGITAL_SAMPLE_NOT_FOUND',
  );
});

test('append requires the current predecessor and preserves immutable history',async()=>{
  const {store,service}=serviceFixture();
  const v1=await service.create('cmd-1','owner-1','style-version-1',manifest);
  const v2=await service.append('cmd-2','owner-1',v1.seriesId,v1.id,{...manifest,note:'Revision two'});
  assert.equal(v2.revision,2);
  await assert.rejects(
    ()=>service.append('cmd-3','owner-1',v1.seriesId,v1.id,{...manifest,note:'Stale'}),
    error=>error?.code==='DIGITAL_SAMPLE_CONCURRENCY_CONFLICT',
  );
  const history=await service.history('owner-1',v1.seriesId,{limit:10});
  assert.deepEqual(history.items.map(v=>v.revision),[1,2]);
  assert.equal(store.snapshot().versions.get(v1.id).note,'Metadata declaration only');
});

test('scenario is immutable planning evidence and does not claim demand or production readiness',async()=>{
  const {service}=serviceFixture();
  const sample=await service.create('cmd-sample','owner-1','style-version-1',manifest);
  const scenario=await service.createScenario('cmd-scenario','owner-1',sample.id,{
    name:'Pilot 300',currency:'EUR',quantity:300,expectedSoldUnits:210,
    unitProductionCost:'72',netUnitPrice:'145',unitSellingCost:'10',
    fixedDevelopmentCost:'5400',minimumOrderQuantity:100,packSize:10,
  });
  assert.equal(scenario.dataClass,'planning_estimate');
  assert.equal(scenario.productionReady,false);
  assert.equal(scenario.calculation.demandVerified,false);
  assert.equal(scenario.calculation.result.batchCashResult,'1350.0000');
});

test('native routes and OpenAPI expose exactly the intended digital-sample surface',()=>{
  const routes=createDigitalSampleRoutes({digitalSamples:{}});
  assert.equal(routes.length,7);
  for(const path of [
    '/product/style-versions/{styleVersionId}/digital-samples',
    '/digital-sample-series/{seriesId}/versions',
    '/digital-sample-versions/{versionId}',
    '/digital-sample-versions/{versionId}/scenarios',
  ]) assert.ok(wholesaleV2ExtendedOpenApi.paths[path],path);
  assert.equal(wholesaleV2ExtendedOpenApi.info.version,'1.22.0');
});

test('migration keeps browser roles away from digital sample tables',async()=>{
  const sql=await readFile(new URL('../db/migrations/181_digital_sample_manifest_registry.sql',import.meta.url),'utf8');
  assert.match(sql,/scope = 'digital-samples'|%L\).*digital-samples/s);
  assert.match(sql,/REVOKE ALL ON public\.digital_sample_series/);
  assert.match(sql,/digital_sample_version_append_guard/);
  assert.match(sql,/productionReady":false/);
});
