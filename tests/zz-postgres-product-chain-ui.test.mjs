import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createProductIdentityQueryService } from '../src/application/product-identity-query-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresProductIdentityStore } from '../src/infrastructure/postgres-product-identity-store.mjs';
import { createPostgresProductIdentityReader } from '../src/infrastructure/postgres-product-identity-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// Путь, которым теперь идут формы цепочки «модель → версия → шкала → SKU → коллекция»: список шкал
// бренда с номером последней версии (новый GET /v2/product/size-scales?brandId=) и назначение
// точной версии модели черновой коллекции.
test('PostgreSQL product chain: the brand size-scale list carries the latest version and respects product.read; a style version joins a draft collection', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-10-02T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const reader = createPostgresProductIdentityReader({ pool });
    const platform = createWholesalePlatform({ store: createPostgresWholesaleStore({ pool }), productIdentityStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });
    const query = createProductIdentityQueryService({ reader });

    await platform.registerOrganisation('org-a', 'system', createOrganisation({ id: 'brand-a', type: 'brand', name: 'Brand A' }));
    await platform.registerOrganisation('org-b', 'system', createOrganisation({ id: 'brand-b', type: 'brand', name: 'Brand B' }));
    await platform.grantMembership('mem-a', 'system', createMembership({ id: 'membership-a', organisationId: 'brand-a', organisationType: 'brand', userId: 'owner-a', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('mem-b', 'system', createMembership({ id: 'membership-b', organisationId: 'brand-b', organisationType: 'brand', userId: 'owner-b', role: 'owner', createdAt: clock() }));

    const withSizes = await productIdentity.createSizeScale('scale-1', 'owner-a', { brandId: 'brand-a', scaleCode: 'ALPHA', nameRu: 'Буквенная', nameEn: 'Alpha' });
    const version = await productIdentity.createSizeScaleVersion('scale-1-v1', 'owner-a', withSizes.id, { expectedLatestVersionNo: 0 });
    await productIdentity.createSizeValue('scale-1-s', 'owner-a', version.id, { sizeCode: 'S', labelRu: 'S', labelEn: 'S', sortOrder: 0 });
    const updated = await productIdentity.updateSizeScale('scale-1-activate', 'owner-a', withSizes.id, { expectedVersion: 1, nameRu: 'Буквенная', nameEn: 'Alpha', status: 'active' });
    assert.equal(updated.status, 'active');
    const empty = await productIdentity.createSizeScale('scale-2', 'owner-a', { brandId: 'brand-a', scaleCode: 'BETA', nameRu: 'Без размеров', nameEn: 'Beta' });
    await productIdentity.createSizeScale('scale-3', 'owner-b', { brandId: 'brand-b', scaleCode: 'OTHER', nameRu: 'Чужая', nameEn: 'Other' });

    const listed = await query.listSizeScalesForActor('owner-a', { brandId: 'brand-a' });
    assert.deepEqual(listed.items.map((item) => [item.scaleCode, item.latestVersionNo, item.status]), [['ALPHA', 1, 'active'], ['BETA', null, 'draft']]);
    assert.equal(listed.items.some((item) => item.id === empty.id), true);
    // Чужой бренд: ни строки, ни утечки существования.
    await assert.rejects(query.listSizeScalesForActor('owner-b', { brandId: 'brand-a' }), (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED');

    const style = await productIdentity.createStyle('style-1', 'owner-a', { brandId: 'brand-a', styleCode: 'CH-001' });
    const styleVersion = await productIdentity.createStyleVersion('style-1-v1', 'owner-a', style.id, { expectedLatestVersionNo: 0, titleRu: 'Модель', titleEn: 'Style' });
    const campaign = await platform.createCampaign('camp-1', 'owner-a', { brandId: 'brand-a', name: 'SS28', season: 'SS28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z' });
    await platform.openCampaign('camp-1-open', 'owner-a', campaign.id);
    const collection = await platform.createCollection('col-1', 'owner-a', { campaignId: campaign.id, brandId: 'brand-a', name: 'Chain', currency: 'EUR' });
    const assignment = await platform.assignStyleVersionToCollection('assign-1', 'owner-a', { collectionId: collection.id, styleVersionId: styleVersion.id });
    const again = await platform.assignStyleVersionToCollection('assign-2', 'owner-a', { collectionId: collection.id, styleVersionId: styleVersion.id });
    assert.equal(again.id, assignment.id, 'a repeated add is the same relation');
    const rows = await pool.query('SELECT style_version_id FROM collection_style_versions WHERE collection_id = $1', [collection.id]);
    assert.deepEqual(rows.rows.map((row) => row.style_version_id), [styleVersion.id]);
    await platform.publishCollection('col-1-publish', 'owner-a', collection.id);
    await assert.rejects(
      platform.assignStyleVersionToCollection('assign-3', 'owner-a', { collectionId: collection.id, styleVersionId: styleVersion.id }),
      (error) => error.code === 'COLLECTION_ASSORTMENT_LOCKED',
    );
  } finally {
    await pool.end();
  }
});
