import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { bootstrapProductionAcceptanceReferences } from '../../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

test('Product Engineering durable jobs reclaim expired leases and dead-letter bounded retries',async()=>{
  assert.ok(connectionString,'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool=new Pool({connectionString,max:2});
  const migrationsDir=fileURLToPath(new URL('../../db/migrations/',import.meta.url));
  try{
    await migratePostgres({pool,migrationsDir});
    const runtime=createPostgresWholesaleRuntime({pool,migrationsDir});
    const references=await bootstrapProductionAcceptanceReferences({platform:runtime.platform,auth:runtime.auth,pool});
    const suffix=randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
    const style=await runtime.productIdentity.createStyle(
      'engineering-job-recovery-style-'+suffix,
      references.actors.brandOwner,
      {brandId:references.brand.id,styleCode:'JOB.RECOVERY.'+suffix},
    );
    const store=runtime.productEngineeringJobStore;

    const t0='2026-10-06T17:00:00.000Z';
    const t1='2026-10-06T17:00:02.000Z';
    const t2='2026-10-06T17:00:04.000Z';

    const recoverId=store.nextId('engineering-job');
    await store.enqueue({
      id:recoverId,
      dedupeKey:'acceptance-reclaim-'+suffix,
      brandId:references.brand.id,
      styleId:style.id,
      jobType:'analysis_execute',
      payload:{acceptance:true},
      maxAttempts:3,
      availableAt:t0,
    });
    const first=await store.claim({workerId:'worker-a',limit:1,leaseMs:1000,claimedAt:t0});
    assert.equal(first.length,1);
    assert.equal(first[0].id,recoverId);
    assert.equal(first[0].attemptCount,1);
    assert.equal(first[0].status,'running');

    const reclaimed=await store.claim({workerId:'worker-b',limit:1,leaseMs:1000,claimedAt:t1});
    assert.equal(reclaimed.length,1);
    assert.equal(reclaimed[0].id,recoverId);
    assert.equal(reclaimed[0].attemptCount,2);
    assert.equal(reclaimed[0].workerId,'worker-b');
    const completed=await store.complete({jobId:recoverId,workerId:'worker-b',result:{recovered:true},completedAt:t1});
    assert.equal(completed.status,'completed');
    assert.deepEqual(completed.result,{recovered:true});

    const deadId=store.nextId('engineering-job');
    await store.enqueue({
      id:deadId,
      dedupeKey:'acceptance-dead-letter-'+suffix,
      brandId:references.brand.id,
      styleId:style.id,
      jobType:'analysis_execute',
      payload:{acceptance:true},
      maxAttempts:2,
      availableAt:t0,
    });
    const attempt1=(await store.claim({workerId:'worker-c',limit:1,leaseMs:1000,claimedAt:t0}))[0];
    assert.equal(attempt1.id,deadId);
    const failed1=await store.fail({
      jobId:deadId,workerId:'worker-c',errorCode:'ACCEPTANCE_TRANSIENT',
      retryAt:t1,failedAt:t0,
    });
    assert.equal(failed1.status,'failed');
    assert.equal(failed1.attemptCount,1);

    const attempt2=(await store.claim({workerId:'worker-d',limit:1,leaseMs:1000,claimedAt:t1}))[0];
    assert.equal(attempt2.id,deadId);
    assert.equal(attempt2.attemptCount,2);
    const terminal=await store.fail({
      jobId:deadId,workerId:'worker-d',errorCode:'ACCEPTANCE_TERMINAL',
      retryAt:t2,failedAt:t1,
    });
    assert.equal(terminal.status,'dead_letter');
    assert.equal(terminal.attemptCount,2);
    assert.equal(terminal.lastErrorCode,'ACCEPTANCE_TERMINAL');

    const afterTerminal=await store.claim({workerId:'worker-e',limit:10,leaseMs:1000,claimedAt:t2});
    assert.equal(afterTerminal.some(job=>job.id===deadId),false);
  }finally{
    await pool.end();
  }
});
