import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

const now = '2026-08-13T00:00:00.000Z';

async function fixture() {
  let id = 0;
  const store = createMemoryWholesaleStore();
  const base = { store, clock: () => now, nextId: prefix => `${prefix}_${++id}` };
  const platform = createWholesalePlatform(base);
  const partners = createPartnerAccessService(base);
  const collaboration = createShowroomSelectionService(base);

  await platform.registerOrganisation('matrix-org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('matrix-org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('matrix-member-brand', 'system', createMembership({ id: 'brand-member', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: now }));
  await platform.grantMembership('matrix-member-shop', 'system', createMembership({ id: 'shop-member', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: now }));

  const relationship = await partners.requestRelationship('matrix-relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('matrix-relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('matrix-campaign-create', 'sales-1', { brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z' });
  await platform.openCampaign('matrix-campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('matrix-collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('matrix-collection-publish', 'sales-1', collection.id);
  const showroom = await collaboration.createShowroom('matrix-showroom-create', 'sales-1', { collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt: '2026-08-01T00:00:00.000Z', closesAt: '2026-09-01T00:00:00.000Z' });
  await collaboration.openShowroom('matrix-showroom-open', 'sales-1', showroom.id);
  const invitation = await partners.inviteShopToShowroom('matrix-invitation-create', 'sales-1', { showroomId: showroom.id, shopId: 'shop-1', expiresAt: '2026-08-30T00:00:00.000Z' });
  await partners.acceptShowroomInvitation('matrix-invitation-accept', 'buyer-1', invitation.id);
  let cycle = await platform.startCycle('matrix-cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: campaign.id, collectionId: collection.id });
  cycle = await platform.advanceCycle('matrix-cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await platform.advanceCycle('matrix-cycle-showroom', 'buyer-1', cycle.id, 'showroom');

  const buyerCatalog = richBuyerCatalog({ collectionId: collection.id, showroomId: showroom.id, invitationId: invitation.id });
  const rich = createShowroomSelectionService({
    ...base,
    catalogReader: Object.freeze({ getSku: async () => { throw new Error('rich matrix must not read the live flat catalog'); } }),
    commercialPublicationReader: Object.freeze({
      getBuyerCatalogForAccess: async () => buyerCatalog,
      getBuyerCatalogVersion: async idValue => idValue === buyerCatalog.id ? buyerCatalog : undefined,
    }),
  });
  return { store, cycle, showroom, buyerCatalog, rich };
}

function richBuyerCatalog({ collectionId, showroomId, invitationId }) {
  const availability = Object.freeze({ mode: 'available_to_sell', quantity: 12 });
  const product = Object.freeze({
    productSkuId: 'product-sku-1', skuCode: 'SKU-1', gtin: '4601234567890', sizeValueId: 'size-m',
    size: Object.freeze({ id: 'size-m', code: 'M', labelRu: 'М', labelEn: 'M', sortOrder: 2 }),
    commercialTerms: Object.freeze({ availability }),
  });
  return Object.freeze({
    id: 'buyer-catalog-1', status: 'published', publicationId: 'publication-1', priceListVersionId: 'price-list-1', contentHash: 'buyer-catalog-hash-1',
    accessGrantId: invitationId, collectionId, brandId: 'brand-1', shopId: 'shop-1', showroomId, currency: 'EUR',
    lines: Object.freeze([Object.freeze({ sku: 'SKU-1', productSkuId: product.productSkuId, styleVersionId: 'style-version-1', colorwayId: 'colorway-1', sizeValueId: 'size-m', catalogVersion: 4, unitPrice: 95, currency: 'EUR', minimumOrderQuantity: 2, availability })]),
    styles: Object.freeze([Object.freeze({ styleId: 'style-1', styleVersionId: 'style-version-1', colorways: Object.freeze([Object.freeze({ colorwayId: 'colorway-1', skus: Object.freeze([product]) })]) })]),
  });
}

test('rich buyer matrix replacement is one atomic selection version change and preserves immutable lineage', async () => {
  const context = await fixture();
  const created = await context.rich.createSelection('matrix-selection-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroom.id });
  const beforeVersion = created.selection.version;
  const updated = await context.rich.replaceSelectionMatrix('matrix-replace', 'buyer-1', created.selection.id, { lines: [{ sku: 'SKU-1', quantity: 3, note: 'core buy' }] });

  assert.equal(updated.version, beforeVersion + 1);
  assert.equal(updated.lines.length, 1);
  assert.deepEqual(updated.lines[0], {
    sku: 'SKU-1', quantity: 3, unitPrice: 95, currency: 'EUR', catalogVersion: 4,
    productSkuId: 'product-sku-1', styleId: 'style-1', styleVersionId: 'style-version-1', colorwayId: 'colorway-1',
    sizeValueId: 'size-m', sizeCode: 'M', sizeLabelRu: 'М', sizeLabelEn: 'M', sizeSortOrder: 2, gtin: '4601234567890',
    note: 'core buy', updatedBy: 'buyer-1', updatedAt: now,
  });
  assert.equal(context.store.snapshot().outbox.some(event => event.type === 'selection.matrix-replaced'), true);
});

test('rich buyer matrix replacement can explicitly clear a draft matrix', async () => {
  const context = await fixture();
  const created = await context.rich.createSelection('matrix-clear-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroom.id });
  const populated = await context.rich.replaceSelectionMatrix('matrix-clear-populate', 'buyer-1', created.selection.id, { lines: [{ sku: 'SKU-1', quantity: 3 }] });
  const cleared = await context.rich.replaceSelectionMatrix('matrix-clear-empty', 'buyer-1', populated.id, { lines: [] });
  assert.equal(cleared.lines.length, 0);
  assert.equal(cleared.version, populated.version + 1);
});

test('rich buyer matrix replacement rolls back completely when any SKU is outside the pinned BuyerCatalogVersion', async () => {
  const context = await fixture();
  const created = await context.rich.createSelection('matrix-rollback-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroom.id });
  const populated = await context.rich.replaceSelectionMatrix('matrix-rollback-populate', 'buyer-1', created.selection.id, { lines: [{ sku: 'SKU-1', quantity: 3 }] });

  await assert.rejects(
    context.rich.replaceSelectionMatrix('matrix-rollback-invalid', 'buyer-1', populated.id, { lines: [{ sku: 'SKU-1', quantity: 4 }, { sku: 'SKU-UNKNOWN', quantity: 2 }] }),
    error => error?.code === 'BUYER_CATALOG_PRODUCT_SKU_NOT_FOUND',
  );

  const stored = context.store.snapshot().selections.find(selection => selection.id === populated.id);
  assert.equal(stored.version, populated.version);
  assert.equal(stored.lines[0].quantity, 3);
  assert.equal(context.store.snapshot().commands.some(command => command.id === 'matrix-rollback-invalid'), false);
});

test('rich buyer matrix replacement rejects client controlled price fields', async () => {
  const context = await fixture();
  const created = await context.rich.createSelection('matrix-price-create', 'buyer-1', { cycleId: context.cycle.id, showroomId: context.showroom.id });
  await assert.rejects(
    context.rich.replaceSelectionMatrix('matrix-price-invalid', 'buyer-1', created.selection.id, { lines: [{ sku: 'SKU-1', quantity: 3, unitPrice: 1 }] }),
    error => error?.code === 'SELECTION_CLIENT_PRICE_FORBIDDEN',
  );
});
