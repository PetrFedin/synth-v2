import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresProductEngineeringJobStore(options={}) {
  const {pool}=options;
  invariant(pool&&typeof pool.query==='function'&&typeof pool.connect==='function','POSTGRES_POOL_REQUIRED','PostgreSQL pool is required');
  return Object.freeze({
    async enqueue(job) {
      const result=await pool.query(
        `INSERT INTO product_engineering_jobs
          (id,dedupe_key,brand_id,style_id,source_id,analysis_run_id,job_type,status,payload,attempt_count,max_attempts,available_at,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8::jsonb,0,$9,$10,$10)
         ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key=EXCLUDED.dedupe_key
         RETURNING *`,
        [job.id,job.dedupeKey,job.brandId,job.styleId,job.sourceId??null,job.analysisRunId??null,job.jobType,JSON.stringify(job.payload??{}),job.maxAttempts??5,job.availableAt],
      );
      return mapJob(result.rows[0]);
    },
    async claim({workerId,limit=10,leaseMs=60000,claimedAt=new Date().toISOString()}={}) {
      invariant(typeof workerId==='string'&&workerId.trim(),'ENGINEERING_JOB_WORKER_REQUIRED','Engineering job worker id is required');
      invariant(Number.isInteger(limit)&&limit>=1&&limit<=100,'ENGINEERING_JOB_LIMIT_INVALID','Engineering job claim limit must be 1-100');
      invariant(Number.isInteger(leaseMs)&&leaseMs>=1000&&leaseMs<=900000,'ENGINEERING_JOB_LEASE_INVALID','Engineering job lease must be 1s-15m');
      const leaseExpiresAt=new Date(Date.parse(claimedAt)+leaseMs).toISOString();
      return withPostgresTransaction(pool,async client=>{
        const result=await client.query(
          `WITH picked AS (
             SELECT id FROM product_engineering_jobs
              WHERE (
                     (status IN ('queued','failed') AND available_at <= $2)
                     OR
                     (status='running' AND lease_expires_at <= $2)
                    )
                AND attempt_count < max_attempts
              ORDER BY available_at,created_at,id
              LIMIT $4
              FOR UPDATE SKIP LOCKED
           )
           UPDATE product_engineering_jobs job
              SET status='running',worker_id=$1,claimed_at=$2,lease_expires_at=$3,
                  attempt_count=job.attempt_count+1,last_error_code=NULL
             FROM picked
            WHERE job.id=picked.id
           RETURNING job.*`,
          [workerId,claimedAt,leaseExpiresAt,limit],
        );
        return Object.freeze(result.rows.map(mapJob));
      });
    },
    async complete({jobId,workerId,result={},completedAt=new Date().toISOString()}) {
      const updated=await pool.query(
        `UPDATE product_engineering_jobs
            SET status='completed',result=$3::jsonb,completed_at=$4,worker_id=NULL,claimed_at=NULL,lease_expires_at=NULL
          WHERE id=$1 AND status='running' AND worker_id=$2
          RETURNING *`,
        [jobId,workerId,JSON.stringify(result),completedAt],
      );
      invariant(updated.rowCount===1,'ENGINEERING_JOB_LEASE_LOST','Engineering job lease was lost',{jobId});
      return mapJob(updated.rows[0]);
    },
    async fail({jobId,workerId,errorCode,retryAt,failedAt=new Date().toISOString()}) {
      const updated=await pool.query(
        `UPDATE product_engineering_jobs
            SET status=CASE WHEN attempt_count>=max_attempts THEN 'dead_letter' ELSE 'failed' END,
                last_error_code=$3,
                available_at=CASE WHEN attempt_count>=max_attempts THEN available_at ELSE $4 END,
                completed_at=CASE WHEN attempt_count>=max_attempts THEN $5 ELSE NULL END,
                worker_id=NULL,claimed_at=NULL,lease_expires_at=NULL
          WHERE id=$1 AND status='running' AND worker_id=$2
          RETURNING *`,
        [jobId,workerId,errorCode,retryAt,failedAt],
      );
      invariant(updated.rowCount===1,'ENGINEERING_JOB_LEASE_LOST','Engineering job lease was lost',{jobId});
      return mapJob(updated.rows[0]);
    },
    async backlog() {
      const result=await pool.query(
        `SELECT count(*) FILTER (WHERE status IN ('queued','failed'))::integer AS pending,
                count(*) FILTER (WHERE status='running')::integer AS running,
                count(*) FILTER (WHERE status='dead_letter')::integer AS dead_letter,
                min(created_at) FILTER (WHERE status IN ('queued','failed')) AS oldest
           FROM product_engineering_jobs`
      );
      const row=result.rows[0]??{};
      return Object.freeze({pending:Number(row.pending??0),running:Number(row.running??0),deadLetter:Number(row.dead_letter??0),oldestQueuedAt:row.oldest?new Date(row.oldest).toISOString():null});
    },
    nextId(prefix='engineering-job'){return `${prefix}_${randomUUID()}`;},
  });
}
function mapJob(row){return Object.freeze({
  id:row.id,dedupeKey:row.dedupe_key,brandId:row.brand_id,styleId:row.style_id,sourceId:row.source_id,analysisRunId:row.analysis_run_id,
  jobType:row.job_type,status:row.status,payload:Object.freeze(row.payload??{}),result:row.result?Object.freeze(row.result):null,
  attemptCount:Number(row.attempt_count),maxAttempts:Number(row.max_attempts),availableAt:iso(row.available_at),claimedAt:iso(row.claimed_at),
  leaseExpiresAt:iso(row.lease_expires_at),workerId:row.worker_id,lastErrorCode:row.last_error_code,createdAt:iso(row.created_at),completedAt:iso(row.completed_at),
});}
function iso(value){return value?new Date(value).toISOString():null;}
