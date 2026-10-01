import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createTechPackService } from '../src/application/tech-pack-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresProductIdentityStore } from '../src/infrastructure/postgres-product-identity-store.mjs';
import { createPostgresTechPackStore } from '../src/infrastructure/postgres-tech-pack-store.mjs';
import { createPostgresTechPackReader } from '../src/infrastructure/postgres-tech-pack-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// docs/backlog-not-yet-integrated.md, раздел J: «именованные виды эскизов («Внешний вид рубашки»,
// «Внутренний вид изделия»)» — раздел «Изделие и поставщик» стоял в оглавлении печатного техпака
// с самого первого его варианта (миграция 090), но ни разу не получал содержимого. Этот тест
// проходит настоящий цикл сервис → стор → реальный PostgreSQL до самого представления
// `tech_pack_document_workspace`: канонический эскиз со своим названием вида добавляется через
// реальный `productIdentity.addMedia`, легаси-артикул техпака связывается с канонической версией
// стиля через `linkCatalogSku`, и документ читается тем же читателем, каким его читает экран.
test('PostgreSQL tech pack document surfaces named sketch views through the legacy-to-canonical link', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-10-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const techPackStore = createPostgresTechPackStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });
    const techPacks = createTechPackService({ techPackStore, clock, nextId });
    const techPackReader = createPostgresTechPackReader({ pool });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-tps', type: 'brand', name: 'Tech Pack Sketches Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-tps', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));

    // the legacy side: campaign -> collection -> catalog SKU, the path a tech pack is still issued against
    const campaign = await platform.createCampaign('campaign-create', 'owner-user', { brandId: 'brand-tps', name: 'FW Sketches', season: 'FW28', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'owner-user', campaign.id);
    const collection = await platform.createCollection('collection-create', 'owner-user', { campaignId: campaign.id, brandId: 'brand-tps', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'owner-user', collection.id);
    const catalogSku = await catalog.createSku('sku-create', 'owner-user', { sku: 'DRS-TPS-1', collectionId: collection.id, brandId: 'brand-tps', name: 'Sketch Dress', wholesalePrice: 90, currency: 'EUR', minimumOrderQuantity: 4, availableQuantity: 40 });

    // the canonical side: style -> version -> colorway -> size scale/value -> canonical SKU, the home of real product_media
    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-tps', styleCode: 'DRS-TPS' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье с эскизами', titleEn: 'Sketch dress' });
    const colorwayBatch = await productIdentity.createColorwaysBatch('colorway-create', 'owner-user', styleVersion.id, { items: [{ colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' }] });
    const colorway = colorwayBatch[0];
    const sizeScale = await productIdentity.createSizeScale('scale-create', 'owner-user', { brandId: 'brand-tps', scaleCode: 'TPS', nameRu: 'Шкала эскизов', nameEn: 'Sketch scale', status: 'active' });
    const sizeScaleVersion = await productIdentity.createSizeScaleVersion('scale-version-create', 'owner-user', sizeScale.id, { expectedLatestVersionNo: 0 });
    const sizeValue = await productIdentity.createSizeValue('size-value-create', 'owner-user', sizeScaleVersion.id, { sizeCode: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 1 });
    const canonicalSku = await productIdentity.createSku('canonical-sku-create', 'owner-user', { styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeValue.id, skuCode: 'DRS-TPS-1' });
    await productIdentity.linkCatalogSku('link-create', 'owner-user', canonicalSku.id, { catalogSku: catalogSku.sku });

    // the actual feature: a style-version-wide sketch (no colorway) with a named view, through the real "Добавить изображение" path
    const sketch = await productIdentity.addMedia('media-sketch', 'owner-user', styleVersion.id, {
      mediaType: 'image', mediaRole: 'design_sketch', uri: 's3://product-media/DRS-TPS/front-view.jpg', sortOrder: 0,
      payload: { viewLabel: 'Внешний вид рубашки' },
    });
    assert.equal(sketch.payload.viewLabel, 'Внешний вид рубашки');
    // a second sketch with no label, to prove the role-based fallback in the view's own data shape
    await productIdentity.addMedia('media-thumbnail', 'owner-user', styleVersion.id, {
      mediaType: 'image', mediaRole: 'tech_pack_thumbnail', uri: 's3://product-media/DRS-TPS/thumbnail.jpg', sortOrder: 1,
    });
    // a photo role must not leak into the tech pack's sketch gallery
    await productIdentity.addMedia('media-hero', 'owner-user', styleVersion.id, {
      mediaType: 'image', mediaRole: 'hero', uri: 's3://product-media/DRS-TPS/hero.jpg', sortOrder: 2,
    });

    await techPacks.createTechPack('tech-pack-create', 'owner-user', { techPackCode: 'TP-DRS-TPS-1-R01', sku: catalogSku.sku, title: 'Sketch Dress Tech Pack' });

    const document = await techPackReader.getDocumentForActor('owner-user', 'TP-DRS-TPS-1-R01');
    assert.equal(document.sketches.length, 2);
    assert.deepEqual(document.sketches.map((value) => value.mediaRole).sort(), ['design_sketch', 'tech_pack_thumbnail']);
    const front = document.sketches.find((value) => value.mediaRole === 'design_sketch');
    assert.equal(front.viewLabel, 'Внешний вид рубашки');
    assert.equal(front.uri, 's3://product-media/DRS-TPS/front-view.jpg');
    const thumbnail = document.sketches.find((value) => value.mediaRole === 'tech_pack_thumbnail');
    assert.equal(thumbnail.viewLabel, null);

    // confirmed directly against the view too, independent of the reader's own authorization wrapping
    const direct = await pool.query('SELECT payload -> \'sketches\' AS sketches FROM tech_pack_document_workspace WHERE tech_pack_code = $1', ['TP-DRS-TPS-1-R01']);
    assert.equal(direct.rows[0].sketches.length, 2);
  } finally {
    await pool.end();
  }
});
