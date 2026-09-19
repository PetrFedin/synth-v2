import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

export function createPostgresWholesaleStore({ pool }) {
  invariant(pool && typeof pool.connect === 'function' && typeof pool.query === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');

  function transaction(work) {
    return withPostgresTransaction(pool, work, { createView: transactionView });
  }

  return Object.freeze({
    transaction,
    async snapshot() {
      const [organisations, memberships, relationships, invitations, retailDoors, campaigns, collections, collectionStyleVersions, showrooms, selections, orders, orderCommitSnapshots, cycles, deals, calendar, commands, outbox] = await Promise.all([
        payloads(pool, 'organisations'),
        payloads(pool, 'memberships'),
        payloads(pool, 'counterparty_relationships'),
        payloads(pool, 'showroom_invitations'),
        payloads(pool, 'retail_doors'),
        payloads(pool, 'campaigns'),
        payloads(pool, 'collections'),
        payloads(pool, 'collection_style_versions'),
        payloads(pool, 'showrooms'),
        payloads(pool, 'selections'),
        payloads(pool, 'orders'),
        payloads(pool, 'order_commit_snapshots'),
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
        retailDoors,
        campaigns,
        collections,
        collectionStyleVersions,
        showrooms,
        selections,
        orders,
        orderCommitSnapshots,
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

    getMembership: (organisationId, userId) => getPayloadBy(client, 'memberships', ['organisation_id', 'user_id'], [organisationId, userId], 'FOR SHARE'),
    listMembershipsByOrganisation: (organisationId) => listPayloadBy(client, 'memberships', 'organisation_id', organisationId, 'FOR SHARE'),
    listMembershipsForTrade: async (brandId, shopId) => {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id = ANY($1::text[]) FOR SHARE',
        [[brandId, shopId]],
      );
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
    getRelationshipByTrade: (brandId, shopId) => getPayloadBy(client, 'counterparty_relationships', ['brand_id', 'shop_id'], [brandId, shopId], 'FOR SHARE'),
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

    getShowroomInvitation: (id) => getPayloadBy(client, 'showroom_invitations', ['id'], [id], 'FOR SHARE'),
    getShowroomInvitationByAccess: (showroomId, shopId) => getPayloadBy(client, 'showroom_invitations', ['showroom_id', 'shop_id'], [showroomId, shopId], 'FOR SHARE'),
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

    getRetailDoor: (id) => getPayloadBy(client, 'retail_doors', ['id'], [id], 'FOR SHARE'),
    getRetailDoorForUpdate: (id) => getPayloadBy(client, 'retail_doors', ['id'], [id], 'FOR UPDATE'),
    getRetailDoorByShopCode: (shopId, code) => getPayloadBy(client, 'retail_doors', ['shop_id', 'code'], [shopId, code], 'FOR SHARE'),
    listRetailDoorsByShop: (shopId) => listRetailDoorsByShop(client, shopId),
    insertRetailDoor: (value) => insert(
      client,
      'retail_doors',
      ['id', 'shop_id', 'code', 'status', 'version', 'payload', 'created_at', 'updated_at'],
      [value.id, value.shopId, value.code, value.status, value.version, value, value.createdAt, value.updatedAt],
      'RETAIL_DOOR_ALREADY_EXISTS',
    ),
    saveRetailDoor: (value, expectedVersion) => saveVersioned(
      client,
      'retail_doors',
      value,
      expectedVersion,
      ['status', 'updated_at'],
      [value.status, value.updatedAt],
      'RETAIL_DOOR_CONCURRENCY_CONFLICT',
    ),

    getCampaign: (id) => getPayload(client, 'campaigns', 'id', id),
    insertCampaign: (value) => insert(client, 'campaigns', ['id', 'brand_id', 'status', 'version', 'payload'], [value.id, value.brandId, value.status, value.version, value], 'CAMPAIGN_ALREADY_EXISTS'),
    saveCampaign: (value, expectedVersion) => saveVersioned(client, 'campaigns', value, expectedVersion, ['status'], [value.status], 'CAMPAIGN_CONCURRENCY_CONFLICT'),

    getProductResponsibility: (id) => getPayload(client, 'product_style_responsibilities', 'id', id),
    insertProductResponsibility: (value) => insert(
      client,
      'product_style_responsibilities',
      ['id', 'style_id', 'brand_id', 'role', 'user_id', 'assigned_at', 'assigned_by', 'payload'],
      [value.id, value.styleId, value.brandId, value.role, value.userId, value.assignedAt, value.assignedBy, value],
      'PRODUCT_RESPONSIBILITY_ALREADY_ASSIGNED',
    ),
    async deleteProductResponsibility(id) {
      const result = await client.query('DELETE FROM product_style_responsibilities WHERE id = $1 RETURNING payload', [id]);
      return result.rows[0]?.payload;
    },

    // Which slots this campaign already holds. An import re-run after a correction must not create a
    // second copy of everything that was already right, so the codes are read once up front rather
    // than probed row by row.
    async getPlaceholderCodesForCampaign(campaignId) {
      const result = await client.query('SELECT placeholder_code FROM product_placeholders WHERE campaign_id = $1', [campaignId]);
      return result.rows.map((row) => row.placeholder_code);
    },
    // Resolve the word a person wrote to the governed entry it names. A file says "Одежда" or
    // "APPAREL" or "Apparel"; all three are the same entry, and none of them is its id.
    async findMdmEntryByToken(dictionaryCode, token) {
      const result = await client.query(
        `SELECT entry.id, entry.version, entry.code, entry.name
           FROM mdm_entries AS entry
           JOIN mdm_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
          WHERE dictionary.code = $1
            AND entry.status = 'active'
            AND (
              lower(entry.code) = lower($2)
              OR lower(entry.name) = lower($2)
              OR EXISTS (
                SELECT 1 FROM jsonb_each_text(entry.translations) AS translation(language, value)
                 WHERE lower(translation.value) = lower($2)
              )
              OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(entry.aliases) AS alias(value)
                 WHERE lower(alias.value) = lower($2)
              )
            )
          ORDER BY entry.code
          LIMIT 2`,
        [dictionaryCode, token],
      );
      // Two entries answering to the same word is a governance problem, not an import problem, and
      // guessing between them would put the wrong one in a plan.
      if (result.rowCount !== 1) return result.rowCount > 1 ? { ambiguous: true } : undefined;
      const row = result.rows[0];
      return { entryId: row.id, version: row.version, code: row.code, name: row.name };
    },
    async mdmDictionaryExists(dictionaryCode) {
      const result = await client.query('SELECT 1 FROM mdm_dictionaries WHERE code = $1', [dictionaryCode]);
      return result.rowCount === 1;
    },
    getProductPlaceholder: (id) => getPayload(client, 'product_placeholders', 'id', id),
    insertProductPlaceholder: (value) => insert(
      client,
      'product_placeholders',
      [
        'id', 'brand_id', 'campaign_id', 'placeholder_code', 'name_ru', 'name_en',
        'category_entry_id', 'category_entry_version', 'gender_entry_id', 'gender_entry_version',
        'age_group_entry_id', 'age_group_entry_version', 'novelty_entry_id', 'novelty_entry_version',
        'seasonality_entry_id', 'seasonality_entry_version', 'fit_entry_id', 'fit_entry_version',
        'capsule', 'drop_name', 'description', 'colourway_count', 'planned_quantity', 'launch_at',
        'currency', 'recommended_retail_price_minor', 'planned_unit_cost_minor', 'planned_margin_basis_points',
        'status', 'version', 'payload', 'created_at', 'created_by', 'updated_at', 'updated_by',
      ],
      [
        value.id, value.brandId, value.campaignId, value.placeholderCode, value.nameRu, value.nameEn,
        value.categoryRef?.entryId ?? null, value.categoryRef?.version ?? null,
        value.genderRef?.entryId ?? null, value.genderRef?.version ?? null,
        value.ageGroupRef?.entryId ?? null, value.ageGroupRef?.version ?? null,
        value.noveltyRef?.entryId ?? null, value.noveltyRef?.version ?? null,
        value.seasonalityRef?.entryId ?? null, value.seasonalityRef?.version ?? null,
        value.fitRef?.entryId ?? null, value.fitRef?.version ?? null,
        value.capsule, value.drop, value.description, value.colourwayCount, value.plannedQuantity, value.launchAt,
        value.currency, value.recommendedRetailPriceMinor, value.plannedUnitCostMinor, value.plannedMarginBasisPoints,
        value.status, value.version, value, value.createdAt, value.createdBy, value.updatedAt, value.updatedBy,
      ],
      'PLACEHOLDER_ALREADY_EXISTS',
    ),
    saveProductPlaceholder: (value, expectedVersion) => saveVersioned(
      client,
      'product_placeholders',
      value,
      expectedVersion,
      ['status', 'updated_at', 'updated_by'],
      [value.status, value.updatedAt, value.updatedBy],
      'PLACEHOLDER_CONCURRENCY_CONFLICT',
    ),
    insertProductPlaceholderStyleLink: (value) => insert(
      client,
      'product_placeholder_style_links',
      ['id', 'placeholder_id', 'style_id', 'brand_id', 'campaign_id', 'linked_at', 'linked_by', 'payload'],
      [value.id, value.placeholderId, value.styleId, value.brandId, value.campaignId, value.linkedAt, value.linkedBy, value],
      'PLACEHOLDER_STYLE_LINK_ALREADY_EXISTS',
    ),

    getCollection: (id) => getPayload(client, 'collections', 'id', id),
    getCollectionStyleVersion: (collectionId, styleVersionId) => getPayloadBy(
      client,
      'collection_style_versions',
      ['collection_id', 'style_version_id'],
      [collectionId, styleVersionId],
      'FOR SHARE',
    ),
    listCollectionStyleVersions: (collectionId) => listCollectionStyleVersions(client, collectionId),
    insertCollection: (value) => insert(
      client,
      'collections',
      ['id', 'campaign_id', 'brand_id', 'status', 'currency', 'version', 'payload'],
      [value.id, value.campaignId, value.brandId, value.status, value.currency, value.version, value],
      'COLLECTION_ALREADY_EXISTS',
    ),
    insertCollectionStyleVersion: (value) => insert(
      client,
      'collection_style_versions',
      ['id', 'collection_id', 'brand_id', 'style_version_id', 'assigned_at', 'assigned_by', 'payload'],
      [value.id, value.collectionId, value.brandId, value.styleVersionId, value.assignedAt, value.assignedBy, value],
      'COLLECTION_STYLE_VERSION_ALREADY_ASSIGNED',
    ),
    saveCollection: (value, expectedVersion) => saveVersioned(client, 'collections', value, expectedVersion, ['status', 'currency'], [value.status, value.currency], 'COLLECTION_CONCURRENCY_CONFLICT'),

    getShowroom: (id) => getPayloadBy(client, 'showrooms', ['id'], [id], 'FOR SHARE'),
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
      ['id', 'selection_id', 'cycle_id', 'brand_id', 'shop_id', 'status', 'currency', 'total_amount', 'retail_door_id', 'retail_door_version', 'order_commit_snapshot_id', 'version', 'payload'],
      [value.id, value.selectionId, value.cycleId, value.brandId, value.shopId, value.status, value.currency, value.totalAmount, value.retailDoorId ?? null, value.retailDoorVersion ?? null, value.orderCommitSnapshotId ?? null, value.version, value],
      'ORDER_ALREADY_EXISTS',
    ),
    saveOrder: (value, expectedVersion) => saveVersioned(
      client,
      'orders',
      value,
      expectedVersion,
      ['status', 'currency', 'total_amount', 'order_commit_snapshot_id'],
      [value.status, value.currency, value.totalAmount, value.orderCommitSnapshotId ?? null],
      'ORDER_CONCURRENCY_CONFLICT',
    ),

    getOrderCommitSnapshot: (id) => getPayload(client, 'order_commit_snapshots', 'id', id),
    insertOrderCommitSnapshot: (value) => insert(
      client,
      'order_commit_snapshots',
      ['id', 'order_id', 'order_version', 'brand_id', 'shop_id', 'currency', 'retail_door_id', 'retail_door_version', 'committed_at', 'content_hash', 'payload'],
      [value.id, value.orderId, value.orderVersion, value.brandId, value.shopId, value.currency, value.retailDoorId ?? null, value.retailDoorVersion ?? null, value.committedAt, value.contentHash, value],
      'ORDER_COMMIT_SNAPSHOT_ALREADY_EXISTS',
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

    getCommand: (id) => getRegisteredCommand(client, 'wholesale', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'wholesale', value),
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

async function getPayloadBy(client, table, columns, values, lockClause = '') {
  const where = columns.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
  const suffix = lockClause ? ` ${lockClause}` : '';
  const result = await client.query(`SELECT payload FROM ${table} WHERE ${where}${suffix}`, values);
  return result.rows[0]?.payload;
}

async function listPayloadBy(client, table, column, value, lockClause = '') {
  const suffix = lockClause ? ` ${lockClause}` : '';
  const result = await client.query(`SELECT payload FROM ${table} WHERE ${column} = $1${suffix}`, [value]);
  return result.rows.map((row) => row.payload);
}

async function listCollectionStyleVersions(client, collectionId) {
  const result = await client.query(
    'SELECT payload FROM collection_style_versions WHERE collection_id = $1 ORDER BY assigned_at, id FOR SHARE',
    [collectionId],
  );
  return result.rows.map((row) => row.payload);
}

async function listRetailDoorsByShop(client, shopId) {
  const result = await client.query('SELECT payload FROM retail_doors WHERE shop_id = $1 ORDER BY code, id FOR SHARE', [shopId]);
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
