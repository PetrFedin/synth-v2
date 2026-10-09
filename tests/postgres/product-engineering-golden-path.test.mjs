import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
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
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
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
      idempotencyKey: `ai-eng-${runId}-style`,
      body: { brandId: references.brand.id, styleCode: `AI.ENG.${runId.toUpperCase()}` },
    }));

    const source = data(await requestBinary(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering/upload`, {
      token,
      idempotencyKey: `ai-eng-${runId}-upload`,
      fileName: `acceptance-${runId}.pdf`,
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
      idempotencyKey: `ai-eng-${runId}-analysis`,
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

    const materialCode = `AI-MAT-${runId.slice(0, 12).toUpperCase()}`;
    const material = data(await requestJson(baseUrl, '/v2/materials', {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-material-create`,
      body: {
        code: materialCode,
        brandId: references.brand.id,
        name: 'AI Engineering acceptance wool',
        type: 'fabric',
        unit: 'm',
        supplierName: 'Acceptance Mill',
        supplierReference: null,
        composition: '100% wool',
        color: 'Black',
        currency: 'EUR',
        unitCost: 20,
        minimumOrderQuantity: 50,
        availableQuantity: 100,
      },
    }));
    assert.equal(material.version, 1);

    const materialProposal = data(await requestJson(baseUrl, `/v2/product-engineering/analyses/${encodeURIComponent(analysis.id)}/proposals`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-material-proposal`,
      body: {
        targetAuthority: 'material',
        targetEntityId: materialCode,
        targetField: 'specification',
        proposedValue: {
          weightGsm: 310,
          cuttableWidth: 145,
          cuttableWidthUnit: 'cm',
          countryOfOrigin: 'IT',
          purchaseUnit: null,
          conversionFactor: null,
          materialSubtype: 'shell',
        },
        confidence: 0.99,
        rationale: 'Accepted technical evidence defines shell material specification.',
      },
    }));
    assert.equal(materialProposal.status, 'pending');

    const acceptedMaterialProposal = data(await requestJson(baseUrl, `/v2/product-engineering/proposals/${encodeURIComponent(materialProposal.id)}/resolve`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-material-accept`,
      body: { expectedVersion: materialProposal.version, decision: 'accepted', note: 'Acceptance reviewer confirmed material specification.' },
    }));
    assert.equal(acceptedMaterialProposal.status, 'accepted');
    assert.equal(acceptedMaterialProposal.appliedReference, null);

    const impact = data(await requestJson(baseUrl, `/v2/product-engineering/proposals/${encodeURIComponent(materialProposal.id)}/impact`, { token }));
    assert.equal(impact.supported, true);
    assert.equal(impact.authority, 'material');
    assert.equal(impact.action, 'specification');
    assert.equal(impact.contextStatus, 'unavailable');
    assert.equal(impact.impacts.some((row) => row.area === 'bom' && row.action === 'review' && row.severity === 'high'), true);
    assert.equal(impact.impacts.some((row) => row.area === 'cost' && row.action === 'recalculate' && row.evidence.status === 'not_available'), true);
    assert.equal(impact.impacts.some((row) => row.area === 'production' && row.action === 'review_if_started'), true);

    const applyCommandId = `ai-eng-${runId}-material-apply`;
    const appliedMaterialProposal = data(await requestJson(baseUrl, `/v2/product-engineering/proposals/${encodeURIComponent(materialProposal.id)}/apply`, {
      method: 'POST',
      token,
      idempotencyKey: applyCommandId,
      body: {
        expectedProposalVersion: acceptedMaterialProposal.version,
        expectedCanonicalVersion: material.version,
      },
    }));
    assert.equal(appliedMaterialProposal.status, 'accepted');
    assert.equal(appliedMaterialProposal.appliedReference.authority, 'material');
    assert.equal(appliedMaterialProposal.appliedReference.entityId, materialCode);
    assert.equal(appliedMaterialProposal.appliedReference.action, 'specification');
    assert.equal(appliedMaterialProposal.appliedReference.commandId, applyCommandId + ':canonical');
    assert.equal(appliedMaterialProposal.appliedReference.version, 2);
    assert.ok(appliedMaterialProposal.appliedReference.receiptId);
    assert.match(appliedMaterialProposal.appliedReference.receiptHash, /^[0-9a-f]{64}$/);

    const receipt = data(await requestJson(baseUrl, `/v2/product-engineering/proposals/${encodeURIComponent(materialProposal.id)}/application-receipt`, { token }));
    assert.equal(receipt.proposalId, materialProposal.id);
    assert.equal(receipt.applicationCommandId, applyCommandId);
    assert.equal(receipt.canonicalCommandId, applyCommandId + ':canonical');
    assert.equal(receipt.expectedCanonicalVersion, material.version);
    assert.equal(receipt.resultingCanonicalVersion, 2);
    assert.equal(receipt.targetAuthority, 'material');
    assert.equal(receipt.targetEntityId, materialCode);
    assert.equal(receipt.targetAction, 'specification');
    assert.equal(receipt.receiptHash, appliedMaterialProposal.appliedReference.receiptHash);
    assert.ok(receipt.lineage.modelRunIds.length >= 1);
    assert.ok(receipt.lineage.evidenceIds.length >= 1);
    assert.ok(receipt.lineage.sourceIds.includes(source.id));

    const appliedMaterial = data(await requestJson(baseUrl, `/v2/materials/${encodeURIComponent(materialCode)}`, { token }));
    assert.equal(appliedMaterial.version, 2);
    assert.equal(appliedMaterial.specification.weightGsm, 310);
    assert.equal(appliedMaterial.specification.cuttableWidth, 145);
    assert.equal(appliedMaterial.specification.cuttableWidthUnit, 'cm');
    assert.equal(appliedMaterial.specification.countryOfOrigin, 'IT');

    const replacementSource = data(await requestBinary(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering/upload`, {
      token,
      idempotencyKey: `ai-eng-${runId}-replacement-upload`,
      fileName: `acceptance-${runId}-revision.pdf`,
      mediaType: 'application/pdf',
      bytes: new TextEncoder().encode('%PDF-1.7\n1 0 obj <</Type /Page>> endobj\n2 0 obj <</Revision /Corrected>> endobj\n%%EOF'),
    }));
    assert.notEqual(replacementSource.contentHash, source.contentHash);
    await runtime.productEngineeringJobs.processPending({ limit: 10 });
    await runtime.productEngineeringJobs.processPending({ limit: 10 });
    const replacementRead = data(await requestJson(baseUrl, `/v2/product-engineering/sources/${encodeURIComponent(replacementSource.id)}`, { token }));
    assert.equal(replacementRead.source.status, 'admitted');
    assert.equal(replacementRead.source.parseStatus, 'completed');

    const revisionResult = data(await requestJson(baseUrl, `/v2/product-engineering/sources/${encodeURIComponent(source.id)}/revise`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-source-revision`,
      body: { replacementSourceId: replacementSource.id, reason: 'Factory issued corrected technical evidence.' },
    }));
    assert.equal(revisionResult.revision.supersededSourceId, source.id);
    assert.equal(revisionResult.revision.replacementSourceId, replacementSource.id);
    assert.equal(revisionResult.changeCase.status, 'open');
    assert.match(revisionResult.changeCase.impactHash, /^[0-9a-f]{64}$/);
    assert.equal(revisionResult.impacts.some((row) => row.impactKind === 'evidence' && row.evidenceStatus === 'observed'), true);
    assert.equal(revisionResult.impacts.some((row) => row.impactKind === 'canonical_target' && row.entityId === materialCode && row.entityVersion === '2'), true);
    assert.equal(revisionResult.impacts.some((row) => row.impactKind === 'downstream_policy' && row.area === 'cost' && row.requiredAction === 'recalculate' && row.evidenceStatus === 'policy_required'), true);
    assert.equal(revisionResult.impacts.some((row) => row.area === 'cost' && row.evidenceStatus === 'observed'), false);

    const workspaceAfterRevision = data(await requestJson(baseUrl, `/v2/product/styles/${encodeURIComponent(style.id)}/engineering`, { token }));
    const projectedCase = workspaceAfterRevision.changeCases.find((row) => row.id === revisionResult.changeCase.id);
    assert.ok(projectedCase);
    assert.equal(projectedCase.status, 'open');
    assert.equal(projectedCase.impactCount, revisionResult.impacts.length);
    assert.equal(projectedCase.pendingImpactCount, revisionResult.impacts.length);

    const changeWorkspace = data(await requestJson(baseUrl, `/v2/product-engineering/change-cases/${encodeURIComponent(revisionResult.changeCase.id)}`, { token }));
    assert.equal(changeWorkspace.changeCase.impactHash, revisionResult.changeCase.impactHash);
    assert.equal(changeWorkspace.impacts.length, revisionResult.impacts.length);

    const acknowledgedCase = data(await requestJson(baseUrl, `/v2/product-engineering/change-cases/${encodeURIComponent(revisionResult.changeCase.id)}/acknowledge`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-change-ack`,
      body: { expectedVersion: revisionResult.changeCase.version, note: 'Engineering team accepted the deterministic re-review workload.' },
    }));
    assert.equal(acknowledgedCase.status, 'acknowledged');
    assert.equal(acknowledgedCase.version, 2);
    assert.equal(acknowledgedCase.resolvedAt, null);

    const canonicalTriggerImpact = revisionResult.impacts.find((row) => row.impactKind === 'canonical_target' && row.entityId === materialCode);
    assert.ok(canonicalTriggerImpact);
    const canonicalTriggerClose = data(await requestJson(baseUrl, `/v2/product-engineering/change-impacts/${encodeURIComponent(canonicalTriggerImpact.id)}/close`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-impact-trigger-${canonicalTriggerImpact.id}`,
      body: {
        expectedVersion: canonicalTriggerImpact.version,
        disposition: 'resolved',
        reason: 'Canonical material correction was independently re-read before orchestration.',
        evidence: [{ kind: 'canonical_revalidation', materialCode, version: appliedMaterial.version }],
        resultReference: { authority: 'material', entityId: materialCode, version: appliedMaterial.version },
      },
    }));
    assert.equal(canonicalTriggerClose.impact.status, 'resolved');
    assert.equal(canonicalTriggerClose.receipt.resultVerification.authority, 'material');
    assert.match(canonicalTriggerClose.receipt.resultVerification.verificationHash, /^[0-9a-f]{64}$/);

    const orchestratedImpact = revisionResult.impacts.find((row) => row.id !== canonicalTriggerImpact.id && row.evidenceStatus !== 'policy_required');
    assert.ok(orchestratedImpact);
    const orchestrationCreate = data(await requestJson(baseUrl, `/v2/product-engineering/change-cases/${encodeURIComponent(revisionResult.changeCase.id)}/recompute-plans`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-recompute-plan`,
      body: {
        triggerImpactId: canonicalTriggerImpact.id,
        dependencies: [{
          id: `review-${orchestratedImpact.id}`,
          impactId: orchestratedImpact.id,
          source: { authority: 'material', entityId: materialCode, version: appliedMaterial.version },
          target: { authority: 'product_engineering', entityId: orchestratedImpact.entityId, version: orchestratedImpact.version },
          dependencyKind: 'direct',
          reason: 'Exact Product Engineering lineage was created from the superseded source evidence.',
          requiredAction: orchestratedImpact.requiredAction,
          severity: orchestratedImpact.severity,
          mode: 'human_review',
          operation: 'product_engineering.re-review',
          dependsOn: [],
          evidence: [{ kind: 'change_impact', impactId: orchestratedImpact.id, changeCaseId: revisionResult.changeCase.id }],
        }],
      },
    }));
    assert.match(orchestrationCreate.dependencySet.dependencySetHash, /^[0-9a-f]{64}$/);
    assert.match(orchestrationCreate.plan.planHash, /^[0-9a-f]{64}$/);
    assert.equal(orchestrationCreate.plan.steps[0].impactId, orchestratedImpact.id);

    const stepReceipt = data(await requestJson(baseUrl, `/v2/product-engineering/recompute-plans/${encodeURIComponent(orchestrationCreate.plan.id)}/steps/${encodeURIComponent(orchestrationCreate.plan.steps[0].id)}/complete`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-recompute-step`,
      body: {
        status: 'succeeded',
        evidence: [{ kind: 'human_review', reviewer: ACCEPTANCE_BRAND_OWNER.email, impactId: orchestratedImpact.id }],
      },
    }));
    assert.equal(stepReceipt.status, 'succeeded');
    assert.match(stepReceipt.receiptHash, /^[0-9a-f]{64}$/);

    const orchestrationReceipt = data(await requestJson(baseUrl, `/v2/product-engineering/recompute-plans/${encodeURIComponent(orchestrationCreate.plan.id)}/seal`, {
      method: 'POST',
      token,
      idempotencyKey: `ai-eng-${runId}-recompute-seal`,
      body: {},
    }));
    assert.equal(orchestrationReceipt.planId, orchestrationCreate.plan.id);
    assert.match(orchestrationReceipt.receiptHash, /^[0-9a-f]{64}$/);

    const persistedOrchestration = data(await requestJson(baseUrl, `/v2/product-engineering/recompute-plans/${encodeURIComponent(orchestrationCreate.plan.id)}`, { token }));
    assert.equal(persistedOrchestration.plan.status, 'completed');
    assert.equal(persistedOrchestration.executionReceipts.length, 1);
    assert.equal(persistedOrchestration.orchestrationReceipt.receiptHash, orchestrationReceipt.receiptHash);

    let finalClose = canonicalTriggerClose;
    for (const impact of revisionResult.impacts) {
      if (impact.id === canonicalTriggerImpact.id) continue;
      const policyRequired = impact.evidenceStatus === 'policy_required';
      const canonicalTarget = impact.impactKind === 'canonical_target' && impact.entityId === materialCode;
      finalClose = data(await requestJson(baseUrl, `/v2/product-engineering/change-impacts/${encodeURIComponent(impact.id)}/close`, {
        method: 'POST',
        token,
        idempotencyKey: `ai-eng-${runId}-impact-${impact.id}`,
        body: {
          expectedVersion: impact.version,
          disposition: policyRequired ? 'waived' : 'resolved',
          reason: policyRequired
            ? 'Acceptance suite records an explicit scoped exception; no canonical correction is claimed.'
            : 'Acceptance reviewer revalidated the direct lineage after source revision.',
          evidence: [{ kind: 'acceptance_review', impactId: impact.id, sourceRevisionId: revisionResult.revision.id }],
          ...(policyRequired ? { waiver: { scope: `acceptance-only:${impact.area}` } } : {}),
          ...(canonicalTarget ? { resultReference: { authority: 'material', entityId: materialCode, version: appliedMaterial.version } } : {}),
        },
      }));
      assert.match(finalClose.receipt.receiptHash, /^[0-9a-f]{64}$/);
      assert.equal(finalClose.receipt.impactId, impact.id);
      assert.equal(finalClose.impact.version, impact.version + 1);
      assert.equal(finalClose.impact.status, policyRequired ? 'waived' : 'resolved');
      if (policyRequired) assert.equal(finalClose.receipt.resultReference, null);
      if (canonicalTarget) {
        assert.equal(finalClose.receipt.resultVerification.authority, 'material');
        assert.equal(finalClose.receipt.resultVerification.observed.entityId, materialCode);
        assert.equal(finalClose.receipt.resultVerification.observed.version, String(appliedMaterial.version));
        assert.match(finalClose.receipt.resultVerification.verificationHash, /^[0-9a-f]{64}$/);
      }
    }
    assert.equal(finalClose.changeCase.status, 'resolved');
    assert.ok(finalClose.changeCase.resolvedBy);

    const firstImpactReceipt = data(await requestJson(baseUrl, `/v2/product-engineering/change-impacts/${encodeURIComponent(revisionResult.impacts[0].id)}/receipt`, { token }));
    assert.equal(firstImpactReceipt.impactId, revisionResult.impacts[0].id);
    assert.match(firstImpactReceipt.receiptHash, /^[0-9a-f]{64}$/);

    const closedWorkspace = data(await requestJson(baseUrl, `/v2/product-engineering/change-cases/${encodeURIComponent(revisionResult.changeCase.id)}`, { token }));
    assert.equal(closedWorkspace.changeCase.status, 'resolved');
    assert.equal(closedWorkspace.impacts.some((row) => row.status === 'pending'), false);
    assert.equal(closedWorkspace.receipts.length, revisionResult.impacts.length);

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
    'DELETE FROM ai_model_route_policies WHERE brand_id=$1 AND purpose=$2',
    [brandId, PURPOSE],
  );
  await pool.query(
    `INSERT INTO ai_model_route_policies
      (id,brand_id,purpose,candidates,max_attempts,timeout_ms,circuit_failure_threshold,circuit_cooldown_ms,status,version,created_at,created_by,updated_at,updated_by)
     VALUES ($1,$2,$3,$4::jsonb,1,5000,3,60000,'active',1,$5,'acceptance-suite',$5,'acceptance-suite')`,
    [`ai-policy-acceptance-${brandId}`, brandId, PURPOSE, JSON.stringify([{ provider: MODEL_PROVIDER, model: MODEL, priority: 0 }]), now],
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
