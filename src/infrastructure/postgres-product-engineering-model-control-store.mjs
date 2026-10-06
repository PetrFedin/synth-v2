import { invariant } from '../core/errors.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresProductEngineeringModelControlStore(options={}) {
  const {pool}=options;
  invariant(pool&&typeof pool.query==='function','POSTGRES_POOL_REQUIRED','PostgreSQL pool is required');
  return Object.freeze({
    async load({brandId,purpose,at=new Date().toISOString()}) {
      const policyResult=await pool.query(
        `SELECT * FROM ai_model_route_policies
          WHERE purpose=$2 AND status='active' AND (brand_id=$1 OR brand_id IS NULL)
          ORDER BY (brand_id IS NOT NULL) DESC, updated_at DESC, id
          LIMIT 1`,
        [brandId,purpose],
      );
      const policy=policyResult.rows[0];
      if(!policy) return Object.freeze({policy:null,qualifications:Object.freeze([])});
      const qualificationResult=await pool.query(
        `SELECT * FROM ai_model_qualifications
          WHERE purpose=$1 AND status='qualified'
            AND (expires_at IS NULL OR expires_at>$2)
          ORDER BY provider,model,prompt_version,schema_version,id`,
        [purpose,at],
      );
      return Object.freeze({
        policy:Object.freeze({
          id:policy.id,brandId:policy.brand_id,purpose:policy.purpose,candidates:Object.freeze(policy.candidates),
          maxAttempts:policy.max_attempts,timeoutMs:policy.timeout_ms,circuitFailureThreshold:policy.circuit_failure_threshold,
          circuitCooldownMs:policy.circuit_cooldown_ms,status:policy.status,version:policy.version,
        }),
        qualifications:Object.freeze(qualificationResult.rows.map(row=>Object.freeze({
          id:row.id,provider:row.provider,model:row.model,purpose:row.purpose,promptVersion:row.prompt_version,
          schemaVersion:row.schema_version,benchmarkHash:row.benchmark_hash,metrics:Object.freeze(row.metrics??{}),
          qualifiedAt:iso(row.qualified_at),qualifiedBy:row.qualified_by,expiresAt:iso(row.expires_at),status:row.status,
        }))),
      });
    },
  });
}
function iso(value){return value?new Date(value).toISOString():null;}
