import { invariant } from '../core/errors.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresOperationalCollaborationStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    transaction(work) {
      return withPostgresTransaction(pool, work, { createView: transactionView });
    },
  });
}

function transactionView(client) {
  return Object.freeze({
    getMembership: async (organisationId, userId) => {
      const result = await client.query(
        'SELECT payload FROM memberships WHERE organisation_id=$1 AND user_id=$2 FOR SHARE',
        [organisationId, userId],
      );
      return result.rows[0]?.payload;
    },
    getOrganisation: async (id) => {
      const result = await client.query('SELECT payload FROM organisations WHERE id=$1 FOR SHARE', [id]);
      return result.rows[0]?.payload;
    },
    getRelationshipByTrade: async (brandId, shopId) => {
      const result = await client.query(
        'SELECT payload FROM counterparty_relationships WHERE brand_id=$1 AND shop_id=$2 FOR SHARE',
        [brandId, shopId],
      );
      return result.rows[0]?.payload;
    },

    getThread: async (id, { lock = false } = {}) => {
      const result = await client.query(
        `SELECT payload FROM operational_threads WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
        [id],
      );
      return result.rows[0]?.payload;
    },
    insertThread: async (thread) => {
      await client.query(
        `INSERT INTO operational_threads
          (id,owner_organisation_id,entity_type,entity_id,entity_version,entity_content_hash,kind,title,status,version,
           created_by,created_at,updated_at,resolved_by,resolved_at,archived_by,archived_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16,$17::jsonb)`,
        [
          thread.id, thread.ownerOrganisationId, thread.entity.type, thread.entity.id, thread.entity.version,
          thread.entity.contentHash, thread.kind, thread.title, thread.status, thread.version, thread.createdBy,
          thread.createdAt, thread.resolvedBy ?? null, thread.resolvedAt ?? null, thread.archivedBy ?? null,
          thread.archivedAt ?? null, JSON.stringify(thread),
        ],
      );
    },
    saveThread: async (thread, expectedVersion, updatedAt) => {
      invariant(thread.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE operational_threads
            SET status=$2,version=$3,updated_at=$4,resolved_by=$5,resolved_at=$6,archived_by=$7,archived_at=$8,payload=$9::jsonb
          WHERE id=$1 AND version=$10`,
        [
          thread.id, thread.status, thread.version, updatedAt, thread.resolvedBy ?? null, thread.resolvedAt ?? null,
          thread.archivedBy ?? null, thread.archivedAt ?? null, JSON.stringify(thread), expectedVersion,
        ],
      );
      invariant(result.rowCount === 1, 'ENTITY_THREAD_CONCURRENCY_CONFLICT', 'Thread version conflict', { threadId: thread.id, expectedVersion });
    },
    insertParticipant: async ({ threadId, organisationId, addedAt }) => {
      await client.query(
        'INSERT INTO operational_thread_participants(thread_id,organisation_id,added_at) VALUES($1,$2,$3)',
        [threadId, organisationId, addedAt],
      );
    },
    listParticipants: async (threadId) => {
      const result = await client.query(
        'SELECT organisation_id FROM operational_thread_participants WHERE thread_id=$1 ORDER BY organisation_id',
        [threadId],
      );
      return result.rows.map((row) => row.organisation_id);
    },
    insertMessage: async (message) => {
      await client.query(
        `INSERT INTO operational_thread_messages
          (id,thread_id,author_organisation_id,author_id,body,created_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [message.id, message.threadId, message.authorOrganisationId, message.authorId, message.body, message.createdAt, JSON.stringify(message)],
      );
    },
    insertDecision: async (decision, ownerOrganisationId) => {
      await client.query(
        `INSERT INTO operational_decisions
          (id,owner_organisation_id,thread_id,entity_type,entity_id,entity_version,entity_content_hash,decision_type,outcome,
           rationale,decided_by,decided_by_organisation_id,decided_at,supersedes_decision_id,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)`,
        [
          decision.id, ownerOrganisationId, decision.threadId, decision.entity.type, decision.entity.id, decision.entity.version,
          decision.entity.contentHash, decision.decisionType, decision.outcome, decision.rationale, decision.decidedBy,
          decision.decidedByOrganisationId, decision.decidedAt, decision.supersedesDecisionId, JSON.stringify(decision),
        ],
      );
    },
    getDecision: async (id, { lock = false } = {}) => {
      const result = await client.query(
        `SELECT payload,owner_organisation_id FROM operational_decisions WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
        [id],
      );
      if (!result.rows[0]) return undefined;
      return Object.freeze({ decision: result.rows[0].payload, ownerOrganisationId: result.rows[0].owner_organisation_id });
    },
    getDecisionSuperseding: async (decisionId) => {
      const result = await client.query(
        'SELECT payload FROM operational_decisions WHERE supersedes_decision_id=$1 FOR SHARE',
        [decisionId],
      );
      return result.rows[0]?.payload;
    },

    listThreadsForActorEntity: async ({ actorId, entityType, entityId, roles }) => {
      const result = await client.query(
        `SELECT DISTINCT t.payload
           FROM operational_threads t
           JOIN operational_thread_participants p ON p.thread_id=t.id
           JOIN memberships m ON m.organisation_id=p.organisation_id
          WHERE m.user_id=$1 AND m.status='active' AND m.role=ANY($2::text[])
            AND t.entity_type=$3 AND t.entity_id=$4
          ORDER BY t.payload->>'createdAt', t.payload->>'id'`,
        [actorId, roles, entityType, entityId],
      );
      return result.rows.map((row) => row.payload);
    },
    listMessagesForActorEntity: async ({ actorId, entityType, entityId, roles }) => {
      const result = await client.query(
        `SELECT DISTINCT msg.payload
           FROM operational_thread_messages msg
           JOIN operational_threads t ON t.id=msg.thread_id
           JOIN operational_thread_participants p ON p.thread_id=t.id
           JOIN memberships m ON m.organisation_id=p.organisation_id
          WHERE m.user_id=$1 AND m.status='active' AND m.role=ANY($2::text[])
            AND t.entity_type=$3 AND t.entity_id=$4
          ORDER BY msg.payload->>'createdAt', msg.payload->>'id'`,
        [actorId, roles, entityType, entityId],
      );
      return result.rows.map((row) => row.payload);
    },
    listDecisionsForActorEntity: async ({ actorId, entityType, entityId, roles }) => {
      const result = await client.query(
        `SELECT DISTINCT d.payload
           FROM operational_decisions d
           LEFT JOIN operational_thread_participants p ON p.thread_id=d.thread_id
           JOIN memberships m ON m.organisation_id = CASE
             WHEN d.thread_id IS NULL THEN d.owner_organisation_id
             ELSE p.organisation_id
           END
          WHERE m.user_id=$1 AND m.status='active' AND m.role=ANY($2::text[])
            AND d.entity_type=$3 AND d.entity_id=$4
          ORDER BY d.decided_at, d.id`,
        [actorId, roles, entityType, entityId],
      );
      return result.rows.map((row) => row.payload);
    },

    getCommand: (id) => getRegisteredCommand(client, 'operational-collaboration', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'operational-collaboration', value),
    appendOutbox: async (event) => {
      await client.query(
        `INSERT INTO outbox_events(id,event_type,aggregate_id,status,event,published_at)
         VALUES($1,$2,$3,'pending',$4::jsonb,NULL)`,
        [event.id, event.type, event.aggregateId, JSON.stringify(event)],
      );
    },
  });
}
