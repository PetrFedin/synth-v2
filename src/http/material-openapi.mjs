const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const MATERIAL_CODE_PATTERN = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const quantity = { type: 'number', minimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const positiveQuantity = { ...quantity, exclusiveMinimum: 0 };
const identifier = { type: 'string', minLength: 1, maxLength: 160 };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const nullableText = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
const idempotencyHeader = {
  name: 'Idempotency-Key', in: 'header', required: true,
  description: 'Globally unique command key. Reuse with another payload returns HTTP 409.',
  schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
};
const codeParameter = { name: 'code', in: 'path', required: true, schema: { type: 'string', pattern: MATERIAL_CODE_PATTERN } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withMaterialOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.8.0';
  Object.assign(specification.components.schemas, materialSchemas());
  Object.assign(specification.paths, materialPaths());
  return deepFreeze(specification);
}

function materialSchemas() {
  const editable = {
    name: { type: 'string', minLength: 2, maxLength: 160 },
    type: { type: 'string', enum: ['fabric', 'trim', 'packaging', 'other'] },
    unit: { type: 'string', enum: ['m', 'kg', 'pc', 'yd'] },
    supplierName: nullableText(160),
    supplierReference: nullableText(120),
    composition: nullableText(500),
    color: nullableText(120),
    currency,
    unitCost: positiveQuantity,
    minimumOrderQuantity: positiveQuantity,
    availableQuantity: quantity,
  };
  return {
    MaterialCreate: {
      type: 'object', additionalProperties: false,
      required: ['code', 'brandId', ...Object.keys(editable)],
      properties: { code: { type: 'string', pattern: MATERIAL_CODE_PATTERN }, brandId: identifier, ...editable },
    },
    MaterialUpdate: {
      type: 'object', additionalProperties: false,
      required: ['expectedVersion', ...Object.keys(editable)],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 }, ...editable },
    },
    MaterialVersionExpectation: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 } },
    },
    Material: {
      type: 'object', additionalProperties: false,
      required: ['id', 'code', 'brandId', ...Object.keys(editable), 'reservedQuantity', 'availableToUse', 'status', 'version', 'publishedAt', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', pattern: MATERIAL_CODE_PATTERN },
        code: { type: 'string', pattern: MATERIAL_CODE_PATTERN },
        brandId: identifier,
        ...editable,
        reservedQuantity: quantity,
        availableToUse: quantity,
        status: { type: 'string', enum: ['draft', 'published'] },
        version: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        publishedAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    MaterialPage: {
      type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
      properties: {
        items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/Material' } },
        nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
      },
    },
  };
}

function materialPaths() {
  return {
    '/materials': {
      get: {
        operationId: 'listMaterials', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 2048 } },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published'] } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['fabric', 'trim', 'packaging', 'other'] } },
          { name: 'brandId', in: 'query', schema: identifier },
        ],
        responses: { 200: dataResponse('Material page', '#/components/schemas/MaterialPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
      post: {
        operationId: 'createMaterial', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader],
        requestBody: body('#/components/schemas/MaterialCreate'),
        responses: { 200: dataResponse('Created material', '#/components/schemas/Material'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/materials/{code}': {
      get: {
        operationId: 'getMaterial', security: [{ bearerAuth: [] }], parameters: [codeParameter],
        responses: { 200: dataResponse('Material', '#/components/schemas/Material'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      patch: {
        operationId: 'updateMaterial', security: [{ bearerAuth: [] }], parameters: [codeParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/MaterialUpdate'),
        responses: { 200: dataResponse('Updated material', '#/components/schemas/Material'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/materials/{code}/publish': {
      post: {
        operationId: 'publishMaterial', security: [{ bearerAuth: [] }], parameters: [codeParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/MaterialVersionExpectation'),
        responses: { 200: dataResponse('Published material', '#/components/schemas/Material'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
  };
}

function body(reference) {
  return { required: true, content: { 'application/json': { schema: { $ref: reference } } } };
}
function dataResponse(description, reference) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object', additionalProperties: false, required: ['data', 'requestId'],
          properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } },
        },
      },
    },
  };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
