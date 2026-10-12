import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTechPackCanonicalPreflightReader } from '../../src/infrastructure/postgres-tech-pack-canonical-preflight-reader.mjs';

const connectionString = process.env.POSTGRES_TEST_URL;
const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

test('canonical Tech Pack source query compiles against migrated PostgreSQL and fails closed for inaccessible packs', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL must identify the isolated verification database');
  const pool = new pg.Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    const reader = createPostgresTechPackCanonicalPreflightReader({ pool });
    assert.equal(await reader.forActor('no-such-brand-user', 'TP-UNAUTHORIZED-PROBE'), undefined);
    // No test fixture, synthetic Pack or SQL writer is needed: this exercises
    // actual table/column names, the active-membership subquery and read-only SQL.
    // It is NOT a positive end-to-end canonical issuance proof.
  } finally {
    await pool.end();
  }
});


test('real PostgreSQL Tech Pack preflight denies another active brand owner and flags absent canonical sources', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL must identify the isolated verification database');
  const { randomUUID } = await import('node:crypto');
  const { createOrganisation } = await import('../../src/modules/organisations/public.mjs');
  const { createMembership } = await import('../../src/modules/access-control/public.mjs');
  const { createPostgresWholesaleRuntime } = await import('../../src/runtime/postgres-runtime.mjs');
  const tag = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const id = suffix => 'tp-preflight-' + tag + '-' + suffix;
  const brandId = id('brand');
  const outsiderBrandId = id('other-brand');
  const ownerId = id('owner');
  const outsiderId = id('other-owner');
  const techPackCode = 'TP/PREF/' + tag;
  const pool = new pg.Pool({ connectionString, max: 4 });
  try {
    await migratePostgres({ pool, migrationsDir });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir });

    // Both users are real active accounts. Each has owner permissions only in
    // their own organisation, rather than an artificial/no-user probe.
    for (const [userId, email] of [
      [ownerId, 'tp-pref-' + tag.toLowerCase() + '@acceptance.invalid'],
      [outsiderId, 'tp-pref-other-' + tag.toLowerCase() + '@acceptance.invalid'],
    ]) {
      await runtime.auth.bootstrapUser({
        id: userId, email, password: 'OnlyForIsolatedTest-' + tag,
        displayName: 'Preflight acceptance owner',
      });
    }
    for (const [orgId, userId, name] of [
      [brandId, ownerId, 'Preflight brand'],
      [outsiderBrandId, outsiderId, 'Other preflight brand'],
    ]) {
      await runtime.platform.registerOrganisation(
        id('register-' + orgId), 'system',
        createOrganisation({ id: orgId, type: 'brand', name }),
      );
      await runtime.platform.grantMembership(
        id('member-' + orgId), 'system',
        createMembership({
          id: id('membership-' + orgId),
          organisationId: orgId, organisationType: 'brand',
          userId, role: 'owner', createdAt: '2026-10-13T00:00:00.000Z',
        }),
      );
    }

    // Use real application transactions to persist the legacy catalog SKU and
    // draft Tech Pack; no direct fixture SQL and no fabricated eligibility.
    const campaign = await runtime.platform.createCampaign(id('campaign'), ownerId, {
      brandId, name: 'Preflight acceptance', season: 'FW28',
      startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-12-31T00:00:00.000Z',
    });
    await runtime.platform.openCampaign(id('open-campaign'), ownerId, campaign.id);
    const collection = await runtime.platform.createCollection(id('collection'), ownerId, {
      campaignId: campaign.id, brandId, name: 'Preflight capsule', currency: 'EUR',
    });
    await runtime.platform.publishCollection(id('publish-collection'), ownerId, collection.id);
    const draftSku = await runtime.catalog.createSku(id('sku'), ownerId, {
      sku: 'TP-PREF-' + tag, collectionId: collection.id, brandId,
      name: 'Acceptance coat', wholesalePrice: 190, currency: 'EUR',
      minimumOrderQuantity: 1, availableQuantity: 10,
    });
    const sku = await runtime.catalog.publishSku(id('publish-sku'), ownerId, draftSku.sku, {
      expectedVersion: draftSku.version,
    });
    const pack = await runtime.techPacks.createTechPack(id('pack'), ownerId, {
      techPackCode, sku: sku.sku, title: 'Preflight source fixture',
    });
    assert.equal(pack.status, 'draft');

    // This pack exists. The outsider still must see the same NOT_FOUND as for
    // a nonexistent pack: no existence/metadata leakage.
    const reader = createPostgresTechPackCanonicalPreflightReader({ pool });
    const ownRow = await reader.forActor(ownerId, techPackCode);
    assert.equal(ownRow?.techPackCode, techPackCode);
    assert.equal(ownRow?.brandId, brandId);
    assert.equal(ownRow?.productSkuId, null);
    assert.equal(await reader.forActor(outsiderId, techPackCode), undefined);
    const checked = await runtime.techPacks.canonicalPreflightForActor(ownerId, techPackCode);
    assert.equal(checked.eligible, false);
    assert.deepEqual(checked.identity, {
      productSkuId: null, styleVersionId: null,
      colorwayId: null, sizeScaleVersionId: null,
    });
    for (const required of [
      'CANONICAL_IDENTITY_MISSING', 'PUBLISHED_CANONICAL_BOM_REQUIRED',
      'PUBLISHED_CANONICAL_MEASUREMENT_REQUIRED', 'APPROVED_CANONICAL_PPS_REQUIRED',
    ]) assert.ok(checked.blockers.includes(required), required);
    await assert.rejects(
      runtime.techPacks.canonicalPreflightForActor(outsiderId, techPackCode),
      error => error?.code === 'TECH_PACK_NOT_FOUND',
    );
  } finally {
    await pool.end();
  }
});
