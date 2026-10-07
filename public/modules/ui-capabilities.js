(function initializeUiCapabilities(global) {
  'use strict';

  const CAPABILITIES = Object.freeze({
    ORGANISATION_MANAGE: 'organisation.manage',
    MEMBERSHIP_MANAGE: 'membership.manage',
    CAMPAIGN_MANAGE: 'campaign.manage',
    COLLECTION_MANAGE: 'collection.manage',
    CATALOG_MANAGE: 'catalog.manage',
    PRODUCT_READ: 'product.read',
    PRODUCT_MANAGE: 'product.manage',
    PRODUCT_ENGINEERING_READ: 'product-engineering.read',
    PRODUCT_ENGINEERING_MANAGE: 'product-engineering.manage',
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
    MATERIAL_PURCHASE_MANAGE: 'material-purchase.manage',
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
    RETAIL_DOOR_READ: 'retail-door.read',
    RETAIL_DOOR_MANAGE: 'retail-door.manage',
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
    COLLABORATION_READ: 'collaboration.read',
    COLLABORATION_WRITE: 'collaboration.write',
    DECISION_RECORD: 'decision.record',
    CALENDAR_READ: 'calendar.read',
    COMPLIANCE_DOCUMENT_READ: 'compliance-document.read',
    COMPLIANCE_DOCUMENT_MANAGE: 'compliance-document.manage',
    PRODUCT_CERTIFICATION_READ: 'product-certification.read',
    PRODUCT_CERTIFICATION_MANAGE: 'product-certification.manage',
    SELECTION_APPROVE: 'selection.approve',
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
      CAPABILITIES.PRODUCT_ENGINEERING_READ,
      CAPABILITIES.PRODUCT_ENGINEERING_MANAGE,
      CAPABILITIES.MEASUREMENT_READ,
      CAPABILITIES.SAMPLE_READ,
      CAPABILITIES.TECH_PACK_READ,
      CAPABILITIES.SUPPLIER_READ,
      CAPABILITIES.SOURCING_READ,
      CAPABILITIES.PRODUCTION_ORDER_READ,
      CAPABILITIES.PRODUCTION_ORDER_MANAGE,
      CAPABILITIES.PRODUCTION_EXECUTION_READ,
    // Продажи видят качество, но не подписывают его: тот, кто продаёт партию, не может сам
    // решить, что она годна. Это разделение обязанностей, а не формальность — на нём стоит вся
    // приёмочная часть, и аудитор спрашивает про него первым.
      CAPABILITIES.QUALITY_READ,
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
      CAPABILITIES.COLLABORATION_READ,
      CAPABILITIES.COLLABORATION_WRITE,
      CAPABILITIES.DECISION_RECORD,
      CAPABILITIES.CALENDAR_READ,
      CAPABILITIES.COMPLIANCE_DOCUMENT_READ,
      CAPABILITIES.PRODUCT_CERTIFICATION_READ,
  ]),
  production: Object.freeze([
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.PRODUCT_ENGINEERING_READ,
      CAPABILITIES.PRODUCT_ENGINEERING_MANAGE,
      CAPABILITIES.BOM_READ,
      CAPABILITIES.MEASUREMENT_READ,
      CAPABILITIES.SAMPLE_READ,
      CAPABILITIES.TECH_PACK_READ,
      CAPABILITIES.TECH_PACK_MANAGE,
      CAPABILITIES.SUPPLIER_READ,
      CAPABILITIES.SOURCING_READ,
      CAPABILITIES.SOURCING_MANAGE,
      CAPABILITIES.PRODUCTION_ALLOCATE,
      CAPABILITIES.MATERIAL_PURCHASE_MANAGE,
      CAPABILITIES.PRODUCTION_ORDER_READ,
      CAPABILITIES.PRODUCTION_ORDER_MANAGE,
      CAPABILITIES.PRODUCTION_EXECUTION_READ,
      CAPABILITIES.PRODUCTION_EXECUTION_MANAGE,
      CAPABILITIES.QUALITY_READ,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.INVENTORY_MANAGE,
      CAPABILITIES.LOGISTICS_READ,
      CAPABILITIES.COLLABORATION_READ,
      CAPABILITIES.COLLABORATION_WRITE,
      CAPABILITIES.DECISION_RECORD,
      CAPABILITIES.CALENDAR_READ,
      CAPABILITIES.PRODUCT_CERTIFICATION_READ,
  ]),
  quality: Object.freeze([
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.PRODUCT_ENGINEERING_READ,
      CAPABILITIES.BOM_READ,
      CAPABILITIES.MEASUREMENT_READ,
      CAPABILITIES.SAMPLE_READ,
      CAPABILITIES.TECH_PACK_READ,
      CAPABILITIES.SUPPLIER_READ,
      CAPABILITIES.PRODUCTION_ORDER_READ,
      CAPABILITIES.PRODUCTION_EXECUTION_READ,
      CAPABILITIES.QUALITY_READ,
      CAPABILITIES.QUALITY_MANAGE,
      CAPABILITIES.QUALITY_APPROVE,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.COLLABORATION_READ,
      CAPABILITIES.COLLABORATION_WRITE,
      CAPABILITIES.DECISION_RECORD,
      CAPABILITIES.CALENDAR_READ,
      CAPABILITIES.PRODUCT_CERTIFICATION_READ,
      CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE,
  ]),
    buyer: Object.freeze([
      CAPABILITIES.PARTNER_RELATIONSHIP_MANAGE,
      CAPABILITIES.SHOWROOM_INVITATION_ACCEPT,
      CAPABILITIES.RETAIL_DOOR_READ,
      CAPABILITIES.RETAIL_DOOR_MANAGE,
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
      CAPABILITIES.COLLABORATION_READ,
      CAPABILITIES.COLLABORATION_WRITE,
      CAPABILITIES.DECISION_RECORD,
      CAPABILITIES.CALENDAR_READ,
      CAPABILITIES.COMPLIANCE_DOCUMENT_READ,
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
      CAPABILITIES.RETAIL_DOOR_READ,
      CAPABILITIES.ORDER_CONFIRM,
      CAPABILITIES.LOGISTICS_READ,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.COST_MANAGE,
      CAPABILITIES.MARGIN_READ,
      CAPABILITIES.DEAL_READ,
      CAPABILITIES.COLLABORATION_READ,
      CAPABILITIES.COLLABORATION_WRITE,
      CAPABILITIES.DECISION_RECORD,
      CAPABILITIES.CALENDAR_READ,
      CAPABILITIES.COMPLIANCE_DOCUMENT_READ,
      CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE,
      CAPABILITIES.SELECTION_APPROVE,
    ]),
    viewer: Object.freeze([
      CAPABILITIES.PRODUCT_READ,
      CAPABILITIES.RETAIL_DOOR_READ,
      CAPABILITIES.INVENTORY_READ,
      CAPABILITIES.CLAIM_READ,
      CAPABILITIES.DEAL_READ,
      CAPABILITIES.COLLABORATION_READ,
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

  // Пункт меню и вкладка раздела видны, только если у роли есть хотя бы одно право, на котором
  // держится чтение их данных. Список соответствия — единственный: меню, вкладки и экраны читают
  // его отсюда, а не заводят каждый свой. Вид, которого здесь нет, открыт всем: так остаются
  // справочники, уведомления и «Ждёт вас» (там отбор делает сам сервер).
  const C = CAPABILITIES;
  const VIEW_READ_CAPABILITIES = Object.freeze({
    planning: Object.freeze([C.PRODUCT_READ, C.CAMPAIGN_MANAGE, C.COLLECTION_MANAGE]),
    catalog: Object.freeze([C.PRODUCT_READ, C.CATALOG_MANAGE, C.COLLECTION_MANAGE, C.DEAL_READ]),
    styles: Object.freeze([C.PRODUCT_READ]),
    'season-palette': Object.freeze([C.PRODUCT_READ]),
    materials: Object.freeze([C.PRODUCT_READ, C.BOM_READ]),
    boms: Object.freeze([C.BOM_READ]),
    measurements: Object.freeze([C.MEASUREMENT_READ]),
    samples: Object.freeze([C.SAMPLE_READ]),
    'tech-packs': Object.freeze([C.TECH_PACK_READ]),
    suppliers: Object.freeze([C.SUPPLIER_READ]),
    rfqs: Object.freeze([C.SOURCING_READ]),
    quotations: Object.freeze([C.SOURCING_READ]),
    production: Object.freeze([C.SOURCING_READ, C.PRODUCTION_ORDER_READ]),
    'material-rfqs': Object.freeze([C.SOURCING_READ]),
    'material-purchase-orders': Object.freeze([C.SOURCING_READ]),
    'production-orders': Object.freeze([C.PRODUCTION_ORDER_READ]),
    'production-executions': Object.freeze([C.PRODUCTION_EXECUTION_READ]),
    'final-quality': Object.freeze([C.QUALITY_READ]),
    showrooms: Object.freeze([C.DEAL_READ, C.SHOWROOM_MANAGE, C.SHOWROOM_INVITATION_ACCEPT]),
    linesheets: Object.freeze([C.DEAL_READ]),
    partners: Object.freeze([C.PARTNER_RELATIONSHIP_MANAGE, C.SHOWROOM_INVITATION_MANAGE, C.SHOWROOM_INVITATION_ACCEPT, C.RETAIL_DOOR_READ, C.COMPLIANCE_DOCUMENT_READ, C.MEMBERSHIP_MANAGE, C.ORGANISATION_MANAGE]),
    selections: Object.freeze([C.SELECTION_WRITE, C.SELECTION_APPROVE, C.DEAL_READ]),
    orders: Object.freeze([C.ORDER_WRITE, C.ORDER_CONFIRM, C.DEAL_READ, C.LOGISTICS_READ]),
    calendar: Object.freeze([C.CALENDAR_READ]),
  });

  // Вкладки экрана «Контрагенты и доступы»: то, что видно не всем, а тем, у кого есть право на данные.
  const PARTNERS_TAB_READ_CAPABILITIES = Object.freeze({
    roles: Object.freeze([C.MEMBERSHIP_MANAGE, C.ORGANISATION_MANAGE]),
    'legal-entities': Object.freeze([C.ORGANISATION_MANAGE]),
    'compliance-documents': Object.freeze([C.COMPLIANCE_DOCUMENT_READ]),
    'retail-doors': Object.freeze([C.RETAIL_DOOR_READ]),
  });

  function holdsAny(workspace, capabilities) {
    return capabilities.some(capability => hasAny(workspace, capability));
  }

  // Без единого активного членства судить не по чему (портал поставщика, рабочее пространство ещё
  // не загружено): прятать по догадке значило бы оставить человека без меню.
  function judgeable(workspace) {
    return activeMemberships(workspace).length > 0;
  }

  function canOpenView(workspace, view) {
    const needed = VIEW_READ_CAPABILITIES[view];
    if (!needed || !judgeable(workspace)) return true;
    return holdsAny(workspace, needed);
  }

  function canOpenPartnersTab(workspace, tab) {
    const needed = PARTNERS_TAB_READ_CAPABILITIES[tab];
    if (!needed || !judgeable(workspace)) return true;
    return holdsAny(workspace, needed);
  }

  global.SynthaUiCapabilities = Object.freeze({
    CAPABILITIES, hasForOrganisation, hasForTrade, hasAny, organisationIds,
    VIEW_READ_CAPABILITIES, PARTNERS_TAB_READ_CAPABILITIES, canOpenView, canOpenPartnersTab,
  });
})(window);
