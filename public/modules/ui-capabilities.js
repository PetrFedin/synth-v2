(function initializeUiCapabilities(global) {
  'use strict';

  const CAPABILITIES = Object.freeze({
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
  });

  const ALL = Object.freeze(Object.values(CAPABILITIES));
  const BY_ROLE = Object.freeze({
    owner: ALL,
    admin: ALL,
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
    ]),
    buyer: Object.freeze([
      CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE,
      CAPABILITIES.SHOWROOM_INVITATION_ACCEPT,
      CAPABILITIES.SELECTION_WRITE,
      CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
      CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE,
      CAPABILITIES.ORDER_WRITE,
      CAPABILITIES.ORDER_CONFIRM,
    ]),
    finance: Object.freeze([CAPABILITIES.ORDER_CONFIRM]),
    viewer: Object.freeze([]),
  });

  function activeMemberships(workspace = {}) {
    return (Array.isArray(workspace.memberships) ? workspace.memberships : []).filter(item => item.status === 'active');
  }

  function hasForOrganisation(workspace, organisationId, capability) {
    return activeMemberships(workspace).some(item => item.organisationId === organisationId && (BY_ROLE[item.role] || []).includes(capability));
  }

  function hasForTrade(workspace, brandId, shopId, capability) {
    return hasForOrganisation(workspace, brandId, capability) || hasForOrganisation(workspace, shopId, capability);
  }

  function hasAny(workspace, capability, organisationType) {
    const organisations = new Map((workspace.organisations || []).map(item => [item.id, item]));
    return activeMemberships(workspace).some(item => {
      const organisation = organisations.get(item.organisationId);
      return (!organisationType || organisation?.type === organisationType) && (BY_ROLE[item.role] || []).includes(capability);
    });
  }

  function organisationIds(workspace, capability, organisationType) {
    const organisations = new Map((workspace.organisations || []).map(item => [item.id, item]));
    return Object.freeze(activeMemberships(workspace)
      .filter(item => (!organisationType || organisations.get(item.organisationId)?.type === organisationType) && (BY_ROLE[item.role] || []).includes(capability))
      .map(item => item.organisationId));
  }

  global.SynthaUiCapabilities = Object.freeze({ CAPABILITIES, hasForOrganisation, hasForTrade, hasAny, organisationIds });
})(window);
