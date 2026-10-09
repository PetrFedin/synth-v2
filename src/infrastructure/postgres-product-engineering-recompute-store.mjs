import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{pool?:any}} [options] */
export function createPostgresProductEngineeringRecomputeStore({ pool } = {}) {
  invariant(pool && typeof pool.query === 'function' && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction: (work) => withPostgresTransaction(pool, work, { createView: transactionView }),
    getCommand: (id) => getRegisteredCommand(pool, 'product-engineering', id),

    async getPlanWorkspace(planId) {
      const [planResult, executionResult, orchestrationResult] = await Promise.all([
        pool.query(
          `SELECT plan.*, dependency_set.dependencies, dependency_set.trigger_result_reference, dependency_set.trigger_verification_hash
             FROM product_engineering_recompute_plans plan
             JOIN product_engineering_recompute_dependency_sets dependency_set ON dependency_set.id=plan.dependency_set_id
            WHERE plan.id=$1`,
          [planId],
        ),
        pool.query('SELECT * FROM product_engineering_recompute_execution_receipts WHERE plan_id=$1 ORDER BY completed_at, step_id', [planId]),
        pool.query('SELECT * FROM product_engineering_recompute_orchestration_receipts WHERE plan_id=$1', [planId]),
      ]);
      if (!planResult.rows[0]) return undefined;
      return deepFreeze({
        plan: mapPlan(planResult.rows[0]),
        dependencies: planResult.rows[0].dependencies ?? [],
        triggerResultReference: planResult.rows[0].trigger_result_reference,
        triggerVerificationHash: planResult.rows[0].trigger_verification_hash,
        executionReceipts: executionResult.rows.map(mapExecutionReceipt),
        orchestrationReceipt: orchestrationResult.rows[0] ? mapOrchestrationReceipt(orchestrationResult.rows[0]) : null,
      });
    },
  });
}

/** @param {any} client */
function transactionView(client) {
  return Object.freeze({
    getCommand: (id) => getRegisteredCommand(client, 'product-engineering', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'product-engineering', value),

    async getChangeImpactForUpdate(impactId) {
      const result = await client.query('SELECT * FROM product_engineering_change_impacts WHERE id=$1 FOR UPDATE', [impactId]);
      return result.rows[0] ? mapChangeImpact(result.rows[0]) : undefined;
    },

    async getChangeImpactReceiptByImpact(impactId) {
      const result = await client.query('SELECT * FROM product_engineering_change_impact_receipts WHERE impact_id=$1', [impactId]);
      return result.rows[0] ? mapChangeImpactReceipt(result.rows[0]) : undefined;
    },

    async getDependencySetByTrigger(changeCaseId, triggerReceiptId) {
      const result = await client.query(
        'SELECT * FROM product_engineering_recompute_dependency_sets WHERE change_case_id=$1 AND trigger_receipt_id=$2 ORDER BY detected_at DESC, id DESC LIMIT 1',
        [changeCaseId, triggerReceiptId],
      );
      return result.rows[0] ? mapDependencySet(result.rows[0]) : undefined;
    },

    async insertDependencySet(value) {
      await client.query(
        `INSERT INTO product_engineering_recompute_dependency_sets
          (id,change_case_id,brand_id,style_id,trigger_receipt_id,trigger_receipt_hash,trigger_result_reference,trigger_verification_hash,dependencies,dependency_set_hash,detected_at,detected_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12)`,
        [
          value.id,value.changeCaseId,value.brandId,value.styleId,value.triggerReceiptId,value.triggerReceiptHash,
          JSON.stringify(value.triggerResultReference),value.triggerVerificationHash,JSON.stringify(value.dependencies),
          value.dependencySetHash,value.detectedAt,value.detectedBy,
        ],
      );
    },

    async getPlanByDependencySet(dependencySetId) {
      const result = await client.query('SELECT * FROM product_engineering_recompute_plans WHERE dependency_set_id=$1', [dependencySetId]);
      return result.rows[0] ? mapPlan(result.rows[0]) : undefined;
    },

    async insertPlan(value) {
      await client.query(
        `INSERT INTO product_engineering_recompute_plans
          (id,change_case_id,brand_id,style_id,trigger_receipt_id,trigger_receipt_hash,dependency_set_id,dependency_set_hash,steps,levels,plan_hash,status,created_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,'open',$12,$13)`,
        [
          value.id,value.changeCaseId,value.brandId,value.styleId,value.triggerReceiptId,value.triggerReceiptHash,
          value.dependencySetId,value.dependencySetHash,JSON.stringify(value.steps),JSON.stringify(value.levels),
          value.planHash,value.createdAt,value.createdBy,
        ],
      );
    },

    async getPlanForUpdate(planId) {
      const result = await client.query('SELECT * FROM product_engineering_recompute_plans WHERE id=$1 FOR UPDATE', [planId]);
      return result.rows[0] ? mapPlan(result.rows[0]) : undefined;
    },

    async listExecutionReceipts(planId) {
      const result = await client.query('SELECT * FROM product_engineering_recompute_execution_receipts WHERE plan_id=$1 ORDER BY completed_at, step_id', [planId]);
      return result.rows.map(mapExecutionReceipt);
    },

    async getExecutionReceiptByStep(planId, stepId) {
      const result = await client.query('SELECT * FROM product_engineering_recompute_execution_receipts WHERE plan_id=$1 AND step_id=$2', [planId, stepId]);
      return result.rows[0] ? mapExecutionReceipt(result.rows[0]) : undefined;
    },

    async insertExecutionReceipt(value) {
      await client.query(
        `INSERT INTO product_engineering_recompute_execution_receipts
          (id,plan_id,plan_hash,step_id,dependency_id,impact_id,owning_authority,operation,mode,command_id,idempotency_key,input_reference,status,evidence,result_reference,result_verification,error_code,receipt_hash,started_at,completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19,$20)`,
        [
          value.id,value.planId,value.planHash,value.stepId,value.dependencyId,value.impactId,value.owningAuthority,
          value.operation,value.mode,value.commandId,value.idempotencyKey,JSON.stringify(value.inputReference),value.status,
          JSON.stringify(value.evidence),value.resultReference===null?null:JSON.stringify(value.resultReference),
          value.resultVerification===null?null:JSON.stringify(value.resultVerification),value.errorCode,value.receiptHash,
          value.startedAt,value.completedAt,
        ],
      );
    },

    async getOrchestrationReceiptByPlan(planId) {
      const result = await client.query('SELECT * FROM product_engineering_recompute_orchestration_receipts WHERE plan_id=$1', [planId]);
      return result.rows[0] ? mapOrchestrationReceipt(result.rows[0]) : undefined;
    },

    async insertOrchestrationReceipt(value) {
      await client.query(
        `INSERT INTO product_engineering_recompute_orchestration_receipts
          (id,plan_id,plan_hash,dependency_set_id,dependency_set_hash,change_case_id,trigger_receipt_id,trigger_receipt_hash,execution_receipt_hashes,admission_hash,receipt_hash,completed_at,completed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
        [
          value.id,value.planId,value.planHash,value.dependencySetId,value.dependencySetHash,value.changeCaseId,
          value.triggerReceiptId,value.triggerReceiptHash,JSON.stringify(value.executionReceiptHashes),value.admissionHash,
          value.receiptHash,value.completedAt,value.completedBy,
        ],
      );
    },

    async markPlanCompleted(planId, completedAt, completedBy) {
      const result = await client.query(
        `UPDATE product_engineering_recompute_plans
            SET status='completed',completed_at=$2,completed_by=$3
          WHERE id=$1 AND status='open'`,
        [planId,completedAt,completedBy],
      );
      invariant(result.rowCount===1,'PRODUCT_ENGINEERING_RECOMPUTE_PLAN_NOT_OPEN','Recompute plan is not open',{planId});
    },
  });
}

/** @param {any} row */
function mapChangeImpact(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,impactKind:row.impact_kind,entityId:row.entity_id,
    entityVersion:row.entity_version,area:row.area,requiredAction:row.required_action,severity:row.severity,
    evidenceStatus:row.evidence_status,basis:deepFreeze(row.basis),status:row.status,
    createdAt:iso(row.created_at),createdBy:row.created_by,version:Number(row.version),
  });
}

/** @param {any} row */
function mapChangeImpactReceipt(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,impactId:row.impact_id,disposition:row.disposition,
    previousImpactVersion:Number(row.previous_impact_version),resultingImpactVersion:Number(row.resulting_impact_version),
    reason:row.reason,evidence:deepFreeze(row.evidence ?? []),resultReference:deepFreeze(row.result_reference),
    resultVerification:deepFreeze(row.result_verification),waiver:deepFreeze(row.waiver),receiptHash:row.receipt_hash,
    createdAt:iso(row.created_at),createdBy:row.created_by,
  });
}

/** @param {any} row */
function mapDependencySet(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,brandId:row.brand_id,styleId:row.style_id,
    triggerReceiptId:row.trigger_receipt_id,triggerReceiptHash:row.trigger_receipt_hash,
    triggerResultReference:deepFreeze(row.trigger_result_reference),triggerVerificationHash:row.trigger_verification_hash,
    dependencies:deepFreeze(row.dependencies ?? []),dependencySetHash:row.dependency_set_hash,
    detectedAt:iso(row.detected_at),detectedBy:row.detected_by,
  });
}

/** @param {any} row */
function mapPlan(row) {
  return Object.freeze({
    id:row.id,changeCaseId:row.change_case_id,brandId:row.brand_id,styleId:row.style_id,
    triggerReceiptId:row.trigger_receipt_id,triggerReceiptHash:row.trigger_receipt_hash,
    dependencySetId:row.dependency_set_id,dependencySetHash:row.dependency_set_hash,
    steps:deepFreeze(row.steps ?? []),levels:deepFreeze(row.levels ?? []),planHash:row.plan_hash,
    status:row.status,createdAt:iso(row.created_at),createdBy:row.created_by,
    completedAt:iso(row.completed_at),completedBy:row.completed_by,
  });
}

/** @param {any} row */
function mapExecutionReceipt(row) {
  return Object.freeze({
    id:row.id,planId:row.plan_id,planHash:row.plan_hash,stepId:row.step_id,dependencyId:row.dependency_id,
    impactId:row.impact_id,owningAuthority:row.owning_authority,operation:row.operation,mode:row.mode,
    commandId:row.command_id,idempotencyKey:row.idempotency_key,inputReference:deepFreeze(row.input_reference),
    status:row.status,evidence:deepFreeze(row.evidence ?? []),resultReference:deepFreeze(row.result_reference),
    resultVerification:deepFreeze(row.result_verification),errorCode:row.error_code,receiptHash:row.receipt_hash,
    startedAt:iso(row.started_at),completedAt:iso(row.completed_at),
  });
}

/** @param {any} row */
function mapOrchestrationReceipt(row) {
  return Object.freeze({
    id:row.id,planId:row.plan_id,planHash:row.plan_hash,dependencySetId:row.dependency_set_id,
    dependencySetHash:row.dependency_set_hash,changeCaseId:row.change_case_id,triggerReceiptId:row.trigger_receipt_id,
    triggerReceiptHash:row.trigger_receipt_hash,executionReceiptHashes:deepFreeze(row.execution_receipt_hashes ?? []),
    admissionHash:row.admission_hash,receiptHash:row.receipt_hash,completedAt:iso(row.completed_at),completedBy:row.completed_by,
  });
}

/** @param {any} value */
function iso(value){return value?new Date(value).toISOString():null;}
/** @param {any} value */
function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const nested of Object.values(value))deepFreeze(nested);return value;}
