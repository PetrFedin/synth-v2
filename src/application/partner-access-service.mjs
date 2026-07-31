import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { assertTradePair } from '../modules/organisations/public.mjs';
import {
  acceptCounterpartyRelationship,
  assertActiveRelationship,
  createCounterpartyRelationship,
  rejectCounterpartyRelationship,
  renewCounterpartyRelationship,
  revokeCounterpartyRelationship,
} from '../modules/counterparty-relationships/public.mjs';
import {
  acceptShowroomInvitation,
  createShowroomInvitation,
  declineShowroomInvitation,
  renewShowroomInvitation,
  revokeShowroomInvitation,
} from '../modules/showroom-invitations/public.mjs';

export function createPartnerAccessService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
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
    const event = domainEvent({
      id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    });
    await tx.appendOutbox(event);
  }

  function requireEntity(entity, code, details) {
    invariant(entity, code, 'Entity not found', details);
    return entity;
  }

  async function tradeMembership(tx, actorId, brandId, shopId, capability) {
    return assertTradeCapability({
      memberships: await tx.listMembershipsForTrade(brandId, shopId), actorId, brandId, shopId, capability,
    });
  }

  return Object.freeze({
    requestRelationship(commandId, actorId, { brandId, shopId }) {
      return execute(commandId, `requestRelationship:${actorId}:${brandId}:${shopId}`, actorId, async (tx) => {
        const brand = await tx.getOrganisation(brandId);
        const shop = await tx.getOrganisation(shopId);
        assertTradePair({ brand, shop });
        const membership = await tradeMembership(tx, actorId, brandId, shopId, CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE);
        const existing = await tx.getRelationshipByTrade(brandId, shopId);
        const relationship = existing
          ? renewCounterpartyRelationship(existing, membership.organisationId, clock())
          : createCounterpartyRelationship({
              id: nextId('relationship'), brandId, shopId, requestedByOrganisationId: membership.organisationId, createdAt: clock(),
            });
        if (existing) await tx.saveRelationship(relationship, existing.version);
        else await tx.insertRelationship(relationship);
        await append(tx, 'counterparty-relationship.requested', relationship.id, {
          brandId, shopId, requestedByOrganisationId: membership.organisationId, version: relationship.version,
        }, commandId, actorId);
        return relationship;
      });
    },

    acceptRelationship(commandId, actorId, relationshipId) {
      return execute(commandId, `acceptRelationship:${actorId}:${relationshipId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getRelationship(relationshipId), 'RELATIONSHIP_NOT_FOUND', { relationshipId });
        const responderOrganisationId = current.requestedByOrganisationId === current.brandId ? current.shopId : current.brandId;
        const membership = await tx.getMembership(responderOrganisationId, actorId);
        assertCapability(membership, CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE);
        const updated = acceptCounterpartyRelationship(current, responderOrganisationId, clock());
        await tx.saveRelationship(updated, current.version);
        await append(tx, 'counterparty-relationship.accepted', relationshipId, {
          brandId: updated.brandId, shopId: updated.shopId, respondedByOrganisationId: responderOrganisationId,
        }, commandId, actorId);
        return updated;
      });
    },

    rejectRelationship(commandId, actorId, relationshipId) {
      return execute(commandId, `rejectRelationship:${actorId}:${relationshipId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getRelationship(relationshipId), 'RELATIONSHIP_NOT_FOUND', { relationshipId });
        const responderOrganisationId = current.requestedByOrganisationId === current.brandId ? current.shopId : current.brandId;
        const membership = await tx.getMembership(responderOrganisationId, actorId);
        assertCapability(membership, CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE);
        const updated = rejectCounterpartyRelationship(current, responderOrganisationId, clock());
        await tx.saveRelationship(updated, current.version);
        await append(tx, 'counterparty-relationship.rejected', relationshipId, {
          brandId: updated.brandId, shopId: updated.shopId, respondedByOrganisationId: responderOrganisationId,
        }, commandId, actorId);
        return updated;
      });
    },

    revokeRelationship(commandId, actorId, relationshipId) {
      return execute(commandId, `revokeRelationship:${actorId}:${relationshipId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getRelationship(relationshipId), 'RELATIONSHIP_NOT_FOUND', { relationshipId });
        const membership = await tradeMembership(tx, actorId, current.brandId, current.shopId, CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE);
        const updated = revokeCounterpartyRelationship(current, membership.organisationId, clock());
        await tx.saveRelationship(updated, current.version);
        await append(tx, 'counterparty-relationship.revoked', relationshipId, {
          brandId: updated.brandId, shopId: updated.shopId, revokedByOrganisationId: membership.organisationId,
        }, commandId, actorId);
        return updated;
      });
    },

    inviteShopToShowroom(commandId, actorId, { showroomId, shopId, expiresAt }) {
      return execute(commandId, `inviteShopToShowroom:${actorId}:${showroomId}:${shopId}:${expiresAt}`, actorId, async (tx) => {
        const showroom = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
        const membership = await tx.getMembership(showroom.brandId, actorId);
        assertCapability(membership, CAPABILITIES.SHOWROOM_INVITATION_MANAGE);
        const relationship = await tx.getRelationshipByTrade(showroom.brandId, shopId);
        assertActiveRelationship(relationship, { brandId: showroom.brandId, shopId });
        const existing = await tx.getShowroomInvitationByAccess(showroomId, shopId);
        const invitation = existing
          ? renewShowroomInvitation(existing, relationship, expiresAt, clock())
          : createShowroomInvitation({ id: nextId('invitation'), showroom, shopId, relationship, expiresAt, createdAt: clock() });
        if (existing) await tx.saveShowroomInvitation(invitation, existing.version);
        else await tx.insertShowroomInvitation(invitation);
        await append(tx, 'showroom-invitation.created', invitation.id, {
          showroomId, brandId: showroom.brandId, shopId, expiresAt, version: invitation.version,
        }, commandId, actorId);
        return invitation;
      });
    },

    acceptShowroomInvitation(commandId, actorId, invitationId) {
      return execute(commandId, `acceptShowroomInvitation:${actorId}:${invitationId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getShowroomInvitation(invitationId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId });
        const membership = await tx.getMembership(current.shopId, actorId);
        assertCapability(membership, CAPABILITIES.SHOWROOM_INVITATION_ACCEPT);
        const relationship = await tx.getRelationshipByTrade(current.brandId, current.shopId);
        assertActiveRelationship(relationship, { brandId: current.brandId, shopId: current.shopId });
        const updated = acceptShowroomInvitation(current, membership.organisationId, clock());
        await tx.saveShowroomInvitation(updated, current.version);
        await append(tx, 'showroom-invitation.accepted', invitationId, {
          showroomId: updated.showroomId, shopId: updated.shopId,
        }, commandId, actorId);
        return updated;
      });
    },

    declineShowroomInvitation(commandId, actorId, invitationId) {
      return execute(commandId, `declineShowroomInvitation:${actorId}:${invitationId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getShowroomInvitation(invitationId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId });
        const membership = await tx.getMembership(current.shopId, actorId);
        assertCapability(membership, CAPABILITIES.SHOWROOM_INVITATION_ACCEPT);
        const updated = declineShowroomInvitation(current, membership.organisationId, clock());
        await tx.saveShowroomInvitation(updated, current.version);
        await append(tx, 'showroom-invitation.declined', invitationId, {
          showroomId: updated.showroomId, shopId: updated.shopId,
        }, commandId, actorId);
        return updated;
      });
    },

    revokeShowroomInvitation(commandId, actorId, invitationId) {
      return execute(commandId, `revokeShowroomInvitation:${actorId}:${invitationId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getShowroomInvitation(invitationId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId });
        const membership = await tx.getMembership(current.brandId, actorId);
        assertCapability(membership, CAPABILITIES.SHOWROOM_INVITATION_MANAGE);
        const updated = revokeShowroomInvitation(current, membership.organisationId, clock());
        await tx.saveShowroomInvitation(updated, current.version);
        await append(tx, 'showroom-invitation.revoked', invitationId, {
          showroomId: updated.showroomId, shopId: updated.shopId,
        }, commandId, actorId);
        return updated;
      });
    },
  });
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
