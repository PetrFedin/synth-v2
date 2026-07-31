import { invariant } from '../core/errors.mjs';

export function createMemoryWorkspaceReader({ store, catalogStore }) {
  invariant(store && typeof store.snapshot === 'function', 'WORKSPACE_SOURCE_STORE_REQUIRED', 'Workspace source store is required');
  return Object.freeze({
    async readForActor(actorId) {
      const source = await store.snapshot();
      const catalogSource = catalogStore && typeof catalogStore.snapshot === 'function' ? await catalogStore.snapshot() : { skus: [] };
      const memberships = source.memberships.filter((item) => item.userId === actorId && item.status === 'active');
      const ownIds = new Set(memberships.map((item) => item.organisationId));
      const ownBrandIds = new Set(memberships.filter((item) => item.organisationType === 'brand').map((item) => item.organisationId));
      const relationships = source.relationships.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const visibleOrgIds = new Set(ownIds);
      for (const item of relationships) { visibleOrgIds.add(item.brandId); visibleOrgIds.add(item.shopId); }
      const invitations = source.showroomInvitations.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const cycles = source.cycles.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const selections = source.selections.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const orders = source.orders.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const deals = source.deals.filter((item) => ownIds.has(item.brandId) || ownIds.has(item.shopId));
      const campaignIds = new Set(cycles.map((item) => item.campaignId));
      const collectionIds = new Set(cycles.map((item) => item.collectionId));
      const showroomIds = new Set([...invitations.map((item) => item.showroomId), ...selections.map((item) => item.showroomId)]);
      const showrooms = source.showrooms.filter((item) => showroomIds.has(item.id) || ownIds.has(item.brandId));
      for (const showroom of showrooms) collectionIds.add(showroom.collectionId);
      return {
        memberships,
        organisations: source.organisations.filter((item) => visibleOrgIds.has(item.id)),
        relationships,
        invitations,
        campaigns: source.campaigns.filter((item) => campaignIds.has(item.id) || ownIds.has(item.brandId)),
        collections: source.collections.filter((item) => collectionIds.has(item.id) || ownIds.has(item.brandId)),
        catalogSkus: catalogSource.skus.filter((item) => ownBrandIds.has(item.brandId) || (item.status === 'published' && collectionIds.has(item.collectionId))),
        showrooms,
        cycles,
        selections,
        orders,
        deals,
        calendar: source.calendar.filter((item) => ownIds.has(item.ownerOrganisationId)),
      };
    },
  });
}
