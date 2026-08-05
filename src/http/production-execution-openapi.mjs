const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,127}$';
const STATUSES = ['planned','active','ready-for-qc','cancelled'];
const MILESTONE_CODES = ['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc'];
const MILESTONE_STATUSES = ['pending','blocked','completed'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const executionParameter = { name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withProductionExecutionOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.16.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    ProductionExecutionEmptyInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    ProductionExecutionVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    ProductionMilestoneCompletionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','milestoneCode','notes'], properties: { expectedVersion: version(), milestoneCode: milestoneCode(), notes: nullableText(2000) } },
    ProductionMilestoneBlockInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','milestoneCode','reason'], properties: { expectedVersion: version(), milestoneCode: milestoneCode(), reason: text(5,1000) } },
    ProductionMilestoneResolutionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','milestoneCode','notes'], properties: { expectedVersion: version(), milestoneCode: milestoneCode(), notes: text(5,2000) } },
    ProductionExecutionCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','reason'], properties: { expectedVersion: version(), reason: text(5,1000) } },
    ProductionExecutionSourceSnapshot: { type: 'object', additionalProperties: false, required: ['productionOrderNumber','productionOrderVersion','supplierCode','quantity','confirmationReference','confirmedAt','techPackCode','techPackVersion'], properties: {
      productionOrderNumber: { type: 'string', pattern: CODE }, productionOrderVersion: version(), supplierCode: { type: 'string', pattern: CODE }, quantity: quantity(), confirmationReference: text(2,120), confirmedAt: { type: 'string', format: 'date-time' }, techPackCode: { type: 'string', pattern: CODE }, techPackVersion: version(),
    } },
    ProductionMilestone: { type: 'object', additionalProperties: false, required: ['code','sequence','dueAt','status','completedAt','completedBy','completionNotes','varianceMinutes','blockedAt','blockedBy','blockReason','resolvedAt','resolvedBy','resolutionNotes'], properties: {
      code: milestoneCode(), sequence: { type: 'integer', minimum: 1, maximum: 6 }, dueAt: { type: 'string', format: 'date-time' }, status: { type: 'string', enum: MILESTONE_STATUSES }, completedAt: dateOrNull(), completedBy: nullableText(200), completionNotes: nullableText(2000), varianceMinutes: { oneOf: [{ type: 'integer', minimum: -5256000, maximum: 5256000 }, { type: 'null' }] }, blockedAt: dateOrNull(), blockedBy: nullableText(200), blockReason: nullableText(1000), resolvedAt: dateOrNull(), resolvedBy: nullableText(200), resolutionNotes: nullableText(2000),
    } },
    ProductionExecution: { type: 'object', additionalProperties: false, required: ['id','executionCode','productionOrderNumber','productionOrderId','productionOrderVersion','brandId','supplierCode','sku','quantity','productionStartAt','deliveryDueAt','sourceSnapshot','templateVersion','milestones','status','version','startedAt','startedBy','readyForQcAt','cancelledAt','cancellationReason','createdAt','updatedAt'], properties: {
      id: text(1,200), executionCode: { type: 'string', pattern: CODE }, productionOrderNumber: { type: 'string', pattern: CODE }, productionOrderId: text(1,200), productionOrderVersion: version(), brandId: text(1,200), supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), productionStartAt: { type: 'string', format: 'date-time' }, deliveryDueAt: { type: 'string', format: 'date-time' }, sourceSnapshot: { $ref: '#/components/schemas/ProductionExecutionSourceSnapshot' }, templateVersion: { type: 'string', enum: ['standard-apparel-v1'] }, milestones: { type: 'array', minItems: 6, maxItems: 6, items: { $ref: '#/components/schemas/ProductionMilestone' } }, status: { type: 'string', enum: STATUSES }, version: version(), startedAt: dateOrNull(), startedBy: nullableText(200), readyForQcAt: dateOrNull(), cancelledAt: dateOrNull(), cancellationReason: nullableText(1000), createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    } },
    ProductionExecutionPage: { type: 'object', additionalProperties: false, required: ['items','nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductionExecution' } }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] } } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [executionParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/production-executions': { get: { operationId: 'listProductionExecutions', security: [{ bearerAuth: [] }], parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE } },
    ], responses: { 200: dataResponse('Production execution page', '#/components/schemas/ProductionExecutionPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/production-executions/{executionCode}': { get: { operationId: 'getProductionExecution', security: [{ bearerAuth: [] }], parameters: [executionParameter], responses: { 200: dataResponse('Production execution', '#/components/schemas/ProductionExecution'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/production-executions/from-production-order/{productionOrderNumber}': { post: { operationId: 'createProductionExecutionFromProductionOrder', security: [{ bearerAuth: [] }], parameters: [{ name: 'productionOrderNumber', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }, idempotency], requestBody: body('#/components/schemas/ProductionExecutionEmptyInput'), responses: mutationResponses('Created production execution') } },
    '/production-executions/{executionCode}/start': { post: mutation('startProductionExecution', '#/components/schemas/ProductionExecutionVersionExpectation', 'Started production execution') },
    '/production-executions/{executionCode}/milestones/complete': { post: mutation('completeProductionMilestone', '#/components/schemas/ProductionMilestoneCompletionInput', 'Completed current production milestone') },
    '/production-executions/{executionCode}/milestones/block': { post: mutation('blockProductionMilestone', '#/components/schemas/ProductionMilestoneBlockInput', 'Blocked current production milestone') },
    '/production-executions/{executionCode}/milestones/resolve': { post: mutation('resolveProductionMilestone', '#/components/schemas/ProductionMilestoneResolutionInput', 'Resolved current production milestone block') },
    '/production-executions/{executionCode}/cancel': { post: mutation('cancelProductionExecution', '#/components/schemas/ProductionExecutionCancellationInput', 'Cancelled production execution') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function milestoneCode() { return { type: 'string', enum: MILESTONE_CODES }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function dateOrNull() { return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/ProductionExecution'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
