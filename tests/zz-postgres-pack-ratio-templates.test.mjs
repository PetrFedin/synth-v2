import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createProductReadinessService } from '../src/application/product-readiness-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresProductReadinessStore } from '../src/infrastructure/postgres-product-readiness-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

// docs/backlog-not-yet-integrated.md, раздел E: «ростовки (размерные горки) как библиотека; `packRatio`
// отмечен незакрытым долгом» — поле `packRatio` на коммерческой подготовке было полностью проведено
// через домен/транспорт/снимок готовности с самого начала, но нигде не было ни способа набрать его в
// интерфейсе, ни именованной библиотеки шаблонов для переиспользования между моделями бренда. Этот
// тест проходит настоящий цикл сервис → стор → реальный PostgreSQL: шаблон создаётся, повторяется
// replay-safe, отказывает дублирующееся имя в той же бренд-организации, и читается прямым SQL.
test('PostgreSQL Pack ratio templates are brand-scoped, replay-safe, duplicate-safe and readable by a real round trip', { skip: !databaseUrl }, async () => {
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
    const productReadinessStore = createPostgresProductReadinessStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-prt', type: 'brand', name: 'Pack Ratio Brand' }));
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-prt', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));
    await platform.grantMembership('member-buyer', 'owner-user', createMembership({ id: 'membership-buyer', organisationId: 'brand-prt', organisationType: 'brand', userId: 'buyer-user', role: 'quality', createdAt: clock() }));

    const sourceReader = {
      getMembership: async (organisationId, userId) => {
        const result = await pool.query('SELECT organisation_id, organisation_type, user_id, role, status FROM memberships WHERE organisation_id = $1 AND user_id = $2', [organisationId, userId]);
        if (!result.rowCount) return undefined;
        const row = result.rows[0];
        return { organisationId: row.organisation_id, organisationType: row.organisation_type, userId: row.user_id, role: row.role, status: row.status };
      },
      getStyleVersion: async () => undefined,
      loadAssessmentContext: async () => undefined,
    };
    const productReadiness = createProductReadinessService({ store: productReadinessStore, sourceReader, clock, nextId });

    // a role without product.manage cannot create a template
    await assert.rejects(
      productReadiness.createPackRatioTemplate('deny', 'buyer-user', { brandId: 'brand-prt', name: 'Стандарт', ratio: [1, 2, 2, 1] }),
      (error) => error.code === 'CAPABILITY_DENIED',
    );

    const first = await productReadiness.createPackRatioTemplate('template-create', 'owner-user', { brandId: 'brand-prt', name: 'Стандарт', ratio: [1, 2, 2, 1] });
    assert.deepEqual(first.ratio, [1, 2, 2, 1]);

    const persisted = await pool.query('SELECT brand_id, name, payload FROM pack_ratio_templates WHERE id = $1', [first.id]);
    assert.equal(persisted.rows[0].brand_id, 'brand-prt');
    assert.equal(persisted.rows[0].name, 'Стандарт');
    assert.deepEqual(persisted.rows[0].payload.ratio, [1, 2, 2, 1]);

    // replay is idempotent
    const replay = await productReadiness.createPackRatioTemplate('template-create', 'owner-user', { brandId: 'brand-prt', name: 'Стандарт', ratio: [1, 2, 2, 1] });
    assert.equal(replay.id, first.id);
    const afterReplay = await pool.query('SELECT count(*)::int AS count FROM pack_ratio_templates WHERE brand_id = $1', ['brand-prt']);
    assert.equal(afterReplay.rows[0].count, 1);

    // the same name cannot be reused in the same brand, even with a different ratio
    await assert.rejects(
      productReadiness.createPackRatioTemplate('template-dupe', 'owner-user', { brandId: 'brand-prt', name: 'Стандарт', ratio: [1, 1] }),
      (error) => error.code === 'PACK_RATIO_TEMPLATE_ALREADY_EXISTS',
    );

    const second = await productReadiness.createPackRatioTemplate('template-second', 'owner-user', { brandId: 'brand-prt', name: 'Компактная', ratio: [1, 1] });

    const listed = await productReadiness.listPackRatioTemplatesForActor('buyer-user', 'brand-prt');
    assert.deepEqual(listed.map((value) => value.name), ['Компактная', 'Стандарт']);
    assert.equal(listed.find((value) => value.id === second.id).ratio.length, 2);
  } finally {
    await pool.end();
  }
});
