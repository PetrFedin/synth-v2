import { createHash } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';
import { loadOptionalEnvFile } from '../src/runtime/local-env.mjs';

loadOptionalEnvFile('.env');

const databaseUrl=process.env.SYNTHA_V2_DATABASE_URL??process.env.DATABASE_URL;
if(!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const provider=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PROVIDER',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PROVIDER??process.env.SYNTHA_ENGINEERING_MODEL_GATEWAY_PROVIDER);
const model=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_MODEL',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_MODEL);
const purpose=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PURPOSE',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PURPOSE);
const promptVersion=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PROMPT_VERSION',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_PROMPT_VERSION);
const schemaVersion=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_SCHEMA_VERSION',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_SCHEMA_VERSION);
const benchmarkHash=requiredHash('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_BENCHMARK_SHA256',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_BENCHMARK_SHA256);
const qualifiedBy=required('SYNTHA_ENGINEERING_MODEL_QUALIFIED_BY',process.env.SYNTHA_ENGINEERING_MODEL_QUALIFIED_BY);
const brandId=process.env.SYNTHA_ENGINEERING_MODEL_POLICY_BRAND_ID?.trim()||null;
const metrics=parseMetrics(process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_METRICS_JSON);
const expiresAt=parseOptionalTimestamp(process.env.SYNTHA_ENGINEERING_MODEL_QUALIFICATION_EXPIRES_AT);
const qualifiedAt=new Date().toISOString();
const identity=[provider,model,purpose,promptVersion,schemaVersion].join('|');
const suffix=createHash('sha256').update(identity).digest('hex').slice(0,24);
const qualificationId='ai-qualification_'+suffix;
const policyScope=[brandId??'GLOBAL',purpose].join('|');
const policyId='ai-policy_'+createHash('sha256').update(policyScope).digest('hex').slice(0,24);

const pool=new pg.Pool({connectionString:databaseUrl,max:1});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['engineering-model-bootstrap:'+policyScope]);
  await client.query(
    \`INSERT INTO ai_model_qualifications
      (id,provider,model,purpose,prompt_version,schema_version,benchmark_hash,metrics,status,qualified_at,qualified_by,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'qualified',$9,$10,$11)
     ON CONFLICT (provider,model,purpose,prompt_version,schema_version)
     DO UPDATE SET benchmark_hash=EXCLUDED.benchmark_hash,metrics=EXCLUDED.metrics,status='qualified',
                   qualified_at=EXCLUDED.qualified_at,qualified_by=EXCLUDED.qualified_by,expires_at=EXCLUDED.expires_at\`,
    [qualificationId,provider,model,purpose,promptVersion,schemaVersion,benchmarkHash,JSON.stringify(metrics),qualifiedAt,qualifiedBy,expiresAt],
  );

  const existing=await client.query(
    \`SELECT id,version FROM ai_model_route_policies
      WHERE purpose=$2 AND (($1::text IS NULL AND brand_id IS NULL) OR brand_id=$1)
      FOR UPDATE\`,
    [brandId,purpose],
  );
  const candidates=JSON.stringify([{provider,model,priority:0}]);
  if(existing.rows[0]){
    await client.query(
      \`UPDATE ai_model_route_policies
          SET candidates=$2::jsonb,status='active',version=version+1,updated_at=$3,updated_by=$4
        WHERE id=$1\`,
      [existing.rows[0].id,candidates,qualifiedAt,qualifiedBy],
    );
  }else{
    await client.query(
      \`INSERT INTO ai_model_route_policies
        (id,brand_id,purpose,candidates,status,version,created_at,created_by,updated_at,updated_by)
       VALUES ($1,$2,$3,$4::jsonb,'active',1,$5,$6,$5,$6)\`,
      [policyId,brandId,purpose,candidates,qualifiedAt,qualifiedBy],
    );
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({
    status:'qualified',
    provider,model,purpose,promptVersion,schemaVersion,
    benchmarkHash,
    metricKeys:Object.keys(metrics).sort(),
    brandScope:brandId??'GLOBAL',
    qualifiedAt,expiresAt,
  },null,2));
}catch(error){
  await client.query('ROLLBACK').catch(()=>undefined);
  throw error;
}finally{
  client.release();
  await pool.end();
}

function required(name,value){
  const normalized=typeof value==='string'?value.trim():'';
  if(!normalized) throw new Error(name+' is required');
  return normalized;
}
function requiredHash(name,value){
  const normalized=required(name,value);
  if(!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(name+' must be a lowercase SHA-256 digest');
  return normalized;
}
function parseMetrics(value){
  const raw=required('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_METRICS_JSON',value);
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw new Error('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_METRICS_JSON must be valid JSON');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_METRICS_JSON must be a JSON object');
  if(!Object.keys(parsed).length) throw new Error('Qualification metrics must not be empty');
  return parsed;
}
function parseOptionalTimestamp(value){
  if(value===undefined||value==='') return null;
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp)) throw new Error('SYNTHA_ENGINEERING_MODEL_QUALIFICATION_EXPIRES_AT must be an ISO timestamp');
  return new Date(timestamp).toISOString();
}
