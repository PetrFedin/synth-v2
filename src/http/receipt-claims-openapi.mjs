const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withReceiptClaimsOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    ReceiptClaimIssueLine: {
      type: 'object', additionalProperties: false,
      required: ['lineId', 'sku', 'shippedQuantity', 'receivedQuantity', 'acceptedQuantity', 'damagedQuantity', 'rejectedQuantity', 'shortageQuantity', 'overageQuantity'],
      properties: {
        lineId: identifier, sku: { type: 'string', pattern: SKU },
        shippedQuantity: nonNegative(), receivedQuantity: nonNegative(), acceptedQuantity: nonNegative(),
        damagedQuantity: nonNegative(), rejectedQuantity: nonNegative(), shortageQuantity: nonNegative(), overageQuantity: nonNegative(),
      },
    },
    ReceiptClaimSubmitInput: {
      type: 'object', additionalProperties: false, required: ['claimReference', 'reason', 'requestedRemedy'],
      properties: {
        claimReference: { type: 'string', minLength: 2, maxLength: 160 },
        reason: { type: 'string', minLength: 2, maxLength: 2000 },
        requestedRemedy: { type: 'string', enum: ['replacement', 'return', 'credit', 'investigation'] },
      },
    },
    ReceiptDiscrepancyClaimSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId', 'latestReceiptSnapshotId', 'receiptDiscrepancySnapshotId', 'receiptDiscrepancyContentHash', 'brandId', 'shopId', 'claimReference', 'reason', 'requestedRemedy', 'issueCount', 'lines', 'status', 'submittedAt', 'contentHash'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: positive(), orderCommitSnapshotId: identifier,
        supplyCommitmentSnapshotId: identifier, fulfillmentPlanSnapshotId: identifier, shipmentNoticeSnapshotId: identifier,
        latestReceiptSnapshotId: identifier, receiptDiscrepancySnapshotId: identifier, receiptDiscrepancyContentHash: sha256(),
        brandId: identifier, shopId: identifier, claimReference: { type: 'string', minLength: 2, maxLength: 160 },
        reason: { type: 'string', minLength: 2, maxLength: 2000 }, requestedRemedy: { type: 'string', enum: ['replacement', 'return', 'credit', 'investigation'] },
        issueCount: positive(), lines: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/ReceiptClaimIssueLine' } },
        status: { type: 'string', enum: ['submitted'] }, submittedAt: date(), contentHash: sha256(),
      },
    },
    ReceiptClaimResolutionInput: {
      type: 'object', additionalProperties: false, required: ['resolutionType', 'resolutionReason'],
      properties: {
        resolutionType: { type: 'string', enum: ['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit', 'accepted-as-is', 'rejected'] },
        resolutionReason: { type: 'string', minLength: 2, maxLength: 2000 },
      },
    },
    ReceiptClaimResolutionSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'claimSnapshotId', 'claimContentHash', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId', 'latestReceiptSnapshotId', 'receiptDiscrepancySnapshotId', 'brandId', 'shopId', 'resolutionType', 'resolutionReason', 'status', 'resolvedAt', 'contentHash'],
      properties: {
        id: identifier, claimSnapshotId: identifier, claimContentHash: sha256(), orderId: identifier, orderVersion: positive(),
        orderCommitSnapshotId: identifier, supplyCommitmentSnapshotId: identifier, fulfillmentPlanSnapshotId: identifier,
        shipmentNoticeSnapshotId: identifier, latestReceiptSnapshotId: identifier, receiptDiscrepancySnapshotId: identifier,
        brandId: identifier, shopId: identifier,
        resolutionType: { type: 'string', enum: ['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit', 'accepted-as-is', 'rejected'] },
        resolutionReason: { type: 'string', minLength: 2, maxLength: 2000 }, status: { type: 'string', enum: ['resolved'] }, resolvedAt: date(), contentHash: sha256(),
      },
    },
  };
}

function paths() {
  const discrepancyId = pathParam('receiptDiscrepancySnapshotId');
  const claimId = pathParam('claimSnapshotId');
  const resolutionId = pathParam('resolutionSnapshotId');
  return {
    '/receipt-discrepancies/{receiptDiscrepancySnapshotId}/claims': { post: mutation('submitReceiptDiscrepancyClaim', [discrepancyId, idempotency], '#/components/schemas/ReceiptClaimSubmitInput', '#/components/schemas/ReceiptDiscrepancyClaimSnapshot') },
    '/receipt-claims/{claimSnapshotId}': { get: read('getReceiptClaim', [claimId], '#/components/schemas/ReceiptDiscrepancyClaimSnapshot') },
    '/receipt-claims/{claimSnapshotId}/resolutions': { post: mutation('resolveReceiptClaim', [claimId, idempotency], '#/components/schemas/ReceiptClaimResolutionInput', '#/components/schemas/ReceiptClaimResolutionSnapshot') },
    '/receipt-claim-resolutions/{resolutionSnapshotId}': { get: read('getReceiptClaimResolution', [resolutionId], '#/components/schemas/ReceiptClaimResolutionSnapshot') },
  };
}
function pathParam(name) { return { name, in: 'path', required: true, schema: identifier }; }
function mutation(operationId, parameters, input, output) { return { operationId, security: [{ bearerAuth: [] }], parameters, requestBody: { required: true, content: { 'application/json': { schema: { $ref: input } } } }, responses: responses(output) }; }
function read(operationId, parameters, output) { return { operationId, security: [{ bearerAuth: [] }], parameters, responses: responses(output, false) }; }
function responses(output, mutation = true) { return { 200: dataResponse(output), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, ...(mutation ? { 409: errorResponse, 422: errorResponse } : {}) }; }
function dataResponse(reference) { return { description: 'Success', content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } }; }
function positive() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function date() { return { type: 'string', format: 'date-time' }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
