import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function createPostgresWorkspaceReader({ pool }) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    readForActor(actorId) {
      return readSnapshot(pool, async (queryable) => {
        const memberships = await payloadWhere(queryable, 'memberships', 'user_id = $1 AND status = $2', [actorId, 'active']);
        const ownIds = memberships.map((item) => item.organisationId);
        if (!ownIds.length) return emptyWorkspace();

        const relationships = await tradePayloads(queryable, 'counterparty_relationships', ownIds);
        const visibleOrgIds = unique([...ownIds, ...relationships.flatMap((item) => [item.brandId, item.shopId])]);
        const [organisations, invitations, cycles, selections, orders, deals, calendar] = await Promise.all([
          payloadAny(queryable, 'organisations', 'id', visibleOrgIds),
          tradePayloads(queryable, 'showroom_invitations', ownIds),
          tradePayloads(queryable, 'commercial_cycles', ownIds),
          tradePayloads(queryable, 'selections', ownIds),
          tradePayloads(queryable, 'orders', ownIds),
          tradePayloads(queryable, 'deals', ownIds),
          payloadAny(queryable, 'calendar_milestones', 'owner_organisation_id', ownIds),
        ]);
        const campaignIds = unique(cycles.map((item) => item.campaignId));
        const cycleCollectionIds = unique(cycles.map((item) => item.collectionId));
        const showroomIds = unique([...invitations.map((item) => item.showroomId), ...selections.map((item) => item.showroomId)]);
        const brandIds = memberships.filter((item) => item.organisationType === 'brand').map((item) => item.organisationId);
        const [campaigns, collections, showrooms] = await Promise.all([
          payloadByIdsOrOwner(queryable, 'campaigns', campaignIds, 'brand_id', brandIds),
          payloadByIdsOrOwner(queryable, 'collections', cycleCollectionIds, 'brand_id', brandIds),
          payloadByIdsOrOwner(queryable, 'showrooms', showroomIds, 'brand_id', brandIds),
        ]);
        const visibleCollectionIds = unique([...cycleCollectionIds, ...showrooms.map((item) => item.collectionId)]);
        const catalogSkus = await visibleCatalogSkus(queryable, brandIds, visibleCollectionIds);
        return { memberships, organisations, relationships, invitations, campaigns, collections, catalogSkus, showrooms, cycles, selections, orders, deals, calendar };
      });
    },
  });
}

function readSnapshot(pool, work) {
  return withPostgresTransaction(pool, work, { begin: SNAPSHOT_BEGIN });
}

async function payloadWhere(queryable, table, where, params) {
  const result = await queryable.query(`SELECT payload FROM ${table} WHERE ${where}`, params);
  return result.rows.map((row) => row.payload);
}
async function payloadAny(queryable, table, column, ids) {
  if (!ids.length) return [];
  return payloadWhere(queryable, table, `${column} = ANY($1::text[])`, [ids]);
}
async function tradePayloads(queryable, table, ids) {
  return payloadWhere(queryable, table, 'brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])', [ids]);
}
async function payloadByIdsOrOwner(queryable, table, ids, ownerColumn, ownerIds) {
  if (!ids.length && !ownerIds.length) return [];
  const result = await queryable.query(
    `SELECT payload FROM ${table} WHERE id = ANY($1::text[]) OR ${ownerColumn} = ANY($2::text[])`,
    [ids, ownerIds],
  );
  return result.rows.map((row) => row.payload);
}
async function visibleCatalogSkus(queryable, brandIds, collectionIds) {
  if (!brandIds.length && !collectionIds.length) return [];
  const result = await queryable.query(
    `SELECT payload FROM catalog_skus
      WHERE brand_id = ANY($1::text[])
         OR (collection_id = ANY($2::text[]) AND status = 'published')`,
    [brandIds, collectionIds],
  );
  return result.rows.map((row) => row.payload);
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function emptyWorkspace() {
  return { memberships: [], organisations: [], relationships: [], invitations: [], campaigns: [], collections: [], catalogSkus: [], showrooms: [], cycles: [], selections: [], orders: [], deals: [], calendar: [] };
}
