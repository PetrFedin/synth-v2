const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const SKU_PATTERN = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const SIZE_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{0,15}$';
const POINT_PATTERN = '^[A-Z0-9][A-Z0-9._-]{0,31}$';
const MAX_DECIMAL = 900_719_925_474.0991;
const decimal = { type: 'number', minimum: 0, maximum: MAX_DECIMAL, multipleOf: 0.0001 };
const positiveDecimal = { ...decimal, exclusiveMinimum: 0 };
const signedDecimal = { type: 'number', minimum: -MAX_DECIMAL, maximum: MAX_DECIMAL, multipleOf: 0.0001 };
const nullableText = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = {
  name: 'Idempotency-Key', in: 'header', required: true,
  description: 'Globally unique command key. Reuse with another payload returns HTTP 409.',
  schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN },
};
const skuParameter = { name: 'sku', in: 'path', required: true, schema: { type: 'string', pattern: SKU_PATTERN } };

export function withMeasurementOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.10.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const sizeInput = {
    type: 'object', additionalProperties: false, required: ['code', 'label'],
    properties: {
      code: { type: 'string', pattern: SIZE_PATTERN },
      label: { type: 'string', minLength: 1, maxLength: 40 },
    },
  };
  const valueInput = {
    type: 'object', additionalProperties: false, required: ['sizeCode', 'value'],
    properties: {
      sizeCode: { type: 'string', pattern: SIZE_PATTERN },
      value: positiveDecimal,
    },
  };
  const pointInput = {
    type: 'object', additionalProperties: false,
    required: ['pointCode', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'measurements'],
    properties: {
      pointCode: { type: 'string', pattern: POINT_PATTERN },
      name: { type: 'string', minLength: 2, maxLength: 120 },
      description: nullableText(500),
      toleranceMinus: decimal,
      tolerancePlus: decimal,
      measurements: { type: 'array', maxItems: 50, items: valueInput },
    },
  };
  const editable = {
    unit: { type: 'string', enum: ['cm', 'in'] },
    baseSizeCode: { type: 'string', pattern: SIZE_PATTERN },
    sizes: { type: 'array', minItems: 1, maxItems: 50, items: sizeInput },
    points: { type: 'array', maxItems: 300, items: pointInput },
    notes: nullableText(2000),
  };
  const requiredEditable = Object.keys(editable);
  return {
    MeasurementSizeInput: sizeInput,
    MeasurementValueInput: valueInput,
    MeasurementPointInput: pointInput,
    MeasurementChartCreate: {
      type: 'object', additionalProperties: false, required: ['sku', ...requiredEditable],
      properties: { sku: { type: 'string', pattern: SKU_PATTERN }, ...editable },
    },
    MeasurementChartUpdate: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', ...requiredEditable],
      properties: { expectedVersion: version(), ...editable },
    },
    MeasurementVersionExpectation: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: version() },
    },
    MeasurementSize: {
      type: 'object', additionalProperties: false, required: ['code', 'label', 'position'],
      properties: { ...sizeInput.properties, position: { type: 'integer', minimum: 1, maximum: 50 } },
    },
    MeasurementValue: {
      type: 'object', additionalProperties: false, required: ['sizeCode', 'value', 'deltaFromPrevious'],
      properties: {
        ...valueInput.properties,
        deltaFromPrevious: { oneOf: [signedDecimal, { type: 'null' }] },
      },
    },
    MeasurementPoint: {
      type: 'object', additionalProperties: false,
      required: ['pointCode', 'position', 'name', 'description', 'toleranceMinus', 'tolerancePlus', 'baseValue', 'measurements'],
      properties: {
        pointCode: { type: 'string', pattern: POINT_PATTERN },
        position: { type: 'integer', minimum: 1, maximum: 300 },
        name: { type: 'string', minLength: 2, maxLength: 120 },
        description: nullableText(500),
        toleranceMinus: decimal,
        tolerancePlus: decimal,
        baseValue: { oneOf: [positiveDecimal, { type: 'null' }] },
        measurements: { type: 'array', maxItems: 50, items: { $ref: '#/components/schemas/MeasurementValue' } },
      },
    },
    MeasurementChart: {
      type: 'object', additionalProperties: false,
      required: ['id', 'sku', 'brandId', 'skuVersion', 'unit', 'baseSizeCode', 'sizes', 'points', 'notes', 'status', 'version', 'publishedAt', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 160 },
        sku: { type: 'string', pattern: SKU_PATTERN },
        brandId: { type: 'string', minLength: 1, maxLength: 160 },
        skuVersion: version(),
        unit: editable.unit,
        baseSizeCode: editable.baseSizeCode,
        sizes: { type: 'array', minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/MeasurementSize' } },
        points: { type: 'array', maxItems: 300, items: { $ref: '#/components/schemas/MeasurementPoint' } },
        notes: editable.notes,
        status: { type: 'string', enum: ['draft', 'published'] },
        version: version(),
        publishedAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    MeasurementChartPage: {
      type: 'object', additionalProperties: false, required: ['items', 'nextCursor'],
      properties: {
        items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/MeasurementChart' } },
        nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
      },
    },
  };
}

function paths() {
  return {
    '/measurements': {
      get: {
        operationId: 'listMeasurementCharts', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 2048 } },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published'] } },
          { name: 'unit', in: 'query', schema: { type: 'string', enum: ['cm', 'in'] } },
          { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } },
        ],
        responses: { 200: dataResponse('Measurement chart page', '#/components/schemas/MeasurementChartPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
      post: {
        operationId: 'createMeasurementChart', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader],
        requestBody: body('#/components/schemas/MeasurementChartCreate'), responses: mutationResponses('Created measurement chart'),
      },
    },
    '/measurements/{sku}': {
      get: {
        operationId: 'getMeasurementChart', security: [{ bearerAuth: [] }], parameters: [skuParameter],
        responses: { 200: dataResponse('Measurement chart', '#/components/schemas/MeasurementChart'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      patch: {
        operationId: 'updateMeasurementChart', security: [{ bearerAuth: [] }], parameters: [skuParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/MeasurementChartUpdate'), responses: mutationResponses('Updated measurement chart'),
      },
    },
    '/measurements/{sku}/publish': {
      post: {
        operationId: 'publishMeasurementChart', security: [{ bearerAuth: [] }], parameters: [skuParameter, idempotencyHeader],
        requestBody: body('#/components/schemas/MeasurementVersionExpectation'), responses: mutationResponses('Published measurement chart'),
      },
    },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/MeasurementChart'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } } } } } };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
