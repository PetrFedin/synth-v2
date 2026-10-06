import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringRoutes } from '../src/http/product-engineering-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function fixture(){
  const calls=[];
  const service=new Proxy({}, {get:(_target,name)=>(...args)=>{calls.push([name,...args]); return {ok:name};}});
  return {calls,routes:createProductEngineeringRoutes({productEngineering:service})};
}
function ctx(route,{body={},query={},commandId='cmd-1'}={}){return {actorId:'user-1',commandId,params:route.params,body,query};}

test('product engineering routes expose evidence-first workflow',async()=>{
  const {calls,routes}=fixture();
  const cases=[
    ['POST','/v2/product/styles/style-1/engineering/sources',{body:{kind:'document',ingestMode:'upload',mediaType:'application/pdf',contentHash:'a'.repeat(64),storageRef:'object://bucket/spec.pdf'}}],
    ['GET','/v2/product-engineering/sources/source-1',{}],
    ['POST','/v2/product-engineering/sources/source-1/scan',{body:{expectedVersion:1,status:'clean',engine:'scanner-v1'}}],
    ['POST','/v2/product-engineering/sources/source-1/admit',{body:{expectedVersion:2,policyVersion:'intake-v1'}}],
    ['POST','/v2/product-engineering/sources/source-1/fragments',{body:{kind:'document_page',locator:{page:1},content:{text:'BOM'}}}],
    ['POST','/v2/product-engineering/sources/source-1/parse-complete',{body:{expectedVersion:3,parser:'pdf-structure',parserVersion:'1.0',fragmentCount:1}}],
    ['POST','/v2/product/styles/style-1/engineering/analyses',{body:{styleVersionId:'sv-1',purpose:'garment_interpretation',inputManifest:{assets:['m1']}}}],
    ['GET','/v2/product/styles/style-1/engineering',{query:{limit:'50'}}],
    ['GET','/v2/product-engineering/analyses/analysis-1',{}],
    ['POST','/v2/product-engineering/analyses/analysis-1/start',{}],
    ['POST','/v2/product-engineering/analyses/analysis-1/findings',{body:{findingType:'closure.type',origin:'ai_inferred',value:{code:'DB'},confidence:.9,evidence:[{sourceKind:'product_media',sourceId:'m1',sourceLocator:{page:1}}]}}],
    ['POST','/v2/product-engineering/analyses/analysis-1/proposals',{body:{targetAuthority:'product_identity',targetField:'technical.closure',proposedValue:{code:'DB'}}}],
    ['GET','/v2/product-engineering/proposals/proposal-1/impact',{}],
    ['POST','/v2/product-engineering/proposals/proposal-1/apply',{body:{expectedProposalVersion:2,expectedCanonicalVersion:7}}],
    ['POST','/v2/product-engineering/analyses/analysis-1/conflicts',{body:{conflictType:'measurement.value',subject:'CHEST M',candidates:[55,56],severity:'blocking'}}],
    ['POST','/v2/product/styles/style-1/engineering/drawings',{body:{viewType:'front',svg:'<svg viewBox="0 0 10 10"></svg>'}}],
  ];
  for(let i=0;i<cases.length;i++){
    const [method,path,input]=cases[i];
    const route=matchWholesaleRoute(routes,method,path);
    assert.ok(route,`${method} ${path}`);
    await route.execute(ctx(route,{...input,commandId:`cmd-${i}`}));
  }
  assert.deepEqual(calls.map(row=>row[0]),[
    'registerSource','getSourceForActor','recordSourceScan','admitSource','addSourceFragment','completeSourceParsing',
    'requestAnalysis','getStyleWorkspaceForActor','getAnalysisWorkspaceForActor','startAnalysis',
    'recordFinding','createProposal','getProposalImpactForActor','applyProposal','createConflict','createDrawing',
  ]);
});

test('transport refuses unknown fields and malformed evidence before service execution',()=>{
  const {calls,routes}=fixture();
  const create=matchWholesaleRoute(routes,'POST','/v2/product/styles/style-1/engineering/analyses');
  assert.throws(()=>create.execute(ctx(create,{body:{purpose:'garment_interpretation',inputManifest:{},writeCanonical:true}})),error=>error.code==='HTTP_BODY_FIELD_UNKNOWN');
  const finding=matchWholesaleRoute(routes,'POST','/v2/product-engineering/analyses/a/findings');
  assert.throws(()=>finding.execute(ctx(finding,{body:{findingType:'x.y',origin:'ai_inferred',value:{},evidence:[{sourceKind:'magic'}]}})),error=>error.code==='HTTP_BODY_FIELD_INVALID');
  assert.equal(calls.length,0);
});

test('OpenAPI documents engineering review and every mutation carries idempotency',()=>{
  const spec=wholesaleV2ExtendedOpenApi;
  const paths=[
    '/product/styles/{styleId}/engineering/sources',
    '/product-engineering/sources/{sourceId}',
    '/product-engineering/sources/{sourceId}/scan',
    '/product-engineering/sources/{sourceId}/admit',
    '/product-engineering/sources/{sourceId}/reject',
    '/product-engineering/sources/{sourceId}/fragments',
    '/product-engineering/sources/{sourceId}/parse-complete',
    '/product/styles/{styleId}/engineering/analyses',
    '/product/styles/{styleId}/engineering',
    '/product-engineering/analyses/{analysisRunId}',
    '/product-engineering/analyses/{analysisRunId}/findings',
    '/product-engineering/analyses/{analysisRunId}/proposals',
    '/product-engineering/proposals/{proposalId}/resolve',
    '/product-engineering/proposals/{proposalId}/impact',
    '/product-engineering/proposals/{proposalId}/apply',
    '/product-engineering/analyses/{analysisRunId}/conflicts',
    '/product-engineering/conflicts/{conflictId}/resolve',
    '/product/styles/{styleId}/engineering/drawings',
    '/product-engineering/drawings/{drawingId}/approve',
  ];
  paths.forEach(path=>assert.ok(spec.paths[path],path));
  for(const path of paths){
    for(const operation of Object.values(spec.paths[path])){
      if(operation.operationId && operation.operationId.startsWith('get')) continue;
      assert.ok(operation.parameters.some(parameter=>parameter.name==='Idempotency-Key'&&parameter.required),path);
    }
  }
  assert.equal(spec.components.schemas.ProductEngineeringAnalysisCreate.additionalProperties,false);
  assert.deepEqual(spec.components.schemas.ProductEngineeringProposalResolve.properties.decision.enum,['accepted','rejected']);
  assert.deepEqual(spec.components.schemas.ProductEngineeringProposalApply.required,['expectedProposalVersion','expectedCanonicalVersion']);
  assert.equal(spec.paths['/product-engineering/proposals/{proposalId}/apply'].post.operationId,'applyProductEngineeringProposal');
  assert.equal(spec.paths['/product-engineering/proposals/{proposalId}/impact'].get.operationId,'getProductEngineeringProposalImpact');
  assert.equal(spec.paths['/product-engineering/proposals/{proposalId}/impact'].get.parameters.some(parameter=>parameter.name==='Idempotency-Key'),false);
});


test('governed source transport rejects malformed source hashes before service execution',()=>{
  const {calls,routes}=fixture();
  const route=matchWholesaleRoute(routes,'POST','/v2/product/styles/style-1/engineering/sources');
  assert.throws(()=>route.execute(ctx(route,{body:{
    kind:'document',ingestMode:'upload',mediaType:'application/pdf',
    contentHash:'not-a-sha256',storageRef:'object://bucket/spec.pdf'
  }})),error=>error.code==='HTTP_BODY_FIELD_INVALID');
  assert.equal(calls.length,0);
});


test('proposal apply transport requires both proposal and canonical optimistic versions',()=>{
  const {calls,routes}=fixture();
  const route=matchWholesaleRoute(routes,'POST','/v2/product-engineering/proposals/proposal-1/apply');
  assert.throws(()=>route.execute(ctx(route,{body:{expectedProposalVersion:2}})),error=>error.code==='HTTP_BODY_FIELD_MISSING');
  assert.throws(()=>route.execute(ctx(route,{body:{expectedProposalVersion:0,expectedCanonicalVersion:3}})),error=>error.code==='HTTP_BODY_FIELD_INVALID');
  assert.equal(calls.length,0);
});
