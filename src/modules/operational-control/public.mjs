import { invariant } from '../../core/errors.mjs';

export const OPERATIONAL_ENTITY_TYPES = Object.freeze([
  'collection',
  'product-style',
  'style-version',
  'colorway',
  'product-sku',
  'bom',
  'bom-line',
  'measurement-chart',
  'sample',
  'tech-pack',
  'sourcing-rfq',
  'material-rfq',
  'material-purchase-order',
  'production-requirement',
  'production-order',
  'production-execution',
  'quality-inspection',
  'material-lot',
  'commercial-publication',
  'buyer-catalog-version',
  'selection',
  'order',
  'order-line',
  'fulfillment-plan',
  'shipment-notice',
  'receipt',
  'receipt-claim',
  'supplier',
  'supplier-facility',
  'deal',
  'calendar-milestone',
  'exception',
]);

export const THREAD_STATUSES = Object.freeze(['open', 'resolved', 'archived']);
export const THREAD_KINDS = Object.freeze(['general', 'clarification', 'fit', 'qc', 'sourcing', 'handoff', 'exception']);
export const DECISION_OUTCOMES = Object.freeze(['approved', 'rejected', 'accepted_with_risk', 'deferred', 'waived', 'recorded']);
export const EXCEPTION_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
export const EXCEPTION_CATEGORIES = Object.freeze([
  'missing_data',
  'missing_document',
  'price_conflict',
  'terms_conflict',
  'reserve_conflict',
  'capacity_conflict',
  'material_shortage',
  'supplier_late',
  'qc_fail',
  'marking_issue',
  'shipment_delay',
  'delivery_discrepancy',
  'payment_overdue',
  'integration_failed',
  'permission_denied',
  'policy_block',
  'other',
]);
export const EXCEPTION_STATES = Object.freeze([
  'open',
  'assigned',
  'waiting_for_role',
  'waiting_for_document',
  'escalated',
  'resolved',
  'accepted_with_risk',
  'closed',
]);

const ACTIVE_EXCEPTION_STATES = new Set(['open', 'assigned', 'waiting_for_role', 'waiting_for_document', 'escalated']);
const WAITING_KINDS = new Set(['role', 'document']);

export function operationalEntityReference({ type, id, version = null, contentHash = null }) {
  invariant(OPERATIONAL_ENTITY_TYPES.includes(type), 'OPERATIONAL_ENTITY_TYPE_INVALID', 'Unsupported operational entity type', { type });
  const normalizedId = requiredText(id, 1, 240, 'OPERATIONAL_ENTITY_ID_INVALID', 'Entity id');
  const normalizedVersion = version === null || version === undefined || version === ''
    ? null
    : positiveInteger(version, 'OPERATIONAL_ENTITY_VERSION_INVALID', 'Entity version');
  const normalizedHash = contentHash === null || contentHash === undefined || contentHash === ''
    ? null
    : requiredHash(contentHash);
  return Object.freeze({ type, id: normalizedId, version: normalizedVersion, contentHash: normalizedHash });
}

export function createEntityThread({
  id,
  ownerOrganisationId,
  participantOrganisationIds = [],
  entity,
  title,
  kind = 'general',
  createdBy,
  createdAt,
}) {
  invariant(THREAD_KINDS.includes(kind), 'ENTITY_THREAD_KIND_INVALID', 'Unsupported thread kind', { kind });
  const owner = requiredText(ownerOrganisationId, 1, 200, 'ENTITY_THREAD_OWNER_REQUIRED', 'Thread owner organisation');
  const participants = uniqueText([owner, ...participantOrganisationIds], 1, 200, 'ENTITY_THREAD_PARTICIPANT_INVALID', 'Participant organisation');
  invariant(participants.length <= 32, 'ENTITY_THREAD_PARTICIPANT_LIMIT', 'Thread cannot include more than 32 organisations');
  return Object.freeze({
    id: requiredText(id, 1, 200, 'ENTITY_THREAD_ID_REQUIRED', 'Thread id'),
    ownerOrganisationId: owner,
    participantOrganisationIds: Object.freeze(participants),
    entity: normalizeEntity(entity),
    title: requiredText(title, 2, 200, 'ENTITY_THREAD_TITLE_INVALID', 'Thread title'),
    kind,
    status: 'open',
    version: 1,
    createdBy: requiredText(createdBy, 1, 200, 'ENTITY_THREAD_CREATOR_REQUIRED', 'Thread creator'),
    createdAt: timestamp(createdAt, 'ENTITY_THREAD_CREATED_AT_INVALID'),
    resolvedAt: null,
    archivedAt: null,
  });
}

export function resolveEntityThread(thread, { resolvedBy, resolvedAt }) {
  assertThread(thread);
  invariant(thread.status === 'open', 'ENTITY_THREAD_NOT_OPEN', 'Only an open thread can be resolved', { status: thread.status });
  const at = timestamp(resolvedAt, 'ENTITY_THREAD_RESOLVED_AT_INVALID');
  return Object.freeze({
    ...thread,
    status: 'resolved',
    version: thread.version + 1,
    resolvedBy: requiredText(resolvedBy, 1, 200, 'ENTITY_THREAD_RESOLVER_REQUIRED', 'Thread resolver'),
    resolvedAt: at,
  });
}

export function archiveEntityThread(thread, { archivedBy, archivedAt }) {
  assertThread(thread);
  invariant(thread.status !== 'archived', 'ENTITY_THREAD_ALREADY_ARCHIVED', 'Thread is already archived');
  const at = timestamp(archivedAt, 'ENTITY_THREAD_ARCHIVED_AT_INVALID');
  return Object.freeze({
    ...thread,
    status: 'archived',
    version: thread.version + 1,
    archivedBy: requiredText(archivedBy, 1, 200, 'ENTITY_THREAD_ARCHIVER_REQUIRED', 'Thread archiver'),
    archivedAt: at,
  });
}

export function appendEntityThreadMessage({
  id,
  thread,
  authorOrganisationId,
  authorId,
  body,
  evidenceRefs = [],
  mentionedUserIds = [],
  createdAt,
}) {
  assertThread(thread);
  invariant(thread.status === 'open', 'ENTITY_THREAD_NOT_OPEN', 'Only an open thread can receive messages', { status: thread.status });
  const organisationId = requiredText(authorOrganisationId, 1, 200, 'ENTITY_MESSAGE_ORGANISATION_REQUIRED', 'Message author organisation');
  invariant(thread.participantOrganisationIds.includes(organisationId), 'ENTITY_THREAD_PARTICIPANT_REQUIRED', 'Message author organisation is not a thread participant', { organisationId, threadId: thread.id });
  return Object.freeze({
    id: requiredText(id, 1, 200, 'ENTITY_MESSAGE_ID_REQUIRED', 'Message id'),
    threadId: thread.id,
    entity: thread.entity,
    authorOrganisationId: organisationId,
    authorId: requiredText(authorId, 1, 200, 'ENTITY_MESSAGE_AUTHOR_REQUIRED', 'Message author'),
    body: requiredText(body, 1, 5000, 'ENTITY_MESSAGE_BODY_INVALID', 'Message body'),
    evidenceRefs: Object.freeze(uniqueText(evidenceRefs, 1, 400, 'ENTITY_MESSAGE_EVIDENCE_REF_INVALID', 'Evidence reference')),
    mentionedUserIds: Object.freeze(uniqueText(mentionedUserIds, 1, 200, 'ENTITY_MESSAGE_MENTION_INVALID', 'Mentioned user')),
    createdAt: timestamp(createdAt, 'ENTITY_MESSAGE_CREATED_AT_INVALID'),
  });
}

export function recordDecision({
  id,
  thread = null,
  entity,
  decisionType,
  outcome,
  rationale,
  evidenceRefs = [],
  decidedBy,
  decidedByOrganisationId,
  decidedAt,
  supersedesDecisionId = null,
}) {
  const normalizedEntity = normalizeEntity(entity);
  if (thread) {
    assertThread(thread);
    invariant(sameEntityIdentity(thread.entity, normalizedEntity), 'DECISION_ENTITY_THREAD_MISMATCH', 'Decision entity does not match thread entity', {
      threadId: thread.id,
      threadEntity: thread.entity,
      decisionEntity: normalizedEntity,
    });
    const organisationId = requiredText(decidedByOrganisationId, 1, 200, 'DECISION_ORGANISATION_REQUIRED', 'Decision organisation');
    invariant(thread.participantOrganisationIds.includes(organisationId), 'DECISION_THREAD_PARTICIPANT_REQUIRED', 'Decision organisation is not a thread participant', { organisationId, threadId: thread.id });
  }
  invariant(DECISION_OUTCOMES.includes(outcome), 'DECISION_OUTCOME_INVALID', 'Unsupported decision outcome', { outcome });
  return Object.freeze({
    id: requiredText(id, 1, 200, 'DECISION_ID_REQUIRED', 'Decision id'),
    threadId: thread?.id ?? null,
    entity: normalizedEntity,
    decisionType: requiredText(decisionType, 2, 120, 'DECISION_TYPE_INVALID', 'Decision type'),
    outcome,
    rationale: requiredText(rationale, 2, 4000, 'DECISION_RATIONALE_INVALID', 'Decision rationale'),
    evidenceRefs: Object.freeze(uniqueText(evidenceRefs, 1, 400, 'DECISION_EVIDENCE_REF_INVALID', 'Evidence reference')),
    decidedBy: requiredText(decidedBy, 1, 200, 'DECISION_ACTOR_REQUIRED', 'Decision actor'),
    decidedByOrganisationId: requiredText(decidedByOrganisationId, 1, 200, 'DECISION_ORGANISATION_REQUIRED', 'Decision organisation'),
    decidedAt: timestamp(decidedAt, 'DECISION_AT_INVALID'),
    supersedesDecisionId: optionalText(supersedesDecisionId, 200, 'DECISION_SUPERSEDES_INVALID', 'Superseded decision id'),
  });
}

export function openOperationalException({
  id,
  entity,
  category,
  severity,
  blocking = true,
  ownerRole,
  ownerUserId = null,
  dueAt,
  threadId,
  recoveryAction,
  businessImpact = null,
  sourceEventId = null,
  slaPolicyId = null,
  slaPolicyVersion = null,
  openedBy,
  openedAt,
}) {
  invariant(EXCEPTION_CATEGORIES.includes(category), 'OPERATIONAL_EXCEPTION_CATEGORY_INVALID', 'Unsupported exception category', { category });
  invariant(EXCEPTION_SEVERITIES.includes(severity), 'OPERATIONAL_EXCEPTION_SEVERITY_INVALID', 'Unsupported exception severity', { severity });
  invariant(typeof blocking === 'boolean', 'OPERATIONAL_EXCEPTION_BLOCKING_INVALID', 'Exception blocking flag must be boolean');
  const opened = timestamp(openedAt, 'OPERATIONAL_EXCEPTION_OPENED_AT_INVALID');
  const due = timestamp(dueAt, 'OPERATIONAL_EXCEPTION_DUE_AT_INVALID');
  invariant(Date.parse(due) > Date.parse(opened), 'OPERATIONAL_EXCEPTION_DUE_NOT_AFTER_OPEN', 'Exception due date must be after it was opened');
  const normalizedPolicyVersion = slaPolicyVersion === null || slaPolicyVersion === undefined || slaPolicyVersion === ''
    ? null
    : positiveInteger(slaPolicyVersion, 'OPERATIONAL_EXCEPTION_SLA_VERSION_INVALID', 'SLA policy version');
  return Object.freeze({
    id: requiredText(id, 1, 200, 'OPERATIONAL_EXCEPTION_ID_REQUIRED', 'Exception id'),
    entity: normalizeEntity(entity),
    category,
    severity,
    blocking,
    ownerRole: requiredText(ownerRole, 1, 120, 'OPERATIONAL_EXCEPTION_OWNER_ROLE_REQUIRED', 'Exception owner role'),
    ownerUserId: optionalText(ownerUserId, 200, 'OPERATIONAL_EXCEPTION_OWNER_USER_INVALID', 'Exception owner user'),
    dueAt: due,
    threadId: requiredText(threadId, 1, 200, 'OPERATIONAL_EXCEPTION_THREAD_REQUIRED', 'Exception thread'),
    recoveryAction: requiredText(recoveryAction, 2, 2000, 'OPERATIONAL_EXCEPTION_RECOVERY_INVALID', 'Recovery action'),
    businessImpact: optionalText(businessImpact, 2000, 'OPERATIONAL_EXCEPTION_IMPACT_INVALID', 'Business impact'),
    sourceEventId: optionalText(sourceEventId, 200, 'OPERATIONAL_EXCEPTION_SOURCE_EVENT_INVALID', 'Source event'),
    slaPolicyId: optionalText(slaPolicyId, 160, 'OPERATIONAL_EXCEPTION_SLA_POLICY_INVALID', 'SLA policy'),
    slaPolicyVersion: normalizedPolicyVersion,
    state: 'open',
    version: 1,
    escalationCount: 0,
    openedBy: requiredText(openedBy, 1, 200, 'OPERATIONAL_EXCEPTION_OPENER_REQUIRED', 'Exception opener'),
    openedAt: opened,
    assignedAt: null,
    resolvedAt: null,
    closedAt: null,
    acceptedRiskDecisionId: null,
  });
}

export function assignOperationalException(exception, { ownerUserId, assignedBy, assignedAt }) {
  assertExceptionActive(exception);
  return transitionException(exception, {
    state: 'assigned',
    ownerUserId: requiredText(ownerUserId, 1, 200, 'OPERATIONAL_EXCEPTION_OWNER_USER_REQUIRED', 'Exception owner user'),
    assignedBy: requiredText(assignedBy, 1, 200, 'OPERATIONAL_EXCEPTION_ASSIGNER_REQUIRED', 'Exception assigner'),
    assignedAt: timestamp(assignedAt, 'OPERATIONAL_EXCEPTION_ASSIGNED_AT_INVALID'),
  });
}

export function waitOperationalException(exception, { waitingFor, note, changedBy, changedAt }) {
  assertExceptionActive(exception);
  invariant(WAITING_KINDS.has(waitingFor), 'OPERATIONAL_EXCEPTION_WAIT_KIND_INVALID', 'Exception can wait only for role or document', { waitingFor });
  return transitionException(exception, {
    state: waitingFor === 'role' ? 'waiting_for_role' : 'waiting_for_document',
    waitingNote: requiredText(note, 2, 1000, 'OPERATIONAL_EXCEPTION_WAIT_NOTE_INVALID', 'Waiting note'),
    changedBy: requiredText(changedBy, 1, 200, 'OPERATIONAL_EXCEPTION_CHANGED_BY_REQUIRED', 'Exception actor'),
    changedAt: timestamp(changedAt, 'OPERATIONAL_EXCEPTION_CHANGED_AT_INVALID'),
  });
}

export function escalateOperationalException(exception, {
  reason,
  escalatedBy,
  escalatedAt,
  ownerRole = exception?.ownerRole,
  ownerUserId = exception?.ownerUserId ?? null,
}) {
  assertExceptionActive(exception);
  return transitionException(exception, {
    state: 'escalated',
    ownerRole: requiredText(ownerRole, 1, 120, 'OPERATIONAL_EXCEPTION_OWNER_ROLE_REQUIRED', 'Exception owner role'),
    ownerUserId: optionalText(ownerUserId, 200, 'OPERATIONAL_EXCEPTION_OWNER_USER_INVALID', 'Exception owner user'),
    escalationCount: exception.escalationCount + 1,
    escalationReason: requiredText(reason, 2, 1000, 'OPERATIONAL_EXCEPTION_ESCALATION_REASON_INVALID', 'Escalation reason'),
    escalatedBy: requiredText(escalatedBy, 1, 200, 'OPERATIONAL_EXCEPTION_ESCALATOR_REQUIRED', 'Exception escalator'),
    escalatedAt: timestamp(escalatedAt, 'OPERATIONAL_EXCEPTION_ESCALATED_AT_INVALID'),
  });
}

export function resolveOperationalException(exception, { resolution, evidenceRefs = [], resolvedBy, resolvedAt }) {
  assertExceptionActive(exception);
  return transitionException(exception, {
    state: 'resolved',
    resolution: requiredText(resolution, 2, 2000, 'OPERATIONAL_EXCEPTION_RESOLUTION_INVALID', 'Exception resolution'),
    resolutionEvidenceRefs: Object.freeze(uniqueText(evidenceRefs, 1, 400, 'OPERATIONAL_EXCEPTION_EVIDENCE_REF_INVALID', 'Evidence reference')),
    resolvedBy: requiredText(resolvedBy, 1, 200, 'OPERATIONAL_EXCEPTION_RESOLVER_REQUIRED', 'Exception resolver'),
    resolvedAt: timestamp(resolvedAt, 'OPERATIONAL_EXCEPTION_RESOLVED_AT_INVALID'),
  });
}

export function acceptOperationalExceptionRisk(exception, { decisionId, acceptedBy, acceptedAt }) {
  assertExceptionActive(exception);
  return transitionException(exception, {
    state: 'accepted_with_risk',
    acceptedRiskDecisionId: requiredText(decisionId, 1, 200, 'OPERATIONAL_EXCEPTION_RISK_DECISION_REQUIRED', 'Accepted-risk decision'),
    acceptedBy: requiredText(acceptedBy, 1, 200, 'OPERATIONAL_EXCEPTION_RISK_ACTOR_REQUIRED', 'Accepted-risk actor'),
    acceptedAt: timestamp(acceptedAt, 'OPERATIONAL_EXCEPTION_RISK_AT_INVALID'),
  });
}

export function closeOperationalException(exception, { closedBy, closedAt }) {
  assertException(exception);
  invariant(exception.state === 'resolved' || exception.state === 'accepted_with_risk', 'OPERATIONAL_EXCEPTION_NOT_CLOSABLE', 'Exception can close only after resolution or accepted risk', { state: exception.state });
  return transitionException(exception, {
    state: 'closed',
    closedBy: requiredText(closedBy, 1, 200, 'OPERATIONAL_EXCEPTION_CLOSER_REQUIRED', 'Exception closer'),
    closedAt: timestamp(closedAt, 'OPERATIONAL_EXCEPTION_CLOSED_AT_INVALID'),
  });
}

export function isOperationalExceptionBlocking(exception) {
  assertException(exception);
  return exception.blocking === true && ACTIVE_EXCEPTION_STATES.has(exception.state);
}

export function sameEntityIdentity(left, right) {
  const a = normalizeEntity(left);
  const b = normalizeEntity(right);
  return a.type === b.type && a.id === b.id;
}

function normalizeEntity(value) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'OPERATIONAL_ENTITY_REF_REQUIRED', 'Operational entity reference is required');
  return operationalEntityReference(value);
}

function assertThread(thread) {
  invariant(thread && typeof thread === 'object', 'ENTITY_THREAD_REQUIRED', 'Entity thread is required');
  invariant(THREAD_STATUSES.includes(thread.status), 'ENTITY_THREAD_STATUS_INVALID', 'Thread status is invalid', { status: thread?.status });
  invariant(Array.isArray(thread.participantOrganisationIds), 'ENTITY_THREAD_PARTICIPANTS_INVALID', 'Thread participants are invalid');
  normalizeEntity(thread.entity);
}

function assertException(exception) {
  invariant(exception && typeof exception === 'object', 'OPERATIONAL_EXCEPTION_REQUIRED', 'Operational exception is required');
  invariant(EXCEPTION_STATES.includes(exception.state), 'OPERATIONAL_EXCEPTION_STATE_INVALID', 'Exception state is invalid', { state: exception?.state });
  normalizeEntity(exception.entity);
}

function assertExceptionActive(exception) {
  assertException(exception);
  invariant(ACTIVE_EXCEPTION_STATES.has(exception.state), 'OPERATIONAL_EXCEPTION_NOT_ACTIVE', 'Exception is not active', { state: exception.state });
}

function transitionException(exception, patch) {
  return Object.freeze({ ...exception, ...patch, version: exception.version + 1 });
}

function uniqueText(values, min, max, code, label) {
  invariant(Array.isArray(values), code, label + ' list must be an array');
  return [...new Set(values.map((value) => requiredText(value, min, max, code, label)))].sort();
}

function requiredText(value, min, max, code, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`);
  return normalized;
}

function optionalText(value, max, code, label) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, 1, max, code, label);
}

function positiveInteger(value, code, label) {
  invariant(Number.isInteger(value) && value >= 1 && value <= 2_147_483_647, code, `${label} must be a positive PostgreSQL integer`);
  return value;
}

function requiredHash(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  invariant(/^[a-f0-9]{64}$/.test(normalized), 'OPERATIONAL_ENTITY_HASH_INVALID', 'Entity content hash must be a SHA-256 hex digest');
  return normalized;
}

function timestamp(value, code) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time');
  return new Date(parsed).toISOString();
}
