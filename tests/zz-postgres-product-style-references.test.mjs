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

// Доска референсов (docs/backlog-not-yet-integrated.md, раздел C) была не построена нигде: ни в
// схеме, ни в домене. Этот тест проходит настоящий цикл сервис → стор → реальный PostgreSQL →
// ридер, доказывая, что референс переживает привязку к стилю (а не к версии) и виден в агрегате,
// который отдаёт экран стиля.
test('PostgreSQL Style Reference board attaches to the style, is replay-safe, and rides along in the style aggregate', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 6 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-30T09:00:00.000Z');
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

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-psr', type: 'brand', name: 'Style Reference Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-psr', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-buyer', 'owner-user', createMembership({ id: 'membership-buyer', organisationId: 'brand-psr', organisationType: 'brand', userId: 'buyer-user', role: 'quality', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-psr', styleCode: 'DRS-PSR' });

    // a role without product.manage cannot add a reference
    await assert.rejects(
      productIdentity.addStyleReference('deny', 'buyer-user', style.id, { imageUri: 'https://cdn/ref.jpg', sortOrder: 0 }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const reference = await productIdentity.addStyleReference('ref-create', 'owner-user', style.id, {
      imageUri: 'https://cdn.example/product-references/DRS-PSR/past-season.jpg',
      referencedModel: 'SS25 midi dress',
      season: 'SS25',
      comment: 'Пройма и посадка — эталон',
      sortOrder: 0,
    });
    assert.equal(reference.styleId, style.id);
    assert.equal(reference.brandId, 'brand-psr');

    const persisted = await pool.query('SELECT style_id, image_uri, referenced_model, season, comment, sort_order FROM product_style_references WHERE style_id = $1', [style.id]);
    assert.deepEqual(persisted.rows, [{
      style_id: style.id,
      image_uri: 'https://cdn.example/product-references/DRS-PSR/past-season.jpg',
      referenced_model: 'SS25 midi dress',
      season: 'SS25',
      comment: 'Пройма и посадка — эталон',
      sort_order: 0,
    }]);

    // replay is idempotent
    const replay = await productIdentity.addStyleReference('ref-create', 'owner-user', style.id, {
      imageUri: 'https://cdn.example/product-references/DRS-PSR/past-season.jpg',
      referencedModel: 'SS25 midi dress',
      season: 'SS25',
      comment: 'Пройма и посадка — эталон',
      sortOrder: 0,
    });
    assert.equal(replay.id, reference.id);
    const afterReplay = await pool.query('SELECT count(*)::int AS count FROM product_style_references WHERE style_id = $1', [style.id]);
    assert.equal(afterReplay.rows[0].count, 1);

    // a second reference at the same position is refused, the first stays intact
    await assert.rejects(
      productIdentity.addStyleReference('ref-collide', 'owner-user', style.id, { imageUri: 'https://cdn.example/other.jpg', sortOrder: 0 }),
      (error) => error.code === 'PRODUCT_STYLE_REFERENCE_POSITION_CONFLICT',
    );
    const secondReference = await productIdentity.addStyleReference('ref-second', 'owner-user', style.id, {
      imageUri: 'https://cdn.example/product-references/DRS-PSR/collar-detail.jpg',
      sortOrder: 1,
    });
    assert.equal(secondReference.referencedModel, null);
    assert.equal(secondReference.season, null);
    assert.equal(secondReference.comment, null);

    // the reference survives independently of any style version, and rides along in the aggregate the style screen reads
    const aggregateBeforeVersion = await productIdentityQuery.getStyleForActor('owner-user', style.id);
    assert.equal(aggregateBeforeVersion.styleVersion, null);
    assert.deepEqual(aggregateBeforeVersion.styleReferences.map((value) => value.id), [reference.id, secondReference.id]);

    await productIdentity.createStyleVersion('version-create', 'owner-user', style.id, { expectedLatestVersionNo: 0, titleRu: 'Платье миди', titleEn: 'Midi dress' });
    const aggregateAfterVersion = await productIdentityQuery.getStyleForActor('owner-user', style.id);
    assert.ok(aggregateAfterVersion.styleVersion);
    assert.deepEqual(aggregateAfterVersion.styleReferences.map((value) => value.imageUri), [
      'https://cdn.example/product-references/DRS-PSR/past-season.jpg',
      'https://cdn.example/product-references/DRS-PSR/collar-detail.jpg',
    ]);
  } finally {
    await pool.end();
  }
});
