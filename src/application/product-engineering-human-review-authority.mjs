import crypto from 'node:crypto';
import { invariant } from '../core/errors.mjs';
import { canonicalJson } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { withPostgresTransaction } from '../infrastructure/postgres-transaction.mjs';

const POLICY = Object.freeze({
  'measurement:measurement.review_revised_chart': CAPABILITIES.MEASUREMENT_MANAGE,
  'material:material.review_revised_specification': CAPABILITIES.CATALOG_MANAGE,
});
const hash = value => crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');

/**
 * Deliberately separate from generic completeEvidenceStep.
 * Only the exact assigned, currently authorised human can decide an exact
 * ready DAG step. This is an append-only review authority, NOT auto-completion.
 * @param {{pool:any,clock?:()=>string}} options
 */
export function createRecomputeHumanReviewAuthority({ pool, clock = () => new Date().toISOString() }) {
  invariant(pool?.connect && pool?.query, 'RECOMPUTE_REVIEW_POOL_REQUIRED', 'PostgreSQL pool is required');
  const readyStep = async (client, planId, stepId) => {
    const { rows } = await client.query(
      `SELECT p.plan_hash,p.brand_id,s.owning_authority,s.operation,s.mode,s.input_reference,s.source_reference
         FROM product_engineering_recompute_plans p
         JOIN product_engineering_recompute_plan_steps s ON s.plan_id=p.id
        WHERE p.id=$1 AND s.step_id=$2 AND s.mode='human_review'
          AND NOT EXISTS (SELECT 1 FROM product_engineering_recompute_execution_receipts r WHERE r.plan_id=p.id AND r.step_id=s.step_id)
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.depends_on) parent(step_id)
            WHERE NOT EXISTS (
              SELECT 1 FROM product_engineering_recompute_execution_receipts r
              WHERE r.plan_id=p.id AND r.step_id=parent.step_id AND r.status='succeeded'
            )
          )`,
      [planId,stepId],
    );
    invariant(rows.length===1,'RECOMPUTE_REVIEW_STEP_NOT_READY','Review step is absent, blocked, or completed');
    return rows[0];
  };
  const membership = async (client, brandId, actorId, capability) => {
    const { rows } = await client.query(
      "SELECT organisation_id AS \"organisationId\",role,status FROM memberships WHERE organisation_id=$1 AND user_id=$2 AND status='active'",
      [brandId,actorId],
    );
    invariant(rows.length===1,'RECOMPUTE_REVIEW_MEMBERSHIP_REQUIRED','Active brand membership is required');
    assertCapability(rows[0],capability);
  };
  return Object.freeze({
    /** @param {{planId:string,stepId:string,assignedReviewerId:string,assignedBy:string}} input */
    async assign({planId,stepId,assignedReviewerId,assignedBy}) {
      return withPostgresTransaction(pool,async client=>{
        const step=await readyStep(client,planId,stepId);
        const capability=POLICY[`${step.owning_authority}:${step.operation}`];
        invariant(capability,'RECOMPUTE_REVIEW_OPERATION_UNSUPPORTED','Only explicitly admitted owning review commands may be assigned');
        await membership(client,step.brand_id,assignedBy,capability);
        await membership(client,step.brand_id,assignedReviewerId,capability);
        const basis={planId,stepId,brandId:step.brand_id,assignedReviewerId,requiredCapability:capability,assignedBy,planHash:step.plan_hash};
        const assignmentHash=hash(basis),assignedAt=clock();
        await client.query(
          `INSERT INTO product_engineering_recompute_review_assignments
           (plan_id,step_id,brand_id,assigned_reviewer_id,required_capability,assigned_by,assigned_at,assignment_hash)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [planId,stepId,step.brand_id,assignedReviewerId,capability,assignedBy,assignedAt,assignmentHash],
        );
        const check=await client.query('SELECT assignment_hash FROM product_engineering_recompute_review_assignments WHERE plan_id=$1 AND step_id=$2',[planId,stepId]);
        invariant(check.rows[0]?.assignment_hash===assignmentHash,'RECOMPUTE_REVIEW_ASSIGNMENT_CONFLICT','Review assignment cannot be silently replaced');
        return Object.freeze({...basis,assignmentHash});
      });
    },
    /** @param {{planId:string,stepId:string,actorId:string,decision:'accepted'|'rejected',rationale:string,evidence:any[],commandId:string}} input */
    async decide({planId,stepId,actorId,decision,rationale,evidence,commandId}) {
      invariant(decision==='accepted'||decision==='rejected','RECOMPUTE_REVIEW_DECISION_INVALID','Review decision must be explicit');
      invariant(typeof rationale==='string'&&rationale.trim(),'RECOMPUTE_REVIEW_REASON_REQUIRED','Review rationale is required');
      invariant(Array.isArray(evidence)&&evidence.length>0,'RECOMPUTE_REVIEW_EVIDENCE_REQUIRED','Review evidence is required');
      invariant(typeof commandId==='string'&&commandId.trim(),'RECOMPUTE_REVIEW_COMMAND_REQUIRED','Idempotent command ID required');
      return withPostgresTransaction(pool,async client=>{
        // Serialise concurrent decisions on this exact immutable assignment.
        const found=await client.query(
          'SELECT * FROM product_engineering_recompute_review_assignments WHERE plan_id=$1 AND step_id=$2 FOR SHARE',
          [planId,stepId],
        );
        const assigned=found.rows[0];
        invariant(assigned?.assigned_reviewer_id===actorId,'RECOMPUTE_REVIEW_ACTOR_NOT_ASSIGNED','Only the exact assigned reviewer may decide');
        await membership(client,assigned.brand_id,actorId,assigned.required_capability);
        const step=await readyStep(client,planId,stepId);
        invariant(POLICY[`${step.owning_authority}:${step.operation}`]===assigned.required_capability,'RECOMPUTE_REVIEW_POLICY_CHANGED','Review policy no longer matches assignment');
        const basis={planId,stepId,planHash:step.plan_hash,assignmentHash:assigned.assignment_hash,reviewerId:actorId,decision,rationale:rationale.trim(),evidence};
        const receiptHash=hash(basis);
        const prior=await client.query('SELECT command_id,receipt_hash FROM product_engineering_recompute_review_decisions WHERE plan_id=$1 AND step_id=$2',[planId,stepId]);
        if(prior.rows.length){
          invariant(prior.rows[0].command_id===commandId&&prior.rows[0].receipt_hash===receiptHash,'RECOMPUTE_REVIEW_DECISION_CONFLICT','Already decided by a different command or evidence');
          return Object.freeze({...basis,receiptHash});
        }
        await client.query(
          `INSERT INTO product_engineering_recompute_review_decisions
             (id,plan_id,step_id,assignment_hash,plan_hash,reviewer_id,decision,rationale,evidence,command_id,receipt_hash,decided_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
          [`review_${crypto.randomUUID()}`,planId,stepId,assigned.assignment_hash,step.plan_hash,actorId,decision,rationale.trim(),JSON.stringify(evidence),commandId,receiptHash,clock()],
        );
        return Object.freeze({...basis,receiptHash});
      });
    },
  });
}
