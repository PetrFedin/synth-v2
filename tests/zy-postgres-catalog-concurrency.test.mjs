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
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL serializes competing catalog edits and rejects stale publication', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 5 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let id = 0;
  let tick = 0;
  const clock = () => `2026-08-03T12:00:${String(tick++).padStart(2, '0')}.000Z`;
  const nextId = (prefix) => `${prefix}_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });
    const wholesaleStore = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
    const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });

    await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-concurrency', type: 'brand', name: 'Brand' }));
    await platform.grantMembership('member-create', 'system', createMembership({
      id: 'membership-concurrency', organisationId: 'brand-concurrency', organisationType: 'brand', userId: 'sales-concurrency', role: 'owner', createdAt: clock(),
    }));
    const campaign = await platform.createCampaign('campaign-create', 'sales-concurrency', {
      brandId: 'brand-concurrency', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
    });
    await platform.openCampaign('campaign-open', 'sales-concurrency', campaign.id);
    const collection = await platform.createCollection('collection-create', 'sales-concurrency', {
      campaignId: campaign.id, brandId: 'brand-concurrency', name: 'Main', currency: 'EUR',
    });
    await platform.publishCollection('collection-publish', 'sales-concurrency', collection.id);
    const draft = await catalog.createSku('sku-create', 'sales-concurrency', {
      sku: 'PG-CONCURRENT-1', collectionId: collection.id, brandId: 'brand-concurrency', name: 'Original', wholesalePrice: 100,
      currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 20,
    });

    const outcomes = await Promise.allSettled([
      catalog.updateSku('sku-update-a', 'sales-concurrency', draft.sku, {
        expectedVersion: 1, name: 'Winner A', wholesalePrice: 101, minimumOrderQuantity: 2, availableQuantity: 20,
      }),
      catalog.updateSku('sku-update-b', 'sales-concurrency', draft.sku, {
        expectedVersion: 1, name: 'Winner B', wholesalePrice: 102, minimumOrderQuantity: 3, availableQuantity: 21,
      }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.equal(rejected.reason.code, 'CATALOG_SKU_CONCURRENCY_CONFLICT');
    assert.equal(rejected.reason.details.actualVersion, 2);

    const current = await catalog.getSku(draft.sku);
    assert.equal(current.version, 2);
    assert.ok(['Winner A', 'Winner B'].includes(current.name));
    await assert.rejects(
      () => catalog.publishSku('sku-publish-stale', 'sales-concurrency', draft.sku, { expectedVersion: 1 }),
      (error) => error?.code === 'CATALOG_SKU_CONCURRENCY_CONFLICT' && error.details?.actualVersion === 2,
    );
    const published = await catalog.publishSku('sku-publish-current', 'sales-concurrency', draft.sku, { expectedVersion: current.version });
    assert.equal(published.version, 3);
    assert.equal(published.status, 'published');

    assert.equal((await pool.query('SELECT count(*)::int AS count FROM catalog_commands')).rows[0].count, 3);
    assert.deepEqual(
      (await pool.query("SELECT event_type FROM outbox_events WHERE event_type LIKE 'catalog-sku.%' ORDER BY event_type")).rows.map((row) => row.event_type),
      ['catalog-sku.created', 'catalog-sku.published', 'catalog-sku.updated'],
    );
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM catalog_outbox_events')).rows[0].count, 0);
  } finally {
    await pool.end();
  }
});
