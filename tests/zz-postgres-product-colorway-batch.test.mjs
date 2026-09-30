import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createProductIdentityService } from '../src/application/product-identity-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresProductIdentityStore } from '../src/infrastructure/postgres-product-identity-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// Заведение цветомоделей по одной за раз держало наполнение каталога дольше, чем должно было для
// бренда с несколькими оттенками одной ткани. Этот тест проходит настоящий цикл сервис → стор →
// реальный PostgreSQL: пакет входит в каталог весь целиком или не входит вовсе.
test('PostgreSQL colorway batch creates several Product Colorways atomically, in replay-safe and duplicate-safe ways', { skip: !databaseUrl }, async () => {
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
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-pcb', type: 'brand', name: 'Colorway Batch Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-pcb', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-buyer', 'owner-user', createMembership({ id: 'membership-buyer', organisationId: 'brand-pcb', organisationType: 'brand', userId: 'buyer-user', role: 'quality', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-pcb', styleCode: 'DRS-PCB' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье миди', titleEn: 'Midi dress' });

    // a role without product.manage cannot bulk-create either
    await assert.rejects(
      productIdentity.createColorwaysBatch('deny', 'buyer-user', styleVersion.id, { items: [{ colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black' }] }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const created = await productIdentity.createColorwaysBatch('batch-create', 'owner-user', styleVersion.id, {
      items: [
        { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black', swatchHex: '#111111' },
        { colorwayCode: 'WHT', nameRu: 'Белый', nameEn: 'White', swatchHex: '#eeeeee' },
        { colorwayCode: 'NVY', nameRu: 'Тёмно-синий', nameEn: 'Navy', swatchHex: '#1a2b4c' },
      ],
    });
    assert.equal(created.length, 3);
    assert.deepEqual(created.map((value) => value.colorwayCode).sort(), ['BLK', 'NVY', 'WHT']);

    const persisted = await pool.query('SELECT colorway_code, name_ru, swatch_hex FROM product_colorways WHERE style_version_id = $1 ORDER BY colorway_code', [styleVersion.id]);
    assert.deepEqual(persisted.rows, [
      { colorway_code: 'BLK', name_ru: 'Чёрный', swatch_hex: '#111111' },
      { colorway_code: 'NVY', name_ru: 'Тёмно-синий', swatch_hex: '#1a2b4c' },
      { colorway_code: 'WHT', name_ru: 'Белый', swatch_hex: '#eeeeee' },
    ]);

    // replay is idempotent
    const replay = await productIdentity.createColorwaysBatch('batch-create', 'owner-user', styleVersion.id, {
      items: [
        { colorwayCode: 'BLK', nameRu: 'Чёрный', nameEn: 'Black', swatchHex: '#111111' },
        { colorwayCode: 'WHT', nameRu: 'Белый', nameEn: 'White', swatchHex: '#eeeeee' },
        { colorwayCode: 'NVY', nameRu: 'Тёмно-синий', nameEn: 'Navy', swatchHex: '#1a2b4c' },
      ],
    });
    assert.deepEqual(replay.map((value) => value.id), created.map((value) => value.id));
    const afterReplay = await pool.query('SELECT count(*)::int AS count FROM product_colorways WHERE style_version_id = $1', [styleVersion.id]);
    assert.equal(afterReplay.rows[0].count, 3);

    // a batch that collides with an already-persisted code lands nothing — not even the earlier items
    await assert.rejects(
      productIdentity.createColorwaysBatch('batch-collide', 'owner-user', styleVersion.id, {
        items: [
          { colorwayCode: 'RED', nameRu: 'Красный', nameEn: 'Red' },
          { colorwayCode: 'BLK', nameRu: 'Чёрный ещё раз', nameEn: 'Black again' },
        ],
      }),
      (error) => error.code === 'PRODUCT_COLORWAY_ALREADY_EXISTS',
    );
    const afterCollision = await pool.query('SELECT count(*)::int AS count FROM product_colorways WHERE style_version_id = $1', [styleVersion.id]);
    assert.equal(afterCollision.rows[0].count, 3, 'the colliding batch must not have partially landed');

    // a batch with a duplicate code within itself is refused before anything is written
    await assert.rejects(
      productIdentity.createColorwaysBatch('batch-dupe', 'owner-user', styleVersion.id, {
        items: [
          { colorwayCode: 'GRN', nameRu: 'Зелёный', nameEn: 'Green' },
          { colorwayCode: 'GRN', nameRu: 'Зелёный 2', nameEn: 'Green 2' },
        ],
      }),
      (error) => error.code === 'PRODUCT_COLORWAY_BATCH_CODE_DUPLICATE',
    );
    const afterDuplicate = await pool.query('SELECT count(*)::int AS count FROM product_colorways WHERE style_version_id = $1', [styleVersion.id]);
    assert.equal(afterDuplicate.rows[0].count, 3);
  } finally {
    await pool.end();
  }
});
