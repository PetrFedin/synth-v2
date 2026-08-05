const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,79}$';
const STATUSES = ['draft','issued','confirmed','cancelled'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const numberParameter = { name: 'productionOrderNumber', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withProductionOrderOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.15.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    ProductionOrderVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    ProductionOrderConfirmationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','supplierCode','confirmationReference','confirmedBy','notes'], properties: { expectedVersion: version(), supplierCode: { type: 'string', pattern: CODE }, confirmationReference: text(2,120), confirmedBy: text(2,200), notes: nullableText(2000) } },
    ProductionOrderCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','reason'], properties: { expectedVersion: version(), reason: text(5,1000) } },
    ProductionOrderSupplierSnapshot: { type: 'object', additionalProperties: false, required: ['supplierCode','legalName','supplierVersion','countryCode','email'], properties: { supplierCode: { type: 'string', pattern: CODE }, legalName: text(2,200), supplierVersion: version(), countryCode: { type: 'string', minLength: 2, maxLength: 2 }, email: { type: 'string', format: 'email', maxLength: 320 } } },
    ProductionOrderCommercialSnapshot: { type: 'object', additionalProperties: false, required: ['currency','incoterm','unitPriceMinor','fixedCostMinor','totalCostMinor','quoteRevision'], properties: { currency: { type: 'string', minLength: 3, maxLength: 3 }, incoterm: { type: 'string', minLength: 3, maxLength: 3 }, unitPriceMinor: money(), fixedCostMinor: money(), totalCostMinor: money(), quoteRevision: version() } },
    ProductionOrderTechPackSnapshot: { type: 'object', additionalProperties: false, required: ['techPackCode','revision','version','issuedVersion','acknowledgedAt','acknowledgementReference'], properties: { techPackCode: { type: 'string', pattern: CODE }, revision: version(), version: version(), issuedVersion: version(), acknowledgedAt: { type: 'string', format: 'date-time' }, acknowledgementReference: text(2,120) } },
    ProductionOrderConfirmation: { type: 'object', additionalProperties: false, required: ['supplierCode','confirmationReference','confirmedBy','notes','confirmedAt','issuedProductionOrderVersion'], properties: { supplierCode: { type: 'string', pattern: CODE }, confirmationReference: text(2,120), confirmedBy: text(2,200), notes: nullableText(2000), confirmedAt: { type: 'string', format: 'date-time' }, issuedProductionOrderVersion: version() } },
    ProductionOrder: { type: 'object', additionalProperties: false, required: ['id','productionOrderNumber','rfqId','rfqCode','rfqVersion','brandId','sku','skuVersion','bomVersion','quantity','productionStartAt','deliveryDueAt','supplierCode','supplierSnapshot','commercialSnapshot','techPackSnapshot','allocationNotes','status','version','issuedAt','issuedBy','confirmedAt','confirmation','cancelledAt','cancellationReason','createdAt','updatedAt'], properties: {
      id: text(1,200), productionOrderNumber: { type: 'string', pattern: CODE }, rfqId: text(1,200), rfqCode: { type: 'string', pattern: CODE }, rfqVersion: version(), brandId: text(1,200), sku: text(1,200), skuVersion: version(), bomVersion: version(), quantity: version(), productionStartAt: { type: 'string', format: 'date-time' }, deliveryDueAt: { type: 'string', format: 'date-time' }, supplierCode: { type: 'string', pattern: CODE }, supplierSnapshot: { $ref: '#/components/schemas/ProductionOrderSupplierSnapshot' }, commercialSnapshot: { $ref: '#/components/schemas/ProductionOrderCommercialSnapshot' }, techPackSnapshot: { $ref: '#/components/schemas/ProductionOrderTechPackSnapshot' }, allocationNotes: nullableText(1000), status: { type: 'string', enum: STATUSES }, version: version(), issuedAt: dateOrNull(), issuedBy: nullableText(200), confirmedAt: dateOrNull(), confirmation: { oneOf: [{ $ref: '#/components/schemas/ProductionOrderConfirmation' }, { type: 'null' }] }, cancelledAt: dateOrNull(), cancellationReason: nullableText(1000), createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    } },
    ProductionOrderPage: { type: 'object', additionalProperties: false, required: ['items','nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductionOrder' } }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] } } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [numberParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/production-orders': { get: { operationId: 'listProductionOrders', security: [{ bearerAuth: [] }], parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE } },
    ], responses: { 200: dataResponse('Production Order page', '#/components/schemas/ProductionOrderPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/production-orders/{productionOrderNumber}': { get: { operationId: 'getProductionOrder', security: [{ bearerAuth: [] }], parameters: [numberParameter], responses: { 200: dataResponse('Production Order', '#/components/schemas/ProductionOrder'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/production-orders/from-allocation/{rfqCode}': { post: { operationId: 'createProductionOrderFromAllocation', security: [{ bearerAuth: [] }], parameters: [{ name: 'rfqCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }, idempotency], requestBody: body('#/components/schemas/ProductionOrderEmptyInput'), responses: mutationResponses('Created Production Order') } },
    '/production-orders/{productionOrderNumber}/issue': { post: mutation('issueProductionOrder', '#/components/schemas/ProductionOrderVersionExpectation', 'Issued Production Order') },
    '/production-orders/{productionOrderNumber}/confirm': { post: mutation('confirmProductionOrder', '#/components/schemas/ProductionOrderConfirmationInput', 'Confirmed Production Order') },
    '/production-orders/{productionOrderNumber}/cancel': { post: mutation('cancelProductionOrder', '#/components/schemas/ProductionOrderCancellationInput', 'Cancelled Production Order') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function money() { return { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function dateOrNull() { return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/ProductionOrder'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
