import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

const clock = () => '2026-08-09T00:00:00.000Z';

async function fixture({ availableQuantity = 10 } = {}) {
  let id = 0;
  const nextId = (prefix) => `${prefix}_${++id}`;
  const store = createMemoryWholesaleStore();
  const options = { store, clock, nextId };
  const platform = createWholesalePlatform(options);
  const partners = createPartnerAccessService(options);

  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-sales', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: clock() }));
  await platform.grantMembership('member-buyer', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: clock() }));
  const relationship = await partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', {
    brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);

  const showroomSeed = createShowroomSelectionService({ ...options, catalogReader: { getSku: async () => undefined } });
  const showroom = await showroomSeed.createShowroom('showroom-create', 'sales-1', {
    collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt: '2026-08-01T00:00:00.000Z', closesAt: '2026-09-01T00:00:00.000Z',
  });
  await showroomSeed.openShowroom('showroom-open', 'sales-1', showroom.id);
  const invitation = await partners.inviteShopToShowroom('invitation-create', 'sales-1', {
    showroomId: showroom.id, shopId: 'shop-1', expiresAt: '2026-08-31T00:00:00.000Z',
  });
  const acceptedInvitation = await partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);

  const buyerCatalog = Object.freeze({
    id: 'BUYER-CAT-1', status: 'published', publicationId: 'PUB-1', priceListVersionId: 'PRICE-1',
    brandId: 'brand-1', shopId: 'shop-1', showroomId: showroom.id, accessGrantId: acceptedInvitation.id,
    collectionId: collection.id, currency: 'EUR', contentHash: 'a'.repeat(64),
    lines: Object.freeze([
      Object.freeze({ sku: 'SKU-1', catalogVersion: 7, unitPrice: 75, currency: 'EUR', minimumOrderQuantity: 2 }),
    ]),
  });
  const liveSku = Object.freeze({
    id: 'SKU-1', sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Live PLM changed',
    wholesalePrice: 999, currency: 'EUR', minimumOrderQuantity: 99,
    availableQuantity, reservedQuantity: 0, availableToSell: availableQuantity,
    status: 'draft', version: 99,
  });
  const commercialReader = Object.freeze({
    getBuyerCatalogForAccess: async () => buyerCatalog,
    getBuyerCatalogVersion: async (idValue) => idValue === buyerCatalog.id ? buyerCatalog : undefined,
  });
  const collaboration = createShowroomSelectionService({
    ...options,
    catalogReader: { getSku: async (sku) => sku === 'SKU-1' ? liveSku : undefined },
    commercialPublicationReader: commercialReader,
  });

  let cycle = await platform.startCycle('cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: campaign.id, collectionId: collection.id });
  cycle = await platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  const selection = (await collaboration.createSelection('selection-create', 'buyer-1', { cycleId: cycle.id, showroomId: showroom.id })).selection;
  return { collaboration, selection };
}

test('pinned buyer selection keeps published price, MOQ and version when live PLM/catalog fields later change', async () => {
  const { collaboration, selection } = await fixture();
  const edited = await collaboration.upsertSelectionLine('line-valid', 'buyer-1', selection.id, { sku: 'SKU-1', quantity: 3 });
  assert.deepEqual(edited.lines[0], {
    sku: 'SKU-1', quantity: 3, unitPrice: 75, currency: 'EUR', catalogVersion: 7,
    note: '', updatedBy: 'buyer-1', updatedAt: clock(),
  });
});

test('pinned buyer selection still uses live inventory only as a dynamic availability overlay', async () => {
  const { collaboration, selection } = await fixture({ availableQuantity: 2 });
  await assert.rejects(
    () => collaboration.upsertSelectionLine('line-over-ats', 'buyer-1', selection.id, { sku: 'SKU-1', quantity: 3 }),
    (error) => error?.code === 'CATALOG_AVAILABILITY_EXCEEDED',
  );
});
