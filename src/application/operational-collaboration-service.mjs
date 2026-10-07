import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability, rolesWithCapability } from '../modules/access-control/public.mjs';
import {
  appendEntityThreadMessage,
  archiveEntityThread,
  createEntityThread,
  operationalEntityReference,
  recordDecision,
  resolveEntityThread,
  sameEntityIdentity,
} from '../modules/operational-control/public.mjs';

/** @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options] */
export function createOperationalCollaborationService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'OPERATIONAL_COLLABORATION_STORE_REQUIRED', 'Operational collaboration store is required');

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
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId,
      occurredAt: clock(),
      payload,
      metadata: { commandId, actorId },
    }));
  }

  async function requireMembership(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function validateParticipants(tx, ownerOrganisationId, participantOrganisationIds) {
    const requested = [...new Set([ownerOrganisationId, ...(Array.isArray(participantOrganisationIds) ? participantOrganisationIds : [])])];
    const owner = await tx.getOrganisation(ownerOrganisationId);
    invariant(owner, 'ENTITY_THREAD_OWNER_ORGANISATION_NOT_FOUND', 'Thread owner organisation not found', { ownerOrganisationId });
    for (const organisationId of requested) {
      const participant = await tx.getOrganisation(organisationId);
      invariant(participant, 'ENTITY_THREAD_PARTICIPANT_ORGANISATION_NOT_FOUND', 'Thread participant organisation not found', { organisationId });
      if (organisationId === ownerOrganisationId) continue;
      const pair = tradePair(owner, participant);
      invariant(pair, 'ENTITY_THREAD_PARTICIPANT_RELATIONSHIP_REQUIRED', 'Cross-organisation thread requires a brand-shop trade relationship', {
        ownerOrganisationId,
        participantOrganisationId: organisationId,
      });
      const relationship = await tx.getRelationshipByTrade(pair.brandId, pair.shopId);
      invariant(relationship?.status === 'active', 'ENTITY_THREAD_PARTICIPANT_RELATIONSHIP_REQUIRED', 'Cross-organisation thread requires an active trade relationship', {
        ownerOrganisationId,
        participantOrganisationId: organisationId,
      });
    }
    return requested;
  }

  async function assertThreadActor(tx, thread, actorId, actingOrganisationId, capability) {
    await requireMembership(tx, actingOrganisationId, actorId, capability);
    const participants = await tx.listParticipants(thread.id);
    invariant(participants.includes(actingOrganisationId), 'ENTITY_THREAD_PARTICIPANT_REQUIRED', 'Acting organisation is not a thread participant', {
      threadId: thread.id,
      actingOrganisationId,
    });
    return participants;
  }

  return Object.freeze({
    createThread(commandId, actorId, input) {
      const fingerprint = `operationalCollaboration.createThread:${actorId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const ownerOrganisationId = String(input?.ownerOrganisationId ?? '');
        await requireMembership(tx, ownerOrganisationId, actorId, CAPABILITIES.COLLABORATION_WRITE);
        const participants = await validateParticipants(tx, ownerOrganisationId, input?.participantOrganisationIds ?? []);
        const now = clock();
        const thread = createEntityThread({
          id: nextId('thread'),
          ownerOrganisationId,
          participantOrganisationIds: participants,
          entity: input?.entity,
          title: input?.title,
          kind: input?.kind ?? 'general',
          createdBy: actorId,
          createdAt: now,
        });
        await tx.insertThread(thread);
        for (const organisationId of thread.participantOrganisationIds) {
          await tx.insertParticipant({ threadId: thread.id, organisationId, addedAt: now });
        }
        await append(tx, 'collaboration.thread.created.v1', thread.id, {
          threadId: thread.id,
          entity: thread.entity,
          ownerOrganisationId: thread.ownerOrganisationId,
          participantOrganisationIds: thread.participantOrganisationIds,
          kind: thread.kind,
        }, commandId, actorId);
        return thread;
      });
    },

    postMessage(commandId, actorId, threadId, input) {
      const fingerprint = `operationalCollaboration.postMessage:${actorId}:${threadId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const thread = await tx.getThread(threadId, { lock: false });
        invariant(thread, 'ENTITY_THREAD_NOT_FOUND', 'Entity thread not found', { threadId });
        const actingOrganisationId = String(input?.actingOrganisationId ?? '');
        await assertThreadActor(tx, thread, actorId, actingOrganisationId, CAPABILITIES.COLLABORATION_WRITE);
        const message = appendEntityThreadMessage({
          id: nextId('message'),
          thread,
          authorOrganisationId: actingOrganisationId,
          authorId: actorId,
          body: input?.body,
          evidenceRefs: input?.evidenceRefs ?? [],
          mentionedUserIds: input?.mentionedUserIds ?? [],
          createdAt: clock(),
        });
        await tx.insertMessage(message);
        await append(tx, 'collaboration.message.posted.v1', thread.id, {
          threadId: thread.id,
          messageId: message.id,
          entity: thread.entity,
          authorOrganisationId: actingOrganisationId,
        }, commandId, actorId);
        return message;
      });
    },

    resolveThread(commandId, actorId, threadId, input) {
      const fingerprint = `operationalCollaboration.resolveThread:${actorId}:${threadId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const thread = await tx.getThread(threadId, { lock: true });
        invariant(thread, 'ENTITY_THREAD_NOT_FOUND', 'Entity thread not found', { threadId });
        const actingOrganisationId = String(input?.actingOrganisationId ?? '');
        await assertThreadActor(tx, thread, actorId, actingOrganisationId, CAPABILITIES.COLLABORATION_WRITE);
        invariant(input?.expectedVersion === thread.version, 'ENTITY_THREAD_CONCURRENCY_CONFLICT', 'Thread version conflict', {
          threadId,
          expectedVersion: input?.expectedVersion,
          actualVersion: thread.version,
        });
        const now = clock();
        const updated = resolveEntityThread(thread, { resolvedBy: actorId, resolvedAt: now });
        await tx.saveThread(updated, thread.version, now);
        await append(tx, 'collaboration.thread.resolved.v1', thread.id, { threadId: thread.id, entity: thread.entity }, commandId, actorId);
        return updated;
      });
    },

    archiveThread(commandId, actorId, threadId, input) {
      const fingerprint = `operationalCollaboration.archiveThread:${actorId}:${threadId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const thread = await tx.getThread(threadId, { lock: true });
        invariant(thread, 'ENTITY_THREAD_NOT_FOUND', 'Entity thread not found', { threadId });
        const actingOrganisationId = String(input?.actingOrganisationId ?? '');
        await assertThreadActor(tx, thread, actorId, actingOrganisationId, CAPABILITIES.COLLABORATION_WRITE);
        invariant(input?.expectedVersion === thread.version, 'ENTITY_THREAD_CONCURRENCY_CONFLICT', 'Thread version conflict', {
          threadId,
          expectedVersion: input?.expectedVersion,
          actualVersion: thread.version,
        });
        const now = clock();
        const updated = archiveEntityThread(thread, { archivedBy: actorId, archivedAt: now });
        await tx.saveThread(updated, thread.version, now);
        await append(tx, 'collaboration.thread.archived.v1', thread.id, { threadId: thread.id, entity: thread.entity }, commandId, actorId);
        return updated;
      });
    },

    recordDecision(commandId, actorId, input) {
      const fingerprint = `operationalCollaboration.recordDecision:${actorId}:${canonicalJson(input ?? null)}`;
      return execute(commandId, actorId, fingerprint, async (tx) => {
        const actingOrganisationId = String(input?.actingOrganisationId ?? '');
        await requireMembership(tx, actingOrganisationId, actorId, CAPABILITIES.DECISION_RECORD);

        let thread = null;
        let ownerOrganisationId = actingOrganisationId;
        if (input?.threadId) {
          thread = await tx.getThread(String(input.threadId), { lock: false });
          invariant(thread, 'ENTITY_THREAD_NOT_FOUND', 'Entity thread not found', { threadId: input.threadId });
          invariant(thread.status !== 'archived', 'ENTITY_THREAD_ARCHIVED', 'Archived thread cannot receive a new decision', { threadId: thread.id });
          await assertThreadActor(tx, thread, actorId, actingOrganisationId, CAPABILITIES.DECISION_RECORD);
          ownerOrganisationId = thread.ownerOrganisationId;
        }

        const entity = operationalEntityReference(input?.entity ?? {});
        if (thread) {
          invariant(sameEntityIdentity(thread.entity, entity), 'DECISION_ENTITY_THREAD_MISMATCH', 'Decision entity does not match thread entity', {
            threadId: thread.id,
            threadEntity: thread.entity,
            decisionEntity: entity,
          });
        }

        let supersedesDecisionId = input?.supersedesDecisionId ?? null;
        if (supersedesDecisionId) {
          supersedesDecisionId = String(supersedesDecisionId);
          const previous = await tx.getDecision(supersedesDecisionId, { lock: true });
          invariant(previous, 'DECISION_SUPERSEDED_NOT_FOUND', 'Decision to supersede was not found', { supersedesDecisionId });
          invariant(previous.ownerOrganisationId === ownerOrganisationId, 'DECISION_SUPERSEDED_OWNER_MISMATCH', 'Decision to supersede belongs to another collaboration owner');
          invariant(sameEntityIdentity(previous.decision.entity, entity), 'DECISION_SUPERSEDED_ENTITY_MISMATCH', 'Decision to supersede belongs to another entity');
          const existingReplacement = await tx.getDecisionSuperseding(supersedesDecisionId);
          invariant(!existingReplacement, 'DECISION_ALREADY_SUPERSEDED', 'Decision was already superseded', {
            supersedesDecisionId,
            supersededBy: existingReplacement?.id ?? null,
          });
        }

        const decision = recordDecision({
          id: nextId('decision'),
          thread,
          entity,
          decisionType: input?.decisionType,
          outcome: input?.outcome,
          rationale: input?.rationale,
          evidenceRefs: input?.evidenceRefs ?? [],
          decidedBy: actorId,
          decidedByOrganisationId: actingOrganisationId,
          decidedAt: clock(),
          supersedesDecisionId,
        });
        await tx.insertDecision(decision, ownerOrganisationId);
        await append(
          tx,
          supersedesDecisionId ? 'decision.superseded.v1' : 'decision.recorded.v1',
          decision.id,
          {
            decisionId: decision.id,
            entity: decision.entity,
            threadId: decision.threadId,
            outcome: decision.outcome,
            supersedesDecisionId: decision.supersedesDecisionId,
          },
          commandId,
          actorId,
        );
        return decision;
      });
    },

    forEntity(actorId, entityType, entityId) {
      const entity = operationalEntityReference({ type: entityType, id: entityId });
      const roles = rolesWithCapability(CAPABILITIES.COLLABORATION_READ);
      return store.transaction(async (tx) => {
        const [threads, messages, decisions] = await Promise.all([
          tx.listThreadsForActorEntity({ actorId, entityType: entity.type, entityId: entity.id, roles }),
          tx.listMessagesForActorEntity({ actorId, entityType: entity.type, entityId: entity.id, roles }),
          tx.listDecisionsForActorEntity({ actorId, entityType: entity.type, entityId: entity.id, roles }),
        ]);
        const messagesByThread = new Map();
        for (const message of messages) {
          const bucket = messagesByThread.get(message.threadId) ?? [];
          bucket.push(message);
          messagesByThread.set(message.threadId, bucket);
        }
        return Object.freeze({
          entity,
          threads: Object.freeze(threads.map((thread) => Object.freeze({
            ...thread,
            messages: Object.freeze(messagesByThread.get(thread.id) ?? []),
          }))),
          decisions: Object.freeze(decisions),
        });
      });
    },
  });
}

function tradePair(left, right) {
  if (left?.type === 'brand' && right?.type === 'shop') return { brandId: left.id, shopId: right.id };
  if (left?.type === 'shop' && right?.type === 'brand') return { brandId: right.id, shopId: left.id };
  return null;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
