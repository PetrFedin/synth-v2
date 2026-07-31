import { invariant } from '../core/errors.mjs';
import { membershipKey } from '../modules/access-control/public.mjs';
import { relationshipKey } from '../modules/counterparty-relationships/public.mjs';
import { showroomInvitationKey } from '../modules/showroom-invitations/public.mjs';

export function createMemoryWholesaleStore() {
  let state = emptyState();
  let transactionTail = Promise.resolve();

  function transaction(work) {
    const run = transactionTail.then(async () => {
      const draft = cloneState(state);
      const tx = transactionView(draft);
      const result = await work(tx);
      state = draft;
      return result;
    });
    transactionTail = run.catch(() => undefined);
    return run;
  }

  return Object.freeze({
    transaction,
    snapshot() { return freezeSnapshot(state); },
    readOutbox(status = 'pending') { return [...state.outbox.values()].filter((record) => record.status === status); },
    async markOutboxPublished(eventIds, publishedAt) {
      return transaction((tx) => { for (const eventId of eventIds) tx.markOutboxPublished(eventId, publishedAt); });
    },
  });
}

function emptyState() {
  return {
    organisations: new Map(), memberships: new Map(), relationships: new Map(), showroomInvitations: new Map(),
    campaigns: new Map(), collections: new Map(), showrooms: new Map(), selections: new Map(), orders: new Map(),
    cycles: new Map(), deals: new Map(), calendar: new Map(), commands: new Map(), outbox: new Map(),
  };
}
function cloneState(state) { return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, new Map(value)])); }

function transactionView(state) {
  return Object.freeze({
    getOrganisation: (id) => state.organisations.get(id),
    insertOrganisation: (organisation) => insertUnique(state.organisations, organisation.id, organisation, 'ORG_ALREADY_EXISTS'),
    getMembership: (organisationId, userId) => state.memberships.get(membershipKey(organisationId, userId)),
    listMembershipsByOrganisation: (organisationId) => [...state.memberships.values()].filter((item) => item.organisationId === organisationId),
    listMembershipsForTrade: (brandId, shopId) => [...state.memberships.values()].filter((item) => item.organisationId === brandId || item.organisationId === shopId),
    insertMembership: (membership) => insertUnique(state.memberships, membershipKey(membership.organisationId, membership.userId), membership, 'MEMBERSHIP_ALREADY_EXISTS'),

    getRelationship: (id) => [...state.relationships.values()].find((item) => item.id === id),
    getRelationshipByTrade: (brandId, shopId) => state.relationships.get(relationshipKey(brandId, shopId)),
    insertRelationship: (relationship) => insertUnique(state.relationships, relationshipKey(relationship.brandId, relationship.shopId), relationship, 'RELATIONSHIP_ALREADY_EXISTS'),
    saveRelationship: (relationship, expectedVersion) => saveVersioned(state.relationships, relationship, expectedVersion, 'RELATIONSHIP_CONCURRENCY_CONFLICT', relationshipKey(relationship.brandId, relationship.shopId)),

    getShowroomInvitation: (id) => [...state.showroomInvitations.values()].find((item) => item.id === id),
    getShowroomInvitationByAccess: (showroomId, shopId) => state.showroomInvitations.get(showroomInvitationKey(showroomId, shopId)),
    insertShowroomInvitation: (invitation) => insertUnique(state.showroomInvitations, showroomInvitationKey(invitation.showroomId, invitation.shopId), invitation, 'SHOWROOM_INVITATION_ALREADY_EXISTS'),
    saveShowroomInvitation: (invitation, expectedVersion) => saveVersioned(state.showroomInvitations, invitation, expectedVersion, 'SHOWROOM_INVITATION_CONCURRENCY_CONFLICT', showroomInvitationKey(invitation.showroomId, invitation.shopId)),

    getCampaign: (id) => state.campaigns.get(id),
    insertCampaign: (campaign) => insertUnique(state.campaigns, campaign.id, campaign, 'CAMPAIGN_ALREADY_EXISTS'),
    saveCampaign: (campaign, expectedVersion) => saveVersioned(state.campaigns, campaign, expectedVersion, 'CAMPAIGN_CONCURRENCY_CONFLICT'),
    getCollection: (id) => state.collections.get(id),
    insertCollection: (collection) => insertUnique(state.collections, collection.id, collection, 'COLLECTION_ALREADY_EXISTS'),
    saveCollection: (collection, expectedVersion) => saveVersioned(state.collections, collection, expectedVersion, 'COLLECTION_CONCURRENCY_CONFLICT'),
    getShowroom: (id) => state.showrooms.get(id),
    insertShowroom: (showroom) => insertUnique(state.showrooms, showroom.id, showroom, 'SHOWROOM_ALREADY_EXISTS'),
    saveShowroom: (showroom, expectedVersion) => saveVersioned(state.showrooms, showroom, expectedVersion, 'SHOWROOM_CONCURRENCY_CONFLICT'),
    getSelection: (id) => state.selections.get(id),
    getSelectionByCycle: (cycleId) => [...state.selections.values()].find((item) => item.cycleId === cycleId),
    insertSelection: (selection) => insertUnique(state.selections, selection.id, selection, 'SELECTION_ALREADY_EXISTS'),
    saveSelection: (selection, expectedVersion) => saveVersioned(state.selections, selection, expectedVersion, 'SELECTION_CONCURRENCY_CONFLICT'),
    getOrder: (id) => state.orders.get(id),
    getOrderByCycle: (cycleId) => [...state.orders.values()].find((item) => item.cycleId === cycleId),
    insertOrder: (order) => insertUnique(state.orders, order.id, order, 'ORDER_ALREADY_EXISTS'),
    saveOrder: (order, expectedVersion) => saveVersioned(state.orders, order, expectedVersion, 'ORDER_CONCURRENCY_CONFLICT'),
    getCycle: (id) => state.cycles.get(id),
    insertCycle: (cycle) => insertUnique(state.cycles, cycle.id, cycle, 'CYCLE_ALREADY_EXISTS'),
    saveCycle: (cycle, expectedVersion) => saveVersioned(state.cycles, cycle, expectedVersion, 'CYCLE_CONCURRENCY_CONFLICT'),
    insertDeal: (deal) => insertUnique(state.deals, deal.id, deal, 'DEAL_ALREADY_EXISTS'),
    insertCalendarMilestone: (milestone) => insertUnique(state.calendar, milestone.id, milestone, 'CALENDAR_MILESTONE_ALREADY_EXISTS'),
    getCommand: (id) => state.commands.get(id),
    insertCommand: (command) => insertUnique(state.commands, command.id, command, 'COMMAND_ALREADY_EXISTS'),
    appendOutbox: (event) => insertUnique(state.outbox, event.id, Object.freeze({ event, status: 'pending', publishedAt: null }), 'OUTBOX_EVENT_ALREADY_EXISTS'),
    markOutboxPublished: (eventId, publishedAt) => {
      const current = state.outbox.get(eventId);
      invariant(current, 'OUTBOX_EVENT_NOT_FOUND', 'Outbox event not found', { eventId });
      state.outbox.set(eventId, Object.freeze({ ...current, status: 'published', publishedAt }));
    },
  });
}

function insertUnique(map, key, value, code) {
  invariant(!map.has(key), code, 'Entity already exists', { key });
  map.set(key, value);
}
function saveVersioned(map, entity, expectedVersion, code, key = entity.id) {
  const current = map.get(key);
  invariant(current, 'ENTITY_NOT_FOUND', 'Versioned entity not found', { id: entity.id });
  invariant(current.version === expectedVersion, code, 'Optimistic concurrency conflict', { id: entity.id, expectedVersion, actualVersion: current.version });
  invariant(entity.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once', { id: entity.id, expectedVersion, nextVersion: entity.version });
  map.set(key, entity);
}
function freezeSnapshot(state) {
  return Object.freeze({
    organisations: [...state.organisations.values()], memberships: [...state.memberships.values()],
    relationships: [...state.relationships.values()], showroomInvitations: [...state.showroomInvitations.values()],
    campaigns: [...state.campaigns.values()], collections: [...state.collections.values()], showrooms: [...state.showrooms.values()],
    selections: [...state.selections.values()], orders: [...state.orders.values()], cycles: [...state.cycles.values()], deals: [...state.deals.values()],
    calendar: [...state.calendar.values()], commands: [...state.commands.values()], outbox: [...state.outbox.values()],
    events: [...state.outbox.values()].map((record) => record.event),
  });
}
