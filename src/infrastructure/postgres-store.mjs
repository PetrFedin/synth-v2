import { invariant } from '../core/errors.mjs';

export function createPostgresWholesaleStore({ pool }) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(transactionView(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    transaction,
    async snapshot() {
      const [organisations, memberships, relationships, invitations, campaigns, collections, showrooms, selections, orders, cycles, deals, calendar, commands, outbox] = await Promise.all([
        payloads(pool, 'organisations'),
        payloads(pool, 'memberships'),
        payloads(pool, 'counterparty_relationships'),
        payloads(pool, 'showroom_invitations'),
        payloads(pool, 'campaigns'),
        payloads(pool, 'collections'),
        payloads(pool, 'showrooms'),
        payloads(pool, 'selections'),
        payloads(pool, 'orders'),
        payloads(pool, 'commercial_cycles'),
        payloads(pool, 'deals'),
        payloads(pool, 'calendar_milestones'),
        commandPayloads(pool, 'commands'),
        outboxRecords(pool),
      ]);
      return Object.freeze({
        organisations,
        memberships,
        relationships,
        showroomInvitations: invitations,
        campaigns,
        collections,
        showrooms,
        selections,
        orders,
        cycles,
        deals,
        calendar,
        commands,
        outbox,
        events: outbox.map((record) => record.event),
      });
    },
    readOutbox(status = 'pending') {
      return readOutbox(pool, status);
    },
    async markOutboxPublished(eventIds, publishedAt) {
      return transaction(async (tx) => {
        for (const eventId of eventIds) await tx.markOutboxPublished(eventId, publishedAt);
      });
    },
  });
}

function transactionView(client) {
  return Object.freeze({
    getOrganisation: (id) => getPayload(client, 'organisations', 'id', id),
    insertOrganisation: (value) => insert(client, 'organisations', ['id', 'type', 'payload'], [value.id, value.type, value], 'ORG_ALREADY_EXISTS'),

    getMembership: (organisationId, userId) => getPayloadBy(client, 'memberships', ['organisation_id', 'user_id'], [organisationId, userId]),
    listMembershipsByOrganisation: (organisationId) => listPayloadBy(client, 'memberships', 'organisation_id', organisationId),
    listMembershipsForTrade: async (brandId, shopId) => {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id = ANY($1::text[])', [[brandId, shopId]]);
      return result.rows.map((row) => row.payload);
    },
    insertMembership: (value) => insert(
      client,
      'memberships',
      ['id', 'organisation_id', 'user_id', 'organisation_type', 'role', 'status', 'payload'],
      [value.id, value.organisationId, value.userId, value.organisationType, value.role, value.status, value],
      'MEMBERSHIP_ALREADY_EXISTS',
    ),

    getRelationship: (id) => getPayload(client, 'counterparty_relationships', 'id', id),
    getRelationshipByTrade: (brandId, shopId) => getPayloadBy(client, 'counterparty_relationships', ['brand_id', 'shop_id'], [brandId, shopId]),
    insertRelationship: (value) => insert(
      client,
      'counterparty_relationships',
      ['id', 'brand_id', 'shop_id', 'status', 'version', 'payload'],
      [value.id, value.brandId, value.shopId, value.status, value.version, value],
      'RELATIONSHIP_ALREADY_EXISTS',
    ),
    saveRelationship: (value, expectedVersion) => saveVersioned(
      client,
      'counterparty_relationships',
      value,
      expectedVersion,
      ['status'],
      [value.status],
      'RELATIONSHIP_CONCURRENCY_CONFLICT',
    ),

    getShowroomInvitation: (id) => getPayload(client, 'showroom_invitations', 'id', id),
    getShowroomInvitationByAccess: (showroomId, shopId) => getPayloadBy(client, 'showroom_invitations', ['showroom_id', 'shop_id'], [showroomId, shopId]),
    insertShowroomInvitation: (value) => insert(
      client,
      'showroom_invitations',
      ['id', 'showroom_id', 'relationship_id', 'brand_id', 'shop_id', 'status', 'expires_at', 'version', 'payload'],
      [value.id, value.showroomId, value.relationshipId, value.brandId, value.shopId, value.status, value.expiresAt, value.version, value],
      'SHOWROOM_INVITATION_ALREADY_EXISTS',
    ),
    saveShowroomInvitation: (value, expectedVersion) => saveVersioned(
      client,
      'showroom_invitations',
      value,
      expectedVersion,
      ['status', 'expires_at', 'relationship_id'],
      [value.status, value.expiresAt, value.relationshipId],
      'SHOWROOM_INVITATION_CONCURRENCY_CONFLICT',
    ),

    getCampaign: (id) => getPayload(client, 'campaigns', 'id', id),
    insertCampaign: (value) => insert(client, 'campaigns', ['id', 'brand_id', 'status', 'version', 'payload'], [value.id, value.brandId, value.status, value.version, value], 'CAMPAIGN_ALREADY_EXISTS'),
    saveCampaign: (value, expectedVersion) => saveVersioned(client, 'campaigns', value, expectedVersion, ['status'], [value.status], 'CAMPAIGN_CONCURRENCY_CONFLICT'),

    getCollection: (id) => getPayload(client, 'collections', 'id', id),
    insertCollection: (value) => insert(
      client,
      'collections',
      ['id', 'campaign_id', 'brand_id', 'status', 'currency', 'version', 'payload'],
      [value.id, value.campaignId, value.brandId, value.status, value.currency, value.version, value],
      'COLLECTION_ALREADY_EXISTS',
    ),
    saveCollection: (value, expectedVersion) => saveVersioned(client, 'collections', value, expectedVersion, ['status', 'currency'], [value.status, value.currency], 'COLLECTION_CONCURRENCY_CONFLICT'),

    getShowroom: (id) => getPayload(client, 'showrooms', 'id', id),
    insertShowroom: (value) => insert(client, 'showrooms', ['id', 'collection_id', 'brand_id', 'status', 'version', 'payload'], [value.id, value.collectionId, value.brandId, value.status, value.version, value], 'SHOWROOM_ALREADY_EXISTS'),
    saveShowroom: (value, expectedVersion) => saveVersioned(client, 'showrooms', value, expectedVersion, ['status'], [value.status], 'SHOWROOM_CONCURRENCY_CONFLICT'),

    getSelection: (id) => getPayload(client, 'selections', 'id', id),
    getSelectionByCycle: (cycleId) => getPayload(client, 'selections', 'cycle_id', cycleId),
    insertSelection: (value) => insert(
      client,
      'selections',
      ['id', 'cycle_id', 'showroom_id', 'collection_id', 'brand_id', 'shop_id', 'status', 'version', 'payload'],
      [value.id, value.cycleId, value.showroomId, value.collectionId, value.brandId, value.shopId, value.status, value.version, value],
      'SELECTION_ALREADY_EXISTS',
    ),
    saveSelection: (value, expectedVersion) => saveVersioned(client, 'selections', value, expectedVersion, ['status'], [value.status], 'SELECTION_CONCURRENCY_CONFLICT'),

    getOrder: (id) => getPayload(client, 'orders', 'id', id),
    getOrderByCycle: (cycleId) => getPayload(client, 'orders', 'cycle_id', cycleId),
    insertOrder: (value) => insert(
      client,
      'orders',
      ['id', 'selection_id', 'cycle_id', 'brand_id', 'shop_id', 'status', 'currency', 'total_amount', 'version', 'payload'],
      [value.id, value.selectionId, value.cycleId, value.brandId, value.shopId, value.status, value.currency, value.totalAmount, value.version, value],
      'ORDER_ALREADY_EXISTS',
    ),
    saveOrder: (value, expectedVersion) => saveVersioned(
      client,
      'orders',
      value,
      expectedVersion,
      ['status', 'currency', 'total_amount'],
      [value.status, value.currency, value.totalAmount],
      'ORDER_CONCURRENCY_CONFLICT',
    ),

    getCycle: (id) => getPayload(client, 'commercial_cycles', 'id', id),
    insertCycle: (value) => insert(
      client,
      'commercial_cycles',
      ['id', 'brand_id', 'shop_id', 'campaign_id', 'collection_id', 'stage', 'version', 'payload'],
      [value.id, value.brandId, value.shopId, value.campaignId, value.collectionId, value.stage, value.version, value],
      'CYCLE_ALREADY_EXISTS',
    ),
    saveCycle: (value, expectedVersion) => saveVersioned(client, 'commercial_cycles', value, expectedVersion, ['stage'], [value.stage], 'CYCLE_CONCURRENCY_CONFLICT'),

    insertDeal: (value) => insert(
      client,
      'deals',
      ['id', 'cycle_id', 'order_id', 'brand_id', 'shop_id', 'status', 'payload'],
      [value.id, value.cycleId, value.orderId, value.brandId, value.shopId, value.status, value],
      'DEAL_ALREADY_EXISTS',
    ),
    insertCalendarMilestone: (value) => insert(
      client,
      'calendar_milestones',
      ['id', 'owner_organisation_id', 'cycle_id', 'type', 'starts_at', 'visibility', 'payload'],
      [value.id, value.ownerOrganisationId, value.cycleId, value.type, value.startsAt, value.visibility, value],
      'CALENDAR_MILESTONE_ALREADY_EXISTS',
    ),

    getCommand: async (id) => {
      const result = await client.query('SELECT id, fingerprint, actor_id, result, completed_at FROM commands WHERE id = $1', [id]);
      return commandFromRow(result.rows[0]);
    },
    insertCommand: (value) => insertCommand(client, value),
    appendOutbox: (event) => insert(
      client,
      'outbox_events',
      ['id', 'event_type', 'aggregate_id', 'status', 'event', 'published_at'],
      [event.id, event.type, event.aggregateId, 'pending', event, null],
      'OUTBOX_EVENT_ALREADY_EXISTS',
    ),
    markOutboxPublished: async (eventId, publishedAt) => {
      const result = await client.query("UPDATE outbox_events SET status = 'published', published_at = $2 WHERE id = $1", [eventId, publishedAt]);
      invariant(result.rowCount === 1, 'OUTBOX_EVENT_NOT_FOUND', 'Outbox event not found', { eventId });
    },
  });
}

async function insert(client, table, columns, values, code) {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const serialized = values.map((value, index) => columns[index] === 'payload' || columns[index] === 'event' ? JSON.stringify(value) : value);
  try {
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, serialized);
  } catch (error) {
    if (error?.code === '23505') invariant(false, code, 'Entity already exists', { table });
    throw error;
  }
}

async function saveVersioned(client, table, value, expectedVersion, columns, values, code) {
  invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once', {
    id: value.id,
    expectedVersion,
    nextVersion: value.version,
  });
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
  assignments.push(`version = $${columns.length + 1}`);
  assignments.push(`payload = $${columns.length + 2}`);
  const idPosition = columns.length + 3;
  const versionPosition = columns.length + 4;
  const params = [...values, value.version, JSON.stringify(value), value.id, expectedVersion];
  const result = await client.query(
    `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = $${idPosition} AND version = $${versionPosition}`,
    params,
  );
  invariant(result.rowCount === 1, code, 'Optimistic concurrency conflict', { id: value.id, expectedVersion });
}

async function getPayload(client, table, column, value) {
  const result = await client.query(`SELECT payload FROM ${table} WHERE ${column} = $1`, [value]);
  return result.rows[0]?.payload;
}

async function getPayloadBy(client, table, columns, values) {
  const where = columns.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
  const result = await client.query(`SELECT payload FROM ${table} WHERE ${where}`, values);
  return result.rows[0]?.payload;
}

async function listPayloadBy(client, table, column, value) {
  const result = await client.query(`SELECT payload FROM ${table} WHERE ${column} = $1`, [value]);
  return result.rows.map((row) => row.payload);
}

async function payloads(queryable, table) {
  const result = await queryable.query(`SELECT payload FROM ${table} ORDER BY id`);
  return result.rows.map((row) => row.payload);
}

async function commandPayloads(queryable, table) {
  const result = await queryable.query(`SELECT id, fingerprint, actor_id, result, completed_at FROM ${table} ORDER BY id`);
  return result.rows.map(commandFromRow);
}

function commandFromRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    fingerprint: row.fingerprint,
    actorId: row.actor_id,
    result: row.result,
    completedAt: row.completed_at.toISOString?.() ?? row.completed_at,
  });
}

async function insertCommand(client, value) {
  try {
    await client.query(
      'INSERT INTO commands (id, fingerprint, actor_id, result, completed_at) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [value.id, value.fingerprint, value.actorId, JSON.stringify(value.result), value.completedAt],
    );
  } catch (error) {
    if (error?.code === '23505') invariant(false, 'COMMAND_ALREADY_EXISTS', 'Command already exists', { commandId: value.id });
    throw error;
  }
}

async function readOutbox(queryable, status) {
  const result = await queryable.query(
    'SELECT event, status, published_at FROM outbox_events WHERE status = $1 ORDER BY id',
    [status],
  );
  return result.rows.map((row) => Object.freeze({
    event: row.event,
    status: row.status,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at,
  }));
}

async function outboxRecords(queryable) {
  const result = await queryable.query('SELECT event, status, published_at FROM outbox_events ORDER BY id');
  return result.rows.map((row) => Object.freeze({
    event: row.event,
    status: row.status,
    publishedAt: row.published_at?.toISOString?.() ?? row.published_at,
  }));
}
