import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTechPackRoutes } from '../src/http/tech-pack-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { queryParameters } from '../src/http/transport-contract.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';
import { completeCanonicalTechPackFixture } from './helpers/canonical-tech-pack-document-fixture.mjs';

function fixture() {
  const calls=[];
  const canonical=completeCanonicalTechPackFixture();
  const log=(operation,...args)=>{
    calls.push({operation,args});
    if(operation==='document')return {
      techPackCode:'TP/2026/001',sku:canonical.sku,revision:1,
      materials:[{lineId:'shell',component:'Shell',materialCode:'FAB-01',
        quantity:2,unit:'m',grossQuantity:2.1,unitCost:728,internalMargin:0.8}],
      sketches:[{mediaRole:'design_sketch',viewLabel:'Front',uri:'s3://SECRET/issued'}],
      bomTotalCost:999,privateAccountingMarker:'COST_LEAK_MARKER',
    };
    if(operation==='operation')return {
      id:'op-1',techPackCode:'TP/2026/001',brandId:canonical.brandId,
      sequence:1,operationCode:'CUT',nameRu:'Раскрой',nameEn:'Cutting',
      standardMinutes:10,internalCost:518,
    };
    // Real issued frozen snapshots exercise the API allowlist instead of
    // passing an invalid mock with no SKU/brand and then relaxing production.
    return canonical;
  };
  const service={
    getForActor:(...args)=>log('get',...args),
    getDocumentForActor:(...args)=>log('document',...args),
    updateTechPack:(...args)=>log('update',...args),
    addOperation:(...args)=>log('operation',...args),
    issueTechPack:(...args)=>log('issue',...args),
    acknowledgeTechPack:(...args)=>log('ack',...args),
    createRevision:(...args)=>log('revision',...args),
    withdrawTechPack:(...args)=>log('withdraw',...args),
  };
  return {calls,canonical,routes:createTechPackRoutes({techPacks:service})};
}
function context(routes,method,relative,body={}) {
  const url=new URL(relative,'http://localhost');
  const route=matchWholesaleRoute(routes,method,url.pathname);
  assert.ok(route,relative);
  return {route,ctx:{actorId:'brand-owner',commandId:'cmd-123',params:route.params,query:queryParameters(url),body}};
}
const CODE='TP/2026/001',uri=s=>'/v2/tech-packs/by-code'+s+'?code='+encodeURIComponent(CODE);
test('all alias operations forward the exact slash-containing code to the owning domain',async()=>{
  const {calls,routes,canonical}=fixture();
  const responses=[];
  for(const [method,suffix,body] of [
    ['GET','',{}],['GET','/document',{}],['PATCH','',{expectedVersion:2}],
    ['POST','/operations',{sequence:1,operationCode:'CUT-01',nameRu:'Раскрой',nameEn:'Cutting',machineClass:'cutting',standardMinutes:10}],
    ['POST','/issue',{expectedVersion:2}],['POST','/acknowledge',{expectedVersion:3}],
    ['POST','/revisions',{expectedVersion:3,techPackCode:'TP/2026/002'}],
    ['POST','/withdraw',{expectedVersion:4,reason:'Production cancelled'}]
  ]){const {route,ctx}=context(routes,method,uri(suffix),body);responses.push(await route.execute(ctx));}
  // Every legacy/slash-addressed operation keeps its routing contract while
  // the transport never serialises internal prices or frozen source payloads.
  const serialized=JSON.stringify(responses);
  // Search exact JSON field identities. The allowed frozenSourcesHash is a
  // lineage digest, NOT the forbidden cost-bearing frozenSources payload.
  const foundKeys=new Set();
  const visit=(value)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    for(const [key,nested] of Object.entries(value)){foundKeys.add(key);visit(nested);}
  };
  visit(responses);
  for(const forbidden of ['frozenSources','frozenDocumentContext','unitCost',
    'unitCostSnapshot','lineCost','bomTotalCost','internalCost','internalMargin',
    'secretCost','exchangeRate','materialCost','laborCost','currencyRate',
    'storageKey','storageVersion','uri']) {
    assert.equal(foundKeys.has(forbidden),false,forbidden);
  }
  // Protect literal secret values too, including unexpected field names.
  assert.equal(serialized.includes('COST_LEAK_MARKER'),false);
  assert.equal(serialized.includes('s3://SECRET'),false);
  assert.equal(foundKeys.has('frozenSourcesHash'),true,
    'immutable lineage hash remains visible without source payload');
  assert.match(responses[4].dependencySnapshot.canonical.frozenSourcesHash,/^[a-f0-9]{64}$/);
  assert.equal(responses[0].sku,canonical.sku);
  assert.equal(responses[1].materials[0].quantity,2);
  assert.equal(responses[3].operationCode,'CUT');
  assert.equal(responses[4].dependencySnapshot.canonical.lineageHash,
    canonical.dependencySnapshot.canonical.lineageHash);
  assert.deepEqual(calls.map(c=>c.operation),['get','document','update','operation','issue','ack','revision','withdraw']);
  for(const call of calls)assert.ok(call.args.includes(CODE),call.operation);
  assert.deepEqual(calls.find(c=>c.operation==='issue').args.slice(0,3),['cmd-123','brand-owner',CODE]);
});
test('invalid, duplicate, missing, and extra code fields never reach domain services',async()=>{
  const {calls,routes}=fixture();
  for(const url of [
    '/v2/tech-packs/by-code','/v2/tech-packs/by-code?code=',
    '/v2/tech-packs/by-code?code=bad%20code','/v2/tech-packs/by-code?code=%2Fetc%2Fpasswd',
    '/v2/tech-packs/by-code?code=TP%2F2026%2F001%00',
    '/v2/tech-packs/by-code?code='+'A'.repeat(100)
  ]){
    const {route,ctx}=context(routes,'GET',url);
    await assert.rejects(Promise.resolve().then(()=>route.execute(ctx)),e=>e?.code==='TECH_PACK_CODE_INVALID');
  }
  for(const [method,suffix] of [['GET',''],['GET','/document'],['POST','/issue']]){
    const {route,ctx}=context(routes,method,uri(suffix)+'&bypass=true',{expectedVersion:1});
    await assert.rejects(Promise.resolve().then(()=>route.execute(ctx)),e=>e?.code==='HTTP_QUERY_FIELD_UNKNOWN');
  }
  assert.throws(()=>queryParameters(new URL(uri('')+'&code=TP-OTHER','http://localhost')),e=>e?.code==='HTTP_QUERY_DUPLICATE');
  assert.throws(()=>matchWholesaleRoute(routes,'GET','/v2/tech-packs/TP%2F2026%2F001'),e=>e?.code==='HTTP_PATH_PARAMETER_INVALID');
  assert.equal(calls.length,0);
});
test('old slash-free routes and command bodies remain supported',async()=>{
  const {calls,routes}=fixture();
  for(const [method,url,body] of [['GET','/v2/tech-packs/TP-2026-001',{}],
    ['POST','/v2/tech-packs/TP-2026-001/issue',{expectedVersion:2}]]){
    const {route,ctx}=context(routes,method,url,body);await route.execute(ctx);
  }
  assert.deepEqual(calls.map(c=>c.operation),['get','issue']);
  assert.equal(calls[0].args[1],'TP-2026-001');
  assert.equal(calls[1].args[2],'TP-2026-001');
  const {route,ctx}=context(routes,'POST',uri('/issue'),{expectedVersion:2,unsafe:true});
  await assert.rejects(Promise.resolve().then(()=>route.execute(ctx)),e=>e?.code==='HTTP_BODY_FIELD_UNKNOWN');
});
test('OpenAPI documents exact authenticated query aliases with idempotency on commands',()=>{
  const spec=wholesaleV2ExtendedOpenApi,ids=new Set();
  for(const [path,method] of [
    ['/tech-packs/by-code','get'],['/tech-packs/by-code','patch'],
    ['/tech-packs/by-code/document','get'],['/tech-packs/by-code/operations','post'],
    ['/tech-packs/by-code/issue','post'],['/tech-packs/by-code/acknowledge','post'],
    ['/tech-packs/by-code/revisions','post'],['/tech-packs/by-code/withdraw','post']
  ]){
    const op=spec.paths[path]?.[method];assert.ok(op,path);
    assert.deepEqual(op.security,[{bearerAuth:[]}]);
    assert.equal(op.parameters[0].name,'code');
    assert.equal(op.parameters[0].required,true);
    assert.equal(op.parameters[0].in,'query');
    assert.ok(op.parameters[0].schema.pattern.includes('/'));
    assert.ok(!ids.has(op.operationId),op.operationId);ids.add(op.operationId);
    if(method==='post'||method==='patch'){
      assert.equal(op.parameters[1].name,'Idempotency-Key');
      assert.equal(op.requestBody.required,true);
    }
  }
  assert.ok(!spec.paths['/tech-packs/{techPackCode}'].get.parameters[0].schema.pattern.includes('/'));
});
test('actual workspace switches to the query alias for slash-coded document and mutations',async()=>{
  const js=await readFile(new URL('../public/modules/tech-packs.js',import.meta.url),'utf8');
  assert.match(js,/function techPackPath\(code, suffix = ''\)/);
  assert.match(js,/code\.includes\('\/'\)/);
  assert.match(js,/canonical \? '\/canonical-document' : '\/document'/);
  for(const tail of ['/issue','/acknowledge','/revisions','/withdraw']){
    assert.ok(js.includes("techPackPath(value.techPackCode, '"+tail+"')")||
      js.includes("techPackPath(techPackCode, '"+tail+"')"),tail);
  }
  assert.ok(js.includes('techPackPath(value.techPackCode)'));
  assert.doesNotMatch(js,/\/v2\/tech-packs\/\$\{encodeURIComponent\(value\.techPackCode\)\}/);
});
