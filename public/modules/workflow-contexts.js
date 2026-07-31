(function initializeWorkflowContexts(global) {
  'use strict';

  function buildCycleContexts(workspace = {}, ownedOrganisationIds = []) {
    const owned = new Set(ownedOrganisationIds);
    const relationships = list(workspace.relationships).filter(item => item.status === 'active' && (owned.has(item.brandId) || owned.has(item.shopId)));
    const campaigns = list(workspace.campaigns).filter(item => item.status === 'open');
    const collections = list(workspace.collections).filter(item => item.status === 'published');
    const contexts = new Map();

    for (const relationship of relationships) {
      for (const campaign of campaigns) {
        if (campaign.brandId !== relationship.brandId) continue;
        for (const collection of collections) {
          if (collection.brandId !== relationship.brandId || collection.campaignId !== campaign.id) continue;
          const key = [relationship.id, campaign.id, collection.id].join('|');
          contexts.set(key, Object.freeze({
            id: key,
            relationshipId: relationship.id,
            brandId: relationship.brandId,
            shopId: relationship.shopId,
            campaignId: campaign.id,
            collectionId: collection.id,
          }));
        }
      }
    }

    return Object.freeze([...contexts.values()].sort(byId));
  }

  function buildSelectionContexts(workspace = {}, ownedOrganisationIds = [], now = new Date().toISOString()) {
    const owned = new Set(ownedOrganisationIds);
    const relationships = list(workspace.relationships).filter(item => item.status === 'active');
    const cycles = list(workspace.cycles).filter(item => item.stage === 'showroom' && owned.has(item.shopId));
    const showrooms = list(workspace.showrooms).filter(item => item.status === 'open');
    const invitations = list(workspace.invitations).filter(item => item.status === 'accepted' && isFuture(item.expiresAt, now));
    const contexts = new Map();

    for (const cycle of cycles) {
      const relationship = relationships.find(item => item.brandId === cycle.brandId && item.shopId === cycle.shopId);
      if (!relationship) continue;
      for (const showroom of showrooms) {
        if (showroom.brandId !== cycle.brandId || showroom.collectionId !== cycle.collectionId) continue;
        const invitation = invitations.find(item => item.showroomId === showroom.id && item.brandId === cycle.brandId && item.shopId === cycle.shopId);
        if (!invitation) continue;
        const key = [cycle.id, showroom.id, invitation.id].join('|');
        contexts.set(key, Object.freeze({
          id: key,
          cycleId: cycle.id,
          showroomId: showroom.id,
          invitationId: invitation.id,
          brandId: cycle.brandId,
          shopId: cycle.shopId,
          collectionId: cycle.collectionId,
        }));
      }
    }

    return Object.freeze([...contexts.values()].sort(byId));
  }

  function list(value) { return Array.isArray(value) ? value : []; }
  function byId(left, right) { return left.id.localeCompare(right.id); }
  function isFuture(value, now) {
    const expiry = Date.parse(value);
    const current = Date.parse(now);
    return Number.isFinite(expiry) && Number.isFinite(current) && expiry > current;
  }

  global.SynthaWorkflowContexts = Object.freeze({ buildCycleContexts, buildSelectionContexts });
})(window);
