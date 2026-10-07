import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const ENTITY_FIELDS = ['type', 'id', 'version', 'contentHash'];
const THREAD_CREATE_BODY = bodyContract(
  ['ownerOrganisationId', 'participantOrganisationIds', 'entity', 'title', 'kind'],
  { entity: ENTITY_FIELDS },
);
const MESSAGE_BODY = bodyContract(['actingOrganisationId', 'body', 'evidenceRefs', 'mentionedUserIds']);
const THREAD_TRANSITION_BODY = bodyContract(['actingOrganisationId', 'expectedVersion']);
const DECISION_BODY = bodyContract(
  ['actingOrganisationId', 'threadId', 'entity', 'decisionType', 'outcome', 'rationale', 'evidenceRefs', 'supersedesDecisionId'],
  { entity: ENTITY_FIELDS },
);

/** @param {{ operationalCollaboration?: any }} [options] */
export function createOperationalCollaborationRoutes({ operationalCollaboration } = {}) {
  const service = operationalCollaboration ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/operational\/entities\/([^/]+)\/([^/]+)\/collaboration$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.forEntity(
          context.actorId,
          decodePathParameter(context.params?.[0]),
          decodePathParameter(context.params?.[1]),
        );
      },
    }),
    mutation('POST', /^\/v2\/operational\/threads$/, THREAD_CREATE_BODY, (context) =>
      service.createThread(context.commandId, context.actorId, context.body)),
    mutation('POST', /^\/v2\/operational\/threads\/([^/]+)\/messages$/, MESSAGE_BODY, (context) =>
      service.postMessage(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/threads\/([^/]+)\/resolve$/, THREAD_TRANSITION_BODY, (context) =>
      service.resolveThread(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/threads\/([^/]+)\/archive$/, THREAD_TRANSITION_BODY, (context) =>
      service.archiveThread(context.commandId, context.actorId, decodePathParameter(context.params?.[0]), context.body)),
    mutation('POST', /^\/v2\/operational\/decisions$/, DECISION_BODY, (context) =>
      service.recordDecision(context.commandId, context.actorId, context.body)),
  ]);
}

function mutation(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      validateArrays(context.body);
      return execute(context);
    },
  });
}

function validateArrays(body) {
  for (const field of ['participantOrganisationIds', 'evidenceRefs', 'mentionedUserIds']) {
    if (body?.[field] !== undefined) {
      invariant(Array.isArray(body[field]), 'HTTP_BODY_FIELD_INVALID', `${field} must be an array`, { field });
      invariant(body[field].every((value) => typeof value === 'string'), 'HTTP_BODY_FIELD_INVALID', `${field} values must be strings`, { field });
    }
  }
}

function unavailable() {
  const fail = () => invariant(false, 'OPERATIONAL_COLLABORATION_SERVICE_REQUIRED', 'Operational collaboration service is required');
  return Object.freeze({
    createThread: fail,
    postMessage: fail,
    resolveThread: fail,
    archiveThread: fail,
    recordDecision: fail,
    forEntity: fail,
  });
}
