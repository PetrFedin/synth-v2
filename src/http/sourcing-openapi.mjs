const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{1,63}$';
const PO_PATTERN = '^[A-Z0-9][A-Z0-9._/-]{2,79}$';
const SUPPLIER_STATUSES = ['draft', 'qualified', 'suspended', 'archived'];
const RFQ_STATUSES = ['draft', 'issued', 'quoted', 'awarded', 'allocated', 'cancelled'];
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, description: 'Globally unique command key. Reuse with another payload returns HTTP 409.', schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } };
const supplierCodeParameter = { name: 'supplierCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE_PATTERN } };
const rfqCodeParameter = { name: 'rfqCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE_PATTERN } };

export function withSourcingOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.12.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const nullableText = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
  const nullableDateTime = { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] };
  const nullableCode = { oneOf: [{ type: 'string', pattern: CODE_PATTERN }, { type: 'null' }] };
  const supplierEditable = {
    legalName: { type: 'string', minLength: 2, maxLength: 200 },
    countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
    email: { type: 'string', format: 'email', maxLength: 320 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    incoterms: { type: 'array', minItems: 1, maxItems: 6, uniqueItems: true, items: { type: 'string', enum: INCOTERMS } },
    categories: { type: 'array', minItems: 1, maxItems: 30, uniqueItems: true, items: { type: 'string', minLength: 2, maxLength: 80 } },
    leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 },
    minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 },
    paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 },
    auditExpiresAt: { type: 'string', format: 'date-time' },
    notes: nullableText(2000),
  };
  const rfqEditable = {
    targetQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 },
    responseDueAt: { type: 'string', format: 'date-time' },
    deliveryDueAt: { type: 'string', format: 'date-time' },
    incoterm: { type: 'string', enum: INCOTERMS },
    supplierCodes: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string', pattern: CODE_PATTERN } },
    notes: nullableText(2000),
  };
  return {
    SupplierCreate: { type: 'object', additionalProperties: false, required: ['supplierCode', 'brandId', ...Object.keys(supplierEditable)], properties: { supplierCode: { type: 'string', pattern: CODE_PATTERN }, brandId: safeIdentifier(), ...supplierEditable } },
    SupplierUpdate: { type: 'object', additionalProperties: false, required: ['expectedVersion', ...Object.keys(supplierEditable)], properties: { expectedVersion: version(), ...supplierEditable } },
    SupplierVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    SupplierSuspensionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reason'], properties: { expectedVersion: version(), reason: { type: 'string', minLength: 5, maxLength: 500 } } },
    Supplier: {
      type: 'object', additionalProperties: false,
      required: ['id', 'supplierCode', 'brandId', ...Object.keys(supplierEditable), 'status', 'version', 'qualifiedAt', 'suspendedAt', 'suspensionReason', 'archivedAt', 'createdAt', 'updatedAt'],
      properties: { id: safeIdentifier(), supplierCode: { type: 'string', pattern: CODE_PATTERN }, brandId: safeIdentifier(), ...supplierEditable, status: { type: 'string', enum: SUPPLIER_STATUSES }, version: version(), qualifiedAt: nullableDateTime, suspendedAt: nullableDateTime, suspensionReason: nullableText(500), archivedAt: nullableDateTime, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } },
    },
    SupplierPage: pageSchema('#/components/schemas/Supplier'),
    RfqCreate: { type: 'object', additionalProperties: false, required: ['rfqCode', 'sku', ...Object.keys(rfqEditable)], properties: { rfqCode: { type: 'string', pattern: CODE_PATTERN }, sku: { type: 'string', pattern: CODE_PATTERN }, ...rfqEditable } },
    RfqUpdate: { type: 'object', additionalProperties: false, required: ['expectedVersion', ...Object.keys(rfqEditable)], properties: { expectedVersion: version(), ...rfqEditable } },
    RfqVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    RfqQuoteInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes'], properties: { expectedVersion: version(), supplierCode: { type: 'string', pattern: CODE_PATTERN }, unitPriceMinor: safeMoney(true), fixedCostMinor: safeMoney(false), leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 }, minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 }, validUntil: { type: 'string', format: 'date-time' }, notes: nullableText(1000) } },
    RfqAwardInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'supplierCode'], properties: { expectedVersion: version(), supplierCode: { type: 'string', pattern: CODE_PATTERN } } },
    RfqAllocationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'purchaseOrderNumber', 'quantity', 'productionStartAt', 'deliveryDueAt', 'notes'], properties: { expectedVersion: version(), purchaseOrderNumber: { type: 'string', pattern: PO_PATTERN }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 }, productionStartAt: { type: 'string', format: 'date-time' }, deliveryDueAt: { type: 'string', format: 'date-time' }, notes: nullableText(1000) } },
    RfqCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reason'], properties: { expectedVersion: version(), reason: { type: 'string', minLength: 5, maxLength: 500 } } },
    RfqQuote: { type: 'object', additionalProperties: false, required: ['supplierCode', 'supplierName', 'supplierVersion', 'unitPriceMinor', 'fixedCostMinor', 'totalCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes', 'receivedAt', 'revision'], properties: { supplierCode: { type: 'string', pattern: CODE_PATTERN }, supplierName: { type: 'string', minLength: 2, maxLength: 200 }, supplierVersion: version(), unitPriceMinor: safeMoney(true), fixedCostMinor: safeMoney(false), totalCostMinor: safeMoney(true), leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 }, minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 }, validUntil: { type: 'string', format: 'date-time' }, notes: nullableText(1000), receivedAt: { type: 'string', format: 'date-time' }, revision: version() } },
    RfqAward: { type: 'object', additionalProperties: false, required: ['supplierCode', 'supplierName', 'supplierVersion', 'quoteRevision', 'unitPriceMinor', 'fixedCostMinor', 'totalCostMinor', 'currency', 'incoterm'], properties: { supplierCode: { type: 'string', pattern: CODE_PATTERN }, supplierName: { type: 'string', minLength: 2, maxLength: 200 }, supplierVersion: version(), quoteRevision: version(), unitPriceMinor: safeMoney(true), fixedCostMinor: safeMoney(false), totalCostMinor: safeMoney(true), currency: { type: 'string', pattern: '^[A-Z]{3}$' }, incoterm: { type: 'string', enum: INCOTERMS } } },
    RfqAllocation: { type: 'object', additionalProperties: false, required: ['purchaseOrderNumber', 'supplierCode', 'quantity', 'productionStartAt', 'deliveryDueAt', 'notes'], properties: { purchaseOrderNumber: { type: 'string', pattern: PO_PATTERN }, supplierCode: { type: 'string', pattern: CODE_PATTERN }, quantity: { type: 'integer', minimum: 1, maximum: 2147483647 }, productionStartAt: { type: 'string', format: 'date-time' }, deliveryDueAt: { type: 'string', format: 'date-time' }, notes: nullableText(1000) } },
    Rfq: {
      type: 'object', additionalProperties: false,
      required: ['id', 'rfqCode', 'brandId', 'sku', 'skuVersion', 'bomVersion', 'bomCurrency', 'bomTotalCost', ...Object.keys(rfqEditable), 'status', 'quotes', 'selectedSupplierCode', 'award', 'allocation', 'cancellationReason', 'version', 'issuedAt', 'awardedAt', 'allocatedAt', 'cancelledAt', 'createdAt', 'updatedAt'],
      properties: { id: safeIdentifier(), rfqCode: { type: 'string', pattern: CODE_PATTERN }, brandId: safeIdentifier(), sku: { type: 'string', pattern: CODE_PATTERN }, skuVersion: version(), bomVersion: version(), bomCurrency: { type: 'string', pattern: '^[A-Z]{3}$' }, bomTotalCost: { type: 'number', exclusiveMinimum: 0 }, ...rfqEditable, status: { type: 'string', enum: RFQ_STATUSES }, quotes: { type: 'array', maxItems: 20, items: { $ref: '#/components/schemas/RfqQuote' } }, selectedSupplierCode: nullableCode, award: { oneOf: [{ $ref: '#/components/schemas/RfqAward' }, { type: 'null' }] }, allocation: { oneOf: [{ $ref: '#/components/schemas/RfqAllocation' }, { type: 'null' }] }, cancellationReason: nullableText(500), version: version(), issuedAt: nullableDateTime, awardedAt: nullableDateTime, allocatedAt: nullableDateTime, cancelledAt: nullableDateTime, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } },
    },
    RfqPage: pageSchema('#/components/schemas/Rfq'),
  };
}

function paths() {
  const supplierMutation = (operationId, schema, description) => mutation(operationId, schema, description, supplierCodeParameter);
  const rfqMutation = (operationId, schema, description) => mutation(operationId, schema, description, rfqCodeParameter);
  return {
    '/suppliers': {
      get: { operationId: 'listSuppliers', security: [{ bearerAuth: [] }], parameters: supplierQueryParameters(), responses: readResponses('Supplier page', '#/components/schemas/SupplierPage') },
      post: { operationId: 'createSupplier', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader], requestBody: body('#/components/schemas/SupplierCreate'), responses: mutationResponses('Created supplier', '#/components/schemas/Supplier') },
    },
    '/suppliers/{supplierCode}': { get: { operationId: 'getSupplier', security: [{ bearerAuth: [] }], parameters: [supplierCodeParameter], responses: readResponses('Supplier', '#/components/schemas/Supplier') }, patch: supplierMutation('updateSupplier', '#/components/schemas/SupplierUpdate', 'Updated supplier') },
    '/suppliers/{supplierCode}/qualify': { post: supplierMutation('qualifySupplier', '#/components/schemas/SupplierVersionExpectation', 'Qualified supplier') },
    '/suppliers/{supplierCode}/suspend': { post: supplierMutation('suspendSupplier', '#/components/schemas/SupplierSuspensionInput', 'Suspended supplier') },
    '/suppliers/{supplierCode}/archive': { post: supplierMutation('archiveSupplier', '#/components/schemas/SupplierVersionExpectation', 'Archived supplier') },
    '/rfqs': {
      get: { operationId: 'listRfqs', security: [{ bearerAuth: [] }], parameters: rfqQueryParameters(), responses: readResponses('RFQ page', '#/components/schemas/RfqPage') },
      post: { operationId: 'createRfq', security: [{ bearerAuth: [] }], parameters: [idempotencyHeader], requestBody: body('#/components/schemas/RfqCreate'), responses: mutationResponses('Created RFQ', '#/components/schemas/Rfq') },
    },
    '/rfqs/{rfqCode}': { get: { operationId: 'getRfq', security: [{ bearerAuth: [] }], parameters: [rfqCodeParameter], responses: readResponses('RFQ', '#/components/schemas/Rfq') }, patch: rfqMutation('updateRfq', '#/components/schemas/RfqUpdate', 'Updated RFQ') },
    '/rfqs/{rfqCode}/issue': { post: rfqMutation('issueRfq', '#/components/schemas/RfqVersionExpectation', 'Issued RFQ') },
    '/rfqs/{rfqCode}/quotes': { post: rfqMutation('upsertRfqQuote', '#/components/schemas/RfqQuoteInput', 'Recorded quotation') },
    '/rfqs/{rfqCode}/award': { post: rfqMutation('awardRfq', '#/components/schemas/RfqAwardInput', 'Awarded RFQ') },
    '/rfqs/{rfqCode}/allocate': { post: rfqMutation('allocateRfq', '#/components/schemas/RfqAllocationInput', 'Allocated production') },
    '/rfqs/{rfqCode}/cancel': { post: rfqMutation('cancelRfq', '#/components/schemas/RfqCancellationInput', 'Cancelled RFQ') },
  };
}
function supplierQueryParameters() { return [limitParameter(), cursorParameter(), searchParameter(), enumQuery('status', SUPPLIER_STATUSES), textQuery('brandId', 160), { name: 'countryCode', in: 'query', schema: { type: 'string', pattern: '^[A-Z]{2}$' } }, textQuery('category', 80)]; }
function rfqQueryParameters() { return [limitParameter(), cursorParameter(), searchParameter(), enumQuery('status', RFQ_STATUSES), textQuery('brandId', 160), { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE_PATTERN } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE_PATTERN } }, { name: 'overdue', in: 'query', schema: { type: 'boolean' } }]; }
function mutation(operationId, schema, description, pathParameter) { return { operationId, security: [{ bearerAuth: [] }], parameters: [pathParameter, idempotencyHeader], requestBody: body(schema), responses: mutationResponses(description, pathParameter === supplierCodeParameter ? '#/components/schemas/Supplier' : '#/components/schemas/Rfq') }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } } } } } }; }
function pageSchema(itemReference) { return { type: 'object', additionalProperties: false, required: ['items', 'referenceTime', 'nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: itemReference } }, referenceTime: { type: 'string', format: 'date-time' }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 3072 }, { type: 'null' }] } } }; }
function safeIdentifier() { return { type: 'string', minLength: 1, maxLength: 160 }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2147483647 }; }
function safeMoney(positive) { return { type: 'integer', minimum: positive ? 1 : 0, maximum: Number.MAX_SAFE_INTEGER }; }
function limitParameter() { return { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }; }
function cursorParameter() { return { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 3072 } }; }
function searchParameter() { return textQuery('q', 80); }
function textQuery(name, maximum) { return { name, in: 'query', schema: { type: 'string', minLength: 1, maxLength: maximum } }; }
function enumQuery(name, values) { return { name, in: 'query', schema: { type: 'string', enum: values } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
