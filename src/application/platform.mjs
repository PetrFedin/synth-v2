import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { assertTradePair } from '../modules/organisations/public.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { createCampaign, changeCampaignStatus } from '../modules/campaigns/public.mjs';
import { createCollection, createCollectionStyleVersionAssignment, publishCollection } from '../modules/collections/public.mjs';
import { advanceCommercialCycle, attachOrder, createCommercialCycle } from '../modules/commercial-cycle/public.mjs';
import { openDealSpace } from '../modules/deal-space/public.mjs';
import { createCalendarMilestone } from '../modules/calendar/public.mjs';

export function createWholesalePlatform({
  store,
  productIdentityStore = null,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
  systemActorId = 'system',
} = {}) {
  assertWholesaleStore(store);

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const context = await prepare(tx);
      const result = await action(tx, context);
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

  async function loadStyleVersion(styleVersionId) {
    invariant(productIdentityStore && typeof productIdentityStore.transaction === 'function', 'PRODUCT_IDENTITY_STORE_REQUIRED', 'Product Identity store is required for collection Style Version assignment');
    return productIdentityStore.transaction(async (tx) => {
      invariant(typeof tx.getStyleVersion === 'function', 'PRODUCT_STYLE_VERSION_READER_REQUIRED', 'Product Identity store must expose getStyleVersion');
      return tx.getStyleVersion(styleVersionId);
    });
  }

  return Object.freeze({
    registerOrganisation(commandId, actorId, organisation) {
      return execute(
        commandId,
        `registerOrganisation:${actorId}:${canonicalJson(organisation)}`,
        actorId,
        async () => {
          invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can register organisations');
          return organisation;
        },
        async (tx) => {
          await tx.insertOrganisation(organisation);
          await append(tx, 'organisation.registered', organisation.id, { type: organisation.type }, commandId, actorId);
          return organisation;
        },
      );
    },

    grantMembership(commandId, actorId, membership) {
      return execute(
        commandId,
        `grantMembership:${actorId}:${canonicalJson(membership)}`,
        actorId,
        async (tx) => {
          const organisation = await tx.getOrganisation(membership.organisationId);
          invariant(organisation, 'ORG_NOT_FOUND', 'Membership organisation not found', { organisationId: membership.organisationId });
          invariant(organisation.type === membership.organisationType, 'MEMBERSHIP_ORG_TYPE_MISMATCH', 'Membership organisation type does not match organisation');
          const organisationMemberships = await tx.listMembershipsByOrganisation(organisation.id);
          const replayedBootstrap = actorId === systemActorId && organisationMemberships.some((candidate) => candidate.id === membership.id);
          if (organisationMemberships.length === 0 || replayedBootstrap) {
            invariant(actorId === systemActorId, 'SYSTEM_ACTOR_REQUIRED', 'Only the system actor can bootstrap the first membership');
            invariant(membership.role === 'owner', 'FIRST_MEMBERSHIP_OWNER_REQUIRED', 'The first membership must be owner');
          } else {
            await assertOrganisationActor(tx, organisation.id, actorId, CAPABILITIES.ORGANISATION_MANAGE);
          }
          return organisation;
        },
        async (tx, organisation) => {
          await tx.insertMembership(membership);
          await append(tx, 'membership.granted', membership.id, { organisationId: organisation.id, userId: membership.userId, role: membership.role }, commandId, actorId);
          return membership;
        },
      );
    },

    createCampaign(commandId, actorId, input) {
      return execute(
        commandId,
        `createCampaign:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const brand = await tx.getOrganisation(input.brandId);
          invariant(brand?.type === 'brand', 'BRAND_REQUIRED', 'Campaign owner must be a brand');
          await assertOrganisationActor(tx, brand.id, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return brand;
        },
        async (tx) => {
          const campaign = createCampaign({ id: nextId('campaign'), ...input, createdAt: clock() });
          await tx.insertCampaign(campaign);
          await append(tx, 'campaign.created', campaign.id, { brandId: campaign.brandId, season: campaign.season }, commandId, actorId);
          return campaign;
        },
      );
    },

    openCampaign(commandId, actorId, campaignId) {
      return execute(
        commandId,
        `openCampaign:${actorId}:${campaignId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCampaign(campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.CAMPAIGN_MANAGE);
          return current;
        },
        async (tx, current) => {
          const updated = changeCampaignStatus(current, 'open', clock());
          await tx.saveCampaign(updated, current.version);
          await append(tx, 'campaign.opened', campaignId, { version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    createCollection(commandId, actorId, input) {
      return execute(
        commandId,
        `createCollection:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const campaign = requireEntity(await tx.getCampaign(input.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: input.campaignId });
          await assertOrganisationActor(tx, campaign.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          return campaign;
        },
        async (tx, campaign) => {
          const collection = createCollection({ id: nextId('collection'), campaign, ...input, createdAt: clock() });
          await tx.insertCollection(collection);
          await append(tx, 'collection.created', collection.id, { campaignId: campaign.id, currency: collection.currency }, commandId, actorId);
          return collection;
        },
      );
    },

    assignStyleVersionToCollection(commandId, actorId, input) {
      invariant(input?.collectionId && input?.styleVersionId, 'COLLECTION_STYLE_VERSION_INPUT_REQUIRED', 'collectionId and styleVersionId are required');
      return execute(
        commandId,
        `assignStyleVersionToCollection:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const collection = requireEntity(await tx.getCollection(input.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: input.collectionId });
          await assertOrganisationActor(tx, collection.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          invariant(collection.status === 'draft', 'COLLECTION_ASSORTMENT_LOCKED', 'Style Version assortment can only change while the collection is draft');
          const existing = await tx.getCollectionStyleVersion(collection.id, input.styleVersionId);
          if (existing) return Object.freeze({ collection, existing, styleVersion: null });
          const styleVersion = requireEntity(await loadStyleVersion(input.styleVersionId), 'PRODUCT_STYLE_VERSION_NOT_FOUND', { styleVersionId: input.styleVersionId });
          invariant(styleVersion.brandId === collection.brandId, 'COLLECTION_STYLE_VERSION_BRAND_MISMATCH', 'Style Version brand must match collection brand');
          return Object.freeze({ collection, existing: null, styleVersion });
        },
        async (tx, { collection, existing, styleVersion }) => {
          if (existing) return existing;
          const assignment = createCollectionStyleVersionAssignment({
            id: nextId('collection-style-version'),
            collection,
            styleVersion,
            assignedAt: clock(),
            assignedBy: actorId,
          });
          await tx.insertCollectionStyleVersion(assignment);
          await append(tx, 'collection.style-version-assigned', collection.id, {
            collectionId: collection.id,
            styleVersionId: styleVersion.id,
            brandId: collection.brandId,
          }, commandId, actorId);
          return assignment;
        },
      );
    },

    publishCollection(commandId, actorId, collectionId) {
      return execute(
        commandId,
        `publishCollection:${actorId}:${collectionId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
          const campaign = requireEntity(await tx.getCampaign(current.campaignId), 'CAMPAIGN_NOT_FOUND', { campaignId: current.campaignId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.COLLECTION_MANAGE);
          return Object.freeze({ current, campaign });
        },
        async (tx, { current, campaign }) => {
          const updated = publishCollection(current, campaign, clock());
          await tx.saveCollection(updated, current.version);
          await append(tx, 'collection.published', collectionId, { version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    startCycle(commandId, actorId, { brandId, shopId, campaignId, collectionId }) {
      const input = { brandId, shopId, campaignId, collectionId };
      return execute(
        commandId,
        `startCycle:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
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
          return Object.freeze({ brand, shop, relationship, campaign, collection });
        },
        async (tx, { relationship, campaign, collection }) => {
          const cycle = createCommercialCycle({ id: nextId('cycle'), brandId, shopId, campaign, collection, createdAt: clock() });
          await tx.insertCycle(cycle);
          await append(tx, 'commercial-cycle.started', cycle.id, { ...input, relationshipId: relationship.id }, commandId, actorId);
          return cycle;
        },
      );
    },

    advanceCycle(commandId, actorId, cycleId, targetStage) {
      return execute(
        commandId,
        `advanceCycle:${actorId}:${cycleId}:${targetStage}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE);
          invariant(
            current.stage === 'campaign' || current.stage === 'collection',
            'CYCLE_MANAGED_TRANSITION_REQUIRED',
            'This commercial stage must advance through its dedicated workflow',
            { stage: current.stage, targetStage },
          );
          return current;
        },
        async (tx, current) => {
          const updated = advanceCommercialCycle(current, targetStage, clock());
          await tx.saveCycle(updated, current.version);
          await append(tx, 'commercial-cycle.advanced', cycleId, { from: current.stage, to: targetStage, version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    attachOrder(commandId, actorId, cycleId, order) {
      return execute(
        commandId,
        `attachOrder:${actorId}:${cycleId}:${canonicalJson(order)}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_WRITE);
          const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
          invariant(order.currency === collection.currency, 'ORDER_COLLECTION_CURRENCY_MISMATCH', 'Order currency must match collection currency', {
            orderCurrency: order.currency, collectionCurrency: collection.currency,
          });
          return current;
        },
        async (tx, current) => {
          const updated = attachOrder(current, order, clock());
          await tx.saveCycle(updated, current.version);
          await append(tx, 'order.attached', cycleId, { orderId: order.id, totalAmount: order.totalAmount, currency: order.currency }, commandId, actorId);
          return updated;
        },
      );
    },

    confirmAndOpenDeal(commandId, actorId, cycleId) {
      return execute(
        commandId,
        `confirmAndOpenDeal:${actorId}:${cycleId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          await authorizeTrade(tx, actorId, current, CAPABILITIES.ORDER_CONFIRM);
          return current;
        },
        async (tx, current) => {
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
        },
      );
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