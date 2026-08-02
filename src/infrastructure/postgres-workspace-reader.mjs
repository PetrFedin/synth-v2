import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MAX_WORKSPACE_LIMIT = 500;
const ORDER_BY = Object.freeze({
  memberships: "payload->>'organisationId' ASC, payload->>'userId' ASC, id ASC",
  organisations: "payload->>'type' ASC, payload->>'name' ASC, id ASC",
  counterparty_relationships: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  showroom_invitations: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  campaigns: "payload->>'startsAt' DESC, payload->>'name' ASC, id ASC",
  collections: "payload->>'name' ASC, id ASC",
  catalog_skus: 'sku ASC',
  showrooms: "payload->>'opensAt' DESC, payload->>'name' ASC, id ASC",
  commercial_cycles: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  selections: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  orders: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  deals: "payload->>'updatedAt' DESC, payload->>'createdAt' DESC, id ASC",
  calendar_milestones: "payload->>'startsAt' ASC, id ASC",
});

export function createPostgresWorkspaceReader({ pool }) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async readForActor(actorId, { limit } = {}) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      validateLimit(limit);
      const fetchLimit = limit + 1;
      return readSnapshot(pool, async (queryable) => {
        const truncatedSections = [];
        const memberships = bounded(
          'memberships',
          await payloadWhere(queryable, 'memberships', 'user_id = $1 AND status = $2', [actorId, 'active'], fetchLimit),
          limit,
          truncatedSections,
        );
        const ownIds = memberships.map((item) => item.organisationId);
        if (!ownIds.length) return emptyWorkspace({ memberships, limit, truncatedSections });

        const relationships = bounded(
          'relationships',
          await tradePayloads(queryable, 'counterparty_relationships', ownIds, fetchLimit),
          limit,
          truncatedSections,
        );
        const visibleOrgIds = unique([...ownIds, ...relationships.flatMap((item) => [item.brandId, item.shopId])]);
        const [organisationRows, invitationRows, cycleRows, selectionRows, orderRows, dealRows, calendarRows] = await Promise.all([
          payloadAny(queryable, 'organisations', 'id', visibleOrgIds, fetchLimit),
          tradePayloads(queryable, 'showroom_invitations', ownIds, fetchLimit),
          tradePayloads(queryable, 'commercial_cycles', ownIds, fetchLimit),
          tradePayloads(queryable, 'selections', ownIds, fetchLimit),
          tradePayloads(queryable, 'orders', ownIds, fetchLimit),
          tradePayloads(queryable, 'deals', ownIds, fetchLimit),
          payloadAny(queryable, 'calendar_milestones', 'owner_organisation_id', ownIds, fetchLimit),
        ]);
        const organisations = bounded('organisations', organisationRows, limit, truncatedSections);
        const invitations = bounded('invitations', invitationRows, limit, truncatedSections);
        const cycles = bounded('cycles', cycleRows, limit, truncatedSections);
        const selections = bounded('selections', selectionRows, limit, truncatedSections);
        const orders = bounded('orders', orderRows, limit, truncatedSections);
        const deals = bounded('deals', dealRows, limit, truncatedSections);
        const calendar = bounded('calendar', calendarRows, limit, truncatedSections);
        const campaignIds = unique(cycles.map((item) => item.campaignId));
        const cycleCollectionIds = unique(cycles.map((item) => item.collectionId));
        const showroomIds = unique([...invitations.map((item) => item.showroomId), ...selections.map((item) => item.showroomId)]);
        const brandIds = memberships.filter((item) => item.organisationType === 'brand').map((item) => item.organisationId);
        const [campaignRows, collectionRows, showroomRows] = await Promise.all([
          payloadByIdsOrOwner(queryable, 'campaigns', campaignIds, 'brand_id', brandIds, fetchLimit),
          payloadByIdsOrOwner(queryable, 'collections', cycleCollectionIds, 'brand_id', brandIds, fetchLimit),
          payloadByIdsOrOwner(queryable, 'showrooms', showroomIds, 'brand_id', brandIds, fetchLimit),
        ]);
        const campaigns = bounded('campaigns', campaignRows, limit, truncatedSections);
        const collections = bounded('collections', collectionRows, limit, truncatedSections);
        const showrooms = bounded('showrooms', showroomRows, limit, truncatedSections);
        const visibleCollectionIds = unique([...cycleCollectionIds, ...showrooms.map((item) => item.collectionId)]);
        const catalogSkus = bounded(
          'catalogSkus',
          await visibleCatalogSkus(queryable, brandIds, visibleCollectionIds, fetchLimit),
          limit,
          truncatedSections,
        );
        return {
          memberships,
          organisations,
          relationships,
          invitations,
          campaigns,
          collections,
          catalogSkus,
          showrooms,
          cycles,
          selections,
          orders,
          deals,
          calendar,
          pageInfo: { truncatedSections },
        };
      });
    },
  });
}

function readSnapshot(pool, work) {
  return withPostgresTransaction(pool, work, { begin: SNAPSHOT_BEGIN });
}

async function payloadWhere(queryable, table, where, params, fetchLimit) {
  const limitParameter = params.length + 1;
  const result = await queryable.query(
    `SELECT payload FROM ${table} WHERE ${where} ORDER BY ${ORDER_BY[table]} LIMIT $${limitParameter}`,
    [...params, fetchLimit],
  );
  return result.rows.map((row) => row.payload);
}
async function payloadAny(queryable, table, column, ids, fetchLimit) {
  if (!ids.length) return [];
  return payloadWhere(queryable, table, `${column} = ANY($1::text[])`, [ids], fetchLimit);
}
async function tradePayloads(queryable, table, ids, fetchLimit) {
  if (!ids.length) return [];
  return payloadWhere(queryable, table, 'brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])', [ids], fetchLimit);
}
async function payloadByIdsOrOwner(queryable, table, ids, ownerColumn, ownerIds, fetchLimit) {
  if (!ids.length && !ownerIds.length) return [];
  return payloadWhere(
    queryable,
    table,
    `id = ANY($1::text[]) OR ${ownerColumn} = ANY($2::text[])`,
    [ids, ownerIds],
    fetchLimit,
  );
}
async function visibleCatalogSkus(queryable, brandIds, collectionIds, fetchLimit) {
  if (!brandIds.length && !collectionIds.length) return [];
  return payloadWhere(
    queryable,
    'catalog_skus',
    "brand_id = ANY($1::text[]) OR (collection_id = ANY($2::text[]) AND status = 'published')",
    [brandIds, collectionIds],
    fetchLimit,
  );
}
function bounded(section, values, limit, truncatedSections) {
  if (values.length > limit) truncatedSections.push(section);
  return values.slice(0, limit);
}
function validateLimit(limit) {
  invariant(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_WORKSPACE_LIMIT,
    'WORKSPACE_LIMIT_INVALID',
    `Workspace limit must be an integer from 1 to ${MAX_WORKSPACE_LIMIT}`,
    { min: 1, max: MAX_WORKSPACE_LIMIT },
  );
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function emptyWorkspace({ memberships = [], limit, truncatedSections = [] } = {}) {
  return {
    memberships,
    organisations: [],
    relationships: [],
    invitations: [],
    campaigns: [],
    collections: [],
    catalogSkus: [],
    showrooms: [],
    cycles: [],
    selections: [],
    orders: [],
    deals: [],
    calendar: [],
    pageInfo: { limit, truncatedSections },
  };
}
