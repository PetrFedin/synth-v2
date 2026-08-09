const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withFulfillmentOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    FulfillmentLocationSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['locationId', 'name', 'countryCode', 'city', 'addressLine1', 'addressLine2', 'postalCode'],
      properties: {
        locationId: { type: 'string', minLength: 1, maxLength: 120 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
        city: { type: 'string', minLength: 1, maxLength: 120 },
        addressLine1: { type: 'string', minLength: 1, maxLength: 240 },
        addressLine2: nullableString(240),
        postalCode: nullableString(40),
      },
    },
    FulfillmentPlanInput: {
      type: 'object', additionalProperties: false,
      required: ['supplyCommitmentSnapshotId', 'shipFrom', 'shipTo', 'plannedShipAt', 'expectedDeliveryAt'],
      properties: {
        supplyCommitmentSnapshotId: identifier,
        shipFrom: { $ref: '#/components/schemas/FulfillmentLocationSnapshot' },
        shipTo: { $ref: '#/components/schemas/FulfillmentLocationSnapshot' },
        plannedShipAt: date(),
        expectedDeliveryAt: date(),
      },
    },
    FulfillmentPlanLine: {
      type: 'object', additionalProperties: false,
      required: ['lineId', 'sku', 'quantity', 'sourceType', 'sourceRef', 'expectedAvailabilityAt'],
      properties: {
        lineId: { type: 'string', minLength: 1, maxLength: 80 },
        sku: identifier,
        quantity: positiveInteger(),
        sourceType: { type: 'string', enum: ['inventory', 'inbound', 'production', 'drop-ship'] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        expectedAvailabilityAt: { oneOf: [date(), { type: 'null' }] },
      },
    },
    FulfillmentPlanSnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId',
        'brandId', 'shopId', 'currency', 'shipFrom', 'shipTo', 'plannedShipAt', 'expectedDeliveryAt',
        'lines', 'status', 'contentHash', 'createdAt',
      ],
      properties: {
        id: identifier, orderId: identifier, orderVersion: positiveInteger(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier, brandId: identifier, shopId: identifier,
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        shipFrom: { $ref: '#/components/schemas/FulfillmentLocationSnapshot' },
        shipTo: { $ref: '#/components/schemas/FulfillmentLocationSnapshot' },
        plannedShipAt: date(), expectedDeliveryAt: date(),
        lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/FulfillmentPlanLine' } },
        status: { type: 'string', enum: ['planned'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    ShipmentNoticeLineInput: {
      type: 'object', additionalProperties: false, required: ['lineId', 'quantity'],
      properties: { lineId: { type: 'string', minLength: 1, maxLength: 80 }, quantity: positiveInteger() },
    },
    ShipmentNoticeInput: {
      type: 'object', additionalProperties: false,
      required: ['shipmentNumber', 'carrier', 'serviceLevel', 'lines', 'shippedAt', 'expectedDeliveryAt'],
      properties: {
        shipmentNumber: { type: 'string', minLength: 2, maxLength: 120 },
        carrier: { type: 'string', minLength: 2, maxLength: 160 },
        serviceLevel: { type: 'string', minLength: 1, maxLength: 120 },
        trackingNumber: nullableString(160),
        lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/ShipmentNoticeLineInput' } },
        shippedAt: date(), expectedDeliveryAt: date(),
      },
    },
    ShipmentNoticeLine: {
      type: 'object', additionalProperties: false,
      required: ['lineId', 'sku', 'quantity', 'sourceType', 'sourceRef'],
      properties: {
        lineId: { type: 'string', minLength: 1, maxLength: 80 }, sku: identifier, quantity: positiveInteger(),
        sourceType: { type: 'string', enum: ['inventory', 'inbound', 'production', 'drop-ship'] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
    ShipmentNoticeSnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId',
        'brandId', 'shopId', 'shipmentNumber', 'carrier', 'serviceLevel', 'trackingNumber', 'shippedAt',
        'expectedDeliveryAt', 'lines', 'status', 'contentHash', 'createdAt',
      ],
      properties: {
        id: identifier, orderId: identifier, orderVersion: positiveInteger(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier, fulfillmentPlanSnapshotId: identifier, brandId: identifier, shopId: identifier,
        shipmentNumber: { type: 'string', minLength: 2, maxLength: 120 }, carrier: { type: 'string', minLength: 2, maxLength: 160 },
        serviceLevel: { type: 'string', minLength: 1, maxLength: 120 }, trackingNumber: nullableString(160),
        shippedAt: date(), expectedDeliveryAt: date(),
        lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/ShipmentNoticeLine' } },
        status: { type: 'string', enum: ['shipped'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    ReceiptLineInput: {
      type: 'object', additionalProperties: false, required: ['lineId', 'receivedQuantity'],
      properties: {
        lineId: { type: 'string', minLength: 1, maxLength: 80 }, receivedQuantity: positiveInteger(),
        damagedQuantity: nonNegativeInteger(), rejectedQuantity: nonNegativeInteger(),
      },
    },
    ReceiptInput: {
      type: 'object', additionalProperties: false,
      required: ['receiptReference', 'receivedBy', 'receiptComplete', 'lines', 'receivedAt'],
      properties: {
        receiptReference: { type: 'string', minLength: 2, maxLength: 160 },
        receivedBy: { type: 'string', minLength: 2, maxLength: 200 },
        receiptComplete: { type: 'boolean' },
        lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/ReceiptLineInput' } },
        receivedAt: date(),
      },
    },
    ReceiptLine: {
      type: 'object', additionalProperties: false,
      required: ['lineId', 'sku', 'shippedQuantity', 'receivedQuantity', 'damagedQuantity', 'rejectedQuantity', 'acceptedQuantity'],
      properties: {
        lineId: { type: 'string', minLength: 1, maxLength: 80 }, sku: identifier,
        shippedQuantity: positiveInteger(), receivedQuantity: positiveInteger(), damagedQuantity: nonNegativeInteger(),
        rejectedQuantity: nonNegativeInteger(), acceptedQuantity: nonNegativeInteger(),
      },
    },
    ReceiptSnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId',
        'shipmentNoticeSnapshotId', 'brandId', 'shopId', 'receiptReference', 'receivedBy', 'receiptComplete', 'receivedAt',
        'lines', 'status', 'contentHash', 'createdAt',
      ],
      properties: {
        id: identifier, orderId: identifier, orderVersion: positiveInteger(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier, fulfillmentPlanSnapshotId: identifier, shipmentNoticeSnapshotId: identifier,
        brandId: identifier, shopId: identifier, receiptReference: { type: 'string', minLength: 2, maxLength: 160 },
        receivedBy: { type: 'string', minLength: 2, maxLength: 200 }, receiptComplete: { type: 'boolean' },
        receivedAt: date(), lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/ReceiptLine' } },
        status: { type: 'string', enum: ['received'] }, contentHash: sha256(), createdAt: date(),
      },
    },
    ReceiptDiscrepancyLine: {
      type: 'object', additionalProperties: false,
      required: ['lineId', 'sku', 'shippedQuantity', 'receivedQuantity', 'acceptedQuantity', 'damagedQuantity', 'rejectedQuantity', 'shortageQuantity', 'overageQuantity'],
      properties: {
        lineId: { type: 'string', minLength: 1, maxLength: 80 }, sku: identifier,
        shippedQuantity: positiveInteger(), receivedQuantity: nonNegativeInteger(), acceptedQuantity: nonNegativeInteger(),
        damagedQuantity: nonNegativeInteger(), rejectedQuantity: nonNegativeInteger(), shortageQuantity: nonNegativeInteger(), overageQuantity: nonNegativeInteger(),
      },
    },
    ReceiptDiscrepancySnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId',
        'shipmentNoticeSnapshotId', 'brandId', 'shopId', 'receiptSnapshotIds', 'latestReceiptSnapshotId', 'finalized',
        'lines', 'issueCount', 'status', 'contentHash', 'createdAt',
      ],
      properties: {
        id: identifier, orderId: identifier, orderVersion: positiveInteger(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier, fulfillmentPlanSnapshotId: identifier, shipmentNoticeSnapshotId: identifier,
        brandId: identifier, shopId: identifier,
        receiptSnapshotIds: { type: 'array', minItems: 1, maxItems: 100_000, uniqueItems: true, items: identifier },
        latestReceiptSnapshotId: identifier, finalized: { type: 'boolean' },
        lines: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/ReceiptDiscrepancyLine' } },
        issueCount: nonNegativeInteger(), status: { type: 'string', enum: ['pending', 'clear', 'open'] },
        contentHash: sha256(), createdAt: date(),
      },
    },
    ReceiptRecordResult: {
      type: 'object', additionalProperties: false, required: ['receipt', 'discrepancy'],
      properties: {
        receipt: { $ref: '#/components/schemas/ReceiptSnapshot' },
        discrepancy: { $ref: '#/components/schemas/ReceiptDiscrepancySnapshot' },
      },
    },
  };
}

function paths() {
  const orderId = pathParameter('orderId');
  const fulfillmentPlanId = pathParameter('fulfillmentPlanId');
  const shipmentNoticeId = pathParameter('shipmentNoticeId');
  const receiptId = pathParameter('receiptId');
  const discrepancyId = pathParameter('discrepancyId');
  return {
    '/orders/{orderId}/fulfillment-plans': {
      post: {
        operationId: 'createFulfillmentPlan', security: [{ bearerAuth: [] }], parameters: [orderId, idempotency],
        requestBody: body('#/components/schemas/FulfillmentPlanInput'),
        responses: mutationResponses('Immutable fulfillment plan snapshot', '#/components/schemas/FulfillmentPlanSnapshot'),
      },
    },
    '/fulfillment-plans/{fulfillmentPlanId}': {
      get: { operationId: 'getFulfillmentPlan', security: [{ bearerAuth: [] }], parameters: [fulfillmentPlanId], responses: readResponses('Fulfillment plan snapshot', '#/components/schemas/FulfillmentPlanSnapshot') },
    },
    '/fulfillment-plans/{fulfillmentPlanId}/shipment-notices': {
      post: {
        operationId: 'createShipmentNotice', security: [{ bearerAuth: [] }], parameters: [fulfillmentPlanId, idempotency],
        requestBody: body('#/components/schemas/ShipmentNoticeInput'),
        responses: mutationResponses('Immutable shipment notice / ASN snapshot', '#/components/schemas/ShipmentNoticeSnapshot'),
      },
    },
    '/shipment-notices/{shipmentNoticeId}': {
      get: { operationId: 'getShipmentNotice', security: [{ bearerAuth: [] }], parameters: [shipmentNoticeId], responses: readResponses('Shipment notice snapshot', '#/components/schemas/ShipmentNoticeSnapshot') },
    },
    '/shipment-notices/{shipmentNoticeId}/receipts': {
      post: {
        operationId: 'recordShipmentReceipt', security: [{ bearerAuth: [] }], parameters: [shipmentNoticeId, idempotency],
        requestBody: body('#/components/schemas/ReceiptInput'),
        responses: mutationResponses('Retail receipt and server-derived discrepancy snapshot', '#/components/schemas/ReceiptRecordResult'),
      },
    },
    '/receipts/{receiptId}': {
      get: { operationId: 'getReceipt', security: [{ bearerAuth: [] }], parameters: [receiptId], responses: readResponses('Receipt snapshot', '#/components/schemas/ReceiptSnapshot') },
    },
    '/receipt-discrepancies/{discrepancyId}': {
      get: { operationId: 'getReceiptDiscrepancy', security: [{ bearerAuth: [] }], parameters: [discrepancyId], responses: readResponses('Receipt discrepancy snapshot', '#/components/schemas/ReceiptDiscrepancySnapshot') },
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
function nullableString(maxLength) { return { oneOf: [{ type: 'string', minLength: 1, maxLength }, { type: 'null' }] }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
