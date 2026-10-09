import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { bootstrapProductionAcceptanceReferences } from '../../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresProductEngineeringRecomputeStore } from '../../src/infrastructure/postgres-product-engineering-recompute-store.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import {
  createStaleDependencySet,
  createRecomputePlan,
  createRecomputeExecutionReceipt,
  evaluateRecomputeAdmission,
  createRecomputeOrchestrationReceipt,
} from '../../src/modules/product-engineering/recompute-orchestration.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;

test('PostgreSQL recompute orchestration survives lease loss, gates DAG dependencies and seals immutable proof', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
    const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform, auth: runtime.auth, pool });
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
    // Keep globally unique PostgreSQL fixture hashes isolated across suites and CI reruns.
    const H = value => createHash('sha256').update(`recompute:${suffix}:${value}`).digest('hex');
    const style = await runtime.productIdentity.createStyle(
      `recompute-style-${suffix}`,
      references.actors.brandOwner,
      { brandId: references.brand.id, styleCode: `RECOMPUTE.${suffix}` },
    );
    const ids = {
      oldSource: `recompute-source-old-${suffix}`,
      newSource: `recompute-source-new-${suffix}`,
      revision: `recompute-revision-${suffix}`,
      changeCase: `recompute-case-${suffix}`,
      impact: `recompute-impact-${suffix}`,
      triggerReceipt: `recompute-trigger-receipt-${suffix}`,
    };
    const t0 = '2026-10-09T12:00:00.000Z';
    const changeCaseImpactHash = H('change-case-impact');
    const triggerReceiptHash = H('trigger-receipt');
    const triggerVerificationHash = H('trigger-verification');
    await pool.query(
      `INSERT INTO product_engineering_sources
         (id,brand_id,style_id,kind,ingest_mode,content_hash,metadata,status,scan_status,parse_status,created_at,created_by,admitted_at,admitted_by)
       VALUES
         ($1,$3,$4,'manual_observation','manual',$5,'{}'::jsonb,'admitted','not_applicable','not_required',$7,$8,$7,$8),
         ($2,$3,$4,'manual_observation','manual',$6,'{}'::jsonb,'admitted','not_applicable','not_required',$7,$8,$7,$8)`,
      [ids.oldSource, ids.newSource, references.brand.id, style.id, H('a'), H('b'), t0, references.actors.brandOwner],
    );
    await pool.query(
      `INSERT INTO product_engineering_source_revisions
         (id,brand_id,style_id,superseded_source_id,replacement_source_id,superseded_content_hash,replacement_content_hash,reason,created_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Corrected source',$8,$9)`,
      [ids.revision, references.brand.id, style.id, ids.oldSource, ids.newSource, H('a'), H('b'), t0, references.actors.brandOwner],
    );
    await pool.query(
      `INSERT INTO product_engineering_change_cases
         (id,source_revision_id,brand_id,style_id,status,impact_snapshot,impact_hash,created_at,created_by,version)
       VALUES ($1,$2,$3,$4,'open','{}'::jsonb,$5,$6,$7,1)`,
      [ids.changeCase, ids.revision, references.brand.id, style.id, changeCaseImpactHash, t0, references.actors.brandOwner],
    );
    await pool.query(
      `INSERT INTO product_engineering_change_impacts
         (id,change_case_id,impact_kind,entity_id,entity_version,area,required_action,severity,evidence_status,basis,status,created_at,created_by,version)
       VALUES ($1,$2,'downstream_policy','MAT-001','7','cost','recalculate','high','policy_required','{}'::jsonb,'resolved',$3,$4,2)`,
      [ids.impact, ids.changeCase, t0, references.actors.brandOwner],
    );
    const triggerReference = { authority: 'material', entityId: 'MAT-001', version: 8 };
    const triggerVerification = { authority: 'material', requested: { entityId: 'MAT-001' }, verificationHash: triggerVerificationHash };
    await pool.query(
      `INSERT INTO product_engineering_change_impact_receipts
         (id,change_case_id,impact_id,disposition,previous_impact_version,resulting_impact_version,reason,evidence,
          result_reference,waiver,receipt_hash,created_at,created_by,result_verification)
       VALUES ($1,$2,$3,'resolved',1,2,'Canonical material corrected','[{"kind":"correction"}]'::jsonb,
               $4::jsonb,NULL,$5,$6,$7,$8::jsonb)`,
      [ids.triggerReceipt, ids.changeCase, ids.impact, JSON.stringify(triggerReference), triggerReceiptHash, t0, references.actors.brandOwner, JSON.stringify(triggerVerification)],
    );

    const changeCase = { id: ids.changeCase, brandId: references.brand.id, styleId: style.id };
    const triggerReceipt = {
      id: ids.triggerReceipt, changeCaseId: ids.changeCase, disposition: 'resolved', receiptHash: triggerReceiptHash,
      resultReference: triggerReference, resultVerification: triggerVerification,
    };
    const dependency = (id, overrides = {}) => ({
      id,
      source: { authority: 'material', entityId: 'MAT-001', version: 8 },
      target: { authority: overrides.authority ?? 'cost_close', entityId: overrides.entityId ?? 'COST-1', version: overrides.version ?? 5 },
      dependencyKind: 'derived', reason: 'Exact downstream snapshot is stale.', requiredAction: overrides.mode === 'human_review' ? 're-review' : 'recompute',
      severity: 'high', mode: overrides.mode ?? 'automatic', operation: overrides.operation ?? 'cost.recompute',
      dependsOn: overrides.dependsOn ?? [], evidence: [{ kind: 'lineage', sourceVersion: 7 }],
    });
    const staleSet = createStaleDependencySet({
      id: `recompute-set-${suffix}`, changeCase, triggerReceipt, detectedAt: t0, detectedBy: references.actors.brandOwner,
      dependencies: [
        dependency('cost'),
        dependency('review', { mode: 'human_review', authority: 'tech_pack', entityId: 'TP-1', operation: 'tech_pack.review', dependsOn: ['cost'] }),
        dependency('commercial', { authority: 'commercial_projection', entityId: 'CP-1', operation: 'commercial_projection.recompute', dependsOn: ['cost', 'review'] }),
      ],
    });
    const plan = createRecomputePlan({ id: `recompute-plan-${suffix}`, staleDependencySet: staleSet, createdAt: t0, createdBy: references.actors.brandOwner });
    const store = createPostgresProductEngineeringRecomputeStore({ pool });
    await store.persistPlan(staleSet, plan);
    await store.persistPlan(staleSet, plan);

    const first = await store.claim({ workerId: 'worker-a', limit: 10, leaseMs: 1000, claimedAt: t0 });
    assert.deepEqual(first.map(job => job.stepId), ['cost']);
    const costReceipt = createRecomputeExecutionReceipt({
      id: `recompute-exec-cost-${suffix}`, plan, stepId: 'cost', commandId: `cmd-cost-${suffix}`,
      idempotencyKey: first[0].dedupeKey, status: 'succeeded', evidence: [{ kind: 'authority_job', id: 'job-cost' }],
      resultReference: { authority: 'cost_close', entityId: 'COST-1', version: 6 },
      resultVerification: { authority: 'cost_close', requested: { entityId: 'COST-1' }, verificationHash: H('f') },
      startedAt: t0, completedAt: '2026-10-09T12:00:01.000Z',
    });
    await store.completeWithReceipt({ jobId: first[0].id, workerId: 'worker-a', receipt: costReceipt, completedAt: costReceipt.completedAt });

    const awaiting = await store.listReadyEvidenceSteps(plan.id);
    assert.deepEqual(awaiting.map(step => step.id), ['review']);
    const reviewReceipt = createRecomputeExecutionReceipt({
      id: `recompute-exec-review-${suffix}`, plan, stepId: 'review', commandId: `cmd-review-${suffix}`,
      idempotencyKey: `review-${suffix}`, status: 'succeeded', evidence: [{ kind: 'human_review', reviewer: references.actors.brandOwner }],
      startedAt: '2026-10-09T12:00:01.000Z', completedAt: '2026-10-09T12:00:02.000Z',
    });
    await store.recordExecutionReceipt(reviewReceipt);

    const t3 = '2026-10-09T12:00:03.000Z';
    const commercialFirst = await store.claim({ workerId: 'worker-b', limit: 10, leaseMs: 1000, claimedAt: t3 });
    assert.deepEqual(commercialFirst.map(job => job.stepId), ['commercial']);
    const commercialReclaimed = await store.claim({ workerId: 'worker-c', limit: 10, leaseMs: 1000, claimedAt: '2026-10-09T12:00:05.000Z' });
    assert.equal(commercialReclaimed[0].id, commercialFirst[0].id);
    assert.equal(commercialReclaimed[0].attemptCount, 2);
    const commercialReceipt = createRecomputeExecutionReceipt({
      id: `recompute-exec-commercial-${suffix}`, plan, stepId: 'commercial', commandId: `cmd-commercial-${suffix}`,
      idempotencyKey: commercialReclaimed[0].dedupeKey, status: 'succeeded', evidence: [{ kind: 'authority_job', id: 'job-commercial' }],
      resultReference: { authority: 'commercial_projection', entityId: 'CP-1', version: 6 },
      resultVerification: { authority: 'commercial_projection', requested: { entityId: 'CP-1' }, verificationHash: H('1') },
      startedAt: '2026-10-09T12:00:05.000Z', completedAt: '2026-10-09T12:00:06.000Z',
    });
    await store.completeWithReceipt({ jobId: commercialReclaimed[0].id, workerId: 'worker-c', receipt: commercialReceipt, completedAt: commercialReceipt.completedAt });

    const receipts = await store.listExecutionReceipts(plan.id);
    const admission = evaluateRecomputeAdmission({ plan, executionReceipts: receipts });
    assert.equal(admission.admitted, true);
    const orchestrationReceipt = createRecomputeOrchestrationReceipt({
      id: `recompute-seal-${suffix}`, plan, executionReceipts: receipts, admission,
      completedAt: '2026-10-09T12:00:07.000Z', completedBy: references.actors.brandOwner,
    });
    const sealed = await store.recordOrchestrationReceipt(orchestrationReceipt);
    assert.equal(sealed.receiptHash, orchestrationReceipt.receiptHash);

    await assert.rejects(
      pool.query(`UPDATE product_engineering_recompute_plans SET created_by=created_by WHERE id=$1`, [plan.id]),
      error => /PRODUCT_ENGINEERING_RECOMPUTE_IMMUTABLE/.test(error.message),
    );
  } finally {
    await pool.end();
  }
});
