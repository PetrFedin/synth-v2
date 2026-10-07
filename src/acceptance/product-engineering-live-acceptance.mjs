import { randomUUID } from 'node:crypto';
import { validateAcceptanceOrigin } from './collection-live-acceptance.mjs';

const RUN_ID_PATTERN=/^[A-Za-z0-9_-]{1,80}$/;

/** @param {any} [options] */
export async function runProductEngineeringLiveAcceptance(options={}) {
  const {
    baseUrl, token, pool, fetchImpl=globalThis.fetch, runId=randomUUID(), brandId,
    purpose='garment_interpretation',
    promptVersion='garment-interpretation-v1',
    schemaVersion='garment-ontology-v1',
    timeoutMs=120_000, pollIntervalMs=1_000,
  }=options;
  const target=validateAcceptanceOrigin(baseUrl);
  requiredToken(token);
  requiredId(brandId,'Acceptance brandId is required');
  if(!RUN_ID_PATTERN.test(runId)) throw new Error('Acceptance runId must contain only letters, numbers, underscores or hyphens and be at most 80 characters');
  if(!pool||typeof pool.query!=='function') throw new Error('PostgreSQL pool is required');
  if(typeof fetchImpl!=='function') throw new Error('Fetch implementation is required');
  if(!Number.isInteger(timeoutMs)||timeoutMs<5_000||timeoutMs>600_000) throw new Error('Product Engineering acceptance timeout must be 5s-10m');
  if(!Number.isInteger(pollIntervalMs)||pollIntervalMs<100||pollIntervalMs>10_000) throw new Error('Product Engineering acceptance poll interval must be 100ms-10s');

  const health=await requestJson(fetchImpl,target.url,'/health');
  if(health?.status!=='ok') throw new Error('Product Engineering acceptance target failed liveness check');
  const readiness=await requestJson(fetchImpl,target.url,'/ready');
  if(readiness?.status!=='ready') throw new Error('Product Engineering acceptance target is not ready');

  const suffix=runId.replace(/[^A-Za-z0-9]/g,'').slice(0,18).toUpperCase()||'RUN';
  const style=data(await requestJson(fetchImpl,target.url,'/v2/product/styles',{
    method:'POST',token,idempotencyKey:command(runId,'style-create'),
    body:{brandId,styleCode:'AI.ACCEPT.'+suffix},
  }),'style creation');

  const bytes=new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n% Syntha AI Engineering acceptance blazer reference\n%%EOF');
  const source=data(await requestBinary(fetchImpl,target.url,'/v2/product/styles/'+encodeURIComponent(style.id)+'/engineering/upload',{
    token,idempotencyKey:command(runId,'source-upload'),fileName:'ai-acceptance-'+suffix+'.pdf',mediaType:'application/pdf',bytes,
  }),'source upload');

  const parsed=await pollUntil(async()=>{
    const payload=data(await requestJson(fetchImpl,target.url,'/v2/product-engineering/sources/'+encodeURIComponent(source.id),{token}),'source read');
    if(['rejected','quarantined'].includes(payload.source?.status)) throw acceptanceFailure('ENGINEERING_SOURCE_REJECTED',payload.source);
    if(payload.source?.parseStatus==='failed') throw acceptanceFailure('ENGINEERING_SOURCE_PARSE_FAILED',payload.source);
    return payload.source?.status==='admitted'&&payload.source?.parseStatus==='completed' ? payload : null;
  },{timeoutMs,pollIntervalMs,label:'source admission and structural parsing'});

  const analysis=data(await requestJson(fetchImpl,target.url,'/v2/product/styles/'+encodeURIComponent(style.id)+'/engineering/analyses',{
    method:'POST',token,idempotencyKey:command(runId,'analysis-create'),
    body:{
      purpose,
      inputManifest:{
        sourceIds:[source.id],
        autoExecute:true,
        sourcePolicy:'admitted-parsed-sources-only',
        modelContract:{promptVersion,schemaVersion},
        requestedFrom:'product-engineering-live-acceptance',
      },
    },
  }),'analysis creation');

  const analysisWorkspace=await pollUntil(async()=>{
    const payload=data(await requestJson(fetchImpl,target.url,'/v2/product-engineering/analyses/'+encodeURIComponent(analysis.id),{token}),'analysis read');
    if(payload.analysis?.status==='failed') throw acceptanceFailure(payload.analysis.failureCode||'ENGINEERING_ANALYSIS_FAILED',payload.analysis);
    return payload.analysis?.status==='completed' ? payload : null;
  },{timeoutMs,pollIntervalMs,label:'qualified model execution'});

  if(!analysisWorkspace.modelRuns?.some(run=>run.status==='completed')) throw new Error('Product Engineering acceptance completed analysis without a completed ModelRun');
  if(!analysisWorkspace.findings?.length) throw new Error('Product Engineering acceptance produced no findings');
  if(!analysisWorkspace.evidence?.length) throw new Error('Product Engineering acceptance produced no source evidence');
  const evidence=analysisWorkspace.evidence.find(row=>row.sourceId===source.id&&row.sourceHash===source.contentHash);
  if(!evidence) throw new Error('Product Engineering acceptance did not preserve exact source hash in evidence');

  const styleWorkspace=data(await requestJson(fetchImpl,target.url,'/v2/product/styles/'+encodeURIComponent(style.id)+'/engineering',{token}),'style engineering workspace');
  if(schemaVersion==='garment-ontology-v1'&&styleWorkspace.garmentGraph?.status!=='reviewed') {
    throw new Error('Product Engineering acceptance did not produce a reviewed garment graph');
  }

  const persisted=await pool.query(
    `SELECT
       source.content_hash AS source_hash,
       blob.content_hash AS blob_hash,
       octet_length(blob.content)::integer AS blob_bytes,
       (SELECT count(*)::integer FROM product_engineering_source_fragments f WHERE f.source_id=source.id) AS fragment_count,
       (SELECT count(*)::integer FROM product_engineering_jobs j WHERE j.source_id=source.id AND j.status='completed') AS source_job_count,
       (SELECT count(*)::integer FROM product_engineering_jobs j WHERE j.analysis_run_id=$2 AND j.status='completed') AS analysis_job_count
     FROM product_engineering_sources source
     JOIN product_engineering_source_blobs blob ON blob.source_id=source.id
     WHERE source.id=$1`,
    [source.id,analysis.id],
  );
  const row=persisted.rows[0];
  if(!row||row.source_hash!==source.contentHash||row.blob_hash!==source.contentHash) throw new Error('Product Engineering acceptance PostgreSQL source/blob hash lineage mismatch');
  if(Number(row.fragment_count)<1||Number(row.source_job_count)<2||Number(row.analysis_job_count)<1) throw new Error('Product Engineering acceptance durable job/fragment persistence is incomplete');

  return Object.freeze({
    status:'passed',runId,target:target.url.origin,
    style:Object.freeze({id:style.id,styleCode:style.styleCode}),
    source:Object.freeze({id:source.id,contentHash:source.contentHash,status:parsed.source.status,parseStatus:parsed.source.parseStatus,fragmentCount:parsed.fragments.length}),
    analysis:Object.freeze({id:analysis.id,status:analysisWorkspace.analysis.status,modelRuns:analysisWorkspace.modelRuns.length,findings:analysisWorkspace.findings.length,evidence:analysisWorkspace.evidence.length,proposals:analysisWorkspace.proposals.length,conflicts:analysisWorkspace.conflicts.length}),
    garmentGraph:styleWorkspace.garmentGraph?Object.freeze({id:styleWorkspace.garmentGraph.id,status:styleWorkspace.garmentGraph.status,nodeCount:styleWorkspace.garmentGraph.nodeCount,edgeCount:styleWorkspace.garmentGraph.edgeCount}):null,
    persistence:Object.freeze({blobBytes:Number(row.blob_bytes),fragmentCount:Number(row.fragment_count),sourceJobs:Number(row.source_job_count),analysisJobs:Number(row.analysis_job_count),verified:true}),
  });
}

/** @param {() => Promise<any>} check @param {any} options */
async function pollUntil(check,options){
  const {timeoutMs,pollIntervalMs,label}=options;
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const result=await check();
    if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,pollIntervalMs));
  }
  throw new Error('Timed out waiting for '+label);
}
/** @param {any} value */
function requiredToken(value){if(typeof value!=='string'||!value.trim())throw new Error('Acceptance bearer token is required');}
/** @param {any} value @param {string} message */
function requiredId(value,message){if(typeof value!=='string'||!value.trim())throw new Error(message);}
/** @param {string} runId @param {string} operation */
function command(runId,operation){return 'acceptance-'+runId+'-'+operation;}
/** @param {string} code @param {any} value */
function acceptanceFailure(code,value){return Object.assign(new Error('Product Engineering acceptance failed: '+code),{code,details:value});}
/** @param {any} payload @param {string} operation */
function data(payload,operation){if(!payload?.data)throw new Error('Acceptance '+operation+' did not return data');return payload.data;}

/** @param {typeof fetch} fetchImpl @param {URL} baseUrl @param {string} pathname @param {any} [options] */
async function requestJson(fetchImpl,baseUrl,pathname,options={}){
  const {method='GET',token,body,idempotencyKey}=options;
  const headers={accept:'application/json'};
  if(token)headers.authorization='Bearer '+token;
  if(idempotencyKey)headers['idempotency-key']=idempotencyKey;
  let serialized;
  if(body!==undefined){headers['content-type']='application/json';serialized=JSON.stringify(body);}
  const response=await fetchImpl(new URL(pathname,baseUrl),{method,headers,...(serialized===undefined?{}:{body:serialized})});
  return decodeResponse(response,method,pathname);
}
/** @param {typeof fetch} fetchImpl @param {URL} baseUrl @param {string} pathname @param {any} options */
async function requestBinary(fetchImpl,baseUrl,pathname,options){
  const {token,idempotencyKey,fileName,mediaType,bytes}=options;
  const response=await fetchImpl(new URL(pathname,baseUrl),{
    method:'POST',
    headers:{accept:'application/json',authorization:'Bearer '+token,'idempotency-key':idempotencyKey,'content-type':mediaType,'x-file-name':encodeURIComponent(fileName)},
    body:bytes,
  });
  return decodeResponse(response,'POST',pathname);
}
/** @param {Response} response @param {string} method @param {string} pathname */
async function decodeResponse(response,method,pathname){
  const text=await response.text();
  let payload={};
  if(text){try{payload=JSON.parse(text);}catch{throw new Error('Acceptance target returned non-JSON response for '+method+' '+pathname);}}
  if(!response.ok){
    const code=payload?.error?.code?' ('+payload.error.code+')':'';
    throw new Error('Acceptance request failed: '+method+' '+pathname+' -> '+response.status+code);
  }
  return payload;
}
