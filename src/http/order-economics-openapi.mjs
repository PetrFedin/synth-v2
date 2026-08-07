const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const positiveMoney = { type: 'number', exclusiveMinimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
const marginActualizationId = { name: 'marginActualizationId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withOrderEconomicsOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    SupplyAllocationInput: {
      type: 'object', additionalProperties: false, required: ['sku', 'quantity', 'sourceType', 'sourceRef'],
      properties: {
        sku: { type: 'string', pattern: SKU }, quantity: quantity(),
        sourceType: { type: 'string', enum: ['inventory', 'inbound', 'production', 'drop-ship'] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        expectedAvailabilityAt: nullableDate(),
      },
    },
    SupplyCommitmentInput: {
      type: 'object', additionalProperties: false, required: ['allocations'],
      properties: { allocations: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/SupplyAllocationInput' } } },
    },
    SupplyAllocation: {
      type: 'object', additionalProperties: false, required: ['sku', 'quantity', 'sourceType', 'sourceRef', 'expectedAvailabilityAt'],
      properties: {
        sku: { type: 'string', pattern: SKU }, quantity: quantity(),
        sourceType: { type: 'string', enum: ['inventory', 'inbound', 'production', 'drop-ship'] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, expectedAvailabilityAt: nullableDate(),
      },
    },
    SupplyCommitmentSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'brandId', 'shopId', 'commercialPublicationId', 'priceListVersionId', 'buyerCatalogVersionId', 'currency', 'allocations', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), brandId: identifier, shopId: identifier,
        commercialPublicationId: nullableIdentifier(), priceListVersionId: nullableIdentifier(), buyerCatalogVersionId: nullableIdentifier(),
        currency, allocations: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/SupplyAllocation' } },
        status: { type: 'string', enum: ['committed'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    ActualCostInput: {
      type: 'object', additionalProperties: false, required: ['costType', 'amount', 'currency', 'sourceRef'],
      properties: {
        costType: costType(), amount: { ...money, not: { const: 0 } }, currency,
        sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, occurredAt: date(),
      },
    },
    ActualCostLedgerEntry: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'brandId', 'shopId', 'costType', 'amount', 'currency', 'sku', 'sourceRef', 'occurredAt', 'recordedAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), brandId: identifier, shopId: identifier,
        costType: costType(), amount: money, currency,
        sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, occurredAt: date(), recordedAt: date(),
      },
    },
    EmptyEconomicsInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    LandedCostSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'currency', 'costEntryIds', 'componentTotals', 'totalCost', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), currency,
        costEntryIds: { type: 'array', minItems: 1, maxItems: 100_000, items: identifier },
        componentTotals: { type: 'object', additionalProperties: money }, totalCost: positiveMoney,
        status: { type: 'string', enum: ['actual'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    MarginActualizationInput: {
      type: 'object', additionalProperties: false, required: ['landedCostSnapshotId'],
      properties: { landedCostSnapshotId: identifier },
    },
    MarginActualizationSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'landedCostSnapshotId', 'commercialPublicationId', 'buyerCatalogVersionId', 'currency', 'netRevenue', 'landedCost', 'contributionMarginAmount', 'contributionMarginPercent', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), landedCostSnapshotId: identifier,
        commercialPublicationId: nullableIdentifier(), buyerCatalogVersionId: nullableIdentifier(), currency,
        netRevenue: positiveMoney, landedCost: positiveMoney, contributionMarginAmount: money,
        contributionMarginPercent: { type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 },
        status: { type: 'string', enum: ['actual'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    MarginActualizationReadResult: {
      type: 'object', additionalProperties: false, required: ['margin', 'orderId'],
      properties: { margin: { $ref: '#/components/schemas/MarginActualizationSnapshot' }, orderId: identifier },
    },
  };
}

function paths() {
  return {
    '/orders/{orderId}/supply-commitments': {
      post: mutation('createSupplyCommitment', '#/components/schemas/SupplyCommitmentInput', '#/components/schemas/SupplyCommitmentSnapshot', 'Committed order supply'),
    },
    '/orders/{orderId}/actual-costs': {
      post: mutation('recordActualCost', '#/components/schemas/ActualCostInput', '#/components/schemas/ActualCostLedgerEntry', 'Recorded append-only actual cost'),
    },
    '/orders/{orderId}/landed-cost/actualize': {
      post: mutation('actualizeLandedCost', '#/components/schemas/EmptyEconomicsInput', '#/components/schemas/LandedCostSnapshot', 'Actualized landed cost'),
    },
    '/orders/{orderId}/margin/actualize': {
      post: mutation('actualizeOrderMargin', '#/components/schemas/MarginActualizationInput', '#/components/schemas/MarginActualizationSnapshot', 'Actualized order contribution margin'),
    },
    '/margin-actualizations/{marginActualizationId}': {
      get: {
        operationId: 'getMarginActualization', security: [{ bearerAuth: [] }], parameters: [marginActualizationId],
        responses: readResponses('Margin actualization', '#/components/schemas/MarginActualizationReadResult'),
      },
    },
  };
}

function mutation(operationId, input, output, description) {
  return { operationId, security: [{ bearerAuth: [] }], parameters: [orderId, idempotency], requestBody: body(input), responses: mutationResponses(description, output) };
}
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function costType() { return { type: 'string', enum: ['factory', 'material', 'labor', 'freight', 'insurance', 'duty', 'brokerage', 'warehouse', 'quality', 'rework', 'packaging', 'commission', 'other'] }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function nullableIdentifier() { return { oneOf: [identifier, { type: 'null' }] }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
