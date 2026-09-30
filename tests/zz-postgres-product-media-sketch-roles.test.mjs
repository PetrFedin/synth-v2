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

// docs/backlog-not-yet-integrated.md, раздел C, п.60 и docs/omnidata-screens-gap-analysis.md, п.10:
// «эскизы с типом (дизайнерский / технический / Tech Pack Thumbnail)». До этой миграции домен знал
// только один общий `technical`, и форма не могла предложить дизайнерский эскиз и превью тех.пакета
// отдельно. Этот тест проходит настоящий цикл сервис → стор → реальный PostgreSQL CHECK-ограничение
// на `product_media.media_role`, подтверждая, что новые роли сохраняются, а произвольная роль вне
// набора по-прежнему отвергается и доменом, и самой базой.
test('PostgreSQL Media accepts design_sketch and tech_pack_thumbnail roles alongside the existing technical role', { skip: !databaseUrl }, async () => {
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

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-pms', type: 'brand', name: 'Media Sketch Roles Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-pms', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-pms', styleCode: 'DRS-PMS' });
    const styleVersion = await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье с эскизами', titleEn: 'Sketch dress' });

    const sketch = await productIdentity.addMedia('media-sketch', 'owner-user', styleVersion.id, { mediaType: 'image', mediaRole: 'design_sketch', uri: 's3://product-media/DRS-PMS/design-sketch.jpg', sortOrder: 0 });
    assert.equal(sketch.mediaRole, 'design_sketch');

    const technical = await productIdentity.addMedia('media-technical', 'owner-user', styleVersion.id, { mediaType: 'image', mediaRole: 'technical', uri: 's3://product-media/DRS-PMS/technical.jpg', sortOrder: 1 });
    assert.equal(technical.mediaRole, 'technical');

    const thumbnail = await productIdentity.addMedia('media-thumbnail', 'owner-user', styleVersion.id, { mediaType: 'image', mediaRole: 'tech_pack_thumbnail', uri: 's3://product-media/DRS-PMS/tech-pack-thumbnail.jpg', sortOrder: 2 });
    assert.equal(thumbnail.mediaRole, 'tech_pack_thumbnail');

    const persisted = await pool.query('SELECT media_role FROM product_media WHERE style_version_id = $1 ORDER BY sort_order', [styleVersion.id]);
    assert.deepEqual(persisted.rows.map((row) => row.media_role), ['design_sketch', 'technical', 'tech_pack_thumbnail']);

    // the database itself rejects a role outside the domain's set, not just the application layer
    await assert.rejects(
      pool.query('INSERT INTO product_media (id, brand_id, style_version_id, colorway_id, media_type, media_role, uri, sort_order, created_at, created_by) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9)',
        ['media_bad', 'brand-pms', styleVersion.id, 'image', 'flat', 's3://product-media/DRS-PMS/flat.jpg', 3, clock(), 'owner-user']),
      (error) => /product_media_media_role_check/.test(error.message),
    );
  } finally {
    await pool.end();
  }
});
