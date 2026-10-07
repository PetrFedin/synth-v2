import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptOperationalExceptionRisk,
  appendEntityThreadMessage,
  archiveEntityThread,
  assignOperationalException,
  closeOperationalException,
  createEntityThread,
  escalateOperationalException,
  isOperationalExceptionBlocking,
  openOperationalException,
  operationalEntityReference,
  recordDecision,
  resolveEntityThread,
  resolveOperationalException,
  sameEntityIdentity,
  waitOperationalException,
} from '../src/modules/operational-control/public.mjs';

const at = (day, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const orderRef = () => operationalEntityReference({ type: 'order', id: 'order-1', version: 3, contentHash: 'a'.repeat(64) });

test('operational entity references pin supported identity, version and hash', () => {
  const ref = orderRef();
  assert.deepEqual(ref, { type: 'order', id: 'order-1', version: 3, contentHash: 'a'.repeat(64) });
  assert.throws(() => operationalEntityReference({ type: 'unknown', id: 'x' }), /OPERATIONAL_ENTITY_TYPE_INVALID/);
  assert.throws(() => operationalEntityReference({ type: 'order', id: 'x', contentHash: 'bad' }), /OPERATIONAL_ENTITY_HASH_INVALID/);
});

test('entity thread normalises participants and always includes the owner organisation', () => {
  const thread = createEntityThread({
    id: 'thread-1',
    ownerOrganisationId: 'brand-1',
    participantOrganisationIds: ['shop-1', 'brand-1', 'shop-1'],
    entity: orderRef(),
    title: 'Order clarification',
    kind: 'clarification',
    createdBy: 'user-1',
    createdAt: at(7),
  });
  assert.deepEqual(thread.participantOrganisationIds, ['brand-1', 'shop-1']);
  assert.equal(thread.status, 'open');
  assert.equal(thread.version, 1);
  assert.ok(Object.isFrozen(thread));
  assert.ok(Object.isFrozen(thread.participantOrganisationIds));
});

test('only participating organisations can append messages and archived/resolved threads cannot receive them', () => {
  const thread = createEntityThread({
    id: 'thread-1',
    ownerOrganisationId: 'brand-1',
    participantOrganisationIds: ['shop-1'],
    entity: orderRef(),
    title: 'Order clarification',
    createdBy: 'user-1',
    createdAt: at(7),
  });
  const message = appendEntityThreadMessage({
    id: 'message-1',
    thread,
    authorOrganisationId: 'shop-1',
    authorId: 'buyer-1',
    body: 'Please confirm the delivery window.',
    evidenceRefs: ['doc-2', 'doc-1', 'doc-1'],
    mentionedUserIds: ['sales-1'],
    createdAt: at(7, 10),
  });
  assert.deepEqual(message.evidenceRefs, ['doc-1', 'doc-2']);
  assert.throws(() => appendEntityThreadMessage({
    id: 'message-2', thread, authorOrganisationId: 'other-1', authorId: 'x', body: 'No', createdAt: at(7, 11),
  }), /ENTITY_THREAD_PARTICIPANT_REQUIRED/);
  const resolved = resolveEntityThread(thread, { resolvedBy: 'sales-1', resolvedAt: at(7, 12) });
  assert.throws(() => appendEntityThreadMessage({
    id: 'message-3', thread: resolved, authorOrganisationId: 'brand-1', authorId: 'sales-1', body: 'Late', createdAt: at(7, 13),
  }), /ENTITY_THREAD_NOT_OPEN/);
  const archived = archiveEntityThread(resolved, { archivedBy: 'sales-1', archivedAt: at(7, 14) });
  assert.equal(archived.status, 'archived');
});

test('decisions are immutable records pinned to the same stable entity as their thread', () => {
  const thread = createEntityThread({
    id: 'thread-1',
    ownerOrganisationId: 'brand-1',
    participantOrganisationIds: ['shop-1'],
    entity: orderRef(),
    title: 'Commercial decision',
    createdBy: 'sales-1',
    createdAt: at(7),
  });
  const decision = recordDecision({
    id: 'decision-1',
    thread,
    entity: { type: 'order', id: 'order-1', version: 4, contentHash: 'b'.repeat(64) },
    decisionType: 'delivery-window',
    outcome: 'approved',
    rationale: 'Both parties accepted the revised dates.',
    evidenceRefs: ['thread-message-3'],
    decidedBy: 'buyer-1',
    decidedByOrganisationId: 'shop-1',
    decidedAt: at(7, 15),
  });
  assert.equal(decision.entity.version, 4);
  assert.ok(Object.isFrozen(decision));
  assert.throws(() => recordDecision({
    id: 'decision-2',
    thread,
    entity: { type: 'shipment-notice', id: 'ship-1' },
    decisionType: 'delivery-window',
    outcome: 'approved',
    rationale: 'Wrong context.',
    decidedBy: 'buyer-1',
    decidedByOrganisationId: 'shop-1',
    decidedAt: at(7, 16),
  }), /DECISION_ENTITY_THREAD_MISMATCH/);
  assert.equal(sameEntityIdentity(thread.entity, decision.entity), true);
});

test('operational exception requires a future due date, owner role, thread and recovery action', () => {
  const exception = openOperationalException({
    id: 'exception-1',
    entity: orderRef(),
    category: 'capacity_conflict',
    severity: 'high',
    ownerRole: 'production',
    dueAt: at(8),
    threadId: 'thread-1',
    recoveryAction: 'Replan the line or move the production window.',
    businessImpact: 'Requested delivery date is at risk.',
    sourceEventId: 'event-1',
    slaPolicyId: 'capacity-p0',
    slaPolicyVersion: 1,
    openedBy: 'system',
    openedAt: at(7),
  });
  assert.equal(exception.state, 'open');
  assert.equal(isOperationalExceptionBlocking(exception), true);
  assert.throws(() => openOperationalException({
    id: 'bad',
    entity: orderRef(),
    category: 'capacity_conflict',
    severity: 'high',
    ownerRole: 'production',
    dueAt: at(6),
    threadId: 'thread-1',
    recoveryAction: 'Replan.',
    openedBy: 'system',
    openedAt: at(7),
  }), /OPERATIONAL_EXCEPTION_DUE_NOT_AFTER_OPEN/);
});

test('exception lifecycle supports assignment, waiting, escalation and resolution without destructive overwrite', () => {
  const opened = openOperationalException({
    id: 'exception-1',
    entity: orderRef(),
    category: 'missing_document',
    severity: 'medium',
    ownerRole: 'quality',
    dueAt: at(9),
    threadId: 'thread-1',
    recoveryAction: 'Attach the missing certificate.',
    openedBy: 'system',
    openedAt: at(7),
  });
  const assigned = assignOperationalException(opened, { ownerUserId: 'quality-1', assignedBy: 'owner-1', assignedAt: at(7, 10) });
  const waiting = waitOperationalException(assigned, { waitingFor: 'document', note: 'Waiting for certificate.', changedBy: 'quality-1', changedAt: at(7, 11) });
  const escalated = escalateOperationalException(waiting, { reason: 'Supplier missed the document deadline.', escalatedBy: 'owner-1', escalatedAt: at(8, 9) });
  const resolved = resolveOperationalException(escalated, { resolution: 'Certificate attached and validated.', evidenceRefs: ['cert-1'], resolvedBy: 'quality-1', resolvedAt: at(8, 10) });
  const closed = closeOperationalException(resolved, { closedBy: 'owner-1', closedAt: at(8, 11) });
  assert.deepEqual(
    [opened.version, assigned.version, waiting.version, escalated.version, resolved.version, closed.version],
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(escalated.escalationCount, 1);
  assert.equal(isOperationalExceptionBlocking(resolved), false);
  assert.equal(closed.state, 'closed');
  assert.throws(() => assignOperationalException(resolved, { ownerUserId: 'x', assignedBy: 'x', assignedAt: at(8, 12) }), /OPERATIONAL_EXCEPTION_NOT_ACTIVE/);
});

test('accepted risk requires an explicit decision and stops the exception from blocking', () => {
  const opened = openOperationalException({
    id: 'exception-1',
    entity: orderRef(),
    category: 'policy_block',
    severity: 'high',
    ownerRole: 'owner',
    dueAt: at(9),
    threadId: 'thread-1',
    recoveryAction: 'Obtain an approved risk decision.',
    openedBy: 'system',
    openedAt: at(7),
  });
  const accepted = acceptOperationalExceptionRisk(opened, {
    decisionId: 'decision-risk-1',
    acceptedBy: 'owner-1',
    acceptedAt: at(7, 10),
  });
  assert.equal(accepted.state, 'accepted_with_risk');
  assert.equal(accepted.acceptedRiskDecisionId, 'decision-risk-1');
  assert.equal(isOperationalExceptionBlocking(accepted), false);
  const closed = closeOperationalException(accepted, { closedBy: 'owner-1', closedAt: at(7, 11) });
  assert.equal(closed.state, 'closed');
});

test('open exceptions cannot be closed directly', () => {
  const opened = openOperationalException({
    id: 'exception-1',
    entity: orderRef(),
    category: 'other',
    severity: 'low',
    blocking: false,
    ownerRole: 'sales',
    dueAt: at(10),
    threadId: 'thread-1',
    recoveryAction: 'Record the disposition.',
    openedBy: 'sales-1',
    openedAt: at(7),
  });
  assert.throws(() => closeOperationalException(opened, { closedBy: 'sales-1', closedAt: at(8) }), /OPERATIONAL_EXCEPTION_NOT_CLOSABLE/);
  assert.equal(isOperationalExceptionBlocking(opened), false);
});
