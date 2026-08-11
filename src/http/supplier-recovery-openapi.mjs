const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const nullableIdentifier = { oneOf: [identifier, { type: 'null' }] };
const money = { type: 'number', exclusiveMinimum: 0, maximum: 900719925474.0991, multipleOf: 0.0001 };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withSupplierRecoveryOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    SupplierRecoveryInput: {
      type: 'object', additionalProperties: false,
      required: ['supplierCode', 'amount', 'currency', 'sourceRef', 'occurredAt', 'reason'],
      properties: {
        supplierCode: { type: 'string', minLength: 2, maxLength: 64 },
        amount: money,
        currency,
        fxRateSnapshotId: nullableIdentifier,
        sku: { oneOf: [{ type: 'string', minLength: 1, maxLength: 160 }, { type: 'null' }] },
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        occurredAt: { type: 'string', format: 'date-time' },
        reason: { type: 'string', minLength: 2, maxLength: 1000 },
      },
    },
    SupplierRecoverySnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'claimResolutionSnapshotId', 'claimResolutionContentHash', 'claimSnapshotId', 'orderId', 'orderVersion',
        'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId',
        'receiptSnapshotId', 'receiptDiscrepancySnapshotId', 'brandId', 'shopId', 'supplierId', 'supplierCode',
        'supplierStatus', 'actualCostEntryId', 'sourceRef', 'sourceRecoveryAmount', 'sourceCurrency', 'recoveryAmount',
        'currency', 'landedCostSnapshotId', 'marginActualizationSnapshotId', 'costCloseSnapshotId', 'postCloseAdjustmentId',
        'reason', 'status', 'recordedAt', 'contentHash',
      ],
      properties: {
        id: identifier,
        claimResolutionSnapshotId: identifier,
        claimResolutionContentHash: sha256(),
        claimSnapshotId: identifier,
        orderId: identifier,
        orderVersion: { type: 'integer', minimum: 1 },
        orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier,
        fulfillmentPlanSnapshotId: identifier,
        shipmentNoticeSnapshotId: identifier,
        receiptSnapshotId: identifier,
        receiptDiscrepancySnapshotId: identifier,
        brandId: identifier,
        shopId: identifier,
        supplierId: identifier,
        supplierCode: { type: 'string', minLength: 2, maxLength: 64 },
        supplierStatus: { type: 'string', enum: ['qualified', 'suspended', 'archived'] },
        actualCostEntryId: identifier,
        sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        sourceRecoveryAmount: money,
        sourceCurrency: currency,
        recoveryAmount: money,
        currency,
        landedCostSnapshotId: identifier,
        marginActualizationSnapshotId: identifier,
        costCloseSnapshotId: nullableIdentifier,
        postCloseAdjustmentId: nullableIdentifier,
        reason: { type: 'string', minLength: 2, maxLength: 1000 },
        status: { type: 'string', enum: ['recorded'] },
        recordedAt: { type: 'string', format: 'date-time' },
        contentHash: sha256(),
      },
    },
    SupplierRecoveryResult: {
      type: 'object', additionalProperties: false,
      required: ['recovery', 'actualCost', 'landedCost', 'marginActualization', 'postCloseAdjustment'],
      properties: {
        recovery: { $ref: '#/components/schemas/SupplierRecoverySnapshot' },
        actualCost: { $ref: '#/components/schemas/ActualCostLedgerEntry' },
        landedCost: { $ref: '#/components/schemas/LandedCostSnapshot' },
        marginActualization: { $ref: '#/components/schemas/MarginActualizationSnapshot' },
        postCloseAdjustment: { oneOf: [{ $ref: '#/components/schemas/PostCloseAdjustment' }, { type: 'null' }] },
      },
    },
  };
}

function paths() {
  const resolutionId = { name: 'resolutionSnapshotId', in: 'path', required: true, schema: identifier };
  const recoveryId = { name: 'recoveryId', in: 'path', required: true, schema: identifier };
  return {
    '/receipt-claim-resolutions/{resolutionSnapshotId}/supplier-recoveries': {
      post: mutation('recordSupplierRecovery', [resolutionId, idempotency], '#/components/schemas/SupplierRecoveryInput', '#/components/schemas/SupplierRecoveryResult'),
    },
    '/supplier-recoveries/{recoveryId}': {
      get: read('getSupplierRecovery', [recoveryId], '#/components/schemas/SupplierRecoverySnapshot'),
    },
  };
}

function mutation(operationId, parameters, input, output) {
  return {
    operationId,
    security: [{ bearerAuth: [] }],
    parameters,
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: input } } } },
    responses: responses(output),
  };
}

function read(operationId, parameters, output) {
  return { operationId, security: [{ bearerAuth: [] }], parameters, responses: responses(output, false) };
}

function responses(output, mutationResponse = true) {
  return {
    200: dataResponse(output),
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    ...(mutationResponse ? { 409: errorResponse, 422: errorResponse } : {}),
  };
}

function dataResponse(reference) {
  return {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object', additionalProperties: false, required: ['data', 'requestId'],
          properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } },
        },
      },
    },
  };
}

function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
