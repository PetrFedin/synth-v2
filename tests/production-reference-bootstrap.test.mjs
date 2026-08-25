import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapProductionAcceptanceReferences,
  PRODUCTION_ACCEPTANCE_REFERENCES,
} from '../src/acceptance/production-reference-bootstrap.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;
const now = '2026-08-25T12:00:00.000Z';

test('production reference bootstrap creates only organisations and role memberships through platform service', async () => {
  const calls = [];
  const organisations = new Map();
  const memberships = new Map();
  const platform = {
    async registerOrganisation(commandId, actorId, organisation) {
      calls.push(['register', commandId, actorId, organisation]);
      organisations.set(organisation.id, organisation);
      return organisation;
    },
    async grantMembership(commandId, actorId, membership) {
      calls.push(['membership', commandId, actorId, membership]);
      memberships.set(membership.id, membership);
      return membership;
    },
  };

  const result = await bootstrapProductionAcceptanceReferences({ platform, clock: () => now });
  assert.equal(result.brand.id, PRODUCTION_ACCEPTANCE_REFERENCES.brand.id);
  assert.equal(result.shop.id, PRODUCTION_ACCEPTANCE_REFERENCES.shop.id);
  assert.equal(calls.filter(([kind]) => kind === 'register').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'membership').length, 5);
  assert.equal(memberships.get('syntha-acceptance-membership-brand-production').role, 'admin');
  assert.equal(memberships.get('syntha-acceptance-membership-brand-finance').role, 'finance');
  assert.equal(memberships.get('syntha-acceptance-membership-shop-buyer').role, 'buyer');
  assert.equal(calls.some((call) => JSON.stringify(call).includes('collection')), false);
  assert.equal(calls.some((call) => JSON.stringify(call).includes('product-sku')), false);
  assert.equal(Object.isFrozen(result), true);
});

test('clean PostgreSQL production reference bootstrap is idempotent through the real platform service', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => now });
    const runtime = createPostgresWholesaleRuntime({ pool, migrationsDir, clock: () => now });

    const first = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform, clock: () => now });
    const replay = await bootstrapProductionAcceptanceReferences({ platform: runtime.platform, clock: () => now });
    assert.deepEqual(replay, first);

    const organisations = await pool.query("SELECT id, type FROM organisations WHERE id = ANY($1::text[]) ORDER BY id", [[first.brand.id, first.shop.id]]);
    assert.deepEqual(organisations.rows, [
      { id: first.brand.id, type: 'brand' },
      { id: first.shop.id, type: 'shop' },
    ].sort((left, right) => left.id.localeCompare(right.id)));

    const membershipCount = await pool.query("SELECT count(*)::int AS count FROM memberships WHERE organisation_id = ANY($1::text[])", [[first.brand.id, first.shop.id]]);
    assert.equal(membershipCount.rows[0].count, 5);
    const businessCount = await pool.query(`SELECT
      (SELECT count(*)::int FROM campaigns) AS campaigns,
      (SELECT count(*)::int FROM collections) AS collections,
      (SELECT count(*)::int FROM product_styles) AS styles,
      (SELECT count(*)::int FROM product_skus) AS product_skus,
      (SELECT count(*)::int FROM orders) AS orders`);
    assert.deepEqual(businessCount.rows[0], { campaigns: 0, collections: 0, styles: 0, product_skus: 0, orders: 0 });
  } finally {
    await pool.end();
  }
});
