const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const STATUSES = ['planned', 'in-inspection', 'rework-required', 'passed', 'rejected'];
const ROUND_STATUSES = ['planned', 'in-inspection', 'rework-required', 'passed', 'rejected'];
const DEFECT_CLASSES = ['critical', 'major', 'minor'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const caseParameter = { name: 'qualityCaseCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withProductionQualityOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.17.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    ProductionQualityEmptyInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    ProductionQualityVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    ProductionQualityDefectInput: { type: 'object', additionalProperties: false, required: ['defectCode', 'classification', 'quantity', 'description', 'evidenceReference'], properties: {
      defectCode: text(2, 80), classification: { type: 'string', enum: DEFECT_CLASSES }, quantity: quantity(), description: text(3, 1000), evidenceReference: nullableText(500),
    } },
    ProductionQualityRecordInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'inspectedQuantity', 'defects'], properties: {
      expectedVersion: version(), inspectedQuantity: quantity(), defects: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductionQualityDefectInput' } },
    }, description: 'Inspection decision is computed by the governed quality policy. Callers cannot submit pass, rework, reject or shipping-release outcomes.' },
    ProductionQualityReworkInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reference', 'notes'], properties: { expectedVersion: version(), reference: text(2, 160), notes: text(5, 2000) } },
    ProductionQualitySourceSnapshot: { type: 'object', additionalProperties: false, required: ['executionCode', 'executionVersion', 'productionOrderNumber', 'supplierCode', 'quantity', 'readyForQcAt', 'techPackCode', 'techPackVersion'], properties: {
      executionCode: { type: 'string', pattern: CODE }, executionVersion: version(), productionOrderNumber: { type: 'string', pattern: CODE }, supplierCode: { type: 'string', pattern: CODE }, quantity: quantity(), readyForQcAt: { type: 'string', format: 'date-time' }, techPackCode: { type: 'string', pattern: CODE }, techPackVersion: version(),
    } },
    ProductionQualityLimits: { type: 'object', additionalProperties: false, required: DEFECT_CLASSES, properties: { critical: nonNegative(), major: nonNegative(), minor: nonNegative() } },
    ProductionQualityDefectTotals: { type: 'object', additionalProperties: false, required: DEFECT_CLASSES, properties: { critical: nonNegative(), major: nonNegative(), minor: nonNegative() } },
    ProductionQualityDefect: { type: 'object', additionalProperties: false, required: ['defectCode', 'classification', 'quantity', 'description', 'evidenceReference'], properties: {
      defectCode: text(2, 80), classification: { type: 'string', enum: DEFECT_CLASSES }, quantity: quantity(), description: text(3, 1000), evidenceReference: nullableText(500),
    } },
    ProductionQualityRework: { type: 'object', additionalProperties: false, required: ['reference', 'notes', 'submittedAt', 'submittedBy'], properties: { reference: text(2, 160), notes: text(5, 2000), submittedAt: { type: 'string', format: 'date-time' }, submittedBy: text(1, 200) } },
    ProductionQualityRound: { type: 'object', additionalProperties: false, required: ['round', 'status', 'sampleSize', 'limits', 'inspectedQuantity', 'defects', 'totals', 'decision', 'startedAt', 'startedBy', 'completedAt', 'completedBy', 'rework', 'createdAt'], properties: {
      round: { type: 'integer', minimum: 1, maximum: 3 }, status: { type: 'string', enum: ROUND_STATUSES }, sampleSize: quantity(), limits: { $ref: '#/components/schemas/ProductionQualityLimits' }, inspectedQuantity: nullableInteger(), defects: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductionQualityDefect' } }, totals: { $ref: '#/components/schemas/ProductionQualityDefectTotals' }, decision: { oneOf: [{ type: 'string', enum: ['rework-required', 'passed', 'rejected'] }, { type: 'null' }] }, startedAt: dateOrNull(), startedBy: nullableText(200), completedAt: dateOrNull(), completedBy: nullableText(200), rework: { oneOf: [{ $ref: '#/components/schemas/ProductionQualityRework' }, { type: 'null' }] }, createdAt: { type: 'string', format: 'date-time' },
    } },
    ProductionQualityCase: { type: 'object', additionalProperties: false, required: ['id', 'qualityCaseCode', 'executionId', 'executionCode', 'executionVersion', 'productionOrderNumber', 'brandId', 'supplierCode', 'sku', 'quantity', 'sourceSnapshot', 'policyVersion', 'status', 'version', 'rounds', 'passedAt', 'rejectedAt', 'shippingReleaseAt', 'createdAt', 'updatedAt'], properties: {
      id: text(1, 200), qualityCaseCode: { type: 'string', pattern: CODE }, executionId: text(1, 200), executionCode: { type: 'string', pattern: CODE }, executionVersion: version(), productionOrderNumber: { type: 'string', pattern: CODE }, brandId: text(1, 200), supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), sourceSnapshot: { $ref: '#/components/schemas/ProductionQualitySourceSnapshot' }, policyVersion: { type: 'string', enum: ['syntha-aql-v1'] }, status: { type: 'string', enum: STATUSES }, version: version(), rounds: { type: 'array', minItems: 1, maxItems: 3, items: { $ref: '#/components/schemas/ProductionQualityRound' } }, passedAt: dateOrNull(), rejectedAt: dateOrNull(), shippingReleaseAt: dateOrNull(), createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    } },
    ProductionQualityPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductionQualityCase' } }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] } } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [caseParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/production-quality': { get: { operationId: 'listProductionQualityCases', security: [{ bearerAuth: [] }], parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE } },
    ], responses: { 200: dataResponse('Production quality page', '#/components/schemas/ProductionQualityPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/production-quality/{qualityCaseCode}': { get: { operationId: 'getProductionQualityCase', security: [{ bearerAuth: [] }], parameters: [caseParameter], responses: { 200: dataResponse('Production quality case', '#/components/schemas/ProductionQualityCase'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/production-quality/from-execution/{executionCode}': { post: { operationId: 'createProductionQualityFromExecution', security: [{ bearerAuth: [] }], parameters: [{ name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }, idempotency], requestBody: body('#/components/schemas/ProductionQualityEmptyInput'), responses: mutationResponses('Created production quality case') } },
    '/production-quality/{qualityCaseCode}/start': { post: mutation('startProductionQualityInspection', '#/components/schemas/ProductionQualityVersionExpectation', 'Started production quality inspection') },
    '/production-quality/{qualityCaseCode}/record': { post: mutation('recordProductionQualityInspection', '#/components/schemas/ProductionQualityRecordInput', 'Recorded governed production quality decision') },
    '/production-quality/{qualityCaseCode}/rework': { post: mutation('submitProductionQualityRework', '#/components/schemas/ProductionQualityReworkInput', 'Submitted rework and opened larger reinspection sample') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function nullableInteger() { return { oneOf: [nonNegative(), { type: 'null' }] }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function dateOrNull() { return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/ProductionQualityCase'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
