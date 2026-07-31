import { invariant } from '../../core/errors.mjs';

export const CAPABILITIES = Object.freeze({
  ORGANISATION_MANAGE: 'organisation.manage',
  CAMPAIGN_MANAGE: 'campaign.manage',
  COLLECTION_MANAGE: 'collection.manage',
  CATALOG_MANAGE: 'catalog.manage',
  SHOWROOM_MANAGE: 'showroom.manage',
  PARTNER_RELATIONSHIP_MANAGE: 'partner-relationship.manage',
  SHOWROOM_INVITATION_MANAGE: 'showroom-invitation.manage',
  SHOWROOM_INVITATION_ACCEPT: 'showroom-invitation.accept',
  SELECTION_WRITE: 'selection.write',
  COMMERCIAL_CYCLE_CREATE: 'commercial-cycle.create',
  COMMERCIAL_CYCLE_ADVANCE: 'commercial-cycle.advance',
  ORDER_WRITE: 'order.write',
  ORDER_CONFIRM: 'order.confirm',
  DEAL_READ: 'deal.read',
  CALENDAR_READ: 'calendar.read',
});

const ALL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

const ROLE_CAPABILITIES = Object.freeze({
  owner: ALL_CAPABILITIES,
  admin: ALL_CAPABILITIES,
  sales: Object.freeze([
    CAPABILITIES.CAMPAIGN_MANAGE,
    CAPABILITIES.COLLECTION_MANAGE,
    CAPABILITIES.CATALOG_MANAGE,
    CAPABILITIES.SHOWROOM_MANAGE,
    CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE,
    CAPABILITIES.SHOWROOM_INVITATION_MANAGE,
    CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
    CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE,
    CAPABILITIES.ORDER_WRITE,
    CAPABILITIES.ORDER_CONFIRM,
    CAPABILITIES.DEAL_READ,
    CAPABILITIES.CALENDAR_READ,
  ]),
  buyer: Object.freeze([
    CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE,
    CAPABILITIES.SHOWROOM_INVITATION_ACCEPT,
    CAPABILITIES.SELECTION_WRITE,
    CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
    CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE,
    CAPABILITIES.ORDER_WRITE,
    CAPABILITIES.ORDER_CONFIRM,
    CAPABILITIES.DEAL_READ,
    CAPABILITIES.CALENDAR_READ,
  ]),
  finance: Object.freeze([
    CAPABILITIES.ORDER_CONFIRM,
    CAPABILITIES.DEAL_READ,
    CAPABILITIES.CALENDAR_READ,
  ]),
  viewer: Object.freeze([
    CAPABILITIES.DEAL_READ,
    CAPABILITIES.CALENDAR_READ,
  ]),
});

const ALLOWED_ROLES = Object.freeze({
  brand: Object.freeze(['owner', 'admin', 'sales', 'finance', 'viewer']),
  shop: Object.freeze(['owner', 'admin', 'buyer', 'finance', 'viewer']),
});

export function createMembership({ id, organisationId, organisationType, userId, role, createdAt }) {
  invariant(id, 'MEMBERSHIP_ID_REQUIRED', 'Membership id is required');
  invariant(organisationId, 'MEMBERSHIP_ORGANISATION_REQUIRED', 'Membership organisation is required');
  invariant(userId, 'MEMBERSHIP_USER_REQUIRED', 'Membership user is required');
  invariant(ALLOWED_ROLES[organisationType]?.includes(role), 'MEMBERSHIP_ROLE_INVALID', 'Role is not valid for organisation type', { organisationType, role });
  return Object.freeze({ id, organisationId, organisationType, userId, role, status: 'active', createdAt });
}

export function membershipKey(organisationId, userId) { return `${organisationId}:${userId}`; }

export function assertCapability(membership, capability) {
  invariant(membership?.status === 'active', 'ACTIVE_MEMBERSHIP_REQUIRED', 'Active organisation membership is required', { capability });
  invariant(ROLE_CAPABILITIES[membership.role]?.includes(capability), 'CAPABILITY_DENIED', 'Role does not grant required capability', { role: membership.role, capability, organisationId: membership.organisationId });
}

export function assertTradeCapability({ memberships, actorId, brandId, shopId, capability }) {
  const membership = memberships.find((candidate) => candidate.userId === actorId && candidate.status === 'active' && (candidate.organisationId === brandId || candidate.organisationId === shopId));
  invariant(membership, 'TRADE_MEMBERSHIP_REQUIRED', 'Actor must belong to one of the trade organisations', { actorId, brandId, shopId, capability });
  assertCapability(membership, capability);
  return membership;
}
