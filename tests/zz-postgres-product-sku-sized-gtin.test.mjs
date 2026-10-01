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

// GTIN на товарном SKU (docs/backlog-not-yet-integrated.md, раздел 4 «Россия P0»: «применимость
// маркировки, GTIN и подготовка к «Честному знаку» (поле `gtin` на SKU есть, обвязки нет) — не
// сделано.») был полностью проведён через домен/стор/HTTP с самого начала (миграция 052), но формы
// создания SKU не было нигде: таблица цветомоделей показывала только число `skuCount`. Этот тест
// проходит ровно тот путь, которым теперь пользуется форма «Добавить SKU» в styles.js: резолв
// оставшихся размеров через реальный `GET /v2/product/size-scales/:id?versionNo=` (его агрегатный
// эквивалент сервиса), создание второго SKU цветомодели с GTIN, и чтение его обратно через тот же
// полный агрегат стиля, каким уже пользуется квотирование.
test('PostgreSQL SKU form path: remaining sizes resolve from the real size scale, a second SKU carries a real GTIN, and both GTIN and duplicate-code validation hold', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  const nextId = (prefix) => `${prefix}_${++tick}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const productIdentityReader = createPostgresProductIdentityReader({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });
    const productIdentityQuery = createProductIdentityQueryService({ reader: productIdentityReader });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-sku', type: 'brand', name: 'SKU GTIN Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-sku', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-buyer', 'owner-user', createMembership({ id: 'membership-buyer', organisationId: 'brand-sku', organisationType: 'brand', userId: 'buyer-user', role: 'quality', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-sku', styleCode: 'DRS-SKU' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье миди', titleEn: 'Midi dress' });
    const colorway = await productIdentity.createColorway('colorway-create', 'owner-user', styleVersion.id, { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' });

    const sizeScale = await productIdentity.createSizeScale('scale-create', 'owner-user', { brandId: 'brand-sku', scaleCode: 'EU', nameRu: 'Шкала EU', nameEn: 'EU scale', status: 'active' });
    const sizeScaleVersion = await productIdentity.createSizeScaleVersion('scale-version-create', 'owner-user', sizeScale.id, { expectedLatestVersionNo: 0 });
    const sizeS = await productIdentity.createSizeValue('size-s-create', 'owner-user', sizeScaleVersion.id, { sizeCode: 'S', labelRu: 'S', labelEn: 'S', sortOrder: 1 });
    const sizeM = await productIdentity.createSizeValue('size-m-create', 'owner-user', sizeScaleVersion.id, { sizeCode: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 2 });

    // a role without product.manage cannot create a SKU
    await assert.rejects(
      productIdentity.createSku('sku-deny', 'buyer-user', { styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeS.id, skuCode: 'DRS-SKU-BLK-S' }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    // the first SKU — exactly what today's seed/batch scripts already do, no gtin yet
    const firstSku = await productIdentity.createSku('sku-create-s', 'owner-user', {
      styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeS.id, skuCode: 'DRS-SKU-BLK-S',
    });

    // the UI form resolves the remaining sizes by reading the exact size scale version the first SKU
    // carries — the real GET /v2/product/size-scales/:id?versionNo= path, not just the latest version
    const resolvedScale = await productIdentityQuery.getSizeScaleForActor('owner-user', sizeScale.id, { versionNo: sizeScaleVersion.versionNo });
    assert.deepEqual(resolvedScale.values.map((value) => value.sizeCode).sort(), ['M', 'S']);
    const used = new Set([sizeS.id]);
    const remaining = resolvedScale.values.filter((value) => !used.has(value.id));
    assert.deepEqual(remaining.map((value) => value.id), [sizeM.id]);

    // invalid GTIN is refused by the domain, not accepted as free text
    await assert.rejects(
      productIdentity.createSku('sku-create-bad-gtin', 'owner-user', {
        styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeM.id, skuCode: 'DRS-SKU-BLK-M', gtin: '12345',
      }),
      (error) => error.code === 'PRODUCT_SKU_GTIN_INVALID',
    );

    // the second SKU, with a real 13-digit GTIN — exactly what the form now sends
    const secondSku = await productIdentity.createSku('sku-create-m', 'owner-user', {
      styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeM.id, skuCode: 'DRS-SKU-BLK-M', gtin: '4601234567893',
    });
    assert.equal(secondSku.gtin, '4601234567893');

    // a colliding SKU code is refused
    await assert.rejects(
      productIdentity.createSku('sku-create-collide', 'owner-user', {
        styleVersionId: styleVersion.id, colorwayId: colorway.id, sizeValueId: sizeM.id, skuCode: 'DRS-SKU-BLK-S', gtin: '4601234567909',
      }),
      (error) => error.code === 'PRODUCT_SKU_ALREADY_EXISTS',
    );

    const persisted = await pool.query('SELECT sku_code, gtin FROM product_skus WHERE id = $1', [secondSku.id]);
    assert.deepEqual(persisted.rows[0], { sku_code: 'DRS-SKU-BLK-M', gtin: '4601234567893' });

    // the aggregate the UI reads (GET /v2/product/styles/:id) carries gtin and the size-scale lineage
    // the form needs to resolve the next SKU's remaining sizes, for both SKUs now on the colourway
    const aggregate = await productIdentityQuery.getStyleForActor('owner-user', style.id);
    const colorwayAgg = aggregate.colorways.find((value) => value.id === colorway.id);
    const skuByCode = Object.fromEntries(colorwayAgg.skus.map((sku) => [sku.skuCode, sku]));
    assert.equal(skuByCode['DRS-SKU-BLK-S'].gtin, null);
    assert.equal(skuByCode['DRS-SKU-BLK-M'].gtin, '4601234567893');
    assert.equal(skuByCode['DRS-SKU-BLK-M'].size.sizeScaleId, sizeScale.id);
    assert.equal(skuByCode['DRS-SKU-BLK-M'].size.sizeScaleVersionNo, sizeScaleVersion.versionNo);
  } finally {
    await pool.end();
  }
});
