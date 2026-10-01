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

// docs/backlog-not-yet-integrated.md, раздел C: «лекала и контуры деталей»; docs/omnidata-screens-gap-analysis.md,
// п.12: «Лекала (файл + изображение) и Контуры деталей». До этой миграции домен не знал ни одной из
// этих двух ролей — набор ролей исчерпывался фото/эскизами (миграции 052 и 148). Этот тест проходит
// настоящий цикл сервис → стор → реальный PostgreSQL CHECK-ограничение на `product_media.media_role`,
// подтверждая, что обе новые роли сохраняются, а произвольная роль вне набора по-прежнему отвергается
// и доменом, и самой базой.
test('PostgreSQL Media accepts pattern and die_line roles alongside the existing sketch roles', { skip: !databaseUrl }, async () => {
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
    const productIdentityStore = createPostgresProductIdentityStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-pmp', type: 'brand', name: 'Media Pattern Roles Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-pmp', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-pmp', styleCode: 'DRS-PMP' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье с лекалами', titleEn: 'Pattern dress' });

    const pattern = await productIdentity.addMedia('media-pattern', 'owner-user', styleVersion.id, { mediaType: 'image', mediaRole: 'pattern', uri: 's3://product-media/DRS-PMP/pattern.jpg', sortOrder: 0 });
    assert.equal(pattern.mediaRole, 'pattern');

    const dieLine = await productIdentity.addMedia('media-die-line', 'owner-user', styleVersion.id, { mediaType: 'image', mediaRole: 'die_line', uri: 's3://product-media/DRS-PMP/die-line.jpg', sortOrder: 1 });
    assert.equal(dieLine.mediaRole, 'die_line');

    const persisted = await pool.query('SELECT media_role FROM product_media WHERE style_version_id = $1 ORDER BY sort_order', [styleVersion.id]);
    assert.deepEqual(persisted.rows.map((row) => row.media_role), ['pattern', 'die_line']);

    // the database itself rejects a role outside the domain's set, not just the application layer
    await assert.rejects(
      pool.query('INSERT INTO product_media (id, brand_id, style_version_id, colorway_id, media_type, media_role, uri, sort_order, created_at, created_by) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9)',
        ['media_bad', 'brand-pmp', styleVersion.id, 'image', 'flat', 's3://product-media/DRS-PMP/flat.jpg', 2, clock(), 'owner-user']),
      (error) => /product_media_media_role_check/.test(error.message),
    );
  } finally {
    await pool.end();
  }
});
