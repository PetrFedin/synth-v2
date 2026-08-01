import { invariant } from '../core/errors.mjs';

export function createPostgresWorkspaceReader({ pool }) {
  invariant(pool && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async readForActor(actorId) {
      const memberships = await payloadWhere(pool, 'memberships', 'user_id = $1 AND status = $2', [actorId, 'active']);
      const ownIds = memberships.map((item) => item.organisationId);
      if (!ownIds.length) return emptyWorkspace();

      const relationships = await tradePayloads(pool, 'counterparty_relationships', ownIds);
      const visibleOrgIds = unique([...ownIds, ...relationships.flatMap((item) => [item.brandId, item.shopId])]);
      const [organisations, invitations, cycles, selections, orders, deals, calendar, calendarEvents, collaborationThreads] = await Promise.all([
        payloadAny(pool, 'organisations', 'id', visibleOrgIds),
        tradePayloads(pool, 'showroom_invitations', ownIds),
        tradePayloads(pool, 'commercial_cycles', ownIds),
        tradePayloads(pool, 'selections', ownIds),
        tradePayloads(pool, 'orders', ownIds),
        tradePayloads(pool, 'deals', ownIds),
        payloadAny(pool, 'calendar_milestones', 'owner_organisation_id', ownIds),
        visibleCalendarEvents(pool, ownIds),
        payloadAny(pool, 'collaboration_threads', 'owner_organisation_id', ownIds),
      ]);
      const threadIds = collaborationThreads.map((item) => item.id);
      const [collaborationMessages, calendarParticipants, calendarReminders] = await Promise.all([
        payloadAny(pool, 'collaboration_messages', 'thread_id', threadIds),
        participantPayloads(pool, calendarEvents.map((item) => item.id), ownIds),
        reminderPayloads(pool, calendarEvents.map((item) => item.id), actorId),
      ]);
      const campaignIds = unique(cycles.map((item) => item.campaignId));
      const cycleCollectionIds = unique(cycles.map((item) => item.collectionId));
      const showroomIds = unique([...invitations.map((item) => item.showroomId), ...selections.map((item) => item.showroomId)]);
      const brandIds = memberships.filter((item) => item.organisationType === 'brand').map((item) => item.organisationId);
      const [campaigns, collections, showrooms] = await Promise.all([
        payloadByIdsOrOwner(pool, 'campaigns', campaignIds, 'brand_id', brandIds),
        payloadByIdsOrOwner(pool, 'collections', cycleCollectionIds, 'brand_id', brandIds),
        payloadByIdsOrOwner(pool, 'showrooms', showroomIds, 'brand_id', brandIds),
      ]);
      const visibleCollectionIds = unique([...cycleCollectionIds, ...showrooms.map((item) => item.collectionId)]);
      const catalogSkus = await visibleCatalogSkus(pool, brandIds, visibleCollectionIds);
      return { memberships, organisations, relationships, invitations, campaigns, collections, catalogSkus, showrooms, cycles, selections, orders, deals, calendar, calendarEvents, calendarParticipants, calendarReminders, collaborationThreads, collaborationMessages };
    },
  });
}

async function payloadWhere(pool, table, where, params) {
  const result = await pool.query(`SELECT payload FROM ${table} WHERE ${where} ORDER BY 1`, params);
  return result.rows.map((row) => row.payload);
}
async function payloadAny(pool, table, column, ids) {
  if (!ids.length) return [];
  return payloadWhere(pool, table, `${column} = ANY($1::text[])`, [ids]);
}
async function tradePayloads(pool, table, ids) {
  return payloadWhere(pool, table, 'brand_id = ANY($1::text[]) OR shop_id = ANY($1::text[])', [ids]);
}
async function payloadByIdsOrOwner(pool, table, ids, ownerColumn, ownerIds) {
  if (!ids.length && !ownerIds.length) return [];
  const result = await pool.query(
    `SELECT payload FROM ${table} WHERE id = ANY($1::text[]) OR ${ownerColumn} = ANY($2::text[]) ORDER BY id`,
    [ids, ownerIds],
  );
  return result.rows.map((row) => row.payload);
}
async function visibleCatalogSkus(pool, brandIds, collectionIds) {
  if (!brandIds.length && !collectionIds.length) return [];
  const result = await pool.query(
    `SELECT payload FROM catalog_skus
      WHERE brand_id = ANY($1::text[])
         OR (collection_id = ANY($2::text[]) AND status = 'published')
      ORDER BY sku`,
    [brandIds, collectionIds],
  );
  return result.rows.map((row) => row.payload);
}
async function visibleCalendarEvents(pool, organisationIds) {
  const result = await pool.query(
    `SELECT DISTINCT e.payload
       FROM calendar_events e
       LEFT JOIN calendar_event_participants p ON p.event_id = e.id
      WHERE e.owner_organisation_id = ANY($1::text[])
         OR (e.visibility = 'trade' AND p.organisation_id = ANY($1::text[]))
      ORDER BY e.payload`,
    [organisationIds],
  );
  return result.rows.map((row) => row.payload);
}
async function participantPayloads(pool, eventIds, organisationIds) {
  if (!eventIds.length) return [];
  const result = await pool.query(
    `SELECT payload FROM calendar_event_participants
      WHERE event_id = ANY($1::text[]) AND organisation_id = ANY($2::text[])
      ORDER BY event_id, organisation_id`,
    [eventIds, organisationIds],
  );
  return result.rows.map((row) => row.payload);
}
async function reminderPayloads(pool, eventIds, actorId) {
  if (!eventIds.length) return [];
  return payloadWhere(pool, 'calendar_event_reminders', 'event_id = ANY($1::text[]) AND recipient_user_id = $2', [eventIds, actorId]);
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function emptyWorkspace() {
  return { memberships: [], organisations: [], relationships: [], invitations: [], campaigns: [], collections: [], catalogSkus: [], showrooms: [], cycles: [], selections: [], orders: [], deals: [], calendar: [], calendarEvents: [], calendarParticipants: [], calendarReminders: [], collaborationThreads: [], collaborationMessages: [] };
}
