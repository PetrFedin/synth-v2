import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  acceptOperationalExceptionRisk,
  assignOperationalException,
  closeOperationalException,
  escalateOperationalException,
  openOperationalException,
  resolveOperationalException,
  sameEntityIdentity,
  waitOperationalException,
} from '../modules/operational-control/public.mjs';

const ACTIVE_STATES = new Set(['open','assigned','waiting_for_role','waiting_for_document','escalated']);

/** @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options] */
export function createOperationalExceptionService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'OPERATIONAL_EXCEPTION_STORE_REQUIRED', 'Operational exception store is required');

  async function execute(commandId, actorId, fingerprint, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId, 'ACTOR_ID_REQUIRED', 'Actor id is required');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand({ id: commandId, fingerprint, actorId, result, completedAt: clock() });
      return result;
    });
  }

  async function requireMembership(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  async function transition(tx, current, next, actorId, actorOrganisationId, details = {}) {
    invariant(next.version === current.version + 1, 'VERSION_INCREMENT_INVALID', 'Exception version must increment exactly once');
    await tx.saveException(next, current.version);
    await tx.insertTransition({
      exceptionId: current.id,
      sequence: next.version,
      fromState: current.state,
      toState: next.state,
      fromVersion: current.version,
      toVersion: next.version,
      actorId,
      actorOrganisationId,
      occurredAt: clock(),
      details,
    });
  }

  async function loadManaged(tx, exceptionId, actorId, actingOrganisationId, expectedVersion) {
    const current = await tx.getException(exceptionId, { lock: true });
    invariant(current, 'OPERATIONAL_EXCEPTION_NOT_FOUND', 'Operational exception not found', { exceptionId });
    invariant(current.ownerOrganisationId === actingOrganisationId, 'OPERATIONAL_EXCEPTION_ORGANISATION_MISMATCH', 'Exception belongs to another organisation');
    await requireMembership(tx, actingOrganisationId, actorId, CAPABILITIES.EXCEPTION_MANAGE);
    invariant(expectedVersion === current.version, 'OPERATIONAL_EXCEPTION_CONCURRENCY_CONFLICT', 'Exception version conflict', {
      exceptionId, expectedVersion, actualVersion: current.version,
    });
    return current;
  }

  return Object.freeze({
    createSlaPolicy(commandId, actorId, input) {
      const fingerprint = `operationalException.createSlaPolicy:${actorId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const organisationId = String(input?.ownerOrganisationId ?? '');
        await requireMembership(tx, organisationId, actorId, CAPABILITIES.SLA_POLICY_MANAGE);
        const id = String(input?.id ?? '').trim();
        invariant(id, 'OPERATIONAL_SLA_POLICY_ID_REQUIRED', 'SLA policy id is required');
        const latest = await tx.getLatestSlaPolicy(id, organisationId, { lock: true });
        const version = (latest?.version ?? 0) + 1;
        if (latest) invariant(latest.status === 'retired', 'OPERATIONAL_SLA_POLICY_ACTIVE_EXISTS', 'Retire the active policy version before creating another');
        const policy = normalizePolicy({ ...input, id, version, ownerOrganisationId: organisationId, createdBy: actorId, createdAt: clock() });
        await tx.insertSlaPolicy(policy);
        await append(tx, 'operational.sla-policy.created.v1', policy.id, { policyId: policy.id, version: policy.version, ownerOrganisationId: organisationId }, commandId, actorId);
        return policy;
      });
    },

    retireSlaPolicy(commandId, actorId, policyId, input) {
      const fingerprint = `operationalException.retireSlaPolicy:${actorId}:${policyId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const organisationId = String(input?.actingOrganisationId ?? '');
        await requireMembership(tx, organisationId, actorId, CAPABILITIES.SLA_POLICY_MANAGE);
        const latest = await tx.getLatestSlaPolicy(policyId, organisationId, { lock: true });
        invariant(latest?.status === 'active', 'OPERATIONAL_SLA_POLICY_NOT_ACTIVE', 'Active SLA policy not found', { policyId });
        const retired = Object.freeze({ ...latest, version: latest.version + 1, status: 'retired', createdBy: actorId, createdAt: clock() });
        await tx.insertSlaPolicy(retired);
        await append(tx, 'operational.sla-policy.retired.v1', policyId, { policyId, version: retired.version, ownerOrganisationId: organisationId }, commandId, actorId);
        return retired;
      });
    },

    openException(commandId, actorId, input) {
      const fingerprint = `operationalException.open:${actorId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const ownerOrganisationId = String(input?.ownerOrganisationId ?? '');
        await requireMembership(tx, ownerOrganisationId, actorId, CAPABILITIES.EXCEPTION_MANAGE);

        const thread = await tx.getThread(String(input?.threadId ?? ''), { lock: false });
        invariant(thread, 'ENTITY_THREAD_NOT_FOUND', 'Entity thread not found', { threadId: input?.threadId });
        const participants = await tx.listThreadParticipants(thread.id);
        invariant(participants.includes(ownerOrganisationId), 'OPERATIONAL_EXCEPTION_THREAD_PARTICIPANT_REQUIRED', 'Exception owner organisation must participate in its thread');
        invariant(sameEntityIdentity(thread.entity, input?.entity), 'OPERATIONAL_EXCEPTION_THREAD_ENTITY_MISMATCH', 'Exception entity does not match thread entity');

        const requestedPolicyId = String(input?.slaPolicyId ?? '');
        const requestedPolicyVersion = Number(input?.slaPolicyVersion);
        const policy = await tx.getSlaPolicy(requestedPolicyId, requestedPolicyVersion, ownerOrganisationId);
        const latestPolicy = await tx.getLatestSlaPolicy(requestedPolicyId, ownerOrganisationId, { lock: false });
        invariant(policy && latestPolicy && latestPolicy.version === policy.version && policy.status === 'active', 'OPERATIONAL_SLA_POLICY_NOT_ACTIVE', 'Latest active SLA policy version is required');
        assertPolicyApplies(policy, input);

        const openedAt = clock();
        const dueAt = new Date(Date.parse(openedAt) + policy.resolutionMinutes * 60_000).toISOString();
        if (input?.calendarMilestoneId) {
          const milestone = await tx.getCalendarMilestone(String(input.calendarMilestoneId));
          invariant(milestone, 'OPERATIONAL_EXCEPTION_CALENDAR_MILESTONE_NOT_FOUND', 'Calendar milestone not found');
          invariant(milestone.ownerOrganisationId === ownerOrganisationId, 'OPERATIONAL_EXCEPTION_CALENDAR_ORGANISATION_MISMATCH', 'Calendar milestone belongs to another organisation');
          invariant(milestone.startsAt === dueAt, 'OPERATIONAL_EXCEPTION_CALENDAR_DEADLINE_MISMATCH', 'Linked calendar milestone date must equal the SLA due date', { dueAt, startsAt: milestone.startsAt });
        }

        const exceptionId = nextId('exception');
        const dedupeKey = buildDedupeKey(input);
        const existing = await tx.getActiveExceptionByDedupe(ownerOrganisationId, dedupeKey, { lock: true });
        invariant(!existing, 'OPERATIONAL_EXCEPTION_ALREADY_ACTIVE', 'An active exception already exists for this condition', { exceptionId: existing?.id ?? null });

        const domain = openOperationalException({
          id: exceptionId,
          entity: input?.entity,
          category: input?.category,
          severity: input?.severity,
          blocking: input?.blocking ?? true,
          ownerRole: input?.ownerRole,
          ownerUserId: input?.ownerUserId ?? null,
          dueAt,
          threadId: thread.id,
          recoveryAction: input?.recoveryAction,
          businessImpact: input?.businessImpact ?? null,
          sourceEventId: input?.sourceEventId ?? null,
          slaPolicyId: policy.id,
          slaPolicyVersion: policy.version,
          openedBy: actorId,
          openedAt,
        });
        const value = Object.freeze({
          ...domain,
          ownerOrganisationId,
          dedupeKey,
          calendarMilestoneId: input?.calendarMilestoneId ?? null,
          slaSnapshot: policy,
          slaBreachedAt: null,
        });
        await tx.insertException(value);
        await tx.insertTransition({
          exceptionId: value.id, sequence: 1, fromState: null, toState: 'open', fromVersion: null, toVersion: 1,
          actorId, actorOrganisationId: ownerOrganisationId, occurredAt: openedAt, details: { sourceEventId: value.sourceEventId },
        });
        await append(tx, 'operational.exception.opened.v1', value.id, {
          exceptionId: value.id, entity: value.entity, category: value.category, severity: value.severity,
          blocking: value.blocking, ownerOrganisationId, ownerRole: value.ownerRole, ownerUserId: value.ownerUserId,
          dueAt: value.dueAt, slaPolicyId: policy.id, slaPolicyVersion: policy.version,
        }, commandId, actorId);
        return value;
      });
    },

    assign(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.assign:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        const next = Object.freeze({ ...assignOperationalException(current, { ownerUserId: input?.ownerUserId, assignedBy: actorId, assignedAt: clock() }), ownerOrganisationId: current.ownerOrganisationId, dedupeKey: current.dedupeKey, calendarMilestoneId: current.calendarMilestoneId, slaSnapshot: current.slaSnapshot });
        await transition(tx, current, next, actorId, org, { ownerUserId: next.ownerUserId });
        await append(tx, 'operational.exception.assigned.v1', exceptionId, { exceptionId, ownerUserId: next.ownerUserId, version: next.version }, commandId, actorId);
        return next;
      });
    },

    wait(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.wait:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        const next = preserveAuthority(current, waitOperationalException(current, { waitingFor: input?.waitingFor, note: input?.note, changedBy: actorId, changedAt: clock() }));
        await transition(tx, current, next, actorId, org, { waitingFor: input?.waitingFor, note: input?.note });
        await append(tx, 'operational.exception.waiting.v1', exceptionId, { exceptionId, state: next.state, version: next.version }, commandId, actorId);
        return next;
      });
    },

    escalate(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.escalate:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        const next = preserveAuthority(current, escalateOperationalException(current, {
          reason: input?.reason, escalatedBy: actorId, escalatedAt: clock(),
          ownerRole: input?.ownerRole ?? current.ownerRole, ownerUserId: input?.ownerUserId ?? current.ownerUserId,
        }));
        await transition(tx, current, next, actorId, org, { reason: input?.reason });
        await append(tx, 'operational.exception.escalated.v1', exceptionId, { exceptionId, escalationCount: next.escalationCount, version: next.version }, commandId, actorId);
        return next;
      });
    },

    resolve(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.resolve:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        invariant(Array.isArray(input?.evidenceRefs) && input.evidenceRefs.length > 0, 'OPERATIONAL_EXCEPTION_RECOVERY_EVIDENCE_REQUIRED', 'Recovery requires at least one evidence reference');
        const next = preserveAuthority(current, resolveOperationalException(current, {
          resolution: input?.resolution, evidenceRefs: input.evidenceRefs, resolvedBy: actorId, resolvedAt: clock(),
        }));
        await transition(tx, current, next, actorId, org, { evidenceRefs: next.resolutionEvidenceRefs });
        await append(tx, 'operational.exception.resolved.v1', exceptionId, { exceptionId, version: next.version, evidenceRefs: next.resolutionEvidenceRefs }, commandId, actorId);
        return next;
      });
    },

    acceptRisk(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.acceptRisk:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        const decisionRecord = await tx.getDecision(String(input?.decisionId ?? ''), { lock: true });
        invariant(decisionRecord, 'DECISION_NOT_FOUND', 'Accepted-risk decision not found');
        invariant(decisionRecord.ownerOrganisationId === org, 'DECISION_OWNER_MISMATCH', 'Accepted-risk decision belongs to another organisation');
        invariant(decisionRecord.decision.outcome === 'accepted_with_risk', 'OPERATIONAL_EXCEPTION_RISK_DECISION_OUTCOME_INVALID', 'Decision must explicitly accept the risk');
        invariant(decisionRecord.decision.threadId === current.threadId, 'OPERATIONAL_EXCEPTION_RISK_DECISION_THREAD_MISMATCH', 'Accepted-risk decision must belong to the exception thread');
        invariant(sameEntityIdentity(decisionRecord.decision.entity, current.entity), 'OPERATIONAL_EXCEPTION_RISK_DECISION_ENTITY_MISMATCH', 'Accepted-risk decision belongs to another entity');
        const replacement = await tx.getDecisionSuperseding(decisionRecord.decision.id);
        invariant(!replacement, 'OPERATIONAL_EXCEPTION_RISK_DECISION_SUPERSEDED', 'Accepted-risk decision has been superseded', { supersededBy: replacement?.id ?? null });
        const next = preserveAuthority(current, acceptOperationalExceptionRisk(current, { decisionId: decisionRecord.decision.id, acceptedBy: actorId, acceptedAt: clock() }));
        await transition(tx, current, next, actorId, org, { decisionId: decisionRecord.decision.id });
        await append(tx, 'operational.exception.risk-accepted.v1', exceptionId, { exceptionId, decisionId: decisionRecord.decision.id, version: next.version }, commandId, actorId);
        return next;
      });
    },

    close(commandId, actorId, exceptionId, input) {
      const fingerprint = `operationalException.close:${actorId}:${exceptionId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const org = String(input?.actingOrganisationId ?? '');
        const current = await loadManaged(tx, exceptionId, actorId, org, input?.expectedVersion);
        const next = preserveAuthority(current, closeOperationalException(current, { closedBy: actorId, closedAt: clock() }));
        await transition(tx, current, next, actorId, org);
        await append(tx, 'operational.exception.closed.v1', exceptionId, { exceptionId, version: next.version }, commandId, actorId);
        return next;
      });
    },

    async getForActor(actorId, exceptionId) {
      return store.transaction(async (tx) => {
        const value = await tx.getException(exceptionId, { lock: false });
        invariant(value, 'OPERATIONAL_EXCEPTION_NOT_FOUND', 'Operational exception not found', { exceptionId });
        await requireMembership(tx, value.ownerOrganisationId, actorId, CAPABILITIES.EXCEPTION_READ);
        const transitions = await tx.listTransitions(exceptionId);
        return Object.freeze({ ...value, transitions: Object.freeze(transitions) });
      });
    },

    async listForEntity(actorId, entityType, entityId) {
      return store.transaction(async (tx) => Object.freeze(await tx.listExceptionsForActorEntity({
        actorId, entityType, entityId, roles: await tx.rolesWithActiveMembership(actorId, CAPABILITIES.EXCEPTION_READ),
      })));
    },

    async scanDueForEscalation({ asOf = clock(), limit = 100 } = {}) {
      return store.transaction(async (tx) => {
        const rows = await tx.listDueActiveExceptions(asOf, limit);
        return Object.freeze(rows.filter((row) => ACTIVE_STATES.has(row.state) && !row.slaBreachedAt));
      });
    },

    async processDueEscalations({ asOf = clock(), limit = 100, actorId = 'system:sla-breach' } = {}) {
      invariant(typeof asOf === 'string' && Number.isFinite(Date.parse(asOf)), 'OPERATIONAL_EXCEPTION_ESCALATION_AS_OF_INVALID', 'SLA escalation reference time is invalid');
      invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000, 'OPERATIONAL_EXCEPTION_ESCALATION_LIMIT_INVALID', 'SLA escalation batch limit must be from 1 to 1000');
      invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 200, 'OPERATIONAL_EXCEPTION_ESCALATION_ACTOR_INVALID', 'SLA escalation actor is invalid');
      const breachedAt = new Date(Date.parse(asOf)).toISOString();
      return store.transaction(async (tx) => {
        const rows = await tx.listDueActiveExceptions(breachedAt, limit);
        const results = [];
        for (const current of rows) {
          if (!ACTIVE_STATES.has(current.state) || current.slaBreachedAt) continue;
          const breachKey = `sla-breach:${current.id}:${current.dueAt}`;
          const escalated = escalateOperationalException(current, {
            reason: 'SLA deadline breached',
            escalatedBy: actorId,
            escalatedAt: breachedAt,
            ownerRole: current.ownerRole,
            ownerUserId: current.ownerUserId,
          });
          const next = Object.freeze({
            ...preserveAuthority(current, escalated),
            slaBreachedAt: breachedAt,
          });
          await transition(tx, current, next, actorId, current.ownerOrganisationId, {
            reason: 'SLA deadline breached',
            automatic: true,
            breachKey,
            dueAt: current.dueAt,
          });
          await append(tx, 'operational.exception.sla-breached.v1', current.id, {
            exceptionId: current.id,
            ownerOrganisationId: current.ownerOrganisationId,
            dueAt: current.dueAt,
            breachedAt,
            breachKey,
            escalationCount: next.escalationCount,
            version: next.version,
          }, breachKey, actorId);
          results.push(Object.freeze({
            status: 'escalated',
            exceptionId: current.id,
            breachKey,
            version: next.version,
            breachedAt,
          }));
        }
        return Object.freeze(results);
      });
    },
  });
}

function normalizePolicy(input) {
  const responseMinutes = positiveInteger(input?.responseMinutes, 'OPERATIONAL_SLA_RESPONSE_INVALID');
  const resolutionMinutes = positiveInteger(input?.resolutionMinutes, 'OPERATIONAL_SLA_RESOLUTION_INVALID');
  const escalationMinutes = positiveInteger(input?.escalationMinutes, 'OPERATIONAL_SLA_ESCALATION_INVALID');
  invariant(resolutionMinutes >= responseMinutes, 'OPERATIONAL_SLA_ORDER_INVALID', 'Resolution target cannot be earlier than response target');
  invariant(escalationMinutes <= resolutionMinutes, 'OPERATIONAL_SLA_ESCALATION_AFTER_RESOLUTION', 'Escalation threshold cannot be after resolution target');
  const status = input?.status ?? 'active';
  invariant(['active','retired'].includes(status), 'OPERATIONAL_SLA_STATUS_INVALID', 'Unsupported SLA policy status');
  return Object.freeze({
    id: String(input.id), version: input.version, ownerOrganisationId: String(input.ownerOrganisationId),
    name: requiredText(input?.name, 2, 160, 'OPERATIONAL_SLA_NAME_INVALID'),
    status, responseMinutes, resolutionMinutes, escalationMinutes,
    applicability: Object.freeze({
      categories: Object.freeze(uniqueText(input?.applicability?.categories ?? [])),
      severities: Object.freeze(uniqueText(input?.applicability?.severities ?? [])),
      blockingOnly: input?.applicability?.blockingOnly === true,
    }),
    createdBy: String(input.createdBy), createdAt: new Date(input.createdAt).toISOString(),
  });
}
function assertPolicyApplies(policy, input) {
  const a = policy.applicability ?? {};
  invariant(!a.categories?.length || a.categories.includes(input?.category), 'OPERATIONAL_SLA_POLICY_CATEGORY_MISMATCH', 'SLA policy does not apply to this exception category');
  invariant(!a.severities?.length || a.severities.includes(input?.severity), 'OPERATIONAL_SLA_POLICY_SEVERITY_MISMATCH', 'SLA policy does not apply to this exception severity');
  invariant(!a.blockingOnly || (input?.blocking ?? true) === true, 'OPERATIONAL_SLA_POLICY_BLOCKING_MISMATCH', 'SLA policy applies only to blocking exceptions');
}
function buildDedupeKey(input) {
  return [input?.entity?.type, input?.entity?.id, input?.category, input?.sourceEventId ?? 'manual'].map((value) => String(value ?? '').trim()).join(':');
}
function preserveAuthority(current, next) {
  return Object.freeze({ ...next, ownerOrganisationId: current.ownerOrganisationId, dedupeKey: current.dedupeKey, calendarMilestoneId: current.calendarMilestoneId, slaSnapshot: current.slaSnapshot });
}
function positiveInteger(value, code) { invariant(Number.isSafeInteger(value) && value > 0, code, 'Value must be a positive integer'); return value; }
function requiredText(value, min, max, code) { const text = typeof value === 'string' ? value.trim() : ''; invariant(text.length >= min && text.length <= max, code, 'Text is outside allowed bounds'); return text; }
function uniqueText(values) { invariant(Array.isArray(values), 'OPERATIONAL_SLA_APPLICABILITY_INVALID', 'Applicability list must be an array'); return [...new Set(values.map(String).map((v) => v.trim()).filter(Boolean))].sort(); }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
