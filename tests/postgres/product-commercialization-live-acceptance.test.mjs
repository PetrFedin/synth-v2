import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureAcceptanceActor } from '../../src/acceptance/acceptance-auth.mjs';
import {
  ensureAcceptanceBrandOwner,
  loginAcceptanceSession,
  logoutAcceptanceSession,
} from '../../src/acceptance/collection-live-acceptance.mjs';
import { runProductCommercializationLiveAcceptance } from '../../src/acceptance/product-commercialization-live-acceptance.mjs';
import { runReadyProductReadinessLiveAcceptance } from '../../src/acceptance/product-readiness-ready-live-acceptance.mjs';
import { PRODUCTION_ACCEPTANCE_REFERENCES, bootstrapProductionAcceptanceReferences } from '../../src/acceptance/production-reference-bootstrap.mjs';
import { bootstrapMdmReference } from '../../src/infrastructure/mdm-reference-bootstrap.mjs';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../../src/runtime/postgres-runtime.mjs';
import { assertCanonicalCommercialWriteGuards } from './canonical-commercial-write-guards.mjs';
import { ACCEPTANCE_BRAND_OWNER, ACCEPTANCE_SHOP_OWNER } from './acceptance-actors.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const brandEmail = ACCEPTANCE_BRAND_OWNER.email;
const brandPassword = ACCEPTANCE_BRAND_OWNER.password;
const shopEmail = ACCEPTANCE_SHOP_OWNER.email;
const shopPassword = ACCEPTANCE_SHOP_OWNER.password;

test('READY Product reaches projection, projection-native publication, price list and BuyerCatalog through real HTTP/PostgreSQL', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 4 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));
  const referenceDir = fileURLToPath(new URL('../../mdm/reference/', import.meta.url));
  let server;
  let brandToken;
  let shopToken;
  let baseUrl;

  try {
    await migratePostgres({ pool, migrationsDir });
    await bootstrapMdmReference({ pool, datasets: await loadOperationalMdmDatasets(referenceDir) });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });
    // Порядок обязателен: оба владельца входят в систему своими почтой и паролем, поэтому их
    // учётные записи заводятся до бутстрапа. Он найдёт их и не тронет, а трём актёрам, которые
    // никогда не входят, заведёт отключённые личности — членство обязано называть существующую.
    await ensureAcceptanceBrandOwner({ pool, auth: runtime.auth, email: brandEmail, password: brandPassword });
    await ensureAcceptanceActor({
      pool,
      auth: runtime.auth,
      actorId: PRODUCTION_ACCEPTANCE_REFERENCES.actors.shopOwner,
      email: shopEmail,
      password: shopPassword,
      displayName: 'Syntha Acceptance Shop Owner',
      envLabel: 'PostgreSQL acceptance shop owner',
    });
    const references = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform, auth: runtime.auth, pool });

    server = createServer(runtime.handler);
    baseUrl = await listenLocal(server);
    brandToken = (await loginAcceptanceSession({ baseUrl, email: brandEmail, password: brandPassword })).token;
    shopToken = (await loginAcceptanceSession({ baseUrl, email: shopEmail, password: shopPassword })).token;

    const ready = await runReadyProductReadinessLiveAcceptance({
      baseUrl,
      token: brandToken,
      pool,
      references,
      runId: 'postgres-live-commercialization',
    });
    assert.equal(ready.status, 'passed');
    assert.equal(ready.readiness.status, 'ready');

    const changeGateIds = {
      sourceOld: 'change-gate-source-old', sourceNew: 'change-gate-source-new', revision: 'change-gate-revision',
      caseId: 'change-gate-case', impact: 'change-gate-impact',
    };
    await pool.query(
      `INSERT INTO product_engineering_sources
        (id,brand_id,style_id,kind,ingest_mode,media_type,original_name,size_bytes,content_hash,storage_ref,source_uri,metadata,status,scan_status,parse_status,rejection_code,rejection_message,created_at,created_by,admitted_at,admitted_by,version)
       VALUES
        ($1,$3,$4,'document','manual','application/pdf','old.pdf',10,$5,NULL,NULL,'{}'::jsonb,'admitted','not_applicable','not_required',NULL,NULL,now(),$3,now(),$3,1),
        ($2,$3,$4,'document','manual','application/pdf','new.pdf',11,$6,NULL,NULL,'{}'::jsonb,'admitted','not_applicable','not_required',NULL,NULL,now(),$3,now(),$3,1)`,
      [changeGateIds.sourceOld, changeGateIds.sourceNew, references.brand.id, ready.product.styleId, 'a'.repeat(64), 'b'.repeat(64)],
    );
    await pool.query(
      `INSERT INTO product_engineering_source_revisions
        (id,brand_id,style_id,superseded_source_id,replacement_source_id,superseded_content_hash,replacement_content_hash,reason,created_at,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Acceptance change gate proof',now(),$2)`,
      [changeGateIds.revision, references.brand.id, ready.product.styleId, changeGateIds.sourceOld, changeGateIds.sourceNew, 'a'.repeat(64), 'b'.repeat(64)],
    );
    await pool.query(
      `INSERT INTO product_engineering_change_cases
        (id,source_revision_id,brand_id,style_id,status,impact_snapshot,impact_hash,created_at,created_by,version)
       VALUES ($1,$2,$3,$4,'open','{}'::jsonb,$5,now(),$3,1)`,
      [changeGateIds.caseId, changeGateIds.revision, references.brand.id, ready.product.styleId, 'c'.repeat(64)],
    );
    await pool.query(
      `INSERT INTO product_engineering_change_impacts
        (id,change_case_id,impact_kind,entity_id,entity_version,area,required_action,severity,evidence_status,basis,status,created_at,created_by)
       VALUES ($1,$2,'downstream_policy',$3,'1','commercial_publication','reproject','high','policy_required',$4::jsonb,'pending',now(),$5)`,
      [changeGateIds.impact, changeGateIds.caseId, ready.product.styleVersionId, JSON.stringify({ acceptance: true }), references.brand.id],
    );

    const blockedAdmission = await runtime.productEngineeringChangeAdmission.evaluate(ready.product.styleVersionId, 'commercial_projection');
    assert.equal(blockedAdmission.admitted, false);
    assert.equal(blockedAdmission.blockerCount, 1);
    assert.equal(blockedAdmission.blockers[0].impactId, changeGateIds.impact);
    await assert.rejects(
      runtime.productEngineeringChangeAdmission.assertAdmitted(ready.product.styleVersionId, 'commercial_projection'),
      (error) => error?.code === 'PRODUCT_ENGINEERING_CHANGE_ADMISSION_BLOCKED',
    );
    await pool.query(`UPDATE product_engineering_change_impacts SET status='resolved' WHERE id=$1`, [changeGateIds.impact]);
    const clearedAdmission = await runtime.productEngineeringChangeAdmission.evaluate(ready.product.styleVersionId, 'commercial_projection');
    assert.equal(clearedAdmission.admitted, true);
    assert.equal(clearedAdmission.blockerCount, 0);

    const result = await runProductCommercializationLiveAcceptance({
      baseUrl,
      brandToken,
      shopToken,
      pool,
      ready,
      references,
      runId: 'postgres-live-commercialization',
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.actors.brandOwner, references.actors.brandOwner);
    assert.equal(result.actors.shopOwner, references.actors.shopOwner);
    assert.equal(result.product.styleVersionId, ready.product.styleVersionId);
    assert.equal(result.readiness.id, ready.readiness.id);
    assert.equal(result.projection.status, 'published');
    assert.equal(result.projection.versionNo, 1);
    assert.equal(result.publication.status, 'published');
    assert.equal(result.priceListVersion.status, 'published');
    assert.equal(result.buyerCatalogVersion.status, 'published');
    assert.equal(result.persistence.verified, true);
    assert.equal(result.persistence.styleVersionId, ready.product.styleVersionId);
    assert.equal(result.persistence.productSkuId, ready.product.skuId);
    assert.equal(result.persistence.readinessSnapshotId, ready.readiness.id);
    assert.equal(result.persistence.commercialProjectionId, result.projection.id);
    assert.equal(result.persistence.publicationId, result.publication.id);
    assert.equal(result.persistence.priceListVersionId, result.priceListVersion.id);
    assert.equal(result.persistence.buyerCatalogVersionId, result.buyerCatalogVersion.id);
    assert.equal(result.persistence.currency, 'USD');
    assert.equal(result.isolation.expectedDeltasVerified, true);

    const downstream = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM selections WHERE brand_id = $1)::int AS selections,
         (SELECT COUNT(*) FROM orders WHERE brand_id = $1)::int AS orders,
         (SELECT COUNT(*) FROM supply_commitment_snapshots WHERE brand_id = $1)::int AS supply_commitments,
         (SELECT COUNT(*) FROM actual_cost_ledger_entries WHERE brand_id = $1)::int AS actual_cost_entries,
         (SELECT COUNT(*) FROM inventory_movement_ledger_entries WHERE brand_id = $1)::int AS inventory_movements`,
      [references.brand.id],
    );
    assert.equal(downstream.rows.length, 1);
    assert.equal(downstream.rows[0].selections, Number(result.isolation.before.selection_rows));
    assert.equal(downstream.rows[0].orders, Number(result.isolation.before.order_rows));
    assert.equal(downstream.rows[0].supply_commitments, Number(result.isolation.before.supply_commitment_rows));
    assert.equal(downstream.rows[0].actual_cost_entries, Number(result.isolation.before.actual_cost_rows));
    assert.equal(downstream.rows[0].inventory_movements, Number(result.isolation.before.inventory_movement_rows));

    await assertCanonicalCommercialWriteGuards({ pool, baseUrl, brandToken, shopToken, references, result });
  } finally {
    if (shopToken && baseUrl) {
      try { await logoutAcceptanceSession({ baseUrl, token: shopToken }); }
      catch { /* best effort after assertion failure */ }
    }
    if (brandToken && baseUrl) {
      try { await logoutAcceptanceSession({ baseUrl, token: brandToken }); }
      catch { /* best effort after assertion failure */ }
    }
    if (server) await closeServer(server);
    await pool.end();
  }
});

async function loadOperationalMdmDatasets(referenceDirectory) {
  const files = (await fs.readdir(referenceDirectory)).filter((name) => name.endsWith('.json')).sort();
  assert.ok(files.length > 0, 'operational MDM reference datasets are required');
  return Promise.all(files.map(async (file) => JSON.parse(await fs.readFile(path.join(referenceDirectory, file), 'utf8'))));
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
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
