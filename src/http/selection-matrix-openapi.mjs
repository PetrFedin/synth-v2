const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const selectionId = { name: 'selectionId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withSelectionMatrixOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    SelectionMatrixLineInput: {
      type: 'object', additionalProperties: false, required: ['sku', 'quantity'],
      properties: {
        sku: { type: 'string', pattern: SKU },
        quantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        note: { type: 'string', maxLength: 2_000 },
      },
    },
    SelectionMatrixReplaceInput: {
      type: 'object', additionalProperties: false, required: ['selectionId', 'lines'],
      properties: {
        selectionId: identifier,
        lines: { type: 'array', maxItems: 5_000, items: { $ref: '#/components/schemas/SelectionMatrixLineInput' } },
      },
    },
    SelectionMatrixLine: {
      type: 'object', additionalProperties: true,
      required: ['sku', 'quantity', 'unitPrice', 'currency', 'catalogVersion', 'productSkuId', 'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode', 'sizeLabelRu', 'sizeLabelEn', 'sizeSortOrder', 'gtin', 'note', 'updatedBy', 'updatedAt'],
      properties: {
        sku: { type: 'string', pattern: SKU },
        quantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        unitPrice: { type: 'number', minimum: 0 },
        currency,
        catalogVersion: { type: 'integer', minimum: 1 },
        productSkuId: identifier,
        gtin: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        styleId: identifier,
        styleVersionId: identifier,
        colorwayId: identifier,
        sizeValueId: identifier,
        sizeCode: { type: 'string', minLength: 1 },
        sizeLabelRu: { type: 'string', minLength: 1 },
        sizeLabelEn: { type: 'string', minLength: 1 },
        sizeSortOrder: { type: 'integer', minimum: 0 },
        note: { type: 'string', maxLength: 2_000 },
        updatedBy: identifier,
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    SelectionMatrixResult: {
      type: 'object', additionalProperties: true,
      required: ['id', 'buyerCatalogVersionId', 'commercialBasisHash', 'status', 'lines', 'version'],
      properties: {
        id: identifier,
        buyerCatalogVersionId: identifier,
        commercialBasisHash: { type: 'string', minLength: 1 },
        status: { type: 'string', enum: ['draft'] },
        lines: { type: 'array', maxItems: 5_000, items: { $ref: '#/components/schemas/SelectionMatrixLine' } },
        version: { type: 'integer', minimum: 1 },
      },
    },
  };
}

function paths() {
  return {
    '/selections/{selectionId}/matrix': {
      put: {
        operationId: 'replaceSelectionMatrix',
        security: [{ bearerAuth: [] }],
        parameters: [selectionId, idempotency],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SelectionMatrixReplaceInput' } } } },
        responses: {
          200: dataResponse('Atomically replaced rich buyer color-size selection matrix', '#/components/schemas/SelectionMatrixResult'),
          400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse,
        },
      },
    },
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } };
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
