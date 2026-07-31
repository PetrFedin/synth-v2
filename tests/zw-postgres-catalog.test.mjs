import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL catalog persists immutable published SKU snapshots and availability', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  let id = 0;
  const clock = () => '2026-07-31T16:00:00.000Z';
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock });
    const store = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const platform = createWholesalePlatform({ store, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock, nextId });

    await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-pg', type: 'brand', name: 'Brand PG' }));
    await platform.grantMembership('member-sales', 'system', createMembership({ id: 'member-pg', organisationId: 'brand-pg', organisationType: 'brand', userId: 'sales-pg', role: 'owner', createdAt: clock() }));
    const campaign = await platform.createCampaign('campaign-create', 'sales-pg', { brandId: 'brand-pg', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
    await platform.openCampaign('campaign-open', 'sales-pg', campaign.id);
    const collection = await platform.createCollection('collection-create', 'sales-pg', { campaignId: campaign.id, brandId: 'brand-pg', name: 'Main', currency: 'EUR' });
    await platform.publishCollection('collection-publish', 'sales-pg', collection.id);

    const draft = await catalog.createSku('catalog-create', 'sales-pg', {
      sku: 'PG-SKU-1', collectionId: collection.id, brandId: 'brand-pg', name: 'Postgres Jacket',
      wholesalePrice: 125.5, currency: 'EUR', minimumOrderQuantity: 5, availableQuantity: 30,
    });
    assert.equal(draft.status, 'draft');
    assert.equal(draft.availableToSell, 30);
    const published = await catalog.publishSku('catalog-publish', 'sales-pg', draft.sku);
    assert.equal(published.status, 'published');
    assert.equal(published.version, 2);
    assert.equal((await catalog.getPublishedSku(draft.sku)).wholesalePrice, 125.5);

    const rows = await pool.query(
      `SELECT status, currency, wholesale_price::text AS price,
              minimum_order_quantity, available_quantity, reserved_quantity,
              version, payload
         FROM catalog_skus WHERE sku = $1`,
      [draft.sku],
    );
    assert.equal(rows.rows[0].status, 'published');
    assert.equal(rows.rows[0].currency, 'EUR');
    assert.equal(rows.rows[0].price, '125.5000');
    assert.equal(rows.rows[0].minimum_order_quantity, 5);
    assert.equal(rows.rows[0].available_quantity, 30);
    assert.equal(rows.rows[0].reserved_quantity, 0);
    assert.equal(rows.rows[0].version, 2);
    assert.equal(rows.rows[0].payload.wholesalePrice, 125.5);
    assert.equal(rows.rows[0].payload.availableToSell, 30);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM catalog_commands')).rows[0].count, 2);
    assert.deepEqual((await pool.query('SELECT event_type FROM catalog_outbox_events ORDER BY id')).rows.map((row) => row.event_type).sort(), ['catalog-sku.created', 'catalog-sku.published']);

    const replay = await catalog.publishSku('catalog-publish', 'sales-pg', draft.sku);
    assert.deepEqual(replay, published);
  } finally { await pool.end(); }
});
