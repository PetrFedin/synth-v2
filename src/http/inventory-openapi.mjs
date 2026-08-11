const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withInventoryOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    InventoryMovementLedgerEntry: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'movementType', 'lineageVersion', 'orderId', 'orderVersion', 'orderCommitSnapshotId',
        'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId', 'receiptSnapshotId',
        'brandId', 'shopId', 'warehouseLocationId', 'receiptLineId', 'sku',
        'receivedQuantity', 'acceptedQuantity', 'damagedQuantity', 'rejectedQuantity',
        'onHandDelta', 'availableDelta', 'quarantineDelta', 'occurredAt', 'postedAt', 'contentHash',
      ],
      properties: {
        id: identifier,
        movementType: { type: 'string', enum: ['receipt-posting'] },
        lineageVersion: { type: 'integer', enum: [1] },
        orderId: identifier,
        orderVersion: positiveInteger(),
        orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier,
        fulfillmentPlanSnapshotId: identifier,
        shipmentNoticeSnapshotId: identifier,
        receiptSnapshotId: identifier,
        brandId: identifier,
        shopId: identifier,
        warehouseLocationId: { type: 'string', minLength: 1, maxLength: 120 },
        receiptLineId: { type: 'string', minLength: 1, maxLength: 80 },
        sku: { type: 'string', pattern: SKU },
        receivedQuantity: positiveInteger(),
        acceptedQuantity: nonNegativeInteger(),
        damagedQuantity: nonNegativeInteger(),
        rejectedQuantity: nonNegativeInteger(),
        onHandDelta: positiveInteger(),
        availableDelta: nonNegativeInteger(),
        quarantineDelta: nonNegativeInteger(),
        occurredAt: date(),
        postedAt: date(),
        contentHash: sha256(),
      },
    },
    ReceiptInventoryPostingResult: {
      type: 'object', additionalProperties: false,
      required: ['receiptSnapshotId', 'shopId', 'warehouseLocationId', 'movementIds', 'movements', 'postedAt'],
      properties: {
        receiptSnapshotId: identifier,
        shopId: identifier,
        warehouseLocationId: { type: 'string', minLength: 1, maxLength: 120 },
        movementIds: { type: 'array', minItems: 1, maxItems: 100_000, uniqueItems: true, items: identifier },
        movements: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/InventoryMovementLedgerEntry' } },
        postedAt: date(),
      },
    },
    WarehouseInventoryPosition: {
      type: 'object', additionalProperties: false,
      required: ['shopId', 'warehouseLocationId', 'sku', 'onHandQuantity', 'availableQuantity', 'quarantineQuantity', 'movementCount', 'latestPostedAt'],
      properties: {
        shopId: identifier,
        warehouseLocationId: { type: 'string', minLength: 1, maxLength: 120 },
        sku: { type: 'string', pattern: SKU },
        onHandQuantity: nonNegativeSafeInteger(),
        availableQuantity: nonNegativeSafeInteger(),
        quarantineQuantity: nonNegativeSafeInteger(),
        movementCount: nonNegativeSafeInteger(),
        latestPostedAt: date(),
      },
    },
    WarehouseInventoryPositionResult: {
      type: 'object', additionalProperties: false,
      required: ['shopId', 'warehouseLocationId', 'sku', 'positions', 'asOf'],
      properties: {
        shopId: identifier,
        warehouseLocationId: { type: 'string', minLength: 1, maxLength: 120 },
        sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
        positions: { type: 'array', maxItems: 100_000, items: { $ref: '#/components/schemas/WarehouseInventoryPosition' } },
        asOf: date(),
      },
    },
    EmptyInventoryInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
  };
}

function paths() {
  const receiptId = pathParameter('receiptId');
  const shopId = pathParameter('shopId');
  const warehouseLocationId = { name: 'warehouseLocationId', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 120, pattern: SAFE_ID } };
  const sku = { name: 'sku', in: 'query', required: false, schema: { type: 'string', pattern: SKU } };
  return {
    '/receipts/{receiptId}/inventory-postings': {
      post: {
        operationId: 'postReceiptToInventory', security: [{ bearerAuth: [] }], parameters: [receiptId, idempotency],
        requestBody: body('#/components/schemas/EmptyInventoryInput'),
        responses: mutationResponses('Append-only inventory movements derived from the immutable receipt', '#/components/schemas/ReceiptInventoryPostingResult'),
      },
    },
    '/shops/{shopId}/warehouse-locations/{warehouseLocationId}/positions': {
      get: {
        operationId: 'getWarehouseInventoryPositions', security: [{ bearerAuth: [] }], parameters: [shopId, warehouseLocationId, sku],
        responses: readResponses('Warehouse position derived from the append-only inventory movement ledger', '#/components/schemas/WarehouseInventoryPositionResult'),
      },
    },
  };
}

function pathParameter(name) { return { name, in: 'path', required: true, schema: identifier }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function date() { return { type: 'string', format: 'date-time' }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function positiveInteger() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegativeInteger() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function nonNegativeSafeInteger() { return { type: 'integer', minimum: 0, maximum: 9_007_199_254_740_991 }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
