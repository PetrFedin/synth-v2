import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import pg from 'pg';
import { ensureAcceptanceBrandOwner, loginAcceptanceSession, logoutAcceptanceSession } from '../../src/acceptance/collection-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES, bootstrapProductionAcceptanceReferences } from '../../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import { ACCEPTANCE_BRAND_OWNER } from './acceptance-actors.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const MODEL_PROVIDER = 'acceptance-gateway';
const MODEL = 'fashion-vision-acceptance-v1';
const PURPOSE = 'garment_interpretation';
const PROMPT_VERSION = 'garment-interpretation-v1';
const SCHEMA_VERSION = 'garment-ontology-v1';
const BENCHMARK_HASH = 'b'.repeat(64);

test('AI Engineering Golden Path crosses real HTTP, PostgreSQL, durable jobs and qualified model review', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 4 });
  const migrationsDir = new URL('../../db/migrations/', import.meta.url).pathname;
  let server;
  let token;
  let baseUrl;

  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({
      pool,
      migrationsDir,
      engineeringModelProviders: {
        [MODEL_PROVIDER]: Object.freeze({
          async execute(request) {
            assert.equal(request.model, MODEL);
            assert.equal(request.purpose, PURPOSE);
            assert.equal(request.promptVersion, PROMPT_VERSION);
            assert.equal(request.schemaVersion, SCHEMA_VERSION);
            assert.equal(request.qualificationId, 'ai-qualification-acceptance');
            const sourceId = request.input.sources[0].source.id;
            return Object.freeze({
              output: Object.freeze({
                findings: Object.freeze([Object.freeze({
                  findingType: 'garment.category',
                  origin: 'document_extracted',
                  value: Object.freeze({ code: 'BLAZER' }),
                  confidence: 0.98,
                  evidence: Object.freeze([Object.freeze({
                    sourceId,
                    sourceLocator: Object.freeze({ page: 1 }),
                    excerpt: 'Double breasted tailored blazer',
                  })]),
                })]),
                proposals: Object.freeze([Object.freeze({
                  findingIndex: 0,
                  targetAuthority: 'product_identity',
                  targetEntityId: request.input.analysis.id,
                  targetField: 'technical.category',
                  proposedValue: Object.freeze({ code: 'BLAZER' }),
                  confidence: 0.98,
                  rationale: 'Document evidence identifies a blazer.',
                })]),
                conflicts: Object.freeze([Object.freeze({
                  conflictType: 'construction.visibility',
                  subject: 'Front closure',
                  candidates: Object.freeze([
                    Object.freeze({ value: 'DOUBLE_BREASTED', sourceId }),
                    Object.freeze({ value: 'UNKNOWN', source: 'canonical' }),
                  ]),
                  severity: 'warning',
                })]),
                garmentGraph: Object.freeze({
                  schemaVersion: SCHEMA_VERSION,
                  nodes: Object.freeze([
                    Object.freeze({ key: 'root', nodeType: 'garment', semanticCode: 'GARMENT.BLAZER', label: 'Blazer', findingIndex: 0, confidence: 0.98 }),
                    Object.freeze({ key: 'front', nodeType: 'panel', semanticCode: 'PANEL.FRONT', label: 'Front panel', findingIndex: 0, confidence: 0.94 }),
                  ]),
                  edges: Object.freeze([
                    Object.freeze({ from: 'root', to: 'front', relation: 'contains', confidence: 0.99 }),
                  ]),
                }),
              }),
              usage: Object.freeze({ inputTokens: 100, outputTokens: 80 }),
            });
          },
        }),
      },
    });

    await ensureAcceptanceBrandOwner({
      pool,
      auth: runtime.auth,
      email: ACCEPTANCE_BRAND_OWNER.email,
      password: ACCEPTANCE_BRAND_OWNER.password,
      displayName: ACCEPTANCE_BRAND_OWNER.displayName,
    });
    const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform, auth: runtime.auth, pool });
    await seedQualification(pool, references.brand.id);

    server = createServer(runtime.handler);
    baseUrl = await listenLocal(server);
    token = (await loginAcceptanceSession({
      baseUrl,
      email: ACCEPTANCE_BRAND_OWNER.email,
      password: ACCEPTANCE_BRAND_OWNER.password,
    })).token;

    const style = data(await requestJson(baseUrl, '/v2/product/styles', {
      method: 'POST',
      token,
      idempotencyKey: 'ai-engineering-acceptance-style',
      body: { brandId: references.brand.id, styleCode: 'AI.ENGINEERING.ACCEPTANCE' },
    }));

    const source = data(await requestBinary(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering/upload`, {
      token,
      idempotencyKey: 'ai-engineering-acceptance-upload',
      fileName: 'acceptance-tech-pack.pdf',
      mediaType: 'application/pdf',
      bytes: new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n%%EOF'),
    }));
    assert.equal(source.status, 'pending');
    assert.equal(source.scanStatus, 'pending');
    assert.equal(source.parseStatus, 'pending');
    assert.match(source.contentHash, /^[0-9a-f]{64}$/);

    const scanBatch = await runtime.productEngineeringJobs.processPending({ limit: 10 });
    assert.equal(scanBatch.some((item) => item.jobType === 'source_scan' && item.status === 'completed'), true);
    const parseBatch = await runtime.productEngineeringJobs.processPending({ limit: 10 });
    assert.equal(parseBatch.some((item) => item.jobType === 'source_parse' && item.status === 'completed'), true);

    const sourceRead = data(await requestJson(baseUrl, `/v2/product-engineering/sources/${encodeURIComponent(source.id)}`, { token }));
    assert.equal(sourceRead.source.status, 'admitted');
    assert.equal(sourceRead.source.scanStatus, 'clean');
    assert.equal(sourceRead.source.parseStatus, 'completed');
    assert.equal(sourceRead.source.contentHash, source.contentHash);
    assert.ok(sourceRead.fragments.some((fragment) => fragment.kind === 'document_page' && fragment.locator.page === 1));

    const analysis = data(await requestJson(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering/analyses`, {
      method: 'POST',
      token,
      idempotencyKey: 'ai-engineering-acceptance-analysis',
      body: {
        purpose: PURPOSE,
        inputManifest: {
          sourceIds: [source.id],
          autoExecute: true,
          sourcePolicy: 'admitted-parsed-sources-only',
          modelContract: { promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION },
        },
      },
    }));
    assert.equal(analysis.status, 'queued');

    const analysisBatch = await runtime.productEngineeringJobs.processPending({ limit: 10 });
    assert.equal(analysisBatch.some((item) => item.jobType === 'analysis_execute' && item.status === 'completed'), true);

    const workspace = data(await requestJson(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering`, { token }));
    const completed = workspace.analyses.find((row) => row.id === analysis.id);
    assert.equal(completed.status, 'completed');
    assert.equal(workspace.proposals.length, 1);
    assert.equal(workspace.proposals[0].status, 'pending');
    assert.equal(workspace.proposals[0].appliedReference, null);
    assert.equal(workspace.conflicts.length, 1);
    assert.equal(workspace.conflicts[0].status, 'open');
    assert.equal(workspace.garmentGraph.status, 'reviewed');
    assert.equal(workspace.garmentGraph.nodeCount, 2);
    assert.equal(workspace.garmentGraph.edgeCount, 1);

    const persisted = await pool.query(
      `SELECT
         source.content_hash AS source_hash,
         blob.content_hash AS blob_hash,
         octet_length(blob.content)::integer AS blob_bytes,
         (SELECT count(*)::integer FROM product_engineering_source_fragments fragment WHERE fragment.source_id=source.id) AS fragment_count,
         (SELECT count(*)::integer FROM product_engineering_evidence evidence WHERE evidence.analysis_run_id=$2 AND evidence.source_hash=source.content_hash) AS evidence_count,
         (SELECT count(*)::integer FROM product_engineering_jobs job WHERE job.source_id=source.id AND job.status='completed') AS completed_source_jobs,
         (SELECT count(*)::integer FROM product_engineering_jobs job WHERE job.analysis_run_id=$2 AND job.status='completed') AS completed_analysis_jobs
       FROM product_engineering_sources source
       JOIN product_engineering_source_blobs blob ON blob.source_id=source.id
       WHERE source.id=$1`,
      [source.id, analysis.id],
    );
    assert.equal(persisted.rows.length, 1);
    assert.equal(persisted.rows[0].source_hash, source.contentHash);
    assert.equal(persisted.rows[0].blob_hash, source.contentHash);
    assert.equal(persisted.rows[0].blob_bytes, source.sizeBytes);
    assert.ok(persisted.rows[0].fragment_count >= 2);
    assert.equal(persisted.rows[0].evidence_count, 1);
    assert.equal(persisted.rows[0].completed_source_jobs, 2);
    assert.equal(persisted.rows[0].completed_analysis_jobs, 1);
  } finally {
    if (token && baseUrl) {
      try { await logoutAcceptanceSession({ baseUrl, token }); }
      catch { /* best effort cleanup */ }
    }
    if (server) await closeServer(server);
    await pool.end();
  }
});

async function seedQualification(pool, brandId) {
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO ai_model_qualifications
      (id,provider,model,purpose,prompt_version,schema_version,benchmark_hash,metrics,status,qualified_at,qualified_by,expires_at)
     VALUES ('ai-qualification-acceptance',$1,$2,$3,$4,$5,$6,$7::jsonb,'qualified',$8,'acceptance-suite',NULL)
     ON CONFLICT (provider,model,purpose,prompt_version,schema_version)
     DO UPDATE SET benchmark_hash=EXCLUDED.benchmark_hash,metrics=EXCLUDED.metrics,status='qualified',
                   qualified_at=EXCLUDED.qualified_at,qualified_by=EXCLUDED.qualified_by,expires_at=NULL`,
    [MODEL_PROVIDER, MODEL, PURPOSE, PROMPT_VERSION, SCHEMA_VERSION, BENCHMARK_HASH, JSON.stringify({ structuralF1: 1, unknownRecall: 1 }), now],
  );
  await pool.query(
    `INSERT INTO ai_model_route_policies
      (id,brand_id,purpose,candidates,max_attempts,timeout_ms,circuit_failure_threshold,circuit_cooldown_ms,status,version,created_at,created_by,updated_at,updated_by)
     VALUES ('ai-policy-acceptance',$1,$2,$3::jsonb,1,5000,3,60000,'active',1,$4,'acceptance-suite',$4,'acceptance-suite')
     ON CONFLICT (COALESCE(brand_id, '__GLOBAL__'), purpose) DO NOTHING`,
    [brandId, PURPOSE, JSON.stringify([{ provider: MODEL_PROVIDER, model: MODEL, priority: 0 }]), now],
  );
}

async function requestJson(baseUrl, path, { method='GET', token, idempotencyKey, body }={}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${method} ${path} failed: ${JSON.stringify(payload)}`);
  return payload;
}

async function requestBinary(baseUrl, path, { token, idempotencyKey, fileName, mediaType, bytes }) {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': mediaType,
      'x-file-name': encodeURIComponent(fileName),
      'idempotency-key': idempotencyKey,
    },
    body: bytes,
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `POST ${path} failed: ${JSON.stringify(payload)}`);
  return payload;
}

function data(payload) {
  assert.ok(payload && typeof payload === 'object' && payload.data, 'Expected API data envelope');
  return payload.data;
}

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
