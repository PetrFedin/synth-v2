(function initializeUiCapabilities(global) {
  'use strict';

  const CAPABILITIES = Object.freeze({
    ORGANISATION_MANAGE: 'organisation.manage',
    CAMPAIGN_MANAGE: 'campaign.manage',
    COLLECTION_MANAGE: 'collection.manage',
    CATALOG_MANAGE: 'catalog.manage',
    PRODUCT_READ: 'product.read',
    PRODUCT_MANAGE: 'product.manage',
    BOM_READ: 'bom.read',
    BOM_MANAGE: 'bom.manage',
    MEASUREMENT_READ: 'measurement.read',
    MEASUREMENT_MANAGE: 'measurement.manage',
    SAMPLE_READ: 'sample.read',
    SAMPLE_MANAGE: 'sample.manage',
    TECH_PACK_READ: 'tech-pack.read',
    TECH_PACK_MANAGE: 'tech-pack.manage',
    TECH_PACK_ACKNOWLEDGE: 'tech-pack.acknowledge',
    SUPPLIER_READ: 'supplier.read',
    SUPPLIER_MANAGE: 'supplier.manage',
    SOURCING_READ: 'sourcing.read',
    SOURCING_MANAGE: 'sourcing.manage',
    SOURCING_AWARD: 'sourcing.award',
    PRODUCTION_ALLOCATE: 'production.allocate',
    PRODUCTION_ORDER_READ: 'production-order.read',
    PRODUCTION_ORDER_MANAGE: 'production-order.manage',
    PRODUCTION_ORDER_CONFIRM: 'production-order.confirm',
    PRODUCTION_EXECUTION_READ: 'production-execution.read',
    PRODUCTION_EXECUTION_MANAGE: 'production-execution.manage',
    QUALITY_READ: 'quality.read',
    QUALITY_MANAGE: 'quality.manage',
    QUALITY_APPROVE: 'quality.approve',
    SHOWROOM_MANAGE: 'showroom.manage',
    PARTNER_RELATIONSHIP_MANAGE: 'partner-relationship.manage',
    SHOWROOM_INVITATION_MANAGE: 'showroom-invitation.manage',
    SHOWROOM_INVITATION_ACCEPT: 'showroom-invitation.accept',
    SELECTION_WRITE: 'selection.write',
    COMMERCIAL_CYCLE_CREATE: 'commercial-cycle.create',
    COMMERCIAL_CYCLE_ADVANCE: 'commercial-cycle.advance',
    ORDER_WRITE: 'order.write',
    ORDER_CONFIRM: 'order.confirm',
    SUPPLY_MANAGE: 'supply.manage',
    FULFILLMENT_MANAGE: 'fulfillment.manage',
    RECEIPT_MANAGE: 'receipt.manage',
    LOGISTICS_READ: 'logistics.read',
    INVENTORY_MANAGE: 'inventory.manage',
    INVENTORY_READ: 'inventory.read',
    CLAIM_MANAGE: 'claim.manage',
    CLAIM_RESOLVE: 'claim.resolve',
    CLAIM_READ: 'claim.read',
    COST_MANAGE: 'cost.manage',
    MARGIN_READ: 'margin.read',
    DEAL_READ: 'deal.read',
    CALENDAR_READ: 'calendar.read',
  });

  const ALL = Object.freeze(Object.values(CAPABILITIES));
  const BY_ROLE = Object.freeze({
    owner: ALL,
    admin: ALL,
    sales: Object.freeze([
      CAPABILITIES.CAMPAIGN_MANAGE,
      CAPABILITIES.COLLECTION_MANAGE,
      CAPABILITIES.CATALOG_MANAGE,
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.PRODUCT_MANAGE,
      CAPABILITIES.MEASUREMENT_READ,
      CAPABILITIES.SAMPLE_READ,
      CAPABILITIES.TECH_PACK_READ,
      CAPABILITIES.SUPPLIER_READ,
      CAPABILITIES.SOURCING_READ,
      CAPABILITIES.PRODUCTION_ORDER_READ,
      CAPABILITIES.PRODUCTION_ORDER_MANAGE,
      CAPABILITIES.PRODUCTION_EXECUTION_READ,
      CAPABILITIES.PRODUCTION_EXECUTION_MANAGE,
      CAPABILITIES.QUALITY_READ,
      CAPABILITIES.QUALITY_MANAGE,
      CAPABILITIES.SHOWROOM_MANAGE,
      CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE,
      CAPABILITIES.SHOWROOM_INVITATION_MANAGE,
      CAPABILITIES.COMMERCIAL_CYCLE_CREATE,
      CAPABILITIES.COMMERCIAL_CYCLE_ADVANCE,
      CAPABILITIES.ORDER_WRITE,
      CAPABILITIES.ORDER_CONFIRM,
      CAPABILITIES.SUPPLY_MANAGE,
      CAPABILITIES.FULFILLMENT_MANAGE,
      CAPABILITIES.LOGISTICS_READ,
      CAPABILITIES.CLAIM_RESOLVE,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.MARGIN_READ,
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
      CAPABILITIES.RECEIPT_MANAGE,
      CAPABILITIES.LOGISTICS_READ,
      CAPABILITIES.INVENTORY_MANAGE,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_MANAGE,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.DEAL_READ,
      CAPABILITIES.CALENDAR_READ,
    ]),
    finance: Object.freeze([
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.BOM_READ,
      CAPABILITIES.TECH_PACK_READ,
      CAPABILITIES.SUPPLIER_READ,
      CAPABILITIES.SOURCING_READ,
      CAPABILITIES.PRODUCTION_ORDER_READ,
      CAPABILITIES.PRODUCTION_EXECUTION_READ,
      CAPABILITIES.QUALITY_READ,
      CAPABILITIES.ORDER_CONFIRM,
      CAPABILITIES.LOGISTICS_READ,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.COST_MANAGE,
      CAPABILITIES.MARGIN_READ,
      CAPABILITIES.DEAL_READ,
      CAPABILITIES.CALENDAR_READ,
    ]),
    viewer: Object.freeze([
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.DEAL_READ,
      CAPABILITIES.CALENDAR_READ,
    ]),
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
