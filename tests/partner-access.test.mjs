import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisation } from '../src/modules/organisations/public.mjs';
import { createMembership } from '../src/modules/access-control/public.mjs';
import {
  acceptCounterpartyRelationship,
  createCounterpartyRelationship,
} from '../src/modules/counterparty-relationships/public.mjs';
import { createWholesalePlatform } from '../src/application/platform.mjs';
import { createPartnerAccessService } from '../src/application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../src/application/showroom-selection-service.mjs';
import { createMemoryWholesaleStore } from '../src/infrastructure/memory-store.mjs';

function createClock(start = Date.parse('2026-07-30T20:00:00.000Z')) {
  let value = start;
  return {
    now: () => new Date(value).toISOString(),
    advance(ms) { value += ms; },
  };
}

async function fixture() {
  let id = 0;
  const timeline = createClock();
  const store = createMemoryWholesaleStore();
  const options = { store, clock: timeline.now, nextId: (prefix) => `${prefix}_${++id}` };
  const platform = createWholesalePlatform(options);
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService(options);

  await platform.registerOrganisation('org-brand', 'system', createOrganisation({ id: 'brand-1', type: 'brand', name: 'Brand' }));
  await platform.registerOrganisation('org-shop', 'system', createOrganisation({ id: 'shop-1', type: 'shop', name: 'Shop' }));
  await platform.grantMembership('member-brand', 'system', createMembership({ id: 'm1', organisationId: 'brand-1', organisationType: 'brand', userId: 'sales-1', role: 'owner', createdAt: timeline.now() }));
  await platform.grantMembership('member-shop', 'system', createMembership({ id: 'm2', organisationId: 'shop-1', organisationType: 'shop', userId: 'buyer-1', role: 'owner', createdAt: timeline.now() }));
  const campaign = await platform.createCampaign('campaign-create', 'sales-1', {
    brandId: 'brand-1', name: 'FW', season: 'FW27', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z',
  });
  await platform.openCampaign('campaign-open', 'sales-1', campaign.id);
  const collection = await platform.createCollection('collection-create', 'sales-1', {
    campaignId: campaign.id, brandId: 'brand-1', name: 'Main', currency: 'EUR',
  });
  await platform.publishCollection('collection-publish', 'sales-1', collection.id);
  const showroom = await collaboration.createShowroom('showroom-create', 'sales-1', {
    collectionId: collection.id, brandId: 'brand-1', name: 'Paris',
    opensAt: '2027-01-05T00:00:00.000Z', closesAt: '2027-01-20T00:00:00.000Z',
  });
  await collaboration.openShowroom('showroom-open', 'sales-1', showroom.id);
  return { timeline, store, platform, partners, collaboration, campaign, collection, showroom };
}

test('requester cannot accept its own counterparty relationship', () => {
  const relationship = createCounterpartyRelationship({
    id: 'r1', brandId: 'brand-1', shopId: 'shop-1', requestedByOrganisationId: 'brand-1', createdAt: '2026-07-30T20:00:00.000Z',
  });
  assert.throws(
    () => acceptCounterpartyRelationship(relationship, 'brand-1', '2026-07-30T20:01:00.000Z'),
    (error) => error.code === 'RELATIONSHIP_SELF_RESPONSE_FORBIDDEN',
  );
});

test('commercial cycle requires an accepted counterparty relationship', async () => {
  const context = await fixture();
  const input = { brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaign.id, collectionId: context.collection.id };
  await assert.rejects(context.platform.startCycle('cycle-before-relationship', 'buyer-1', input), (error) => error.code === 'ACTIVE_RELATIONSHIP_REQUIRED');
  const requested = await context.partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  assert.equal(requested.status, 'pending');
  const active = await context.partners.acceptRelationship('relationship-accept', 'buyer-1', requested.id);
  assert.equal(active.status, 'active');
  const cycle = await context.platform.startCycle('cycle-after-relationship', 'buyer-1', input);
  assert.equal(cycle.stage, 'campaign');
  assert.equal(context.store.snapshot().relationships.length, 1);
});

test('selection requires accepted, unexpired showroom invitation', async () => {
  const context = await fixture();
  const requested = await context.partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await context.partners.acceptRelationship('relationship-accept', 'buyer-1', requested.id);
  let cycle = await context.platform.startCycle('cycle-create', 'buyer-1', {
    brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaign.id, collectionId: context.collection.id,
  });
  cycle = await context.platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await context.platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  await assert.rejects(
    context.collaboration.createSelection('selection-without-invite', 'buyer-1', { cycleId: cycle.id, showroomId: context.showroom.id }),
    (error) => error.code === 'SHOWROOM_ACCESS_REQUIRED',
  );
  const invitation = await context.partners.inviteShopToShowroom('invitation-create', 'sales-1', {
    showroomId: context.showroom.id, shopId: 'shop-1', expiresAt: '2027-01-15T00:00:00.000Z',
  });
  await assert.rejects(
    context.collaboration.createSelection('selection-pending-invite', 'buyer-1', { cycleId: cycle.id, showroomId: context.showroom.id }),
    (error) => error.code === 'SHOWROOM_ACCESS_REQUIRED',
  );
  await context.partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  const result = await context.collaboration.createSelection('selection-with-access', 'buyer-1', {
    cycleId: cycle.id, showroomId: context.showroom.id,
  });
  assert.equal(result.selection.shopId, 'shop-1');
  assert.equal(result.cycle.stage, 'selection');
});

test('revoked relationship immediately blocks showroom access', async () => {
  const context = await fixture();
  const requested = await context.partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  const active = await context.partners.acceptRelationship('relationship-accept', 'buyer-1', requested.id);
  const invitation = await context.partners.inviteShopToShowroom('invitation-create', 'sales-1', {
    showroomId: context.showroom.id, shopId: 'shop-1', expiresAt: '2027-01-15T00:00:00.000Z',
  });
  await context.partners.acceptShowroomInvitation('invitation-accept', 'buyer-1', invitation.id);
  let cycle = await context.platform.startCycle('cycle-create', 'buyer-1', {
    brandId: 'brand-1', shopId: 'shop-1', campaignId: context.campaign.id, collectionId: context.collection.id,
  });
  cycle = await context.platform.advanceCycle('cycle-collection', 'buyer-1', cycle.id, 'collection');
  cycle = await context.platform.advanceCycle('cycle-showroom', 'buyer-1', cycle.id, 'showroom');
  await context.partners.revokeRelationship('relationship-revoke', 'sales-1', active.id);
  await assert.rejects(
    context.collaboration.createSelection('selection-after-revoke', 'buyer-1', { cycleId: cycle.id, showroomId: context.showroom.id }),
    (error) => error.code === 'ACTIVE_RELATIONSHIP_REQUIRED',
  );
});

test('expired invitation cannot be accepted and failed command rolls back', async () => {
  const context = await fixture();
  const requested = await context.partners.requestRelationship('relationship-request', 'sales-1', { brandId: 'brand-1', shopId: 'shop-1' });
  await context.partners.acceptRelationship('relationship-accept', 'buyer-1', requested.id);
  const invitation = await context.partners.inviteShopToShowroom('invitation-create', 'sales-1', {
    showroomId: context.showroom.id, shopId: 'shop-1', expiresAt: '2026-07-30T20:05:00.000Z',
  });
  context.timeline.advance(10 * 60 * 1000);
  await assert.rejects(
    context.partners.acceptShowroomInvitation('invitation-expired-accept', 'buyer-1', invitation.id),
    (error) => error.code === 'SHOWROOM_INVITATION_EXPIRED',
  );
  const snapshot = context.store.snapshot();
  assert.equal(snapshot.showroomInvitations[0].status, 'pending');
  assert.equal(snapshot.commands.some((command) => command.id === 'invitation-expired-accept'), false);
});
