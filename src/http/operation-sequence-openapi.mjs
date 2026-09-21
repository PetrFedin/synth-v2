const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const SEQ_CODE = '^[A-Z0-9][A-Z0-9._/-]{1,63}$';
const OPERATION_CODE = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const STAGES = ['materials-ready', 'cutting-complete', 'assembly-complete', 'finishing-complete', 'packing-complete', 'ready-for-qc'];
const KINDS = ['template', 'product'];
const STATUSES = ['draft', 'published', 'retired'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const sequenceParameter = { name: 'sequenceId', in: 'path', required: true, schema: { type: 'string', pattern: SAFE_ID } };

export function withOperationSequenceOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    // `position` — место операции в списке, а не набираемое число: поэтому дыра в нумерации
    // невозможна по построению.
    BolOperation: {
      type: 'object', additionalProperties: false,
      required: ['position', 'operationCode', 'nameRu', 'nameEn', 'stage', 'constructionNode', 'standardMinutes', 'equipment', 'notes'],
      properties: {
        position: count(), operationCode: { type: 'string', pattern: OPERATION_CODE },
        nameRu: text(2, 200), nameEn: text(2, 200), stage: { type: 'string', enum: STAGES },
        constructionNode: nullableText(64), standardMinutes: minutes(),
        equipment: nullableText(120), notes: nullableText(500),
      },
    },
    // Трудоёмкость — сумма по операциям и потому вычисляется при чтении. Стоимости труда здесь нет:
    // для неё нужна ставка, а это отдельный договор с фабрикой.
    BolWorkload: {
      type: 'object', additionalProperties: false, required: ['operationCount', 'totalStandardMinutes', 'byStage'],
      properties: {
        operationCount: nonNegative(), totalStandardMinutes: nonNegativeMinutes(),
        byStage: { type: 'array', maxItems: 12, items: {
          type: 'object', additionalProperties: false, required: ['stage', 'operations', 'standardMinutes'],
          properties: { stage: { type: 'string', enum: STAGES }, operations: count(), standardMinutes: nonNegativeMinutes() },
        } },
      },
    },
    OperationSequence: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'kind', 'templateCode', 'category', 'sku', 'nameRu', 'nameEn', 'status', 'sourceTemplateCode', 'notes', 'operations', 'version', 'createdAt', 'createdBy', 'updatedAt'],
      properties: {
        id: text(1, 200), brandId: text(1, 200), kind: { type: 'string', enum: KINDS },
        templateCode: { oneOf: [{ type: 'string', pattern: SEQ_CODE }, { type: 'null' }] },
        category: nullableText(120), sku: { oneOf: [{ type: 'string', pattern: CODE }, { type: 'null' }] },
        nameRu: text(2, 200), nameEn: text(2, 200), status: { type: 'string', enum: STATUSES },
        sourceTemplateCode: { oneOf: [{ type: 'string', pattern: SEQ_CODE }, { type: 'null' }] },
        notes: nullableText(1000),
        operations: { type: 'array', maxItems: 400, items: { $ref: '#/components/schemas/BolOperation' } },
        version: count(), createdAt: date(), createdBy: text(1, 200), updatedAt: date(), updatedBy: nullableText(200),
        publishedAt: nullableDate(), publishedBy: nullableText(200),
        retiredAt: nullableDate(), retiredBy: nullableText(200), retirementReason: nullableText(1000),
        workload: { $ref: '#/components/schemas/BolWorkload' },
      },
    },
    OperationSequences: { type: 'array', maxItems: 2000, items: { $ref: '#/components/schemas/OperationSequence' } },
    OperationSequenceTemplateInput: {
      type: 'object', additionalProperties: false, required: ['brandId', 'templateCode', 'nameRu', 'nameEn'],
      properties: { brandId: text(1, 200), templateCode: { type: 'string', pattern: SEQ_CODE }, category: text(2, 120), nameRu: text(2, 200), nameEn: text(2, 200), notes: text(2, 1000) },
    },
    OperationSequenceProductInput: {
      type: 'object', additionalProperties: false, required: ['brandId', 'sku'],
      properties: { brandId: text(1, 200), sku: { type: 'string', pattern: CODE }, templateCode: { type: 'string', pattern: SEQ_CODE }, nameRu: text(2, 200), nameEn: text(2, 200), notes: text(2, 1000) },
    },
    OperationSequenceOperationsInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'operations'],
      properties: {
        expectedVersion: count(),
        operations: { type: 'array', maxItems: 400, items: {
          type: 'object', additionalProperties: false, required: ['operationCode', 'nameRu', 'nameEn', 'stage', 'standardMinutes'],
          properties: {
            operationCode: { type: 'string', pattern: OPERATION_CODE }, nameRu: text(2, 200), nameEn: text(2, 200),
            stage: { type: 'string', enum: STAGES }, constructionNode: text(2, 64), standardMinutes: minutes(),
            equipment: text(2, 120), notes: text(2, 500),
          },
        } },
      },
    },
    OperationSequenceVerdictInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: count(), reason: text(5, 1000) },
    },
  };
}

function paths() {
  return {
    '/operation-sequences': {
      get: { operationId: 'listOperationSequences', security: [{ bearerAuth: [] }], responses: { 200: dataResponse('Operation sequences', '#/components/schemas/OperationSequences'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'createProductOperationSequence', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/OperationSequenceProductInput'), responses: mutationResponses('Created product sequence') },
    },
    '/operation-sequence-templates': { post: { operationId: 'createOperationSequenceTemplate', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/OperationSequenceTemplateInput'), responses: mutationResponses('Created template') } },
    '/operation-sequences/{sequenceId}/operations': { post: { operationId: 'replaceOperationSequenceOperations', security: [{ bearerAuth: [] }], parameters: [sequenceParameter, idempotency], requestBody: body('#/components/schemas/OperationSequenceOperationsInput'), responses: mutationResponses('Rewritten sequence') } },
    '/operation-sequences/{sequenceId}/publish': { post: { operationId: 'publishOperationSequence', security: [{ bearerAuth: [] }], parameters: [sequenceParameter, idempotency], requestBody: body('#/components/schemas/OperationSequenceVerdictInput'), responses: mutationResponses('Published sequence') } },
    '/operation-sequences/{sequenceId}/retire': { post: { operationId: 'retireOperationSequence', security: [{ bearerAuth: [] }], parameters: [sequenceParameter, idempotency], requestBody: body('#/components/schemas/OperationSequenceVerdictInput'), responses: mutationResponses('Retired sequence') } },
    '/catalog-skus/{sku}/operation-sequence': { get: { operationId: 'getOperationSequenceForSku', security: [{ bearerAuth: [] }], parameters: [{ name: 'sku', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }], responses: { 200: dataResponse('Operation sequence for a product', '#/components/schemas/OperationSequence'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
  };
}

function count() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function minutes() { return { type: 'number', exclusiveMinimum: 0, maximum: 10_000 }; }
function nonNegativeMinutes() { return { type: 'number', minimum: 0, maximum: 4_000_000 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/OperationSequence'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
