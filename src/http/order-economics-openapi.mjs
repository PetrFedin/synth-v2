const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const positiveMoney = { type: 'number', exclusiveMinimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const fxRate = { type: 'number', exclusiveMinimum: 0, maximum: 90_071_992.54740991, multipleOf: 0.00000001 };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
const actualCostEntryId = { name: 'actualCostEntryId', in: 'path', required: true, schema: identifier };
const marginActualizationId = { name: 'marginActualizationId', in: 'path', required: true, schema: identifier };
const costCloseSnapshotId = { name: 'costCloseSnapshotId', in: 'path', required: true, schema: identifier };
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
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'brandId', 'shopId', 'commercialPublicationId', 'priceListVersionId', 'buyerCatalogVersionId', 'currency', 'allocations', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier,
        brandId: identifier, shopId: identifier,
        commercialPublicationId: nullableIdentifier(), priceListVersionId: nullableIdentifier(), buyerCatalogVersionId: nullableIdentifier(),
        currency, allocations: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/SupplyAllocation' } },
        status: { type: 'string', enum: ['committed'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    OrderFxRateSnapshotInput: {
      type: 'object', additionalProperties: false, required: ['sourceCurrency', 'rate', 'rateType', 'sourceRef', 'effectiveAt'],
      properties: {
        sourceCurrency: currency,
        rate: fxRate,
        rateType: fxRateType(),
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        effectiveAt: date(),
      },
    },
    OrderFxRateSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'sourceCurrency', 'targetCurrency', 'rate', 'rateType', 'sourceRef', 'effectiveAt', 'status', 'contentHash', 'recordedAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier,
        sourceCurrency: currency, targetCurrency: currency, rate: fxRate, rateType: fxRateType(),
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, effectiveAt: date(),
        status: { type: 'string', enum: ['recorded'] }, contentHash: sha256(), recordedAt: date(),
      },
    },
    ActualCostInput: {
      type: 'object', additionalProperties: false, required: ['supplyCommitmentSnapshotId', 'costType', 'amount', 'currency', 'sourceRef'],
      properties: actualCostWriteProperties(),
    },
    ActualCostCorrectionInput: {
      type: 'object', additionalProperties: false, required: ['reason', 'supplyCommitmentSnapshotId', 'costType', 'amount', 'currency', 'sourceRef'],
      properties: { reason: reason(), ...actualCostWriteProperties() },
    },
    ActualCostLedgerEntry: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'brandId', 'shopId', 'entryKind', 'reversalOfEntryId', 'correctionId', 'correctionReason', 'costType', 'sourceAmount', 'sourceCurrency', 'fxRateSnapshotId', 'amount', 'currency', 'sku', 'sourceRef', 'occurredAt', 'recordedAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier, supplyCommitmentSnapshotId: identifier,
        brandId: identifier, shopId: identifier,
        entryKind: { type: 'string', enum: ['actual', 'reversal'] },
        reversalOfEntryId: nullableIdentifier(), correctionId: nullableIdentifier(), correctionReason: nullableString(1000),
        costType: costType(), sourceAmount: money, sourceCurrency: currency, fxRateSnapshotId: nullableIdentifier(), amount: money, currency,
        sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, occurredAt: date(), recordedAt: date(),
      },
    },
    ActualCostCorrectionResult: {
      type: 'object', additionalProperties: false,
      required: ['correctionId', 'originalEntryId', 'reversal', 'replacement'],
      properties: {
        correctionId: identifier,
        originalEntryId: identifier,
        reversal: { $ref: '#/components/schemas/ActualCostLedgerEntry' },
        replacement: { $ref: '#/components/schemas/ActualCostLedgerEntry' },
      },
    },
    EmptyEconomicsInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    LandedCostSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotIds', 'supplyLineageComplete', 'currency', 'costEntryIds', 'componentTotals', 'totalCost', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotIds: { type: 'array', maxItems: 100_000, uniqueItems: true, items: identifier },
        supplyLineageComplete: { type: 'boolean' },
        currency,
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
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'landedCostSnapshotId', 'supplyCommitmentSnapshotIds', 'supplyLineageComplete', 'commercialPublicationId', 'priceListVersionId', 'buyerCatalogVersionId', 'currency', 'netRevenue', 'landedCost', 'contributionMarginAmount', 'contributionMarginPercent', 'status', 'contentHash', 'createdAt'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier, landedCostSnapshotId: identifier,
        supplyCommitmentSnapshotIds: { type: 'array', maxItems: 100_000, uniqueItems: true, items: identifier },
        supplyLineageComplete: { type: 'boolean' },
        commercialPublicationId: nullableIdentifier(), priceListVersionId: nullableIdentifier(), buyerCatalogVersionId: nullableIdentifier(), currency,
        netRevenue: positiveMoney, landedCost: positiveMoney, contributionMarginAmount: money,
        contributionMarginPercent: { type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 },
        status: { type: 'string', enum: ['actual'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    MarginActualizationReadResult: {
      type: 'object', additionalProperties: false, required: ['margin', 'orderId'],
      properties: { margin: { $ref: '#/components/schemas/MarginActualizationSnapshot' }, orderId: identifier },
    },
    CostCloseInput: {
      type: 'object', additionalProperties: false, required: ['landedCostSnapshotId', 'marginActualizationSnapshotId'],
      properties: { landedCostSnapshotId: identifier, marginActualizationSnapshotId: identifier },
    },
    CostCloseSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'brandId', 'shopId', 'landedCostSnapshotId', 'marginActualizationSnapshotId', 'costEntryIds', 'supplyCommitmentSnapshotIds', 'currency', 'totalLandedCost', 'netRevenue', 'contributionMarginAmount', 'contributionMarginPercent', 'closedAt', 'status', 'contentHash'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier,
        brandId: identifier, shopId: identifier,
        landedCostSnapshotId: identifier, marginActualizationSnapshotId: identifier,
        costEntryIds: { type: 'array', minItems: 1, maxItems: 100_000, uniqueItems: true, items: identifier },
        supplyCommitmentSnapshotIds: { type: 'array', minItems: 1, maxItems: 100_000, uniqueItems: true, items: identifier },
        currency, totalLandedCost: positiveMoney, netRevenue: positiveMoney, contributionMarginAmount: money,
        contributionMarginPercent: { type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 },
        closedAt: date(), status: { type: 'string', enum: ['closed'] }, contentHash: sha256(),
      },
    },
    PostCloseAdjustmentInput: {
      type: 'object', additionalProperties: false, required: ['reason', 'supplyCommitmentSnapshotId', 'costType', 'amount', 'currency', 'sourceRef'],
      properties: { reason: reason(), ...actualCostWriteProperties() },
    },
    PostCloseAdjustment: {
      type: 'object', additionalProperties: false,
      required: ['id', 'costCloseSnapshotId', 'previousAdjustmentId', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'actualCostEntryId', 'priorLandedCostSnapshotId', 'landedCostSnapshotId', 'priorMarginActualizationSnapshotId', 'marginActualizationSnapshotId', 'costDeltaAmount', 'marginDeltaAmount', 'reason', 'recordedAt', 'status', 'contentHash'],
      properties: {
        id: identifier, costCloseSnapshotId: identifier, previousAdjustmentId: nullableIdentifier(),
        orderId: identifier, orderVersion: version(), orderCommitSnapshotId: identifier,
        actualCostEntryId: identifier, priorLandedCostSnapshotId: identifier, landedCostSnapshotId: identifier,
        priorMarginActualizationSnapshotId: identifier, marginActualizationSnapshotId: identifier,
        costDeltaAmount: money, marginDeltaAmount: money, reason: reason(), recordedAt: date(),
        status: { type: 'string', enum: ['recorded'] }, contentHash: sha256(),
      },
    },
    PostCloseAdjustmentResult: {
      type: 'object', additionalProperties: false,
      required: ['adjustment', 'actualCost', 'landedCost', 'marginActualization'],
      properties: {
        adjustment: { $ref: '#/components/schemas/PostCloseAdjustment' },
        actualCost: { $ref: '#/components/schemas/ActualCostLedgerEntry' },
        landedCost: { $ref: '#/components/schemas/LandedCostSnapshot' },
        marginActualization: { $ref: '#/components/schemas/MarginActualizationSnapshot' },
      },
    },
    CostCloseReadResult: {
      type: 'object', additionalProperties: false, required: ['costClose', 'orderId'],
      properties: { costClose: { $ref: '#/components/schemas/CostCloseSnapshot' }, orderId: identifier },
    },
  };
}

function paths() {
  return {
    '/orders/{orderId}/supply-commitments': {
      post: mutation('createSupplyCommitment', '#/components/schemas/SupplyCommitmentInput', '#/components/schemas/SupplyCommitmentSnapshot', 'Committed order supply'),
    },
    '/orders/{orderId}/fx-rate-snapshots': {
      post: mutation('createOrderFxRateSnapshot', '#/components/schemas/OrderFxRateSnapshotInput', '#/components/schemas/OrderFxRateSnapshot', 'Recorded immutable FX rate for order costing'),
    },
    '/orders/{orderId}/actual-costs': {
      post: mutation('recordActualCost', '#/components/schemas/ActualCostInput', '#/components/schemas/ActualCostLedgerEntry', 'Recorded append-only actual cost'),
    },
    '/orders/{orderId}/actual-costs/{actualCostEntryId}/corrections': {
      post: mutationWithParameters('correctActualCost', [orderId, actualCostEntryId], '#/components/schemas/ActualCostCorrectionInput', '#/components/schemas/ActualCostCorrectionResult', 'Append-only actual cost reversal and replacement'),
    },
    '/orders/{orderId}/landed-cost/actualize': {
      post: mutation('actualizeLandedCost', '#/components/schemas/EmptyEconomicsInput', '#/components/schemas/LandedCostSnapshot', 'Actualized landed cost'),
    },
    '/orders/{orderId}/margin/actualize': {
      post: mutation('actualizeOrderMargin', '#/components/schemas/MarginActualizationInput', '#/components/schemas/MarginActualizationSnapshot', 'Actualized order contribution margin'),
    },
    '/orders/{orderId}/cost-close': {
      post: mutation('closeOrderCost', '#/components/schemas/CostCloseInput', '#/components/schemas/CostCloseSnapshot', 'Closed immutable order cost and margin basis'),
    },
    '/orders/{orderId}/cost-close/adjustments': {
      post: mutation('recordPostCloseAdjustment', '#/components/schemas/PostCloseAdjustmentInput', '#/components/schemas/PostCloseAdjustmentResult', 'Recorded late cost and re-actualized landed cost and margin'),
    },
    '/margin-actualizations/{marginActualizationId}': {
      get: {
        operationId: 'getMarginActualization', security: [{ bearerAuth: [] }], parameters: [marginActualizationId],
        responses: readResponses('Margin actualization', '#/components/schemas/MarginActualizationReadResult'),
      },
    },
    '/cost-closes/{costCloseSnapshotId}': {
      get: {
        operationId: 'getCostClose', security: [{ bearerAuth: [] }], parameters: [costCloseSnapshotId],
        responses: readResponses('Cost close', '#/components/schemas/CostCloseReadResult'),
      },
    },
  };
}

function actualCostWriteProperties() {
  return {
    supplyCommitmentSnapshotId: identifier,
    costType: costType(), amount: { ...money, not: { const: 0 } }, currency,
    fxRateSnapshotId: identifier,
    sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
    sourceRef: { type: 'string', minLength: 1, maxLength: 240 }, occurredAt: date(),
  };
}
function mutation(operationId, input, output, description) {
  return mutationWithParameters(operationId, [orderId], input, output, description);
}
function mutationWithParameters(operationId, parameters, input, output, description) {
  return { operationId, security: [{ bearerAuth: [] }], parameters: [...parameters, idempotency], requestBody: body(input), responses: mutationResponses(description, output) };
}
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function costType() { return { type: 'string', enum: ['factory', 'material', 'labor', 'freight', 'insurance', 'duty', 'brokerage', 'warehouse', 'quality', 'rework', 'packaging', 'commission', 'other'] }; }
function fxRateType() { return { type: 'string', enum: ['plan', 'budget', 'po', 'invoice', 'accounting', 'settlement'] }; }
function reason() { return { type: 'string', minLength: 1, maxLength: 1000 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function nullableIdentifier() { return { oneOf: [identifier, { type: 'null' }] }; }
function nullableString(maxLength) { return { oneOf: [{ type: 'string', minLength: 1, maxLength }, { type: 'null' }] }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
