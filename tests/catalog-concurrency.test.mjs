import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createMemoryCatalogStore } from '../src/infrastructure/memory-catalog-store.mjs';

async function fixture() {
  let sequence = 0;
  let tick = 0;
  const wholesaleStore = createMemoryWholesaleStore();
  const catalogStore = createMemoryCatalogStore();
  const clock = () => `2026-08-03T10:00:${String(tick++).padStart(2, '0')}.000Z`;
  const nextId = (prefix) => `${prefix}_${++sequence}`;
  const platform = createWholesalePlatform({ store: wholesaleStore, clock, nextId });
  const catalog = createCatalogService({ wholesaleStore, catalogStore, clock, nextId });

  await platform.registerOrganisation('org-create', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.grantMembership('member-create', 'system', createMembership({
    id: 'membership-1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: clock(),
  }));
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', {
    brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', {
    campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR',
  });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  const draft = await catalog.createSku('sku-create', 'sales-1', {
    sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Jacket', wholesalePrice: 80,
    currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 10,
  });
  return { catalog, catalogStore, draft };
}

const update = Object.freeze({
  expectedVersion: 1,
  name: 'Jacket Updated',
  wholesalePrice: 85,
  minimumOrderQuantity: 3,
  availableQuantity: 15,
});

test('catalog update is idempotent, version guarded and emits one atomic update event', async () => {
  const { catalog, catalogStore, draft } = await fixture();
  const updated = await catalog.updateSku('sku-update', 'sales-1', draft.sku, update);
  assert.equal(updated.version, 2);
  assert.equal(updated.name, 'Jacket Updated');
  assert.equal(updated.availableToSell, 15);

  const replay = await catalog.updateSku('sku-update', 'sales-1', draft.sku, update);
  assert.deepEqual(replay, updated);
  assert.equal(catalogStore.snapshot().commands.filter((command) => command.id === 'sku-update').length, 1);
  assert.deepEqual(
    catalogStore.snapshot().outbox.map((record) => record.event.type),
    ['catalog-sku.created', 'catalog-sku.updated'],
  );

  await assert.rejects(
    () => catalog.updateSku('sku-stale', 'sales-1', draft.sku, { ...update, name: 'Stale overwrite' }),
    (error) => error?.code === 'CATALOG_SKU_CONCURRENCY_CONFLICT'
      && error.details?.expectedVersion === 1
      && error.details?.actualVersion === 2,
  );
  assert.equal(catalogStore.snapshot().commands.some((command) => command.id === 'sku-stale'), false);

  await assert.rejects(
    () => catalog.updateSku('sku-identity-change', 'sales-1', draft.sku, { ...update, expectedVersion: 2, sku: 'SKU-2' }),
    (error) => error?.code === 'CATALOG_UPDATE_FIELD_FORBIDDEN' && error.details?.fields?.[0] === 'sku',
  );
});

test('no-op edit records idempotency without version or outbox churn', async () => {
  const { catalog, catalogStore, draft } = await fixture();
  const result = await catalog.updateSku('sku-noop', 'sales-1', draft.sku, {
    expectedVersion: draft.version,
    name: ` ${draft.name} `,
    wholesalePrice: draft.wholesalePrice,
    minimumOrderQuantity: draft.minimumOrderQuantity,
    availableQuantity: draft.availableQuantity,
  });
  assert.equal(result.version, draft.version);
  assert.equal(catalogStore.snapshot().commands.some((command) => command.id === 'sku-noop'), true);
  assert.deepEqual(catalogStore.snapshot().outbox.map((record) => record.event.type), ['catalog-sku.created']);
});

test('publication requires the current version and published SKU becomes immutable', async () => {
  const { catalog, draft } = await fixture();
  const updated = await catalog.updateSku('sku-update', 'sales-1', draft.sku, update);

  await assert.rejects(
    () => catalog.publishSku('sku-publish-stale', 'sales-1', draft.sku, { expectedVersion: 1 }),
    (error) => error?.code === 'CATALOG_SKU_CONCURRENCY_CONFLICT' && error.details?.actualVersion === 2,
  );
  const published = await catalog.publishSku('sku-publish', 'sales-1', draft.sku, { expectedVersion: updated.version });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);

  await assert.rejects(
    () => catalog.updateSku('sku-update-published', 'sales-1', draft.sku, {
      ...update, expectedVersion: published.version, name: 'Illegal edit',
    }),
    (error) => error?.code === 'CATALOG_SKU_NOT_DRAFT',
  );
});
