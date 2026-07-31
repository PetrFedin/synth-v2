import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

async function fixture(existingStore) {
  let tick = 0;
  let id = 0;
  const store = existingStore ?? createMemoryWholesaleStore();
  const options = {
    store,
    clock: () => `2026-07-30T20:00:${String(tick++).padStart(2, '0')}.000Z`,
    nextId: (prefix) => `${prefix}_${++id}`,
  };
  const platform = createWholesalePlatform(options);
  const partners = createPartnerAccessService(options);
  await platform.registerOrganisation('cmd-org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Syntha Brand' }));
  await platform.registerOrganisation('cmd-org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Syntha Shop' }));
  await platform.grantMembership('cmd-brand-owner', 'system', createMembership({
    id: 'membership-brand-owner', organisationId: 'brand-1', organisationType: 'brand', userId: 'brand-owner', role: 'owner', createdAt: 'now',
  }));
  await platform.grantMembership('cmd-shop-owner', 'system', createMembership({
    id: 'membership-shop-owner', organisationId: 'shop-1', organisationType: 'shop', userId: 'shop-owner', role: 'owner', createdAt: 'now',
  }));
  await platform.grantMembership('cmd-brand-sales', 'brand-owner', createMembership({
    id: 'membership-brand-sales', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'sales', createdAt: 'now',
  }));
  await platform.grantMembership('cmd-shop-buyer', 'shop-owner', createMembership({
    id: 'membership-shop-buyer', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'buyer', createdAt: 'now',
  }));
  await platform.grantMembership('cmd-shop-viewer', 'shop-owner', createMembership({
    id: 'membership-shop-viewer', organisationId: 'shop-1', organisationType: 'shop', userId: 'viewer-1', role: 'viewer', createdAt: 'now',
  }));
  const relationship = await partners.requestRelationship('cmd-relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await partners.acceptRelationship('cmd-relationship-accept', 'buyer-1', relationship.id);
  const campaign = await platform.createCampaign('cmd-campaign', 'sales-1', {
    brandId: 'brand-1', name: 'Main Campaign', season: 'FW27',
    startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('cmd-campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('cmd-collection', 'sales-1', {
    campaignId: campaign.id, brandId: 'brand-1', name: 'Runway', currency: 'EUR',
  });
  await platform.publishCollection('cmd-collection-publish', 'sales-1', collection.id);
  return { platform, store, campaignId: campaign.id, collectionId: collection.id };
}

async function moveToOrder(context, actorId = 'buyer-1') {
  const { platform, campaignId, collectionId } = context;
  let cycle = await platform.startCycle('cmd-cycle', actorId, { brandId: 'brand-1', shopId: 'shop-1', campaignId, collectionId });
  for (const stage of ['collection', 'showroom', 'selection', 'order-builder', 'order']) {
    cycle = await platform.advanceCycle(`cmd-cycle-stage-${stage}`, actorId, cycle.id, stage);
  }
  return cycle;
}

test('confirmation atomically opens DealSpace and shared milestones', async () => {
  const context = await fixture();
  const cycle = await moveToOrder(context);
  await context.platform.attachOrder('cmd-attach-order', 'buyer-1', cycle.id, {
    id: 'order-1', currency: 'EUR', totalAmount: 600,
    lines: [{ sku: 'JACKET-01', quantity: 2, unitPrice: 200 }, { sku: 'SHIRT-01', quantity: 2, unitPrice: 100 }],
  });
  const result = await context.platform.confirmAndOpenDeal('cmd-confirm', 'buyer-1', cycle.id);
  assert.equal(result.cycle.stage, 'deal-space');
  assert.equal(result.deal.orderId, 'order-1');
  assert.equal(result.milestones.length, 2);
  assert.deepEqual(new Set(result.milestones.map((item) => item.ownerOrganisationId)), new Set(['brand-1', 'shop-1']));
  assert.equal(context.platform.snapshot().events.at(-1).metadata.actorId, 'buyer-1');
  assert.ok(context.store.readOutbox('pending').length > 0);
});

test('commands are durable and idempotent across platform instances', async () => {
  const context = await fixture();
  const input = { brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaignId, collectionId: context.collectionId };
  const first = await context.platform.startCycle('same-command', 'buyer-1', input);
  const secondPlatform = createWholesalePlatform({ store: context.store });
  const second = await secondPlatform.startCycle('same-command', 'buyer-1', input);
  assert.deepEqual(first, second);
  assert.equal(context.store.snapshot().cycles.length, 1);
});

test('reusing commandId for another actor or mutation is rejected', async () => {
  const context = await fixture();
  const input = { brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaignId, collectionId: context.collectionId };
  await context.platform.startCycle('shared-command', 'buyer-1', input);
  await assert.rejects(context.platform.startCycle('shared-command', 'shop-owner', input), (error) => error.code === 'COMMAND_ID_CONFLICT');
});

test('viewer cannot create or mutate a commercial cycle', async () => {
  const context = await fixture();
  await assert.rejects(
    context.platform.startCycle('cmd-viewer-cycle', 'viewer-1', {
      brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaignId, collectionId: context.collectionId,
    }),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});

test('buyer cannot manage brand campaigns', async () => {
  const context = await fixture();
  await assert.rejects(
    context.platform.createCampaign('cmd-buyer-campaign', 'buyer-1', {
      brandId: 'brand-1', name: 'Forbidden', season: 'SS28', startsAt: '2028-01-01T00:00:00.000Z', endsAt: '2028-02-01T00:00:00.000Z',
    }),
    (error) => error.code === 'ACTIVE_MEMBERSHIP_REQUIRED',
  );
});

test('failed confirmation rolls back cycle, deal, calendar and command', async () => {
  const context = await fixture();
  const cycle = await moveToOrder(context);
  const before = context.platform.snapshot();
  await assert.rejects(context.platform.confirmAndOpenDeal('cmd-invalid-confirm', 'buyer-1', cycle.id), (error) => error.code === 'ORDER_REQUIRED_FOR_CONFIRMATION');
  const after = context.platform.snapshot();
  assert.equal(after.cycles.find((item) => item.id === cycle.id).stage, 'order');
  assert.equal(after.deals.length, before.deals.length);
  assert.equal(after.calendar.length, before.calendar.length);
  assert.equal(after.commands.some((item) => item.id === 'cmd-invalid-confirm'), false);
});

test('order currency must match collection currency', async () => {
  const context = await fixture();
  const cycle = await moveToOrder(context);
  await assert.rejects(
    context.platform.attachOrder('cmd-wrong-currency', 'buyer-1', cycle.id, {
      id: 'order-1', currency: 'USD', totalAmount: 100, lines: [{ sku: 'SKU-1', quantity: 1, unitPrice: 100 }],
    }),
    (error) => error.code === 'ORDER_COLLECTION_CURRENCY_MISMATCH',
  );
});
