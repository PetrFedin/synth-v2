import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
const connectionString=process.env.POSTGRES_TEST_URL;
const migrationsDir=fileURLToPath(new URL('../../db/migrations/',import.meta.url));
test('real PostgreSQL serves slash-coded Tech Packs via authenticated query routes with command replay', async () => {
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
      techPackCode, sku: sku.sku, title: 'Slash-addressed source fixture',
    });
    assert.equal(pack.status, 'draft');


    const endpoint = '/v2/tech-packs/by-code?code=' + encodeURIComponent(techPackCode);
    const origin = 'http://127.0.0.1';
    const password = 'OnlyForIsolatedTest-' + tag;
    const ownerToken = (await runtime.auth.login({
      email: 'tp-pref-' + tag.toLowerCase() + '@acceptance.invalid',
      password, clientAddress: '127.0.0.1',
    })).accessToken;
    const outsiderToken = (await runtime.auth.login({
      email: 'tp-pref-other-' + tag.toLowerCase() + '@acceptance.invalid',
      password, clientAddress: '127.0.0.1',
    })).accessToken;
    function request(url, token, { method = 'GET', body, commandId } = {}) {
      return runtime.fetchHandler(new Request(origin + url, {
        method,
        headers: {
          ...(token ? { authorization: 'Bearer ' + token } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(commandId ? { 'idempotency-key': commandId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }));
    }
    assert.equal((await request(endpoint)).status, 401);
    const own = await request(endpoint, ownerToken);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('cache-control'), 'no-store');
    const ownData = (await own.json()).data;
    assert.equal(ownData.brandId, brandId);
    assert.equal(ownData.techPackCode, techPackCode);
    assert.equal(ownData.status, 'draft');
    assert.equal(ownData.version, pack.version);

    const foreign = await request(endpoint, outsiderToken);
    const unknown = await request('/v2/tech-packs/by-code?code=TP%2FPREF%2FUNKNOWN-' + tag, outsiderToken);
    assert.equal(foreign.status, 404);
    assert.equal(unknown.status, 404);
    const foreignError = (await foreign.json()).error;
    const missingError = (await unknown.json()).error;
    assert.equal(foreignError.code, 'TECH_PACK_NOT_FOUND');
    assert.equal(missingError.code, foreignError.code);
    assert.equal(missingError.message, foreignError.message);
    assert.equal((await request('/v2/tech-packs/' + encodeURIComponent(techPackCode), ownerToken)).status, 400,
      'common path decoder must keep rejecting encoded separators');

    const edit = { expectedVersion: pack.version, title: 'Updated slash-addressed source fixture' };
    const opts = { method: 'PATCH', body: edit, commandId: id('updated') };
    const changed = await request(endpoint, ownerToken, opts);
    assert.equal(changed.status, 200);
    const updated = (await changed.json()).data;
    assert.equal(updated.techPackCode, techPackCode);
    assert.equal(updated.status, 'draft');
    assert.equal(updated.version, pack.version + 1);
    assert.equal(updated.title, edit.title);

    const replay = await request(endpoint, ownerToken, opts);
    assert.equal(replay.status, 200, 'same command+body must replay idempotently');
    assert.deepEqual((await replay.json()).data, updated);
    const persisted = await pool.query(
      'SELECT version, status, payload FROM tech_packs WHERE tech_pack_code = $1',
      [techPackCode],
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].version, updated.version);
    assert.equal(persisted.rows[0].status, 'draft');
    assert.equal(persisted.rows[0].payload.title, edit.title);
    assert.equal((await request(endpoint, outsiderToken, {
      method: 'PATCH', body: { expectedVersion: updated.version, title: 'Forbidden overwrite' },
      commandId: id('foreign-edit'),
    })).status, 403);
    assert.equal((await request(endpoint, ownerToken, {
      method: 'PATCH', body: { expectedVersion: updated.version, title: 'Invalid schema', status: 'issued' },
      commandId: id('invalid-edit'),
    })).status, 400);
    const still = await pool.query('SELECT version FROM tech_packs WHERE tech_pack_code = $1',[techPackCode]);
    assert.equal(still.rows[0].version, updated.version);
  } finally {
    await pool.end();
  }
});
