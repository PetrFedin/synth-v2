import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { assertTradePair } from '../modules/organisations/public.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { createCampaign, changeCampaignStatus } from '../modules/campaigns/public.mjs';
import { createCollection, publishCollection } from '../modules/collections/public.mjs';
import { advanceCommercialCycle, attachOrder, createCommercialCycle } from '../modules/commercial-cycle/public.mjs';
import { openDealSpace } from '../modules/deal-space/public.mjs';
import { createCalendarMilestone } from '../modules/calendar/public.mjs';

export function createWholesalePlatform({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  systemActorId = 'system',
} = {}) {
  assertWholesaleStore(store);

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(previous.fingerprint === fingerprint, 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    const event = domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } });
    await tx.appendOutbox(event);
    return event;
  }

  async function assertOrganisationActor(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function authorizeTrade(tx, actorId, cycle, capability) {
    return assertTradeCapability({
      memberships: await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId,
      brandId: cycle.brandId, shopId: cycle.shopId, capability,
    });
  }

  return Object.freeze({
    registerOrganisation(commandId, actorId, organisation) {
      return execute(commandId, `registerOrganisation:${actorId}:${JSON.stringify(organisation)}`, actorId, async (tx) => {
        invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can register organisations');
        await tx.insertOrganisation(organisation);
        await append(tx, 'organisation.registered', organisation.id, { type: organisation.type }, commandId, actorId);
        return organisation;
      });
    },

    grantMembership(commandId, actorId, membership) {
      return execute(commandId, `grantMembership:${actorId}:${JSON.stringify(membership)}`, actorId, async (tx) => {
        const organisation = await tx.getOrganisation(membership.organisationId);
        invariant(organisation, 'ORG_NOT_FOUND', 'Membership organisation not found', { organisationId: membership.organisationId });
        invariant(organisation.type === membership.organisationType, 'MEMBERSHIP_ORG_TYPE_MISMATCH', 'Membership organisation type does not match organisation');
        const organisationMemberships = await tx.listMembershipsByOrganisation(organisation.id);
        if (organisationMemberships.length === 0) {
          invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can bootstrap the first membership');
          invariant(membership.role === 'owner', 'FIRST_MEMBERSHIP_OWNER_REQUIRED', 'The first membership must be owner');
        } else {
          await assertOrganisationActor(tx, organisation.id, actorId, CAPABILITIES.ORGANISATION_MANAGE);
        }
        await tx.insertMembership(membership);
        await append(tx, 'membership.granted', membership.id, { organisationId: organisation.id, userId: membership.userId, role: membership.role }, commandId, actorId);
        return membership;
      });
    },

    createCampaign(commandId, actorId, input) {
      return execute(commandId, `createCampaign:${actorId}:${JSON.stringify(input)}`, actorId, async (tx) => {
        const brand = await tx.getOrganisation(input.brandId);
        invariant(brand?.type === 'brand', 'BRAND_REQUIRED', 'Campaign owner must be a brand');
        await assertOrganisationActor(tx, brand.id, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
        const campaign = createCampaign({ id: nextId('campaign'), ...input, createdAt: clock() });
        await tx.insertCampaign(campaign);
        await append(tx, 'campaign.created', campaign.id, { brandId: campaign.brandId, season: campaign.season }, commandId, actorId);
        return campaign;
      });
    },

    openCampaign(commandId, actorId, campaignId) {
      return execute(commandId, `openCampaign:${actorId}:${campaignId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getCampaign(campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId });
        await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
        const updated = changeCampaignStatus(current, 'open', clock());
        await tx.saveCampaign(updated, current.version);
        await append(tx, 'campaign.opened', campaignId, { version: updated.version }, commandId, actorId);
        return updated;
      });
    },

    createCollection(commandId, actorId, input) {
      return execute(commandId, `createCollection:${actorId}:${JSON.stringify(input)}`, actorId, async (tx) => {
        const campaign = requireEntity(await tx.getCampaign(input.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: input.campaignId });
        await assertOrganisationActor(tx, campaign.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
        const collection = createCollection({ id: nextId('collection'), campaign, ...input, createdAt: clock() });
        await tx.insertCollection(collection);
        await append(tx, 'collection.created', collection.id, { campaignId: campaign.id, currency: collection.currency }, commandId, actorId);
        return collection;
      });
    },

    publishCollection(commandId, actorId, collectionId) {
      return execute(commandId, `publishCollection:${actorId}:${collectionId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
        const campaign = requireEntity(await tx.getCampaign(current.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: current.campaignId });
        await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
        const updated = publishCollection(current, campaign, clock());
        await tx.saveCollection(updated, current.version);
        await append(tx, 'collection.published', collectionId, { version: updated.version }, commandId, actorId);
        return updated;
      });
    },

    startCycle(commandId, actorId, { brandId, shopId, campaignId, collectionId }) {
      const input = { brandId, shopId, campaignId, collectionId };
      return execute(commandId, `startCycle:${actorId}:${JSON.stringify(input)}`, actorId, async (tx) => {
        const brand = await tx.getOrganisation(brandId);
        const shop = await tx.getOrganisation(shopId);
        assertTradePair({ brand, shop });
        assertTradeCapability({
          memberships: await tx.listMembershipsForTrade(brandId, shopId), actorId, brandId, shopId,
          capability: CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
        });
        const relationship = await tx.getRelationshipByTrade(brandId, shopId);
        assertActiveRelationship(relationship, { brandId, shopId });
        const campaign = requireEntity(await tx.getCampaign(campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId });
        const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
        const cycle = createCommercialCycle({ id: nextId('cycle'), brandId, shopId, campaign, collection, createdAt: clock() });
        await tx.insertCycle(cycle);
        await append(tx, 'commercial-cycle.started', cycle.id, { ...input, relationshipId: relationship.id }, commandId, actorId);
        return cycle;
      });
    },

    advanceCycle(commandId, actorId, cycleId, targetStage) {
      return execute(commandId, `advanceCycle:${actorId}:${cycleId}:${targetStage}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
        await authorizeTrade(tx, actorId, current, CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
        const updated = advanceCommercialCycle(current, targetStage, clock());
        await tx.saveCycle(updated, current.version);
        await append(tx, 'commercial-cycle.advanced', cycleId, { from: current.stage, to: targetStage, version: updated.version }, commandId, actorId);
        return updated;
      });
    },

    attachOrder(commandId, actorId, cycleId, order) {
      return execute(commandId, `attachOrder:${actorId}:${cycleId}:${JSON.stringify(order)}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
        await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_WRITE);
        const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
        invariant(order.currency === collection.currency, 'ORDER_COLLECTION_CURRENCY_MISMATCH', 'Order currency must match collection currency', {
          orderCurrency: order.currency, collectionCurrency: collection.currency,
        });
        const updated = attachOrder(current, order, clock());
        await tx.saveCycle(updated, current.version);
        await append(tx, 'order.attached', cycleId, { orderId: order.id, totalAmount: order.totalAmount, currency: order.currency }, commandId, actorId);
        return updated;
      });
    },

    confirmAndOpenDeal(commandId, actorId, cycleId) {
      return execute(commandId, `confirmAndOpenDeal:${actorId}:${cycleId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
        await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_CONFIRM);
        const confirmed = advanceCommercialCycle(current, 'confirmation', clock());
        await tx.saveCycle(confirmed, current.version);
        const deal = openDealSpace({ id: nextId('deal'), cycle: confirmed, createdAt: clock() });
        const brandMilestone = createCalendarMilestone({
          id: nextId('calendar'), ownerOrganisationId: confirmed.brandId, cycleId, type: 'deal',
          title: `Deal opened for ${confirmed.order.id}`, startsAt: clock(), visibility: 'shared',
        });
        const shopMilestone = createCalendarMilestone({
          id: nextId('calendar'), ownerOrganisationId: confirmed.shopId, cycleId, type: 'deal',
          title: `Deal opened for ${confirmed.order.id}`, startsAt: brandMilestone.startsAt, visibility: 'shared',
        });
        const completed = advanceCommercialCycle(confirmed, 'deal-space', clock());
        await tx.saveCycle(completed, confirmed.version);
        await tx.insertDeal(deal);
        await tx.insertCalendarMilestone(brandMilestone);
        await tx.insertCalendarMilestone(shopMilestone);
        await append(tx, 'order.confirmed', cycleId, { orderId: completed.order.id }, commandId, actorId);
        await append(tx, 'deal-space.opened', deal.id, { cycleId, orderId: deal.orderId }, commandId, actorId);
        return Object.freeze({ cycle: completed, deal, milestones: Object.freeze([brandMilestone, shopMilestone]) });
      });
    },

    snapshot() { return store.snapshot(); },
  });
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}
function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
