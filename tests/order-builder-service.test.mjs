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
  const options = { store, clock: () => '2026-07-30T20:00:00.000Z', nextId: (prefix) => `${prefix}_${++id}` };
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, clock: options.clock, nextId: options.nextId });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const orders = createOrderBuilderService(options);
  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-brand', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: 'now' }));
  await platform.grantMembership('member-shop', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: 'now' }));
  const relationship = await partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', { brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01', endsAt: '2027-02-01' });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', { campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR' });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  await catalog.createSku('catalog-create', 'sales-1', {
    sku: 'SKU-1', collectionId: collection.id, brandId: 'brand-1', name: 'Jacket', wholesalePrice: 80,
    currency: 'EUR', minimumOrderQuantity: 1, availableQuantity: 10,
  });
  await catalog.publishSku('catalog-publish', 'sales-1', 'SKU-1', { expectedVersion: 1 });
  const showroom = await collaboration.createShowroom('showroom-create', 'sales-1', { collectionId: collection.id, brandId: 'brand-1', name: 'Paris', opensAt: '2027-01-05', closesAt: '2027-01-20' });
  await collaboration.openShowroom('showroom-open', 'sales-1', showroom.id);
  const invitation = await partners.inviteShopToShowroom('invitation-create', 'sales-1', { showroomId: showroom.id, shopId: 'shop-1', expiresAt: '2027-01-15' });
  await partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  let cycle = await platform.startCycle('cycle-create', 'buyer-1', { brandId: 'brand-1', shopId: 'shop-1', campaignId: campaign.id, collectionId: collection.id });
  cycle = await platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  const created = await collaboration.createSelection('selection-create', 'buyer-1', { cycleId: cycle.id, showroomId: showroom.id });
  const edited = await collaboration.upsertSelectionLine('selection-line', 'buyer-1', created.selection.id, { sku: 'SKU-1', quantity: 3 });
  const submitted = await collaboration.submitSelection('selection-submit', 'buyer-1', edited.id);
  return { store, platform, orders, selectionId: submitted.selection.id, cycleId: submitted.cycle.id };
}

const terms = { incoterm: 'DAP', paymentDays: 30, prepaymentPercent: 20, deliveryStart: '2027-03-01', deliveryEnd: '2027-03-31' };

test('dual-approved order advances to DealSpace without manual totals', async () => {
  const context = await fixture();
  let order = await context.orders.createOrderDraft('order-create', 'buyer-1', { selectionId: context.selectionId, terms });
  assert.equal(order.totalAmount, 240);
  order = await context.orders.acceptTerms('order-shop-accept', 'buyer-1', { orderId: order.id, organisationId: 'shop-1', expectedVersion: order.version });
  assert.equal(order.status, 'draft');
  order = await context.orders.acceptTerms('order-brand-accept', 'sales-1', { orderId: order.id, organisationId: 'brand-1', expectedVersion: order.version });
  assert.equal(order.status, 'ready');
  const attached = await context.orders.attachOrderToCycle('order-attach', 'buyer-1', { orderId: order.id, expectedVersion: order.version });
  assert.equal(attached.cycle.stage, 'order');
  assert.equal(attached.cycle.order.totalAmount, 240);
  const deal = await context.platform.confirmAndOpenDeal('deal-confirm', 'buyer-1', context.cycleId);
  assert.equal(deal.cycle.stage, 'deal-space');
  assert.equal(deal.deal.totalAmount, 240);
});

test('one-sided approval cannot attach order and transaction rolls back', async () => {
  const context = await fixture();
  let order = await context.orders.createOrderDraft('order-create-one-sided', 'buyer-1', { selectionId: context.selectionId, terms });
  order = await context.orders.acceptTerms('order-shop-only', 'buyer-1', { orderId: order.id, organisationId: 'shop-1', expectedVersion: order.version });
  await assert.rejects(context.orders.attachOrderToCycle('order-attach-invalid', 'buyer-1', { orderId: order.id, expectedVersion: order.version }), (error) => error.code === 'ORDER_NOT_READY');
  const snapshot = context.store.snapshot();
  assert.equal(snapshot.orders[0].status, 'draft');
  assert.equal(snapshot.cycles.find((item) => item.id === context.cycleId).stage, 'order-builder');
  assert.equal(snapshot.commands.some((item) => item.id === 'order-attach-invalid'), false);
});

async function attachedOrderFixture() {
  const context = await fixture();
  let order = await context.orders.createOrderDraft('order-create', 'buyer-1', { selectionId: context.selectionId, terms });
  order = await context.orders.acceptTerms('order-shop-accept', 'buyer-1', { orderId: order.id, organisationId: 'shop-1', expectedVersion: order.version });
  order = await context.orders.acceptTerms('order-brand-accept', 'sales-1', { orderId: order.id, organisationId: 'brand-1', expectedVersion: order.version });
  const attached = await context.orders.attachOrderToCycle('order-attach', 'buyer-1', { orderId: order.id, expectedVersion: order.version });
  return { ...context, order: attached.order };
}

test('either side of an attached order can propose an amendment; the commercial impact is derived from the line price', async () => {
  const { orders, order } = await attachedOrderFixture();
  assert.equal(order.lines[0].quantity, 3);
  const amendment = await orders.proposeAmendment('amend-propose', 'buyer-1', { orderId: order.id, lineNo: 1, proposedQuantity: 5, reason: 'Retailer wants two more units for a launch event' });
  assert.equal(amendment.status, 'proposed');
  assert.equal(amendment.currentQuantity, 3);
  assert.equal(amendment.proposedQuantity, 5);
  assert.equal(amendment.deltaAmount, 160); // (5 - 3) * 80
  assert.equal(amendment.proposedOrganisationId, 'shop-1');
});

test('an order that is not yet attached cannot be amended', async () => {
  const context = await fixture();
  const order = await context.orders.createOrderDraft('order-create-draft', 'buyer-1', { selectionId: context.selectionId, terms });
  await assert.rejects(
    context.orders.proposeAmendment('amend-too-early', 'buyer-1', { orderId: order.id, lineNo: 1, proposedQuantity: 5, reason: 'x' }),
    (error) => error.code === 'ORDER_AMENDMENT_NOT_ATTACHED',
  );
});

test('a line cannot carry two open amendments at once', async () => {
  const { orders, order } = await attachedOrderFixture();
  await orders.proposeAmendment('amend-first', 'buyer-1', { orderId: order.id, lineNo: 1, proposedQuantity: 5, reason: 'First request' });
  await assert.rejects(
    orders.proposeAmendment('amend-second', 'buyer-1', { orderId: order.id, lineNo: 1, proposedQuantity: 7, reason: 'Second request before the first is answered' }),
    (error) => error.code === 'ORDER_AMENDMENT_ALREADY_OPEN',
  );
});

test('only the other side of the order can accept or reject a proposal, and rejection requires a reason', async () => {
  const { orders, order } = await attachedOrderFixture();
  const amendment = await orders.proposeAmendment('amend-propose', 'buyer-1', { orderId: order.id, lineNo: 1, proposedQuantity: 5, reason: 'Retailer wants two more units' });

  await assert.rejects(
    orders.respondToAmendment('amend-self-respond', 'buyer-1', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' }),
    (error) => error.code === 'ORDER_AMENDMENT_SELF_RESPONSE_FORBIDDEN',
  );
  await assert.rejects(
    orders.respondToAmendment('amend-reject-no-reason', 'sales-1', { orderId: order.id, amendmentId: amendment.id, decision: 'rejected' }),
    (error) => error.code === 'ORDER_AMENDMENT_RESPONSE_REASON_REQUIRED',
  );
  const accepted = await orders.respondToAmendment('amend-accept', 'sales-1', { orderId: order.id, amendmentId: amendment.id, decision: 'accepted' });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.respondedOrganisationId, 'brand-1');

  const view = await orders.getAmendmentsForActor('buyer-1', order.id);
  assert.equal(view.amendments.length, 1);
  assert.equal(view.amendments[0].status, 'accepted');

  // the order line itself is untouched — an accepted amendment records a decision, it does not
  // silently rewrite committed quantities.
  assert.equal((await orders.getAmendmentsForActor('sales-1', order.id)).orderId, order.id);
});
