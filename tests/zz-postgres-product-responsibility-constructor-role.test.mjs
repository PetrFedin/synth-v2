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

// docs/backlog-not-yet-integrated.md, раздел K: конструктор отсутствовал среди ролей ответственности
// на продукте, хотя остальные пять из требуемого списка уже были заведены. Этот тест проходит
// настоящий цикл сервис → стор → реальный PostgreSQL, доказывая, что расширенное миграцией 145
// ограничение принимает новую роль, а не только старые пять, и что триггер членства продолжает
// работать как прежде.
test('PostgreSQL accepts the constructor desk as a recognized product responsibility role', { skip: !databaseUrl }, async () => {
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
    const platform = createWholesalePlatform({ store: wholesaleStore, productIdentityStore, clock, nextId });
    const productIdentity = createProductIdentityService({ store: productIdentityStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-prc', type: 'brand', name: 'Constructor Role Brand' }));
    // A responsibility's user_id is a real foreign key into auth_users (migration 080), unlike
    // membership, so the desk-holder needs a row there even though this test exercises neither
    // registration nor login.
    await pool.query(
      "INSERT INTO auth_users (id, email, email_normalized, display_name, password_hash, status, created_at, updated_at) VALUES ('owner-user', 'owner@constructor-role.example', 'owner@constructor-role.example', 'Owner', 'x', 'active', now(), now())",
    );
    await platform.grantMembership('member-owner', 'system', createMembership({ id: 'membership-owner', organisationId: 'brand-prc', organisationType: 'brand', userId: 'owner-user', role: 'owner', createdAt: clock() }));

    const style = await productIdentity.createStyle('style-create', 'owner-user', { brandId: 'brand-prc', styleCode: 'DRS-PRC' });

    const responsibility = await platform.assignProductResponsibility('assign-constructor', 'owner-user', style.id, { role: 'constructor', userId: 'owner-user' });
    assert.equal(responsibility.role, 'constructor');

    const persisted = await pool.query('SELECT role, user_id FROM product_style_responsibilities WHERE id = $1', [responsibility.id]);
    assert.deepEqual(persisted.rows, [{ role: 'constructor', user_id: 'owner-user' }]);

    // a role outside the now-six-value list is still refused by the widened constraint
    await assert.rejects(
      pool.query(
        "INSERT INTO product_style_responsibilities (id, style_id, brand_id, role, user_id, assigned_at, assigned_by, payload) VALUES ('bad-role', $1, 'brand-prc', 'ceo', 'owner-user', now(), 'owner-user', '{}'::jsonb)",
        [style.id],
      ),
      (error) => /product_style_responsibilities_role_check/.test(error.message),
    );

    await platform.releaseProductResponsibility('release-constructor', 'owner-user', responsibility.id);
    const afterRelease = await pool.query('SELECT count(*)::int AS count FROM product_style_responsibilities WHERE id = $1', [responsibility.id]);
    assert.equal(afterRelease.rows[0].count, 0);
  } finally {
    await pool.end();
  }
});
