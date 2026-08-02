import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MAX_WORKSPACE_LIMIT = 500;
const ORDER_BY = Object.freeze({
  memberships: "payload->>'organisationId' ASC NULLS LAST, payload->>'userId' ASC NULLS LAST, id ASC",
  organisations: "payload->>'type' ASC NULLS LAST, payload->>'name' ASC NULLS LAST, id ASC",
  counterparty_relationships: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  showroom_invitations: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  campaigns: "payload->>'startsAt' DESC NULLS LAST, payload->>'name' ASC NULLS LAST, id ASC",
  collections: "payload->>'name' ASC NULLS LAST, id ASC",
  catalog_skus: 'sku ASC',
  showrooms: "payload->>'opensAt' DESC NULLS LAST, payload->>'name' ASC NULLS LAST, id ASC",
  commercial_cycles: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  selections: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  orders: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  deals: "payload->>'updatedAt' DESC NULLS LAST, payload->>'createdAt' DESC NULLS LAST, id ASC",
  calendar_milestones: "payload->>'startsAt' ASC NULLS LAST, id ASC",
});

export function createPostgresWorkspaceReader({ pool }) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async readForActor(actorId, { limit } = {}) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      validateLimit(limit);
      const fetchLimit = limit + 1;
      return readSnapshot(pool, async (queryable) => {
        const scope = await loadVisibilityScope(queryable, actorId);
        const truncatedSections = [];
        const memberships = bounded(
          'memberships',
          await payloadWhere(queryable, 'memberships', 'user_id = $1 AND status = $2', [actorId, 'active'], fetchLimit),
          limit,
          truncatedSections,
        );
        if (!scope.ownIds.length) return emptyWorkspace({ memberships, truncatedSections });

        const [relationshipRows, organisationRows, invitationRows, cycleRows, selectionRows, orderRows, dealRows, calendarRows] = await Promise.all([
          tradePayloads(queryable, 'counterparty_relationships', scope.ownIds, fetchLimit),
          payloadAny(queryable, 'organisations', 'id', scope.visibleOrganisationIds, fetchLimit),
          tradePayloads(queryable, 'showroom_invitations', scope.ownIds, fetchLimit),
          tradePayloads(queryable, 'commercial_cycles', scope.ownIds, fetchLimit),
          tradePayloads(queryable, 'selections', scope.ownIds, fetchLimit),
          tradePayloads(queryable, 'orders', scope.ownIds, fetchLimit),
          tradePayloads(queryable, 'deals', scope.ownIds, fetchLimit),
          payloadAny(queryable, 'calendar_milestones', 'owner_organisation_id', scope.ownIds, fetchLimit),
        ]);
        const [campaignRows, collectionRows, showroomRows, catalogRows] = await Promise.all([
          payloadByIdsOrOwner(queryable, 'campaigns', scope.campaignIds, 'brand_id', scope.brandIds, fetchLimit),
          payloadByIdsOrOwner(queryable, 'collections', scope.collectionIds, 'brand_id', scope.brandIds, fetchLimit),
          payloadByIdsOrOwner(queryable, 'showrooms', scope.showroomIds, 'brand_id', scope.brandIds, fetchLimit),
          visibleCatalogSkus(queryable, scope.brandIds, scope.visibleCollectionIds, fetchLimit),
        ]);

        return {
          memberships,
          organisations: bounded('organisations', organisationRows, limit, truncatedSections),
          relationships: bounded('relationships', relationshipRows, limit, truncatedSections),
          invitations: bounded('invitations', invitationRows, limit, truncatedSections),
          campaigns: bounded('campaigns', campaignRows, limit, truncatedSections),
          collections: bounded('collections', collectionRows, limit, truncatedSections),
          catalogSkus: bounded('catalogSkus', catalogRows, limit, truncatedSections),
          showrooms: bounded('showrooms', showroomRows, limit, truncatedSections),
          cycles: bounded('cycles', cycleRows, limit, truncatedSections),
          selections: bounded('selections', selectionRows, limit, truncatedSections),
          orders: bounded('orders', orderRows, limit, truncatedSections),
          deals: bounded('deals', dealRows, limit, truncatedSections),
          calendar: bounded('calendar', calendarRows, limit, truncatedSections),
          pageInfo: { truncatedSections },
        };
      });
    },
  });
}

function readSnapshot(pool, work) {
  return withPostgresTransaction(pool, work, { begin: SNAPSHOT_BEGIN });
}

async function loadVisibilityScope(queryable, actorId) {
  const membershipResult = await queryable.query(
    `SELECT organisation_id, payload->>'organisationType' AS organisation_type
       FROM memberships
      WHERE user_id = $1 AND status = $2
      ORDER BY organisation_id ASC`,
    [actorId, 'active'],
  );
  const ownIds = unique(membershipResult.rows.map((row) => row.organisation_id));
  const brandIds = unique(membershipResult.rows.filter((row) => row.organisation_type === 'brand').map((row) => row.organisation_id));
  if (!ownIds.length) return emptyVisibilityScope();

  const [relationshipResult, cycleResult, invitationResult, selectionResult] = await Promise.all([
    queryable.query(
      'SELECT brand_id, shop_id FROM counterparty_relationships WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT campaign_id, collection_id FROM commercial_cycles WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT showroom_id FROM showroom_invitations WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
    queryable.query(
      'SELECT showroom_id FROM selections WHERE brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])',
      [ownIds],
    ),
  ]);
  const relationshipOrganisationIds = relationshipResult.rows.flatMap((row) => [row.brand_id, row.shop_id]);
  const campaignIds = unique(cycleResult.rows.map((row) => row.campaign_id));
  const collectionIds = unique(cycleResult.rows.map((row) => row.collection_id));
  const linkedShowroomIds = unique([
    ...invitationResult.rows.map((row) => row.showroom_id),
    ...selectionResult.rows.map((row) => row.showroom_id),
  ]);
  const showroomResult = linkedShowroomIds.length || brandIds.length
    ? await queryable.query(
      'SELECT id, collection_id FROM showrooms WHERE id = ANY($1::text[]) OR brand_id = ANY($2::text[])',
      [linkedShowroomIds, brandIds],
    )
    : { rows: [] };
  const showroomIds = unique([...linkedShowroomIds, ...showroomResult.rows.map((row) => row.id)]);
  const visibleCollectionIds = unique([...collectionIds, ...showroomResult.rows.map((row) => row.collection_id)]);
  return Object.freeze({
    ownIds: Object.freeze(ownIds),
    brandIds: Object.freeze(brandIds),
    visibleOrganisationIds: Object.freeze(unique([...ownIds, ...relationshipOrganisationIds])),
    campaignIds: Object.freeze(campaignIds),
    collectionIds: Object.freeze(collectionIds),
    showroomIds: Object.freeze(showroomIds),
    visibleCollectionIds: Object.freeze(visibleCollectionIds),
  });
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
  return payloadWhere(queryable, table, `id = ANY($1::text[]) OR ${ownerColumn} = ANY($2::text[])`, [ids, ownerIds], fetchLimit);
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
function emptyVisibilityScope() {
  return Object.freeze({
    ownIds: Object.freeze([]),
    brandIds: Object.freeze([]),
    visibleOrganisationIds: Object.freeze([]),
    campaignIds: Object.freeze([]),
    collectionIds: Object.freeze([]),
    showroomIds: Object.freeze([]),
    visibleCollectionIds: Object.freeze([]),
  });
}
function emptyWorkspace({ memberships = [], truncatedSections = [] } = {}) {
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
    pageInfo: { truncatedSections },
  };
}
