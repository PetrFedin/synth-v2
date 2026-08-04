const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const SAMPLE_CODE_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{2,63}$';
const SKU_PATTERN = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const SIZE_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{0,15}$';
const SUPPLIER_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{1,63}$';
const SAMPLE_TYPES = ['proto', 'fit', 'size-set', 'pre-production', 'sales', 'photo'];
const SAMPLE_STATUSES = ['draft', 'requested', 'in-production', 'received', 'approved', 'rejected', 'cancelled'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, description: 'Globally unique command key. Reuse with another payload returns HTTP 409.', schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } };
const sampleCodeParameter = { name: 'sampleCode', in: 'path', required: true, schema: { type: 'string', pattern: SAMPLE_CODE_PATTERN } };

export function withSampleOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.11.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const nullableText = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
  const nullableDateTime = { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] };
  const nullableCode = { oneOf: [{ type: 'string', pattern: SUPPLIER_PATTERN }, { type: 'null' }] };
  const editable = {
    supplierCode: nullableCode,
    supplierName: nullableText(160),
    dueAt: nullableDateTime,
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
    sizeCodes: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: { type: 'string', pattern: SIZE_PATTERN } },
    colourway: nullableText(120),
    notes: nullableText(2000),
  };
  const requiredEditable = Object.keys(editable);
  return {
    SampleCreate: { type: 'object', additionalProperties: false, required: ['sampleCode', 'sku', 'sampleType', 'round', ...requiredEditable], properties: { sampleCode: { type: 'string', pattern: SAMPLE_CODE_PATTERN }, sku: { type: 'string', pattern: SKU_PATTERN }, sampleType: { type: 'string', enum: SAMPLE_TYPES }, round: { type: 'integer', minimum: 1, maximum: 100 }, ...editable } },
    SampleUpdate: { type: 'object', additionalProperties: false, required: ['expectedVersion', ...requiredEditable], properties: { expectedVersion: version(), ...editable } },
    SampleVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    SampleReceiptInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'receivedQuantity', 'condition', 'trackingReference', 'notes'], properties: { expectedVersion: version(), receivedQuantity: { type: 'integer', minimum: 1, maximum: 100 }, condition: { type: 'string', enum: ['accepted', 'damaged', 'incomplete'] }, trackingReference: nullableText(120), notes: nullableText(1000) } },
    SampleDecisionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'decision', 'notes'], properties: { expectedVersion: version(), decision: { type: 'string', enum: ['approved', 'rejected'] }, notes: nullableText(2000) } },
    SampleCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reason'], properties: { expectedVersion: version(), reason: { type: 'string', minLength: 5, maxLength: 500 } } },
    SampleNextRoundInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'sampleCode', 'dueAt'], properties: { expectedVersion: version(), sampleCode: { type: 'string', pattern: SAMPLE_CODE_PATTERN }, dueAt: { type: 'string', format: 'date-time' }, notes: nullableText(2000) } },
    SampleReceipt: { type: 'object', additionalProperties: false, required: ['receivedQuantity', 'condition', 'trackingReference', 'notes'], properties: { receivedQuantity: { type: 'integer', minimum: 1, maximum: 100 }, condition: { type: 'string', enum: ['accepted', 'damaged', 'incomplete'] }, trackingReference: nullableText(120), notes: nullableText(1000) } },
    SampleDecision: { type: 'object', additionalProperties: false, required: ['outcome', 'notes', 'actorId'], properties: { outcome: { type: 'string', enum: ['approved', 'rejected'] }, notes: nullableText(2000), actorId: { type: 'string', minLength: 1, maxLength: 160 } } },
    Sample: {
      type: 'object', additionalProperties: false,
      required: ['id', 'sampleCode', 'sku', 'brandId', 'skuVersion', 'sampleType', 'round', 'supplierCode', 'supplierName', 'dueAt', 'quantity', 'sizeCodes', 'colourway', 'notes', 'sourceSampleCode', 'status', 'version', 'requestedAt', 'productionStartedAt', 'receivedAt', 'decisionAt', 'cancelledAt', 'receipt', 'decision', 'cancellationReason', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 160 }, sampleCode: { type: 'string', pattern: SAMPLE_CODE_PATTERN }, sku: { type: 'string', pattern: SKU_PATTERN }, brandId: { type: 'string', minLength: 1, maxLength: 160 }, skuVersion: version(), sampleType: { type: 'string', enum: SAMPLE_TYPES }, round: { type: 'integer', minimum: 1, maximum: 100 },
        ...editable, sourceSampleCode: { oneOf: [{ type: 'string', pattern: SAMPLE_CODE_PATTERN }, { type: 'null' }] }, status: { type: 'string', enum: SAMPLE_STATUSES }, version: version(),
        requestedAt: nullableDateTime, productionStartedAt: nullableDateTime, receivedAt: nullableDateTime, decisionAt: nullableDateTime, cancelledAt: nullableDateTime,
        receipt: { oneOf: [{ $ref: '#/components/schemas/SampleReceipt' }, { type: 'null' }] }, decision: { oneOf: [{ $ref: '#/components/schemas/SampleDecision' }, { type: 'null' }] }, cancellationReason: nullableText(500),
        createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    SamplePage: { type: 'object', additionalProperties: false, required: ['items', 'referenceTime', 'nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/Sample' } }, referenceTime: { type: 'string', format: 'date-time' }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 3072 }, { type: 'null' }] } } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [sampleCodeParameter, idempotencyHeader], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/samples': {
      get: { operationId: 'listSamples', security: [{ bearerAuth: [] }], parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
        { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 3072 } },
        { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: SAMPLE_STATUSES } },
        { name: 'sampleType', in: 'query', schema: { type: 'string', enum: SAMPLE_TYPES } },
        { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } },
        { name: 'sku', in: 'query', schema: { type: 'string', pattern: SKU_PATTERN } },
        { name: 'overdue', in: 'query', schema: { type: 'boolean' } },
      ], responses: { 200: dataResponse('Sample page', '#/components/schemas/SamplePage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'createSample', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader], requestBody: body('#/components/schemas/SampleCreate'), responses: mutationResponses('Created sample') },
    },
    '/samples/{sampleCode}': { get: { operationId: 'getSample', security: [{ bearerAuth: [] }], parameters: [sampleCodeParameter], responses: { 200: dataResponse('Sample', '#/components/schemas/Sample'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } }, patch: mutation('updateSample', '#/components/schemas/SampleUpdate', 'Updated sample') },
    '/samples/{sampleCode}/request': { post: mutation('requestSample', '#/components/schemas/SampleVersionExpectation', 'Requested sample') },
    '/samples/{sampleCode}/start-production': { post: mutation('startSampleProduction', '#/components/schemas/SampleVersionExpectation', 'Sample in production') },
    '/samples/{sampleCode}/receive': { post: mutation('receiveSample', '#/components/schemas/SampleReceiptInput', 'Received sample') },
    '/samples/{sampleCode}/decision': { post: mutation('decideSample', '#/components/schemas/SampleDecisionInput', 'Reviewed sample') },
    '/samples/{sampleCode}/cancel': { post: mutation('cancelSample', '#/components/schemas/SampleCancellationInput', 'Cancelled sample') },
    '/samples/{sampleCode}/next-round': { post: mutation('createNextSampleRound', '#/components/schemas/SampleNextRoundInput', 'Created next sample round') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/Sample'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
