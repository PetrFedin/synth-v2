import { DECISION_OUTCOMES, OPERATIONAL_ENTITY_TYPES, THREAD_KINDS, THREAD_STATUSES } from '../modules/operational-control/public.mjs';

const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$';
const identifier = { type: 'string', minLength: 1, maxLength: 240, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withOperationalCollaborationOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const entity = {
    type: 'object', additionalProperties: false, required: ['type', 'id', 'version', 'contentHash'],
    properties: {
      type: { type: 'string', enum: OPERATIONAL_ENTITY_TYPES },
      id: identifier,
      version: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
      contentHash: { oneOf: [{ type: 'string', pattern: '^[a-f0-9]{64}$' }, { type: 'null' }] },
    },
  };
  return {
    OperationalEntityReference: entity,
    OperationalThread: {
      type: 'object', additionalProperties: true,
      required: ['id','ownerOrganisationId','participantOrganisationIds','entity','title','kind','status','version','createdBy','createdAt'],
      properties: {
        id: identifier,
        ownerOrganisationId: identifier,
        participantOrganisationIds: { type: 'array', maxItems: 32, uniqueItems: true, items: identifier },
        entity: { $ref: '#/components/schemas/OperationalEntityReference' },
        title: { type: 'string', minLength: 2, maxLength: 200 },
        kind: { type: 'string', enum: THREAD_KINDS },
        status: { type: 'string', enum: THREAD_STATUSES },
        version: { type: 'integer', minimum: 1 },
        createdBy: identifier,
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    OperationalThreadMessage: {
      type: 'object', additionalProperties: false,
      required: ['id','threadId','entity','authorOrganisationId','authorId','body','evidenceRefs','mentionedUserIds','createdAt'],
      properties: {
        id: identifier, threadId: identifier,
        entity: { $ref: '#/components/schemas/OperationalEntityReference' },
        authorOrganisationId: identifier, authorId: identifier,
        body: { type: 'string', minLength: 1, maxLength: 5000 },
        evidenceRefs: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 400 } },
        mentionedUserIds: { type: 'array', uniqueItems: true, items: identifier },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    OperationalDecision: {
      type: 'object', additionalProperties: false,
      required: ['id','threadId','entity','decisionType','outcome','rationale','evidenceRefs','decidedBy','decidedByOrganisationId','decidedAt','supersedesDecisionId'],
      properties: {
        id: identifier,
        threadId: { oneOf: [identifier, { type: 'null' }] },
        entity: { $ref: '#/components/schemas/OperationalEntityReference' },
        decisionType: { type: 'string', minLength: 2, maxLength: 120 },
        outcome: { type: 'string', enum: DECISION_OUTCOMES },
        rationale: { type: 'string', minLength: 2, maxLength: 4000 },
        evidenceRefs: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 400 } },
        decidedBy: identifier, decidedByOrganisationId: identifier,
        decidedAt: { type: 'string', format: 'date-time' },
        supersedesDecisionId: { oneOf: [identifier, { type: 'null' }] },
      },
    },
    OperationalCollaborationView: {
      type: 'object', additionalProperties: false, required: ['entity','threads','decisions'],
      properties: {
        entity: { $ref: '#/components/schemas/OperationalEntityReference' },
        threads: { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/OperationalThread' }, { type: 'object', properties: { messages: { type: 'array', items: { $ref: '#/components/schemas/OperationalThreadMessage' } } } }] } },
        decisions: { type: 'array', items: { $ref: '#/components/schemas/OperationalDecision' } },
      },
    },
    OperationalThreadCreateInput: {
      type: 'object', additionalProperties: false, required: ['ownerOrganisationId','participantOrganisationIds','entity','title','kind'],
      properties: {
        ownerOrganisationId: identifier,
        participantOrganisationIds: { type: 'array', maxItems: 32, uniqueItems: true, items: identifier },
        entity,
        title: { type: 'string', minLength: 2, maxLength: 200 },
        kind: { type: 'string', enum: THREAD_KINDS },
      },
    },
    OperationalMessageInput: {
      type: 'object', additionalProperties: false, required: ['actingOrganisationId','body'],
      properties: {
        actingOrganisationId: identifier,
        body: { type: 'string', minLength: 1, maxLength: 5000 },
        evidenceRefs: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 400 } },
        mentionedUserIds: { type: 'array', uniqueItems: true, items: identifier },
      },
    },
    OperationalThreadTransitionInput: {
      type: 'object', additionalProperties: false, required: ['actingOrganisationId','expectedVersion'],
      properties: { actingOrganisationId: identifier, expectedVersion: { type: 'integer', minimum: 1 } },
    },
    OperationalDecisionInput: {
      type: 'object', additionalProperties: false, required: ['actingOrganisationId','entity','decisionType','outcome','rationale'],
      properties: {
        actingOrganisationId: identifier,
        threadId: identifier,
        entity,
        decisionType: { type: 'string', minLength: 2, maxLength: 120 },
        outcome: { type: 'string', enum: DECISION_OUTCOMES },
        rationale: { type: 'string', minLength: 2, maxLength: 4000 },
        evidenceRefs: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 400 } },
        supersedesDecisionId: identifier,
      },
    },
  };
}

function paths() {
  const entityType = { name: 'entityType', in: 'path', required: true, schema: { type: 'string', enum: OPERATIONAL_ENTITY_TYPES } };
  const entityId = { name: 'entityId', in: 'path', required: true, schema: identifier };
  const threadId = { name: 'threadId', in: 'path', required: true, schema: identifier };
  return {
    '/operational/entities/{entityType}/{entityId}/collaboration': {
      get: {
        operationId: 'getOperationalCollaboration',
        description: 'Contextual threads, immutable messages and decision ledger visible to the authenticated actor through participant organisations. This is a read projection, never business-entity authority.',
        security: [{ bearerAuth: [] }],
        parameters: [entityType, entityId],
        responses: responses('#/components/schemas/OperationalCollaborationView', false),
      },
    },
    '/operational/threads': { post: mutation('createOperationalThread', [idempotency], '#/components/schemas/OperationalThreadCreateInput', '#/components/schemas/OperationalThread') },
    '/operational/threads/{threadId}/messages': { post: mutation('postOperationalMessage', [threadId, idempotency], '#/components/schemas/OperationalMessageInput', '#/components/schemas/OperationalThreadMessage') },
    '/operational/threads/{threadId}/resolve': { post: mutation('resolveOperationalThread', [threadId, idempotency], '#/components/schemas/OperationalThreadTransitionInput', '#/components/schemas/OperationalThread') },
    '/operational/threads/{threadId}/archive': { post: mutation('archiveOperationalThread', [threadId, idempotency], '#/components/schemas/OperationalThreadTransitionInput', '#/components/schemas/OperationalThread') },
    '/operational/decisions': { post: mutation('recordOperationalDecision', [idempotency], '#/components/schemas/OperationalDecisionInput', '#/components/schemas/OperationalDecision') },
  };
}

function mutation(operationId, parameters, input, output) {
  return {
    operationId, security: [{ bearerAuth: [] }], parameters,
    requestBody: { required: true, content: {
      'application/json': { schema: { $ref: input } },
      'application/*+json': { schema: { $ref: input } },
    } },
    responses: responses(output, true),
  };
}

function responses(output, write) {
  return {
    200: dataResponse(output), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse,
    ...(write ? { 409: errorResponse, 422: errorResponse } : {}),
  };
}

function dataResponse(reference) {
  return { description: 'Success', content: { 'application/json': { schema: {
    type: 'object', additionalProperties: false, required: ['data','requestId'],
    properties: { data: { $ref: reference }, requestId: { type: 'string' } },
  } } } };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
