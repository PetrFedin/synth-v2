import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../src/application/order-builder-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createMemoryCatalogStore } from '../src/infrastructure/memory-catalog-store.mjs';

async function fixture() {
  let id = 0;
  const store = createMemoryWholesaleStore();
  const catalogStore = createMemoryCatalogStore();
  const clock = () => '2026-07-31T15:00:00.000Z';
  const nextId = (prefix) => `${prefix}_${++id}`;
  const options = { store, clock, nextId };
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock, nextId });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const orders = createOrderBuilderService(options);

  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-sales', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: clock() }));
  await platform.grantMembership('member-buyer', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: clock() }));
  const relationship = await partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', { brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  const draftSku = await catalog.createSku('sku-create', 'sales-1', {
    sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Jacket Black 48',
    wholesalePrice: 80, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 10,
  });
  const showroom = await collaboration.createShowroom('showroom-create', 'sales-1', { collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt: '2027-01-05T00:00:00.000Z', closesAt: '2027-01-20T00:00:00.000Z' });
  await collaboration.openShowroom('showroom-open', 'sales-1', showroom.id);
  const invitation = await partners.inviteShopToShowroom('invitation-create', 'sales-1', { showroomId: showroom.id, shopId: 'shop-1', expiresAt: '2027-01-15T00:00:00.000Z' });
  await partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  let cycle = await platform.startCycle('cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: campaign.id, collectionId: collection.id });
  cycle = await platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  const selection = (await collaboration.createSelection('selection-create', 'buyer-1', { cycleId: cycle.id, showroomId: showroom.id })).selection;
  return { store, catalogStore, catalog, collaboration, orders, collection, draftSku, selection };
}

test('Selection accepts only a published catalog SKU and derives price, currency, MOQ and ATS', async () => {
  const context = await fixture();
  await assert.rejects(
    () => context.collaboration.upsertSelectionLine('line-draft', 'buyer-1', context.selection.id, { sku: 'SKU-1', quantity: 3 }),
    (error) => error.code === 'CATALOG_SKU_NOT_PUBLISHED',
  );
  await context.catalog.publishSku('sku-publish', 'sales-1', 'SKU-1');
  assert.throws(
    () => context.collaboration.upsertSelectionLine('line-client-price', 'buyer-1', context.selection.id, { sku: 'SKU-1', quantity: 3, unitPrice: 1 }),
    (error) => error.code === 'SELECTION_CLIENT_PRICE_FORBIDDEN',
  );
  await assert.rejects(
    () => context.collaboration.upsertSelectionLine('line-below-moq', 'buyer-1', context.selection.id, { sku: 'SKU-1', quantity: 1 }),
    (error) => error.code === 'CATALOG_MOQ_NOT_MET',
  );
  await assert.rejects(
    () => context.collaboration.upsertSelectionLine('line-over-ats', 'buyer-1', context.selection.id, { sku: 'SKU-1', quantity: 11 }),
    (error) => error.code === 'CATALOG_AVAILABILITY_EXCEEDED',
  );
  const edited = await context.collaboration.upsertSelectionLine('line-valid', 'buyer-1', context.selection.id, { sku: 'SKU-1', quantity: 3, note: 'Core buy' });
  assert.deepEqual(edited.lines[0], {
    sku: 'SKU-1', quantity: 3, unitPrice: 80, currency: 'EUR', catalogVersion: 2,
    note: 'Core buy', updatedBy: 'buyer-1', updatedAt: '2026-07-31T15:00:00.000Z',
  });
  const submitted = await context.collaboration.submitSelection('selection-submit', 'buyer-1', edited.id);
  const order = await context.orders.createOrderDraft('order-create', 'buyer-1', {
    selectionId: submitted.selection.id,
    terms: { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' },
  });
  assert.equal(order.currency, 'EUR');
  assert.equal(order.totalAmount, 240);
  assert.equal(context.catalogStore.snapshot().commands.length, 2);
  assert.deepEqual(context.catalogStore.snapshot().outbox.map((record) => record.event.type), ['catalog-sku.created', 'catalog-sku.published']);
});

test('buyer cannot create brand catalog SKU', async () => {
  const context = await fixture();
  await assert.rejects(
    () => context.catalog.createSku('sku-buyer', 'buyer-1', {
      sku: 'SKU-2', collectionId: context.collection.id, brandId: 'brand-1', name: 'Buyer bypass',
      wholesalePrice: 10, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10,
    }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});
