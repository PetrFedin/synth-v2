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

test('managed wholesale workflow reaches DealSpace without generic stage bypasses', async () => {
  let id = 0;
  let tick = 0;
  const store = createMemoryWholesaleStore();
  const catalogStore = createMemoryCatalogStore();
  const options = {
    store,
    clock: () => `2026-08-18T12:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++id}`,
  };
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock: options.clock, nextId: options.nextId });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const orders = createOrderBuilderService(options);

  await platform.registerOrganisation('e2e-org-brand', 'system', createOrganisation({ id: 'brand-e2e', type: 'brand', name: 'E2E Brand' }));
  await platform.registerOrganisation('e2e-org-shop', 'system', createOrganisation({ id: 'shop-e2e', type: 'shop', name: 'E2E Shop' }));
  await platform.grantMembership('e2e-member-brand', 'system', createMembership({
    id: 'member-brand-e2e', organisationId: 'brand-e2e', organisationType: 'brand', userId: 'brand-user-e2e', role: 'owner', createdAt: '2026-08-18T12:00:00.000Z',
  }));
  await platform.grantMembership('e2e-member-shop', 'system', createMembership({
    id: 'member-shop-e2e', organisationId: 'shop-e2e', organisationType: 'shop', userId: 'shop-user-e2e', role: 'owner', createdAt: '2026-08-18T12:00:00.000Z',
  }));

  const relationship = await partners.requestRelationship('e2e-relationship-request', 'brand-user-e2e', { brandId: 'brand-e2e', shopId: 'shop-e2e' });
  await partners.acceptRelationship('e2e-relationship-accept', 'shop-user-e2e', relationship.id);

  const campaign = await platform.createCampaign('e2e-campaign-create', 'brand-user-e2e', {
    brandId: 'brand-e2e', name: 'FW27 E2E', season: 'FW27',
    startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-28T00:00:00.000Z',
  });
  await platform.openCampaign('e2e-campaign-open', 'brand-user-e2e', campaign.id);
  const collection = await platform.createCollection('e2e-collection-create', 'brand-user-e2e', {
    campaignId: campaign.id, brandId: 'brand-e2e', name: 'Core E2E', currency: 'EUR',
  });
  await platform.publishCollection('e2e-collection-publish', 'brand-user-e2e', collection.id);

  await catalog.createSku('e2e-sku-create', 'brand-user-e2e', {
    sku: 'E2E-JACKET-M', collectionId: collection.id, brandId: 'brand-e2e', name: 'Jacket M',
    wholesalePrice: 125, currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 20,
  });
  await catalog.publishSku('e2e-sku-publish', 'brand-user-e2e', 'E2E-JACKET-M', { expectedVersion: 1 });

  const showroom = await collaboration.createShowroom('e2e-showroom-create', 'brand-user-e2e', {
    collectionId: collection.id, brandId: 'brand-e2e', name: 'Paris E2E',
    opensAt: '2026-08-01T00:00:00.000Z', closesAt: '2026-09-30T00:00:00.000Z',
  });
  await collaboration.openShowroom('e2e-showroom-open', 'brand-user-e2e', showroom.id);
  const invitation = await partners.inviteShopToShowroom('e2e-invitation-create', 'brand-user-e2e', {
    showroomId: showroom.id, shopId: 'shop-e2e', expiresAt: '2026-09-15T00:00:00.000Z',
  });
  await partners.acceptShowroomInvitation('e2e-invitation-accept', 'shop-user-e2e', invitation.id);

  let cycle = await platform.startCycle('e2e-cycle-create', 'shop-user-e2e', {
    brandId: 'brand-e2e', shopId: 'shop-e2e', campaignId: campaign.id, collectionId: collection.id,
  });
  cycle = await platform.advanceCycle('e2e-cycle-collection', 'shop-user-e2e', cycle.id, 'collection');
  cycle = await platform.advanceCycle('e2e-cycle-showroom', 'shop-user-e2e', cycle.id, 'showroom');

  const selectionResult = await collaboration.createSelection('e2e-selection-create', 'shop-user-e2e', {
    cycleId: cycle.id, showroomId: showroom.id,
  });
  assert.equal(selectionResult.cycle.stage, 'selection');
  const selection = await collaboration.upsertSelectionLine('e2e-selection-line', 'shop-user-e2e', selectionResult.selection.id, {
    sku: 'E2E-JACKET-M', quantity: 4,
  });
  const submitted = await collaboration.submitSelection('e2e-selection-submit', 'shop-user-e2e', selection.id);
  assert.equal(submitted.cycle.stage, 'order-builder');

  let order = await orders.createOrderDraft('e2e-order-create', 'shop-user-e2e', {
    selectionId: selection.id,
    terms: {
      incoterm: 'FCA', paymentDays: 30, prepaymentPercent: 20,
      deliveryStart: '2027-03-01T00:00:00.000Z', deliveryEnd: '2027-03-31T00:00:00.000Z',
    },
  });
  order = await orders.acceptTerms('e2e-order-shop-accept', 'shop-user-e2e', {
    orderId: order.id, organisationId: 'shop-e2e', expectedVersion: order.version,
  });
  order = await orders.acceptTerms('e2e-order-brand-accept', 'brand-user-e2e', {
    orderId: order.id, organisationId: 'brand-e2e', expectedVersion: order.version,
  });
  assert.equal(order.status, 'ready');

  const attached = await orders.attachOrderToCycle('e2e-order-attach', 'shop-user-e2e', {
    orderId: order.id, expectedVersion: order.version,
  });
  assert.equal(attached.order.status, 'attached');
  assert.equal(attached.cycle.stage, 'order');
  assert.equal(attached.cycle.order.id, order.id);
  assert.equal(attached.cycle.order.orderCommitSnapshotId, attached.orderCommitSnapshot.id);

  const completed = await platform.confirmAndOpenDeal('e2e-deal-open', 'shop-user-e2e', cycle.id);
  assert.equal(completed.cycle.stage, 'deal-space');
  assert.equal(completed.deal.orderId, order.id);
  assert.equal(completed.deal.totalAmount, 500);
  assert.equal(completed.milestones.length, 2);

  const snapshot = store.snapshot();
  assert.equal(snapshot.selections.length, 1);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.orderCommitSnapshots.length, 1);
  assert.equal(snapshot.deals.length, 1);
  assert.equal(snapshot.cycles.find((item) => item.id === cycle.id).stage, 'deal-space');
  assert.ok(snapshot.events.some((event) => event.type === 'selection.submitted'));
  assert.ok(snapshot.events.some((event) => event.type === 'order.commit-snapshot-created'));
  assert.ok(snapshot.events.some((event) => event.type === 'deal-space.opened'));
});
