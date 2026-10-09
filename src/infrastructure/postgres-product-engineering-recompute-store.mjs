import { randomUUID } from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{pool?: any}} [options] */
export function createPostgresProductEngineeringRecomputeStore(options = {}) {
  const { pool } = options;
  invariant(pool && typeof pool.query === 'function' && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  return Object.freeze({
    async persistPlan(staleDependencySet, plan) {
      invariant(staleDependencySet?.id && plan?.id, 'PRODUCT_ENGINEERING_RECOMPUTE_PERSISTENCE_INPUT_REQUIRED', 'Dependency set and recompute plan are required');
      invariant(plan.dependencySetId === staleDependencySet.id && plan.dependencySetHash === staleDependencySet.dependencySetHash, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_SET_MISMATCH', 'Recompute plan does not belong to the exact stale dependency set');
      return withPostgresTransaction(pool, async client => {
        await client.query(
          `INSERT INTO product_engineering_stale_dependency_sets
             (id,change_case_id,brand_id,style_id,trigger_receipt_id,trigger_receipt_hash,
              trigger_result_reference,trigger_verification_hash,dependencies,dependency_set_hash,payload,detected_at,detected_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11::jsonb,$12,$13)
           ON CONFLICT DO NOTHING`,
          [
            staleDependencySet.id, staleDependencySet.changeCaseId, staleDependencySet.brandId, staleDependencySet.styleId,
            staleDependencySet.triggerReceiptId, staleDependencySet.triggerReceiptHash, JSON.stringify(staleDependencySet.triggerResultReference),
            staleDependencySet.triggerVerificationHash, JSON.stringify(staleDependencySet.dependencies), staleDependencySet.dependencySetHash,
            JSON.stringify(staleDependencySet), staleDependencySet.detectedAt, staleDependencySet.detectedBy,
          ],
        );
        const persistedSet = await client.query(
          `SELECT id,dependency_set_hash FROM product_engineering_stale_dependency_sets WHERE dependency_set_hash=$1`,
          [staleDependencySet.dependencySetHash],
        );
        invariant(persistedSet.rowCount === 1 && persistedSet.rows[0].id === staleDependencySet.id, 'PRODUCT_ENGINEERING_RECOMPUTE_DEPENDENCY_SET_CONFLICT', 'Dependency set hash is already bound to another identity');

        await client.query(
          `INSERT INTO product_engineering_recompute_plans
             (id,change_case_id,dependency_set_id,brand_id,style_id,trigger_receipt_id,trigger_receipt_hash,
              dependency_set_hash,steps,levels,plan_hash,payload,created_at,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13,$14)
           ON CONFLICT DO NOTHING`,
          [
            plan.id, plan.changeCaseId, plan.dependencySetId, plan.brandId, plan.styleId, plan.triggerReceiptId,
            plan.triggerReceiptHash, plan.dependencySetHash, JSON.stringify(plan.steps), JSON.stringify(plan.levels),
            plan.planHash, JSON.stringify(plan), plan.createdAt, plan.createdBy,
          ],
        );
        const persistedPlan = await client.query(
          `SELECT id,plan_hash FROM product_engineering_recompute_plans WHERE plan_hash=$1`,
          [plan.planHash],
        );
        invariant(persistedPlan.rowCount === 1 && persistedPlan.rows[0].id === plan.id, 'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_CONFLICT', 'Recompute plan hash is already bound to another identity');

        for (const step of plan.steps) {
          await client.query(
            `INSERT INTO product_engineering_recompute_plan_steps
               (plan_id,step_id,dependency_id,owning_authority,operation,mode,severity,input_reference,source_reference,depends_on,evidence)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)
             ON CONFLICT (plan_id,step_id) DO NOTHING`,
            [
              plan.id, step.id, step.dependencyId, step.owningAuthority, step.operation, step.mode, step.severity,
              JSON.stringify(step.inputReference), JSON.stringify(step.sourceReference), JSON.stringify(step.dependsOn), JSON.stringify(step.evidence),
            ],
          );
          if (step.mode === 'automatic') {
            const jobId = `recompute-job_${randomUUID()}`;
            await client.query(
              `INSERT INTO product_engineering_recompute_jobs
                 (id,dedupe_key,plan_id,step_id,brand_id,style_id,job_type,status,payload,attempt_count,max_attempts,available_at,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,'automatic_dispatch','queued',$7::jsonb,0,5,$8,$8)
               ON CONFLICT (plan_id,step_id) DO NOTHING`,
              [jobId, `recompute:${plan.planHash}:${step.id}`, plan.id, step.id, plan.brandId, plan.styleId, JSON.stringify({ planHash: plan.planHash, stepId: step.id }), plan.createdAt],
            );
          }
        }
        return Object.freeze({ staleDependencySet: deepFreeze(structuredClone(staleDependencySet)), plan: deepFreeze(structuredClone(plan)) });
      });
    },

    async getPlan(planId) {
      const result = await pool.query(`SELECT payload FROM product_engineering_recompute_plans WHERE id=$1`, [planId]);
      return result.rowCount === 1 ? deepFreeze(structuredClone(result.rows[0].payload)) : null;
    },

    async claim(options = {}) {
      const { workerId, limit = 10, leaseMs = 60000, claimedAt = new Date().toISOString() } = /** @type {any} */ (options);
      invariant(typeof workerId === 'string' && workerId.trim(), 'PRODUCT_ENGINEERING_RECOMPUTE_WORKER_REQUIRED', 'Recompute worker id is required');
      invariant(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'PRODUCT_ENGINEERING_RECOMPUTE_LIMIT_INVALID', 'Recompute claim limit must be 1-100');
      invariant(Number.isInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 900000, 'PRODUCT_ENGINEERING_RECOMPUTE_LEASE_INVALID', 'Recompute lease must be 1s-15m');
      const leaseExpiresAt = new Date(Date.parse(claimedAt) + leaseMs).toISOString();
      return withPostgresTransaction(pool, async client => {
        const result = await client.query(
          `WITH picked AS (
             SELECT job.id
               FROM product_engineering_recompute_jobs job
               JOIN product_engineering_recompute_plan_steps step
                 ON step.plan_id=job.plan_id AND step.step_id=job.step_id
              WHERE (
                     (job.status IN ('queued','failed') AND job.available_at <= $2)
                     OR
                     (job.status='running' AND job.lease_expires_at <= $2)
                    )
                AND job.attempt_count < job.max_attempts
                AND NOT EXISTS (
                  SELECT 1
                    FROM jsonb_array_elements_text(step.depends_on) dependency(step_id)
                   WHERE NOT EXISTS (
                     SELECT 1
                       FROM product_engineering_recompute_execution_receipts receipt
                      WHERE receipt.plan_id=job.plan_id
                        AND receipt.step_id=dependency.step_id
                        AND receipt.status='succeeded'
                   )
                )
              ORDER BY job.available_at,job.created_at,job.id
              LIMIT $4
              FOR UPDATE OF job SKIP LOCKED
           )
           UPDATE product_engineering_recompute_jobs job
              SET status='running',worker_id=$1,claimed_at=$2,lease_expires_at=$3,
                  attempt_count=job.attempt_count+1,last_error_code=NULL
             FROM picked
            WHERE job.id=picked.id
           RETURNING job.*`,
          [workerId, claimedAt, leaseExpiresAt, limit],
        );
        return Object.freeze(result.rows.map(mapJob));
      });
    },

    async completeWithReceipt({ jobId, workerId, receipt, result = {}, completedAt = new Date().toISOString() }) {
      return withPostgresTransaction(pool, async client => {
        const persisted = await insertExecutionReceipt(client, receipt);
        const updated = await client.query(
          `UPDATE product_engineering_recompute_jobs
              SET status='completed',result=$3::jsonb,completed_at=$4,worker_id=NULL,claimed_at=NULL,lease_expires_at=NULL
            WHERE id=$1 AND status='running' AND worker_id=$2
            RETURNING *`,
          [jobId, workerId, JSON.stringify({ ...result, receiptId: persisted.id, receiptHash: persisted.receiptHash }), completedAt],
        );
        invariant(updated.rowCount === 1, 'PRODUCT_ENGINEERING_RECOMPUTE_JOB_LEASE_LOST', 'Recompute job lease was lost', { jobId });
        return Object.freeze({ job: mapJob(updated.rows[0]), receipt: persisted });
      });
    },

    async fail({ jobId, workerId, errorCode, retryAt, failedAt = new Date().toISOString() }) {
      const updated = await pool.query(
        `UPDATE product_engineering_recompute_jobs
            SET status=CASE WHEN attempt_count>=max_attempts THEN 'dead_letter' ELSE 'failed' END,
                last_error_code=$3,
                available_at=CASE WHEN attempt_count>=max_attempts THEN available_at ELSE $4::timestamptz END,
                completed_at=CASE WHEN attempt_count>=max_attempts THEN $5::timestamptz ELSE NULL::timestamptz END,
                worker_id=NULL,claimed_at=NULL,lease_expires_at=NULL
          WHERE id=$1 AND status='running' AND worker_id=$2
          RETURNING *`,
        [jobId, workerId, errorCode, retryAt, failedAt],
      );
      invariant(updated.rowCount === 1, 'PRODUCT_ENGINEERING_RECOMPUTE_JOB_LEASE_LOST', 'Recompute job lease was lost', { jobId });
      return mapJob(updated.rows[0]);
    },

    async recordExecutionReceipt(receipt) {
      return withPostgresTransaction(pool, client => insertExecutionReceipt(client, receipt));
    },

    async listExecutionReceipts(planId) {
      const result = await pool.query(
        `SELECT * FROM product_engineering_recompute_execution_receipts WHERE plan_id=$1 ORDER BY step_id`,
        [planId],
      );
      return Object.freeze(result.rows.map(mapExecutionReceipt));
    },

    async listReadyEvidenceSteps(planId) {
      const result = await pool.query(
        `SELECT step.*
           FROM product_engineering_recompute_plan_steps step
          WHERE step.plan_id=$1
            AND step.mode IN ('human_review','external_evidence')
            AND NOT EXISTS (
              SELECT 1 FROM product_engineering_recompute_execution_receipts receipt
               WHERE receipt.plan_id=step.plan_id AND receipt.step_id=step.step_id
            )
            AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements_text(step.depends_on) dependency(step_id)
               WHERE NOT EXISTS (
                 SELECT 1 FROM product_engineering_recompute_execution_receipts receipt
                  WHERE receipt.plan_id=step.plan_id
                    AND receipt.step_id=dependency.step_id
                    AND receipt.status='succeeded'
               )
            )
          ORDER BY step.step_id`,
        [planId],
      );
      return Object.freeze(result.rows.map(mapStep));
    },

    async recordOrchestrationReceipt(receipt) {
      await pool.query(
        `INSERT INTO product_engineering_recompute_orchestration_receipts
           (id,plan_id,plan_hash,dependency_set_id,dependency_set_hash,change_case_id,trigger_receipt_id,trigger_receipt_hash,
            execution_receipt_hashes,admission_hash,completed_at,completed_by,receipt_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
         ON CONFLICT (plan_id) DO NOTHING`,
        [
          receipt.id, receipt.planId, receipt.planHash, receipt.dependencySetId, receipt.dependencySetHash,
          receipt.changeCaseId, receipt.triggerReceiptId, receipt.triggerReceiptHash, JSON.stringify(receipt.executionReceiptHashes),
          receipt.admissionHash, receipt.completedAt, receipt.completedBy, receipt.receiptHash,
        ],
      );
      const result = await pool.query(`SELECT * FROM product_engineering_recompute_orchestration_receipts WHERE plan_id=$1`, [receipt.planId]);
      invariant(result.rowCount === 1 && result.rows[0].receipt_hash === receipt.receiptHash, 'PRODUCT_ENGINEERING_RECOMPUTE_ORCHESTRATION_CONFLICT', 'Plan is already sealed by another orchestration receipt');
      return mapOrchestrationReceipt(result.rows[0]);
    },

    async getOrchestrationReceipt(planId) {
      const result = await pool.query(`SELECT * FROM product_engineering_recompute_orchestration_receipts WHERE plan_id=$1`, [planId]);
      return result.rowCount === 1 ? mapOrchestrationReceipt(result.rows[0]) : null;
    },

    async backlog() {
      const result = await pool.query(
        `SELECT count(*) FILTER (WHERE status IN ('queued','failed'))::integer AS pending,
                count(*) FILTER (WHERE status='running')::integer AS running,
                count(*) FILTER (WHERE status='dead_letter')::integer AS dead_letter,
                min(created_at) FILTER (WHERE status IN ('queued','failed')) AS oldest
           FROM product_engineering_recompute_jobs`,
      );
      const row = result.rows[0] ?? {};
      return Object.freeze({ pending: Number(row.pending ?? 0), running: Number(row.running ?? 0), deadLetter: Number(row.dead_letter ?? 0), oldestQueuedAt: iso(row.oldest) });
    },

    nextId(prefix = 'recompute') { return `${prefix}_${randomUUID()}`; },
  });
}

async function insertExecutionReceipt(client, receipt) {
  await client.query(
    `INSERT INTO product_engineering_recompute_execution_receipts
       (id,plan_id,plan_hash,step_id,dependency_id,owning_authority,operation,mode,command_id,idempotency_key,input_reference,
        status,evidence,result_reference,result_verification,error_code,started_at,completed_at,receipt_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17,$18,$19)
     ON CONFLICT (plan_id,step_id) DO NOTHING`,
    [
      receipt.id, receipt.planId, receipt.planHash, receipt.stepId, receipt.dependencyId, receipt.owningAuthority,
      receipt.operation, receipt.mode, receipt.commandId, receipt.idempotencyKey, JSON.stringify(receipt.inputReference),
      receipt.status, JSON.stringify(receipt.evidence), receipt.resultReference ? JSON.stringify(receipt.resultReference) : null,
      receipt.resultVerification ? JSON.stringify(receipt.resultVerification) : null, receipt.errorCode, receipt.startedAt,
      receipt.completedAt, receipt.receiptHash,
    ],
  );
  const result = await client.query(
    `SELECT * FROM product_engineering_recompute_execution_receipts WHERE plan_id=$1 AND step_id=$2`,
    [receipt.planId, receipt.stepId],
  );
  invariant(result.rowCount === 1 && result.rows[0].receipt_hash === receipt.receiptHash, 'PRODUCT_ENGINEERING_RECOMPUTE_RECEIPT_CONFLICT', 'Plan step is already closed by another execution receipt');
  return mapExecutionReceipt(result.rows[0]);
}

function mapJob(row) {
  return Object.freeze({
    id: row.id, dedupeKey: row.dedupe_key, planId: row.plan_id, stepId: row.step_id, brandId: row.brand_id, styleId: row.style_id,
    jobType: row.job_type, status: row.status, payload: deepFreeze(row.payload ?? {}), result: row.result ? deepFreeze(row.result) : null,
    attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts), availableAt: iso(row.available_at), claimedAt: iso(row.claimed_at),
    leaseExpiresAt: iso(row.lease_expires_at), workerId: row.worker_id, lastErrorCode: row.last_error_code,
    createdAt: iso(row.created_at), completedAt: iso(row.completed_at),
  });
}

function mapStep(row) {
  return Object.freeze({
    id: row.step_id, dependencyId: row.dependency_id, owningAuthority: row.owning_authority, operation: row.operation,
    mode: row.mode, severity: row.severity, inputReference: deepFreeze(row.input_reference), sourceReference: deepFreeze(row.source_reference),
    dependsOn: Object.freeze([...(row.depends_on ?? [])]), evidence: deepFreeze(row.evidence ?? []),
  });
}

function mapExecutionReceipt(row) {
  return Object.freeze({
    id: row.id, planId: row.plan_id, planHash: row.plan_hash, stepId: row.step_id, dependencyId: row.dependency_id,
    owningAuthority: row.owning_authority, operation: row.operation, mode: row.mode, commandId: row.command_id,
    idempotencyKey: row.idempotency_key, inputReference: deepFreeze(row.input_reference), status: row.status,
    evidence: deepFreeze(row.evidence ?? []), resultReference: row.result_reference ? deepFreeze(row.result_reference) : null,
    resultVerification: row.result_verification ? deepFreeze(row.result_verification) : null, errorCode: row.error_code,
    startedAt: iso(row.started_at), completedAt: iso(row.completed_at), receiptHash: row.receipt_hash,
  });
}

function mapOrchestrationReceipt(row) {
  return Object.freeze({
    id: row.id, planId: row.plan_id, planHash: row.plan_hash, dependencySetId: row.dependency_set_id,
    dependencySetHash: row.dependency_set_hash, changeCaseId: row.change_case_id, triggerReceiptId: row.trigger_receipt_id,
    triggerReceiptHash: row.trigger_receipt_hash, executionReceiptHashes: Object.freeze([...(row.execution_receipt_hashes ?? [])]),
    admissionHash: row.admission_hash, completedAt: iso(row.completed_at), completedBy: row.completed_by, receiptHash: row.receipt_hash,
  });
}

function iso(value) { return value ? new Date(value).toISOString() : null; }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
