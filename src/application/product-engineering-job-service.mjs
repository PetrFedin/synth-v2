import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { admitEngineeringSource, completeSourceParsing, createEngineeringFragment, queueSourceParsing, recordSourceScan, rejectEngineeringSource } from '../modules/product-engineering/intake.mjs';
import { failAnalysis } from '../modules/product-engineering/public.mjs';
import { parseEngineeringSourceStructure } from '../modules/product-engineering/structural-parser.mjs';

/**
 * @param {{
 *   jobStore?: any,
 *   engineeringStore?: any,
 *   scanner?: any,
 *   workerId?: string,
 *   clock?: () => string,
 *   retryDelayMs?: number,
 *   leaseMs?: number,
 *   nextId?: (prefix: string) => string,
 *   analysisExecutor?: ((job: any) => Promise<any>) | null
 * }} [options]
 */
export function createProductEngineeringJobService(options={}) {
  const {
    jobStore, engineeringStore, scanner, workerId='engineering-worker', clock=()=>new Date().toISOString(),
    retryDelayMs=5000, leaseMs=60000, nextId=((prefix)=>`${prefix}_${randomUUID()}`),
    analysisExecutor=null,
  }=options;
  invariant(jobStore&&engineeringStore&&scanner,'ENGINEERING_JOB_SERVICE_REQUIRED','Engineering job service dependencies are required');

  async function processPending({limit=10}={}) {
    const claimed=await jobStore.claim({workerId,limit,leaseMs,claimedAt:now()});
    const results=[];
    for(const job of claimed){
      try{
        const result=await processJob(job);
        await jobStore.complete({jobId:job.id,workerId,result,completedAt:now()});
        results.push(Object.freeze({jobId:job.id,status:'completed',jobType:job.jobType}));
      }catch(error){
        const code=errorCode(error);
        const retryAt=new Date(Date.parse(now())+retryDelayMs*Math.min(16,2**Math.max(0,job.attemptCount-1))).toISOString();
        const failed=await jobStore.fail({jobId:job.id,workerId,errorCode:code,retryAt,failedAt:now()});
        if(failed.status==='dead_letter'&&job.analysisRunId){
          await engineeringStore.transaction(async tx=>{
            const analysis=await tx.getAnalysisRunForUpdate(job.analysisRunId);
            if(analysis&&['queued','running'].includes(analysis.status)){
              const terminal=failAnalysis(analysis,{failureCode:code,failureMessage:'Durable Product Engineering job exhausted retry policy',failedAt:now()});
              await tx.updateAnalysisRun(terminal,analysis.version);
            }
          });
        }
        results.push(Object.freeze({jobId:job.id,status:failed.status,errorCode:code,jobType:job.jobType}));
      }
    }
    return Object.freeze(results);
  }

  async function processJob(job){
    if(job.jobType==='source_scan') return scanSource(job);
    if(job.jobType==='source_parse') return parseSource(job);
    if(job.jobType==='analysis_execute'){
      invariant(typeof analysisExecutor==='function','ENGINEERING_ANALYSIS_EXECUTOR_UNAVAILABLE','No qualified analysis executor is configured');
      return analysisExecutor(job);
    }
    invariant(false,'ENGINEERING_JOB_TYPE_INVALID','Engineering job type is unsupported',{jobType:job.jobType});
  }

  async function scanSource(job){
    const source=await engineeringStore.getSource(job.sourceId);
    invariant(source,'ENGINEERING_SOURCE_NOT_FOUND','Engineering source not found',{sourceId:job.sourceId});
    if(source.status!=='pending') return {sourceId:source.id,status:source.status,skipped:true};
    const blob=await engineeringStore.getSourceBlob(source.id);
    invariant(blob,'ENGINEERING_SOURCE_BLOB_NOT_FOUND','Engineering source bytes not found',{sourceId:source.id});
    const scan=await scanner.scan({source,blob});
    await engineeringStore.transaction(async tx=>{
      const exact=await tx.getSourceForUpdate(source.id);
      if(!exact||exact.status!=='pending') return;
      const scanned=recordSourceScan(exact,{status:scan.status,scannedAt:now(),engine:`${scanner.name}/${scanner.version}`,details:{...scan.details,assurance:scanner.assurance}});
      await tx.updateSource(scanned,exact.version);
      if(scan.status!=='clean'||scan.allowAdmission!==true){
        const rejected=rejectEngineeringSource(scanned,{code:scan.code??'SOURCE_SCAN_REJECTED',message:'Controlled source failed admission scan',rejectedAt:now(),rejectedBy:workerId,quarantine:scan.status==='infected'});
        await tx.updateSource(rejected,scanned.version);
        return;
      }
      const admitted=admitEngineeringSource(scanned,{admittedAt:now(),admittedBy:workerId,policyVersion:`controlled-upload-${scanner.assurance}-v1`});
      await tx.updateSource(admitted,scanned.version);
      if(admitted.parseStatus==='pending'){
        const queued=queueSourceParsing(admitted,{queuedAt:now(),queuedBy:workerId});
        await tx.updateSource(queued,admitted.version);
      }
    });
    const latest=await engineeringStore.getSource(source.id);
    if(latest?.status==='admitted'&&latest.parseStatus==='queued'){
      await jobStore.enqueue({
        id:jobStore.nextId(),dedupeKey:`source-parse:${source.id}:${source.contentHash}`,brandId:source.brandId,styleId:source.styleId,
        sourceId:source.id,jobType:'source_parse',payload:{contentHash:source.contentHash},availableAt:now(),maxAttempts:5,
      });
    }
    return {sourceId:source.id,status:latest?.status,scanStatus:latest?.scanStatus,parseStatus:latest?.parseStatus};
  }

  async function parseSource(job){
    const source=await engineeringStore.getSource(job.sourceId);
    invariant(source,'ENGINEERING_SOURCE_NOT_FOUND','Engineering source not found',{sourceId:job.sourceId});
    if(source.parseStatus==='completed') return {sourceId:source.id,status:'completed',skipped:true};
    invariant(source.status==='admitted','ENGINEERING_SOURCE_NOT_ADMITTED','Source must be admitted before parsing');
    const blob=await engineeringStore.getSourceBlob(source.id);
    invariant(blob,'ENGINEERING_SOURCE_BLOB_NOT_FOUND','Engineering source bytes not found',{sourceId:source.id});
    const parsed=parseEngineeringSourceStructure({source,blob});
    await engineeringStore.transaction(async tx=>{
      const exact=await tx.getSourceForUpdate(source.id);
      if(exact?.parseStatus==='completed') return;
      invariant(exact?.status==='admitted','ENGINEERING_SOURCE_NOT_ADMITTED','Source must remain admitted while parsing');
      for(const raw of parsed.fragments){
        const fragment=createEngineeringFragment({
          id:nextId('engineering-fragment'),source:exact,kind:raw.kind,locator:raw.locator,content:raw.content,
          createdAt:now(),createdBy:workerId,
        });
        await tx.insertFragment(fragment);
      }
      const completed=completeSourceParsing(exact,{completedAt:now(),parser:parsed.parser,parserVersion:parsed.parserVersion,fragmentCount:parsed.fragments.length});
      await tx.updateSource(completed,exact.version);
    });
    return {sourceId:source.id,parser:parsed.parser,parserVersion:parsed.parserVersion,fragmentCount:parsed.fragments.length};
  }

  function now(){const value=clock();invariant(typeof value==='string'&&Number.isFinite(Date.parse(value)),'ENGINEERING_JOB_CLOCK_INVALID','Engineering job clock is invalid');return new Date(value).toISOString();}
  return Object.freeze({processPending});
}
function errorCode(error){return typeof error?.code==='string'&&error.code?error.code:'ENGINEERING_JOB_FAILED';}
