const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const SKU_PATTERN = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const quantity = { type: 'number', minimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const positiveQuantity = { ...quantity, exclusiveMinimum: 0 };
const cost = { ...quantity };
const identifier = { type: 'string', minLength: 1, maxLength: 160 };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const nullableNotes = { oneOf: [{ type: 'string', minLength: 1, maxLength: 2000 }, { type: 'null' }] };
const idempotencyHeader = {
  name: 'Idempotency-Key', in: 'header', required: true,
  description: 'Globally unique command key. Reuse with another payload returns HTTP 409.',
  schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
};
const skuParameter = { name: 'sku', in: 'path', required: true, schema: { type: 'string', pattern: SKU_PATTERN } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withBomOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.9.0';
  Object.assign(specification.components.schemas, bomSchemas());
  Object.assign(specification.paths, bomPaths());
  return deepFreeze(specification);
}

function bomSchemas() {
  const lineInput = {
    type: 'object',
    additionalProperties: false,
    required: ['lineId', 'component', 'materialCode', 'quantity', 'wastePercent'],
    properties: {
      lineId: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._-]{0,63}$' },
      component: { type: 'string', minLength: 2, maxLength: 160 },
      materialCode: { type: 'string', pattern: SKU_PATTERN },
      quantity: positiveQuantity,
      wastePercent: { ...quantity, maximum: 1000 },
      exchangeRate: positiveQuantity,
    },
  };
  const editableProperties = {
    currency,
    lines: { type: 'array', minItems: 1, maxItems: 500, items: lineInput },
    laborCost: cost,
    overheadCost: cost,
    logisticsCost: cost,
    otherCost: cost,
    notes: nullableNotes,
  };
  const editableRequired = Object.keys(editableProperties);
  return {
    BomLineInput: lineInput,
    BomCreate: {
      type: 'object', additionalProperties: false,
      required: ['sku', ...editableRequired],
      properties: { sku: { type: 'string', pattern: SKU_PATTERN }, ...editableProperties },
    },
    BomUpdate: {
      type: 'object', additionalProperties: false,
      required: ['expectedVersion', ...editableRequired],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 }, ...editableProperties },
    },
    BomVersionExpectation: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 } },
    },
    BomLine: {
      type: 'object', additionalProperties: false,
      required: [
        'lineId', 'position', 'component', 'materialCode', 'materialVersion', 'materialName', 'materialType',
        'unit', 'quantity', 'wastePercent', 'grossQuantity', 'materialCurrency', 'unitCostSnapshot',
        'exchangeRate', 'lineCost',
      ],
      properties: {
        lineId: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._-]{0,63}$' },
        position: { type: 'integer', minimum: 1, maximum: 500 },
        component: { type: 'string', minLength: 2, maxLength: 160 },
        materialCode: { type: 'string', pattern: SKU_PATTERN },
        materialVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        materialName: { type: 'string', minLength: 2, maxLength: 160 },
        materialType: { type: 'string', enum: ['fabric', 'trim', 'packaging', 'other'] },
        unit: { type: 'string', enum: ['m', 'kg', 'pc', 'yd'] },
        quantity: positiveQuantity,
        wastePercent: { ...quantity, maximum: 1000 },
        grossQuantity: positiveQuantity,
        materialCurrency: currency,
        unitCostSnapshot: positiveQuantity,
        exchangeRate: positiveQuantity,
        lineCost: cost,
      },
    },
    Bom: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'sku', 'brandId', 'currency', 'lines', 'materialCost', 'laborCost', 'overheadCost',
        'logisticsCost', 'otherCost', 'totalCost', 'notes', 'status', 'version', 'publishedAt', 'createdAt', 'updatedAt',
      ],
      properties: {
        id: identifier,
        sku: { type: 'string', pattern: SKU_PATTERN },
        brandId: identifier,
        currency,
        lines: { type: 'array', minItems: 1, maxItems: 500, items: { $ref: '#/components/schemas/BomLine' } },
        materialCost: cost,
        laborCost: cost,
        overheadCost: cost,
        logisticsCost: cost,
        otherCost: cost,
        totalCost: positiveQuantity,
        notes: nullableNotes,
        status: { type: 'string', enum: ['draft', 'published'] },
        version: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        publishedAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    BomPage: {
      type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
      properties: {
        items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/Bom' } },
        nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
      },
    },
  };
}

function bomPaths() {
  return {
    '/boms': {
      get: {
        operationId: 'listBoms', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 2048 } },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published'] } },
          { name: 'brandId', in: 'query', schema: identifier },
        ],
        responses: { 200: dataResponse('BOM page', '#/components/schemas/BomPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
      post: {
        operationId: 'createBom', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader],
        requestBody: body('#/components/schemas/BomCreate'),
        responses: { 200: dataResponse('Created BOM', '#/components/schemas/Bom'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/boms/{sku}': {
      get: {
        operationId: 'getBom', security: [{ bearerAuth: [] }], parameters: [skuParameter],
        responses: { 200: dataResponse('BOM', '#/components/schemas/Bom'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      patch: {
        operationId: 'updateBom', security: [{ bearerAuth: [] }], parameters: [skuParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/BomUpdate'),
        responses: { 200: dataResponse('Updated BOM', '#/components/schemas/Bom'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
      },
    },
    '/boms/{sku}/publish': {
      post: {
        operationId: 'publishBom', security: [{ bearerAuth: [] }], parameters: [skuParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/BomVersionExpectation'),
        responses: { 200: dataResponse('Published BOM', '#/components/schemas/Bom'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
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
