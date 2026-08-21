import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createCatalogService } from '../src/application/catalog-service.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createRetailDoorService } from '../src/application/retail-door-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';
import { createMemoryCatalogStore } from '../src/infrastructure/memory-catalog-store.mjs';

const PROJECTION_LINEAGE = Object.freeze({
  commercialProjectionId: 'projection-1',
  commercialProjectionVersionNo: 4,
  commercialProjectionContentHash: 'b'.repeat(64),
  readinessSnapshotId: 'readiness-1',
  styleVersionId: 'style-version-1',
});

async function fixture() {
  let id = 0;
  const store = createMemoryWholesaleStore();
  const catalogStore = createMemoryCatalogStore();
  const options = { store, clock: () => '2026-07-30T20:00:00.000Z', nextId: (prefix) => `${prefix}_${++id}` };
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock: options.clock, nextId: options.nextId });
  const partners = createPartnerAccessService(options);
  const retailDoors = createRetailDoorService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-sales', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: 'now' }));
  await platform.grantMembership('member-buyer', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: 'now' }));
  const door = await retailDoors.createRetailDoor('door-create', 'buyer-1', {
    shopId: 'shop-1', code: 'PARIS-01', name: 'Paris Flagship',
    shipToAddress: { countryCode: 'FR', postalCode: '75001', city: 'Paris', region: null, line1: '1 Rue de Rivoli', line2: null },
  });
  const relationship = await partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', {
    brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  await catalog.createSku('catalog-create', 'sales-1', {
    sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Jacket', wholesalePrice: 80,
    currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10,
  });
  await catalog.publishSku('catalog-publish', 'sales-1', 'SKU-1', { expectedVersion: 1 });
  const showroom = await collaboration.createShowroom('showroom-create', 'sales-1', {
    collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt: '2027-01-05T00:00:00.000Z', closesAt: '2027-01-20T00:00:00.000Z',
  });
  await collaboration.openShowroom('showroom-open', 'sales-1', showroom.id);
  const invitation = await partners.inviteShopToShowroom('invitation-create', 'sales-1', {
    showroomId: showroom.id, shopId: 'shop-1', expiresAt: '2027-01-15T00:00:00.000Z',
  });
  await partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  let cycle = await platform.startCycle('cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: campaign.id, collectionId: collection.id });
  cycle = await platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  return { store, platform, collaboration, showroomId: showroom.id, invitationId: invitation.id, cycle, door };
}

function richBuyerCatalog(context, overrides = {}) {
  const availability = overrides.availability ?? { mode: 'available_to_sell', quantity: 10 };
  const line = {
    sku: 'SKU-1',
    productSkuId: 'product-sku-1',
    styleVersionId: 'style-version-1',
    colorwayId: 'colorway-1',
    sizeValueId: 'size-m',
    catalogVersion: 7,
    unitPrice: 95,
    currency: 'EUR',
    minimumOrderQuantity: overrides.minimumOrderQuantity ?? 2,
    availability,
  };
  return Object.freeze({
    id: 'buyer-catalog-1',
    status: 'published',
    publicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    contentHash: 'catalog-hash-1',
    accessGrantId: context.invitationId,
    collectionId: context.cycle.collectionId,
    brandId: 'brand-1',
    shopId: 'shop-1',
    showroomId: context.showroomId,
    currency: 'EUR',
    ...PROJECTION_LINEAGE,
    lines: Object.freeze([Object.freeze(line)]),
    styles: Object.freeze([Object.freeze({
      styleId: 'style-1',
      styleVersionId: 'style-version-1',
      colorways: Object.freeze([Object.freeze({
        colorwayId: 'colorway-1',
        skus: Object.freeze([Object.freeze({
          productSkuId: 'product-sku-1',
          skuCode: 'SKU-1',
          gtin: '4601234567890',
          sizeValueId: 'size-m',
          size: Object.freeze({ id: 'size-m', code: 'M', labelRu: 'М', labelEn: 'M', sortOrder: 2 }),
          commercialTerms: Object.freeze({ availability }),
        })]),
      })]),
    })]),
  });
}

function richCollaboration(context, buyerCatalog) {
  let id = 0;
  return createShowroomSelectionService({
    store: context.store,
    clock: () => '2026-07-30T20:00:00.000Z',
    nextId: (prefix) => `rich_${prefix}_${++id}`,
    catalogReader: Object.freeze({
      getSku: async () => { throw new Error('live catalog must not be read for a rich pinned buyer cart'); },
    }),
    commercialPublicationReader: Object.freeze({
      getBuyerCatalogForAccess: async () => buyerCatalog,
      getBuyerCatalogVersion: async () => buyerCatalog,
    }),
  });
}

test('shop selection advances cycle atomically to order-builder', async () => {
  const context = await fixture();
  const created = await context.collaboration.createSelection('selection-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroomId });
  assert.equal(created.cycle.stage, 'selection');
  const edited = await context.collaboration.upsertSelectionLine('selection-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 });
  assert.equal(edited.lines[0].unitPrice, 80);
  assert.equal(edited.lines[0].currency, 'EUR');
  const submitted = await context.collaboration.submitSelection('selection-submit', 'buyer-1', edited.id);
  assert.equal(submitted.selection.status, 'submitted');
  assert.equal(submitted.cycle.stage, 'order-builder');
  assert.equal(context.store.snapshot().selections.length, 1);
});

test('rich pinned buyer cart resolves Style Colorway Size SKU entirely from frozen buyer catalog', async () => {
  const context = await fixture();
  const buyerCatalog = richBuyerCatalog(context);
  const collaboration = richCollaboration(context, buyerCatalog);
  const created = await collaboration.createSelection('rich-selection-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroomId, retailDoorId: context.door.id });
  const edited = await collaboration.upsertSelectionLine('rich-selection-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 });

  assert.equal(edited.buyerCatalogVersionId, buyerCatalog.id);
  assert.equal(edited.commercialBasisHash, buyerCatalog.contentHash);
  for (const [key, value] of Object.entries(PROJECTION_LINEAGE)) assert.equal(edited[key], value);
  assert.equal(edited.retailDoorId, context.door.id);
  assert.deepEqual(edited.lines[0], {
    sku: 'SKU-1',
    quantity: 3,
    unitPrice: 95,
    currency: 'EUR',
    catalogVersion: 7,
    productSkuId: 'product-sku-1',
    styleId: 'style-1',
    styleVersionId: 'style-version-1',
    colorwayId: 'colorway-1',
    sizeValueId: 'size-m',
    sizeCode: 'M',
    sizeLabelRu: 'М',
    sizeLabelEn: 'M',
    sizeSortOrder: 2,
    gtin: '4601234567890',
    note: '',
    updatedBy: 'buyer-1',
    updatedAt: '2026-07-30T20:00:00.000Z',
  });
});

test('rich pinned buyer cart enforces frozen MOQ without reading live flat catalog', async () => {
  const context = await fixture();
  const buyerCatalog = richBuyerCatalog(context, { minimumOrderQuantity: 4 });
  const collaboration = richCollaboration(context, buyerCatalog);
  const created = await collaboration.createSelection('rich-moq-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroomId, retailDoorId: context.door.id });

  await assert.rejects(
    collaboration.upsertSelectionLine('rich-moq-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 }),
    (error) => error.code === 'BUYER_CATALOG_MOQ_NOT_MET',
  );
});

test('rich pinned buyer cart enforces documented frozen available-to-sell quantity', async () => {
  const context = await fixture();
  const buyerCatalog = richBuyerCatalog(context, { availability: { mode: 'available_to_sell', quantity: 2 } });
  const collaboration = richCollaboration(context, buyerCatalog);
  const created = await collaboration.createSelection('rich-ats-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroomId, retailDoorId: context.door.id });

  await assert.rejects(
    collaboration.upsertSelectionLine('rich-ats-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 }),
    (error) => error.code === 'BUYER_CATALOG_AVAILABILITY_EXCEEDED',
  );
});

test('brand actor cannot write a shop selection', async () => {
  const context = await fixture();
  await assert.rejects(
    context.collaboration.createSelection('selection-brand', 'sales-1', { cycleId: context.cycle.id, showroomId: context.showroomId }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
  assert.equal(context.store.snapshot().selections.length, 0);
  assert.equal(context.store.snapshot().cycles.find((item) => item.id === context.cycle.id).stage, 'showroom');
});

test('empty selection submission rolls back selection and cycle changes', async () => {
  const context = await fixture();
  const created = await context.collaboration.createSelection('selection-empty-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroomId });
  await assert.rejects(context.collaboration.submitSelection('selection-empty-submit', 'buyer-1', created.selection.id), (error) => error.code === 'SELECTION_LINES_REQUIRED');
  const snapshot = context.store.snapshot();
  assert.equal(snapshot.selections[0].status, 'draft');
  assert.equal(snapshot.cycles.find((item) => item.id === context.cycle.id).stage, 'selection');
  assert.equal(snapshot.commands.some((item) => item.id === 'selection-empty-submit'), false);
});
