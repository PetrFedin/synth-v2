const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const shopId = { name: 'shopId', in: 'path', required: true, schema: identifier };
const retailDoorId = { name: 'retailDoorId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withRetailDoorOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  if (specification.components.schemas.OrderCreate?.properties) {
    specification.components.schemas.OrderCreate.properties.retailDoorId = {
      ...identifier,
      description: 'Retail door master id. Required when selection is pinned to an immutable commercial publication/buyer catalog; omitted only for legacy unpinned orders.',
    };
  }
  return deepFreeze(specification);
}

function schemas() {
  return {
    RetailDoorAddressInput: {
      type: 'object', additionalProperties: false, required: ['countryCode', 'city', 'line1'],
      properties: {
        countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
        postalCode: { type: 'string', minLength: 1, maxLength: 32 },
        city: { type: 'string', minLength: 1, maxLength: 160 },
        region: { type: 'string', minLength: 1, maxLength: 160 },
        line1: { type: 'string', minLength: 1, maxLength: 200 },
        line2: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
    RetailDoorAddress: {
      type: 'object', additionalProperties: false,
      required: ['countryCode', 'postalCode', 'city', 'region', 'line1', 'line2'],
      properties: {
        countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
        postalCode: nullableString(32),
        city: { type: 'string', minLength: 1, maxLength: 160 },
        region: nullableString(160),
        line1: { type: 'string', minLength: 1, maxLength: 200 },
        line2: nullableString(200),
      },
    },
    RetailDoorCreate: {
      type: 'object', additionalProperties: false, required: ['shopId', 'code', 'name', 'shipToAddress'],
      properties: {
        shopId: identifier,
        code: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$' },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        shipToAddress: { $ref: '#/components/schemas/RetailDoorAddressInput' },
        billToAddress: { $ref: '#/components/schemas/RetailDoorAddressInput' },
      },
    },
    RetailDoorUpdate: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        shipToAddress: { $ref: '#/components/schemas/RetailDoorAddressInput' },
        billToAddress: { $ref: '#/components/schemas/RetailDoorAddressInput' },
      },
    },
    RetailDoorVersionExpectation: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 } },
    },
    RetailDoor: {
      type: 'object', additionalProperties: false,
      required: ['id', 'shopId', 'code', 'name', 'status', 'shipToAddress', 'billToAddress', 'version', 'createdAt', 'updatedAt'],
      properties: {
        id: identifier,
        shopId: identifier,
        code: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[A-Z0-9][A-Z0-9._/-]{0,31}$' },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        status: { type: 'string', enum: ['active', 'inactive'] },
        shipToAddress: { $ref: '#/components/schemas/RetailDoorAddress' },
        billToAddress: { $ref: '#/components/schemas/RetailDoorAddress' },
        version: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  };
}

function paths() {
  return {
    '/shops/{shopId}/doors': {
      get: {
        operationId: 'listRetailDoors', security: [{ bearerAuth: [] }], parameters: [shopId],
        responses: { 200: listResponse(), 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      post: {
        operationId: 'createRetailDoor', security: [{ bearerAuth: [] }], parameters: [shopId, idempotency],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetailDoorCreate' } } } },
        responses: { 200: dataResponse('Created retail door master', '#/components/schemas/RetailDoor'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/retail-doors/{retailDoorId}': {
      get: {
        operationId: 'getRetailDoor', security: [{ bearerAuth: [] }], parameters: [retailDoorId],
        responses: { 200: dataResponse('Retail door master', '#/components/schemas/RetailDoor'), 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      patch: {
        operationId: 'updateRetailDoor', security: [{ bearerAuth: [] }], parameters: [retailDoorId, idempotency],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetailDoorUpdate' } } } },
        responses: { 200: dataResponse('Updated retail door master', '#/components/schemas/RetailDoor'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/retail-doors/{retailDoorId}/deactivate': statusTransition('deactivateRetailDoor', 'Deactivated retail door master'),
    '/retail-doors/{retailDoorId}/reactivate': statusTransition('reactivateRetailDoor', 'Reactivated retail door master'),
  };
}

function statusTransition(operationId, description) {
  return {
    post: {
      operationId, security: [{ bearerAuth: [] }], parameters: [retailDoorId, idempotency],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetailDoorVersionExpectation' } } } },
      responses: { 200: dataResponse(description, '#/components/schemas/RetailDoor'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
    },
  };
}

function nullableString(maxLength) { return { anyOf: [{ type: 'string', minLength: 1, maxLength }, { type: 'null' }] }; }
function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: envelope({ $ref: reference }) } } };
}
function listResponse() {
  return { description: 'Retail doors visible to the shop actor', content: { 'application/json': { schema: envelope({ type: 'array', items: { $ref: '#/components/schemas/RetailDoor' } }) } } };
}
function envelope(data) {
  return { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } };
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
