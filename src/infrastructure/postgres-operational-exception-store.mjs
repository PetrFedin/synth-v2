import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, rolesWithCapability } from '../modules/access-control/public.mjs';
import { getRegisteredCommand, insertRegisteredCommand } from './postgres-command-registry.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

/** @param {{ pool?: any }} [options] */
export function createPostgresOperationalExceptionStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({ transaction(work) { return withPostgresTransaction(pool, work, { createView: transactionView }); } });
}

function transactionView(client) {
  return Object.freeze({
    getMembership: async (organisationId, userId) => {
      const result = await client.query('SELECT payload FROM memberships WHERE organisation_id=$1 AND user_id=$2 FOR SHARE', [organisationId, userId]);
      return result.rows[0]?.payload;
    },
    rolesWithActiveMembership: async (_actorId, capability) => rolesWithCapability(capability),
    getThread: async (id, { lock = false } = {}) => {
      const result = await client.query(`SELECT payload FROM operational_threads WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
      return result.rows[0]?.payload;
    },
    listThreadParticipants: async (threadId) => {
      const result = await client.query('SELECT organisation_id FROM operational_thread_participants WHERE thread_id=$1 ORDER BY organisation_id', [threadId]);
      return result.rows.map((row) => row.organisation_id);
    },
    getDecision: async (id, { lock = false } = {}) => {
      const result = await client.query(`SELECT payload,owner_organisation_id FROM operational_decisions WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
      if (!result.rows[0]) return undefined;
      return { decision: result.rows[0].payload, ownerOrganisationId: result.rows[0].owner_organisation_id };
    },
    getDecisionSuperseding: async (decisionId) => {
      const result = await client.query('SELECT payload FROM operational_decisions WHERE supersedes_decision_id=$1 FOR SHARE', [decisionId]);
      return result.rows[0]?.payload;
    },
    getCalendarMilestone: async (id) => {
      const result = await client.query('SELECT owner_organisation_id,starts_at,payload FROM calendar_milestones WHERE id=$1 FOR SHARE', [id]);
      if (!result.rows[0]) return undefined;
      return {
        ownerOrganisationId: result.rows[0].owner_organisation_id,
        startsAt: new Date(result.rows[0].starts_at).toISOString(),
        payload: result.rows[0].payload,
      };
    },

    getLatestSlaPolicy: async (id, ownerOrganisationId, { lock = false } = {}) => {
      const result = await client.query(
        `SELECT payload FROM operational_sla_policies WHERE id=$1 AND owner_organisation_id=$2 ORDER BY version DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id, ownerOrganisationId],
      );
      return result.rows[0]?.payload;
    },
    getSlaPolicy: async (id, version, ownerOrganisationId) => {
      const result = await client.query('SELECT payload FROM operational_sla_policies WHERE id=$1 AND version=$2 AND owner_organisation_id=$3 FOR SHARE', [id, version, ownerOrganisationId]);
      return result.rows[0]?.payload;
    },
    insertSlaPolicy: async (policy) => {
      await client.query(
        `INSERT INTO operational_sla_policies
          (id,version,owner_organisation_id,name,status,response_minutes,resolution_minutes,escalation_minutes,applicability,created_by,created_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb)`,
        [policy.id,policy.version,policy.ownerOrganisationId,policy.name,policy.status,policy.responseMinutes,policy.resolutionMinutes,policy.escalationMinutes,JSON.stringify(policy.applicability),policy.createdBy,policy.createdAt,JSON.stringify(policy)],
      );
    },

    getActiveExceptionByDedupe: async (ownerOrganisationId, dedupeKey, { lock = false } = {}) => {
      const result = await client.query(
        `SELECT payload FROM operational_exceptions WHERE owner_organisation_id=$1 AND dedupe_key=$2 AND state<>'closed'${lock ? ' FOR UPDATE' : ''}`,
        [ownerOrganisationId, dedupeKey],
      );
      return result.rows[0]?.payload;
    },
    getException: async (id, { lock = false } = {}) => {
      const result = await client.query(`SELECT payload FROM operational_exceptions WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
      return result.rows[0]?.payload;
    },
    insertException: async (value) => {
      await client.query(
        `INSERT INTO operational_exceptions
          (id,owner_organisation_id,dedupe_key,entity_type,entity_id,entity_version,entity_content_hash,category,severity,blocking,
           owner_role,owner_user_id,thread_id,due_at,calendar_milestone_id,sla_policy_id,sla_policy_version,sla_snapshot,
           recovery_action,business_impact,source_event_id,state,version,escalation_count,opened_by,opened_at,assigned_at,
           resolved_at,closed_at,accepted_risk_decision_id,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb)`,
        [
          value.id,value.ownerOrganisationId,value.dedupeKey,value.entity.type,value.entity.id,value.entity.version,value.entity.contentHash,
          value.category,value.severity,value.blocking,value.ownerRole,value.ownerUserId,value.threadId,value.dueAt,value.calendarMilestoneId,
          value.slaPolicyId,value.slaPolicyVersion,JSON.stringify(value.slaSnapshot),value.recoveryAction,value.businessImpact,value.sourceEventId,
          value.state,value.version,value.escalationCount,value.openedBy,value.openedAt,value.assignedAt,value.resolvedAt,value.closedAt,
          value.acceptedRiskDecisionId,JSON.stringify(value),
        ],
      );
    },
    saveException: async (value, expectedVersion) => {
      invariant(value.version === expectedVersion + 1, 'VERSION_INCREMENT_INVALID', 'Version must increment exactly once');
      const result = await client.query(
        `UPDATE operational_exceptions SET
          owner_role=$2,owner_user_id=$3,state=$4,version=$5,escalation_count=$6,assigned_at=$7,resolved_at=$8,closed_at=$9,
          accepted_risk_decision_id=$10,payload=$11::jsonb
         WHERE id=$1 AND version=$12`,
        [value.id,value.ownerRole,value.ownerUserId,value.state,value.version,value.escalationCount,value.assignedAt,value.resolvedAt,value.closedAt,value.acceptedRiskDecisionId,JSON.stringify(value),expectedVersion],
      );
      invariant(result.rowCount === 1, 'OPERATIONAL_EXCEPTION_CONCURRENCY_CONFLICT', 'Exception version conflict', { exceptionId: value.id, expectedVersion });
    },
    insertTransition: async (entry) => {
      await client.query(
        `INSERT INTO operational_exception_transitions
          (exception_id,sequence,from_state,to_state,from_version,to_version,actor_id,actor_organisation_id,occurred_at,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [entry.exceptionId,entry.sequence,entry.fromState,entry.toState,entry.fromVersion,entry.toVersion,entry.actorId,entry.actorOrganisationId,entry.occurredAt,JSON.stringify(entry)],
      );
    },
    listTransitions: async (exceptionId) => {
      const result = await client.query('SELECT payload FROM operational_exception_transitions WHERE exception_id=$1 ORDER BY sequence', [exceptionId]);
      return result.rows.map((row) => row.payload);
    },
    listExceptionsForActorEntity: async ({ actorId, entityType, entityId, roles }) => {
      const result = await client.query(
        `SELECT e.payload FROM operational_exceptions e
          WHERE e.entity_type=$2 AND e.entity_id=$3
            AND EXISTS (
              SELECT 1 FROM memberships m
               WHERE m.organisation_id=e.owner_organisation_id AND m.user_id=$1 AND m.status='active' AND m.role=ANY($4::text[])
            )
          ORDER BY e.opened_at,e.id`,
        [actorId,entityType,entityId,roles],
      );
      return result.rows.map((row) => row.payload);
    },
    listDueActiveExceptions: async (asOf, limit) => {
      const result = await client.query(
        `SELECT payload FROM operational_exceptions
          WHERE state IN ('open','assigned','waiting_for_role','waiting_for_document','escalated')
            AND due_at <= $1::timestamptz
          ORDER BY due_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [asOf,limit],
      );
      return result.rows.map((row) => row.payload);
    },

    getCommand: (id) => getRegisteredCommand(client, 'operational-exception', id),
    insertCommand: (value) => insertRegisteredCommand(client, 'operational-exception', value),
    appendOutbox: async (event) => {
      await client.query(
        `INSERT INTO outbox_events(id,event_type,aggregate_id,status,event,published_at)
         VALUES($1,$2,$3,'pending',$4::jsonb,NULL)`,
        [event.id,event.type,event.aggregateId,JSON.stringify(event)],
      );
    },
  });
}
