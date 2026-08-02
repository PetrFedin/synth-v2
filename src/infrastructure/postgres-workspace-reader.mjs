import { invariant } from '../core/errors.mjs';
import { WORKSPACE_CURSOR_POSITION_LENGTHS, WORKSPACE_SECTION_NAMES } from '../core/workspace-cursor.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const MAX_WORKSPACE_LIMIT = 500;
const MAX_WORKSPACE_PAGE_LIMIT = 200;
const MAX_CURSOR_VALUE_LENGTH = 512;
const PAGE_SORT = Object.freeze({
  memberships: Object.freeze([{ expression: "payload->>'organisationId'", direction: 'ASC' }, { expression: "payload->>'userId'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
  organisations: Object.freeze([{ expression: "payload->>'type'", direction: 'ASC' }, { expression: "payload->>'name'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
  relationships: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  invitations: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  campaigns: Object.freeze([{ expression: "payload->>'startsAt'", direction: 'DESC' }, { expression: "payload->>'name'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
  collections: Object.freeze([{ expression: "payload->>'name'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
  catalogSkus: Object.freeze([{ expression: 'sku', direction: 'ASC' }]),
  showrooms: Object.freeze([{ expression: "payload->>'opensAt'", direction: 'DESC' }, { expression: "payload->>'name'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
  cycles: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  selections: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  orders: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  deals: Object.freeze([{ expression: "payload->>'updatedAt'", direction: 'DESC' }, { expression: "payload->>'createdAt'", direction: 'DESC' }, { expression: 'id', direction: 'ASC' }]),
  calendar: Object.freeze([{ expression: "payload->>'startsAt'", direction: 'ASC' }, { expression: 'id', direction: 'ASC' }]),
});
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

    async pageForActor(actorId, { section, limit, after } = {}) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'WORKSPACE_ACTOR_REQUIRED', 'Workspace actor is required');
      validatePageRequest({ section, limit, after });
      return readSnapshot(pool, async (queryable) => {
        const scope = await loadVisibilityScope(queryable, actorId);
        const specification = pageSpecification(section, scope, actorId);
        if (!specification) return emptyPage();
        return readSectionPage(queryable, { section, limit, after, ...specification });
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

function pageSpecification(section, scope, actorId) {
  switch (section) {
    case 'memberships':
      return { table: 'memberships', where: 'user_id = $1 AND status = $2', params: [actorId, 'active'] };
    case 'organisations':
      return scope.visibleOrganisationIds.length
        ? { table: 'organisations', where: 'id = ANY($1::text[])', params: [scope.visibleOrganisationIds] }
        : undefined;
    case 'relationships':
      return tradePage('counterparty_relationships', scope.ownIds);
    case 'invitations':
      return tradePage('showroom_invitations', scope.ownIds);
    case 'campaigns':
      return idsOrOwnerPage('campaigns', scope.campaignIds, 'brand_id', scope.brandIds);
    case 'collections':
      return idsOrOwnerPage('collections', scope.collectionIds, 'brand_id', scope.brandIds);
    case 'catalogSkus':
      return scope.brandIds.length || scope.visibleCollectionIds.length
        ? {
          table: 'catalog_skus',
          where: "brand_id = ANY($1::text[]) OR (collection_id = ANY($2::text[]) AND status = 'published')",
          params: [scope.brandIds, scope.visibleCollectionIds],
        }
        : undefined;
    case 'showrooms':
      return idsOrOwnerPage('showrooms', scope.showroomIds, 'brand_id', scope.brandIds);
    case 'cycles':
      return tradePage('commercial_cycles', scope.ownIds);
    case 'selections':
      return tradePage('selections', scope.ownIds);
    case 'orders':
      return tradePage('orders', scope.ownIds);
    case 'deals':
      return tradePage('deals', scope.ownIds);
    case 'calendar':
      return scope.ownIds.length
        ? { table: 'calendar_milestones', where: 'owner_organisation_id = ANY($1::text[])', params: [scope.ownIds] }
        : undefined;
    default:
      return undefined;
  }
}

function tradePage(table, organisationIds) {
  return organisationIds.length
    ? { table, where: 'brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])', params: [organisationIds] }
    : undefined;
}

function idsOrOwnerPage(table, ids, ownerColumn, ownerIds) {
  return ids.length || ownerIds.length
    ? { table, where: `id = ANY($1::text[]) OR ${ownerColumn} = ANY($2::text[])`, params: [ids, ownerIds] }
    : undefined;
}

async function readSectionPage(queryable, { section, table, where, params: visibilityParams, limit, after }) {
  const sort = PAGE_SORT[section];
  const params = [...visibilityParams];
  const clauses = [`(${where})`];
  if (after) clauses.push(keysetClause(sort, after, params));
  const fetchLimit = limit + 1;
  const limitParameter = params.push(fetchLimit);
  const cursorColumns = sort.map(({ expression }, index) => `${expression} AS cursor_${index}`).join(', ');
  const orderBy = sort.map(({ expression, direction }) => `${expression} ${direction} NULLS LAST`).join(', ');
  const result = await queryable.query(
    `SELECT payload, ${cursorColumns} FROM ${table} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy} LIMIT $${limitParameter}`,
    params,
  );
  const rows = result.rows.slice(0, limit);
  const hasMore = result.rows.length > limit;
  return Object.freeze({
    items: Object.freeze(rows.map((row) => row.payload)),
    hasMore,
    ...(hasMore ? { nextPosition: Object.freeze(sort.map((_, index) => cursorValue(rows.at(-1)?.[`cursor_${index}`]))) } : {}),
  });
}

function keysetClause(sort, after, params) {
  const parameterIndexes = after.map((value) => value === null ? null : params.push(value));
  const alternatives = [];
  for (let index = 0; index < sort.length; index += 1) {
    const prefix = [];
    for (let prefixIndex = 0; prefixIndex < index; prefixIndex += 1) {
      const expression = sort[prefixIndex].expression;
      const parameter = parameterIndexes[prefixIndex];
      prefix.push(parameter === null ? `${expression} IS NULL` : `${expression} = $${parameter}`);
    }
    const parameter = parameterIndexes[index];
    if (parameter === null) continue;
    const { expression, direction } = sort[index];
    const comparison = direction === 'DESC' ? '<' : '>';
    alternatives.push(`(${[...prefix, `(${expression} ${comparison} $${parameter} OR ${expression} IS NULL)`].join(' AND ')})`);
  }
  invariant(alternatives.length > 0, 'WORKSPACE_CURSOR_INVALID', 'Workspace cursor cannot advance');
  return `(${alternatives.join(' OR ')})`;
}

function validatePageRequest({ section, limit, after }) {
  invariant(
    typeof section === 'string' && WORKSPACE_SECTION_NAMES.includes(section),
    'WORKSPACE_SECTION_INVALID',
    'Workspace section is invalid',
    { allowed: WORKSPACE_SECTION_NAMES },
  );
  invariant(
    Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_WORKSPACE_PAGE_LIMIT,
    'WORKSPACE_PAGE_LIMIT_INVALID',
    `Workspace page limit must be an integer from 1 to ${MAX_WORKSPACE_PAGE_LIMIT}`,
    { min: 1, max: MAX_WORKSPACE_PAGE_LIMIT },
  );
  if (after === undefined) return;
  invariant(
    Array.isArray(after) && after.length === WORKSPACE_CURSOR_POSITION_LENGTHS[section],
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor position shape is invalid',
  );
  for (const [index, value] of after.entries()) {
    invariant(
      value === null || (typeof value === 'string' && value.length <= MAX_CURSOR_VALUE_LENGTH),
      'WORKSPACE_CURSOR_INVALID',
      'Workspace cursor position value is invalid',
      { section, index },
    );
  }
  invariant(
    typeof after.at(-1) === 'string' && after.at(-1).length > 0,
    'WORKSPACE_CURSOR_INVALID',
    'Workspace cursor tie-breaker is invalid',
  );
}

function cursorValue(value) {
  return value === null || value === undefined ? null : String(value);
}

function emptyPage() {
  return Object.freeze({ items: Object.freeze([]), hasMore: false });
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
