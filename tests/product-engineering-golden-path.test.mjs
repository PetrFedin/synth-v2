import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEngineeringJobService } from '../src/application/product-engineering-job-service.mjs';
import { createBaselineEngineeringScanner } from '../src/modules/product-engineering/baseline-scanner.mjs';
import { createEngineeringSource } from '../src/modules/product-engineering/intake.mjs';

const NOW='2026-10-06T15:00:00.000Z';
const HASH='a'.repeat(64);

test('durable engineering worker advances controlled source from scan to parsed fragments',async()=>{
  let source=createEngineeringSource({
    id:'source-1',brandId:'brand-1',styleId:'style-1',kind:'document',ingestMode:'upload',
    mediaType:'application/pdf',originalName:'spec.pdf',sizeBytes:48,contentHash:HASH,
    storageRef:'postgres-blob:source-1',createdAt:NOW,createdBy:'user-1',
  });
  const blob={
    sourceId:'source-1',brandId:'brand-1',styleId:'style-1',mediaType:'application/pdf',
    sizeBytes:48,contentHash:HASH,
    content:new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Type /Page>> endobj'),
    createdAt:NOW,
  };
  const fragments=[];
  const engineeringStore={
    async getSource(id){return id===source.id?source:undefined;},
    async getSourceBlob(id){return id===source.id?blob:undefined;},
    async transaction(work){
      return work({
        async getSourceForUpdate(id){return id===source.id?source:undefined;},
        async updateSource(next,expectedVersion){
          assert.equal(source.version,expectedVersion);
          source=next;
        },
        async insertFragment(fragment){fragments.push(fragment);},
      });
    },
  };

  let sequence=0;
  const jobs=[{
    id:'job-scan',dedupeKey:'source-scan:source-1:'+HASH,brandId:'brand-1',styleId:'style-1',
    sourceId:'source-1',analysisRunId:null,jobType:'source_scan',status:'queued',payload:{contentHash:HASH},
    attemptCount:0,maxAttempts:5,availableAt:NOW,claimedAt:null,leaseExpiresAt:null,workerId:null,lastErrorCode:null,createdAt:NOW,completedAt:null,
  }];
  const completed=[];
  const jobStore={
    async claim({workerId}){
      const job=jobs.find(x=>x.status==='queued');
      if(!job)return [];
      job.status='running';job.workerId=workerId;job.attemptCount+=1;return [Object.freeze({...job})];
    },
    async enqueue(job){jobs.push({...job,status:'queued',attemptCount:0});return job;},
    async complete({jobId,result}){const job=jobs.find(x=>x.id===jobId);job.status='completed';completed.push({jobId,result});return job;},
    async fail(){throw new Error('job should not fail');},
    nextId(){sequence+=1;return 'job-'+sequence;},
  };

  const runner=createProductEngineeringJobService({
    jobStore,engineeringStore,scanner:createBaselineEngineeringScanner(),workerId:'worker-1',
    clock:()=>NOW,nextId:(prefix)=>prefix+'-'+(++sequence),
  });

  const first=await runner.processPending({limit:10});
  assert.equal(first[0].jobType,'source_scan');
  assert.equal(source.status,'admitted');
  assert.equal(source.scanStatus,'clean');
  assert.equal(source.parseStatus,'queued');
  assert.equal(source.metadata.securityScan.details.assurance,'integrity_only');
  assert.ok(jobs.some(x=>x.jobType==='source_parse'&&x.status==='queued'));

  const second=await runner.processPending({limit:10});
  assert.equal(second[0].jobType,'source_parse');
  assert.equal(source.parseStatus,'completed');
  assert.equal(source.metadata.parse.parser,'pdf-structure');
  assert.equal(fragments.length,2);
  assert.equal(fragments[1].kind,'document_page');
  assert.equal(fragments[1].locator.page,1);
  assert.equal(completed.length,2);
});
