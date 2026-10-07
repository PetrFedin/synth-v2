import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalCollaborationService } from '../src/application/operational-collaboration-service.mjs';

function fixture() {
  const state = {
    commands: new Map(), threads: new Map(), participants: new Map(), messages: [], decisions: new Map(), outbox: [],
  };
  const organisations = new Map([
    ['brand-1', { id: 'brand-1', type: 'brand' }],
    ['shop-1', { id: 'shop-1', type: 'shop' }],
    ['shop-2', { id: 'shop-2', type: 'shop' }],
  ]);
  const memberships = new Map([
    ['brand-1:owner-1', { organisationId: 'brand-1', userId: 'owner-1', role: 'owner', status: 'active' }],
    ['shop-1:buyer-1', { organisationId: 'shop-1', userId: 'buyer-1', role: 'buyer', status: 'active' }],
  ]);
  const relationships = new Map([['brand-1:shop-1', { brandId: 'brand-1', shopId: 'shop-1', status: 'active' }]]);
  let sequence = 0;
  const nextId = (prefix) => `${prefix}-${++sequence}`;
  const clockValues = Array.from({ length: 30 }, (_, index) => `2026-10-07T13:${String(index).padStart(2,'0')}:00.000Z`);
  let clockIndex = 0;
  const clock = () => clockValues[clockIndex++] ?? '2026-10-07T14:00:00.000Z';

  const tx = {
    getMembership: async (organisationId, userId) => memberships.get(`${organisationId}:${userId}`),
    getOrganisation: async (id) => organisations.get(id),
    getRelationshipByTrade: async (brandId, shopId) => relationships.get(`${brandId}:${shopId}`),
    getThread: async (id) => state.threads.get(id),
    insertThread: async (thread) => { state.threads.set(thread.id, thread); },
    saveThread: async (thread, expectedVersion) => {
      const current = state.threads.get(thread.id);
      assert.equal(current.version, expectedVersion);
      state.threads.set(thread.id, thread);
    },
    insertParticipant: async ({ threadId, organisationId }) => {
      const set = state.participants.get(threadId) ?? new Set();
      set.add(organisationId); state.participants.set(threadId, set);
    },
    listParticipants: async (threadId) => [...(state.participants.get(threadId) ?? [])].sort(),
    insertMessage: async (message) => { state.messages.push(message); },
    insertDecision: async (decision, ownerOrganisationId) => { state.decisions.set(decision.id, { decision, ownerOrganisationId }); },
    getDecision: async (id) => state.decisions.get(id),
    getDecisionSuperseding: async (id) => [...state.decisions.values()].find((entry) => entry.decision.supersedesDecisionId === id)?.decision,
    listThreadsForActorEntity: async ({ actorId, entityType, entityId }) => [...state.threads.values()].filter((thread) =>
      thread.entity.type === entityType && thread.entity.id === entityId && [...(state.participants.get(thread.id) ?? [])].some((organisationId) => memberships.has(`${organisationId}:${actorId}`))),
    listMessagesForActorEntity: async ({ actorId, entityType, entityId }) => state.messages.filter((message) => {
      const thread = state.threads.get(message.threadId);
      return thread?.entity.type === entityType && thread?.entity.id === entityId && [...(state.participants.get(thread.id) ?? [])].some((organisationId) => memberships.has(`${organisationId}:${actorId}`));
    }),
    listDecisionsForActorEntity: async ({ actorId, entityType, entityId }) => [...state.decisions.values()].map((entry) => entry.decision).filter((decision) =>
      decision.entity.type === entityType && decision.entity.id === entityId && memberships.has(`${decision.decidedByOrganisationId}:${actorId}`)),
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (command) => { state.commands.set(command.id, command); },
    appendOutbox: async (event) => { state.outbox.push(event); },
  };
  const store = { transaction: (work) => work(tx) };
  return { state, service: createOperationalCollaborationService({ store, clock, nextId }) };
}

test('cross-company thread is admitted only through an active trade relationship and writes one atomic event', async () => {
  const { state, service } = fixture();
  const thread = await service.createThread('cmd-1', 'owner-1', {
    ownerOrganisationId: 'brand-1',
    participantOrganisationIds: ['shop-1'],
    entity: { type: 'order', id: 'order-1', version: 4, contentHash: 'a'.repeat(64) },
    title: 'Delivery clarification',
    kind: 'clarification',
  });
  assert.deepEqual(thread.participantOrganisationIds, ['brand-1','shop-1']);
  assert.deepEqual([...state.participants.get(thread.id)].sort(), ['brand-1','shop-1']);
  assert.equal(state.outbox.at(-1).type, 'collaboration.thread.created.v1');

  await assert.rejects(
    service.createThread('cmd-2', 'owner-1', {
      ownerOrganisationId: 'brand-1', participantOrganisationIds: ['shop-2'],
      entity: { type: 'order', id: 'order-2' }, title: 'Not connected', kind: 'general',
    }),
    { code: 'ENTITY_THREAD_PARTICIPANT_RELATIONSHIP_REQUIRED' },
  );
});

test('messages derive author side from a validated acting membership and decisions can supersede exactly once', async () => {
  const { state, service } = fixture();
  const thread = await service.createThread('cmd-1', 'owner-1', {
    ownerOrganisationId: 'brand-1', participantOrganisationIds: ['shop-1'],
    entity: { type: 'order', id: 'order-1', version: 4, contentHash: 'a'.repeat(64) },
    title: 'Commercial decision', kind: 'clarification',
  });
  const message = await service.postMessage('cmd-2', 'buyer-1', thread.id, {
    actingOrganisationId: 'shop-1', body: 'We can accept Friday.', evidenceRefs: ['mail-1'],
  });
  assert.equal(message.authorOrganisationId, 'shop-1');

  const first = await service.recordDecision('cmd-3', 'buyer-1', {
    actingOrganisationId: 'shop-1', threadId: thread.id,
    entity: { type: 'order', id: 'order-1', version: 4, contentHash: 'a'.repeat(64) },
    decisionType: 'delivery-window', outcome: 'approved', rationale: 'Friday accepted.',
  });
  const replacement = await service.recordDecision('cmd-4', 'owner-1', {
    actingOrganisationId: 'brand-1', threadId: thread.id,
    entity: { type: 'order', id: 'order-1', version: 5, contentHash: 'b'.repeat(64) },
    decisionType: 'delivery-window', outcome: 'recorded', rationale: 'Pinned to the amended order.',
    supersedesDecisionId: first.id,
  });
  assert.equal(replacement.supersedesDecisionId, first.id);
  assert.equal(state.outbox.at(-1).type, 'decision.superseded.v1');

  await assert.rejects(service.recordDecision('cmd-5', 'owner-1', {
    actingOrganisationId: 'brand-1', threadId: thread.id,
    entity: { type: 'order', id: 'order-1', version: 6, contentHash: 'c'.repeat(64) },
    decisionType: 'delivery-window', outcome: 'recorded', rationale: 'A competing replacement.',
    supersedesDecisionId: first.id,
  }), { code: 'DECISION_ALREADY_SUPERSEDED' });
});

test('command replay is idempotent and a reused key with a different fingerprint is refused', async () => {
  const { state, service } = fixture();
  const input = {
    ownerOrganisationId: 'brand-1', participantOrganisationIds: [],
    entity: { type: 'sample', id: 'sample-1' }, title: 'Fit notes', kind: 'fit',
  };
  const first = await service.createThread('cmd-replay', 'owner-1', input);
  const second = await service.createThread('cmd-replay', 'owner-1', input);
  assert.equal(second.id, first.id);
  assert.equal(state.threads.size, 1);
  await assert.rejects(service.createThread('cmd-replay', 'owner-1', { ...input, title: 'Different' }), { code: 'COMMAND_ID_CONFLICT' });
});

test('entity read returns threaded messages and decisions rather than a second business-state authority', async () => {
  const { service } = fixture();
  const thread = await service.createThread('cmd-1', 'owner-1', {
    ownerOrganisationId: 'brand-1', participantOrganisationIds: [],
    entity: { type: 'sample', id: 'sample-1', version: 2 }, title: 'Fit review', kind: 'fit',
  });
  await service.postMessage('cmd-2', 'owner-1', thread.id, { actingOrganisationId: 'brand-1', body: 'Sleeve needs review.' });
  await service.recordDecision('cmd-3', 'owner-1', {
    actingOrganisationId: 'brand-1', threadId: thread.id,
    entity: { type: 'sample', id: 'sample-1', version: 2 },
    decisionType: 'fit-review', outcome: 'deferred', rationale: 'Await next sample.',
  });
  const view = await service.forEntity('owner-1', 'sample', 'sample-1');
  assert.equal(view.threads.length, 1);
  assert.equal(view.threads[0].messages.length, 1);
  assert.equal(view.decisions.length, 1);
  assert.deepEqual(view.entity, { type: 'sample', id: 'sample-1', version: null, contentHash: null });
});
