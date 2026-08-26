const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const collectionId = { name: 'collectionId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withCollectionStyleVersionOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    CollectionStyleVersionAssignmentCreate: {
      type: 'object',
      additionalProperties: false,
      required: ['styleVersionId'],
      properties: { styleVersionId: identifier },
    },
    CollectionStyleVersionAssignment: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'collectionId', 'brandId', 'styleVersionId', 'assignedAt', 'assignedBy'],
      properties: {
        id: identifier,
        collectionId: identifier,
        brandId: identifier,
        styleVersionId: identifier,
        assignedAt: { type: 'string', format: 'date-time' },
        assignedBy: identifier,
      },
    },
  };
}

function paths() {
  return {
    '/collections/{collectionId}/style-versions': {
      post: {
        operationId: 'assignStyleVersionToCollection',
        summary: 'Pin an exact immutable Product Style Version to a draft Collection',
        security: [{ bearerAuth: [] }],
        parameters: [collectionId, idempotency],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CollectionStyleVersionAssignmentCreate' } } },
        },
        responses: {
          200: dataResponse('Exact Collection to Product Style Version assignment', '#/components/schemas/CollectionStyleVersionAssignment'),
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          409: errorResponse,
          422: errorResponse,
        },
      },
    },
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: envelope({ $ref: reference }) } } };
}
function envelope(data) {
  return {
    type: 'object', additionalProperties: false, required: ['data', 'requestId'],
    properties: { data, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } },
  };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
