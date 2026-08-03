import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createCatalogQueryService } from '../src/application/catalog-query-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresCatalogReader } from '../src/infrastructure/postgres-catalog-reader.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL catalog read model enforces draft ownership, published counterparty visibility and filter-bound pages', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  let id = 0;
  let tick = 0;
  const clock = () => `2026-08-03T10:${String(Math.floor(tick / 60)).padStart(2, '0')}:${String(tick++ % 60).padStart(2, '0')}.000Z`;
  const nextId = (prefix) => `${prefix}_catalog_reader_${++id}`;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock });
    const store = createPostgresWholesaleStore({ pool });
    const catalogStore = createPostgresCatalogStore({ pool });
    const options = { store, clock, nextId };
    const platform = createWholesalePlatform(options);
    const commands = createCatalogService({ wholesaleStore: store, catalogStore, clock, nextId });
    const query = createCatalogQueryService({ reader: createPostgresCatalogReader({ pool }) });
    const partners = createPartnerAccessService(options);

    await platform.registerOrganisation('catalog-reader-brand', 'system', createOrganisation({ id: 'brand-reader', type: 'brand', name: 'Reader Brand' }));
    await platform.registerOrganisation('catalog-reader-shop', 'system', createOrganisation({ id: 'shop-reader', type: 'shop', name: 'Reader Shop' }));
    await platform.grantMembership('catalog-reader-brand-member', 'system', createMembership({
      id: 'member-brand-reader', organisationId: 'brand-reader', organisationType: 'brand', userId: 'sales-reader', role: 'owner', createdAt: clock(),
    }));
    await platform.grantMembership('catalog-reader-shop-member', 'system', createMembership({
      id: 'member-shop-reader', organisationId: 'shop-reader', organisationType: 'shop', userId: 'buyer-reader', role: 'owner', createdAt: clock(),
    }));

    const relationship = await partners.requestRelationship('catalog-reader-relationship-request', 'sales-reader', { brandId: 'brand-reader', shopId: 'shop-reader' });
    await partners.acceptRelationship('catalog-reader-relationship-accept', 'buyer-reader', relationship.id);
    const campaign = await platform.createCampaign('catalog-reader-campaign', 'sales-reader', {
      brandId: 'brand-reader', name: 'Catalog Reader', season: 'SS28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z',
    });
    await platform.openCampaign('catalog-reader-campaign-open', 'sales-reader', campaign.id);
    const collection = await platform.createCollection('catalog-reader-collection', 'sales-reader', {
      campaignId: campaign.id, brandId: 'brand-reader', name: 'Reader Main', currency: 'EUR',
    });
    await platform.publishCollection('catalog-reader-collection-publish', 'sales-reader', collection.id);
    await platform.startCycle('catalog-reader-cycle', 'buyer-reader', {
      brandId: 'brand-reader', shopId: 'shop-reader', campaignId: campaign.id, collectionId: collection.id,
    });

    await commands.createSku('catalog-reader-draft', 'sales-reader', {
      sku: 'READER-DRAFT', collectionId: collection.id, brandId: 'brand-reader', name: 'Summer Draft Coat',
      wholesalePrice: 100, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10,
    });
    await commands.createSku('catalog-reader-published', 'sales-reader', {
      sku: 'READER-PUBLISHED', collectionId: collection.id, brandId: 'brand-reader', name: 'Summer Published Coat',
      wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 20,
    });
    await commands.publishSku('catalog-reader-publish', 'sales-reader', 'READER-PUBLISHED');

    const ownerPage = await query.pageForActor('sales-reader', { q: 'Summer', brandId: 'brand-reader', limit: 1 });
    assert.deepEqual(ownerPage.items.map((item) => item.sku), ['READER-DRAFT']);
    assert.equal(typeof ownerPage.nextCursor, 'string');
    const ownerNext = await query.pageForActor('sales-reader', {
      q: 'Summer', brandId: 'brand-reader', limit: 1, cursor: ownerPage.nextCursor,
    });
    assert.deepEqual(ownerNext.items.map((item) => item.sku), ['READER-PUBLISHED']);
    assert.equal(ownerNext.nextCursor, null);

    const shopPage = await query.pageForActor('buyer-reader', { collectionId: collection.id, limit: 10 });
    assert.deepEqual(shopPage.items.map((item) => item.sku), ['READER-PUBLISHED']);
    assert.equal((await query.getForActor('buyer-reader', 'READER-PUBLISHED')).status, 'published');
    await assert.rejects(
      () => query.getForActor('buyer-reader', 'READER-DRAFT'),
      (error) => error?.code === 'CATALOG_SKU_NOT_FOUND',
    );
    await assert.rejects(
      () => query.pageForActor('sales-reader', { q: 'Other', cursor: ownerPage.nextCursor }),
      (error) => error?.code === 'CATALOG_CURSOR_INVALID',
    );
  } finally {
    await pool.end();
  }
});
