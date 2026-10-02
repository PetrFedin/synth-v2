import {
  AWAITING_ACTION_GROUPS,
  AWAITING_ACTION_MAX_LIMIT,
  AWAITING_ACTION_TYPE_CODES,
} from '../modules/awaiting-action/public.mjs';

const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withAwaitingActionOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const count = {
    type: 'object', additionalProperties: false, required: ['group', 'count', 'overdue'],
    properties: { group: { type: 'string', enum: AWAITING_ACTION_GROUPS }, count: nonNegative(), overdue: nonNegative() },
  };
  return {
    AwaitingActionRoute: {
      type: 'object', additionalProperties: false, required: ['view', 'entityId'],
      description: 'The screen of the web client that opens the entity, and the entity to open on it.',
      properties: { view: { type: 'string', minLength: 1, maxLength: 80 }, entityId: { type: 'string', minLength: 1, maxLength: 300 } },
    },
    // Это не хранимая задача, а состояние самой сущности: пункт исчезает, как только ход сделан.
    AwaitingActionItem: {
      type: 'object', additionalProperties: false,
      required: ['type', 'group', 'entityKind', 'entityId', 'label', 'organisationId', 'titleRu', 'titleEn', 'route', 'waitingSince', 'ageSeconds', 'dueAt', 'overdue', 'detail'],
      properties: {
        type: { type: 'string', enum: AWAITING_ACTION_TYPE_CODES },
        group: { type: 'string', enum: AWAITING_ACTION_GROUPS },
        entityKind: { type: 'string', minLength: 1, maxLength: 80 },
        entityId: { type: 'string', minLength: 1, maxLength: 300 },
        label: { type: 'string', minLength: 1, maxLength: 400 },
        organisationId: { type: 'string', pattern: SAFE_ID, description: 'The organisation of the reader on whose behalf the move is theirs.' },
        titleRu: { type: 'string', maxLength: 200 },
        titleEn: { type: 'string', maxLength: 200 },
        route: { $ref: '#/components/schemas/AwaitingActionRoute' },
        waitingSince: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }], description: 'The moment the entity entered the state that waits for the reader.' },
        ageSeconds: nonNegative(),
        dueAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }], description: 'Deadline, where the entity has one (payment term, invitation expiry).' },
        overdue: { type: 'boolean' },
        overdueSeconds: nonNegative(),
        detail: { type: 'object', additionalProperties: true, description: 'A few facts about the entity for the list row; the entity itself is the source of truth.' },
      },
    },
    AwaitingActionCount: count,
    AwaitingActionList: {
      type: 'object', additionalProperties: false, required: ['asOf', 'total', 'overdue', 'counts', 'items'],
      properties: {
        asOf: { type: 'string', format: 'date-time' },
        total: { ...nonNegative(), description: 'Everything waiting for the reader within the requested filter, not only the returned page.' },
        overdue: nonNegative(),
        counts: { type: 'object', additionalProperties: { $ref: '#/components/schemas/AwaitingActionCount' }, description: 'Per requested type, zero where nothing waits.' },
        items: { type: 'array', maxItems: AWAITING_ACTION_MAX_LIMIT, items: { $ref: '#/components/schemas/AwaitingActionItem' } },
      },
    },
  };
}

function paths() {
  return {
    '/inbox/awaiting-action': {
      get: {
        operationId: 'listAwaitingAction',
        summary: 'What waits for the authenticated actor to act',
        description: 'Collects, for the authenticated user and only within the roles they hold, the entities whose next move is theirs: orders awaiting acceptance, order amendments to answer, RFQs with quotations to choose from, inspections to decide, supplier payments that fell due, tech packs to acknowledge, lots and lab dips to decide, compliance documents to issue. An item is shown only if the role holds the capability of the command that makes the move. Overdue items come first, then the oldest.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', required: false, description: 'One type code or a comma-separated list.', schema: { type: 'string', maxLength: 600 } },
          { name: 'group', in: 'query', required: false, schema: { type: 'string', enum: AWAITING_ACTION_GROUPS } },
          { name: 'limit', in: 'query', required: false, description: 'Page size; 0 returns the counters only.', schema: { type: 'integer', minimum: 0, maximum: AWAITING_ACTION_MAX_LIMIT, default: 100 } },
        ],
        responses: {
          200: {
            description: 'Awaiting action list',
            content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: '#/components/schemas/AwaitingActionList' }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } },
          },
          400: errorResponse, 401: errorResponse, 422: errorResponse,
        },
      },
    },
  };
}

function nonNegative() { return { type: 'integer', minimum: 0, maximum: 9_007_199_254_740_991 }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
