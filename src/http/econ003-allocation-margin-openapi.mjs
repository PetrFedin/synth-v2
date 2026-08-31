const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const nullableIdentifier = { oneOf: [identifier, { type: 'null' }] };
const sha256 = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const nullableSha256 = { oneOf: [sha256, { type: 'null' }] };
const allocationStatus = { type: 'string', enum: ['current', 'legacy-not-applicable', 'pending-post-close'] };
const nullableAllocationStatus = { oneOf: [allocationStatus, { type: 'null' }] };
const nullableLineageMode = { oneOf: [{ type: 'string', enum: ['product-sku-v2'] }, { type: 'null' }] };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
const postCloseAdjustmentId = { name: 'postCloseAdjustmentId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withEcon003AllocationMarginOpenApi(base) {
  const specification = structuredClone(base);
  const schemas = specification.components?.schemas ?? {};

  addProperties(schemas.MarginActualizationInput, {
    costAllocationRunSnapshotId: identifier,
  });
  addProperties(schemas.MarginActualizationSnapshot, allocationSnapshotProperties());
  addProperties(schemas.CostCloseReadinessSnapshot, allocationSnapshotProperties());
  addProperties(schemas.CostCloseSnapshot, allocationSnapshotProperties());
  addProperties(schemas.PostCloseAdjustment, {
    aggregateContentHash: sha256,
    previousAllocationStatus: { oneOf: [allocationStatus, { type: 'null' }] },
    resultingAllocationStatus: allocationStatus,
    closedCostAllocationRunSnapshotId: nullableIdentifier,
    closedCostAllocationRunContentHash: nullableSha256,
  });

  Object.assign(schemas, postCloseReconciliationSchemas());
  enrichEconomicsPosition(schemas.OrderEconomicsPosition);
  specification.paths['/orders/{orderId}/cost-close/adjustments/{postCloseAdjustmentId}/allocation-reconcile'] = {
    post: {
      operationId: 'reconcilePostCloseAllocation',
      security: [{ bearerAuth: [] }],
      parameters: [orderId, postCloseAdjustmentId, idempotency],
      requestBody: body('#/components/schemas/PostCloseAllocationReconciliationInput'),
      responses: mutationResponses('Reconciled exact ProductSku allocation after a post-close adjustment', '#/components/schemas/PostCloseAllocationReconciliationResult'),
    },
  };

  return deepFreeze(specification);
}

function allocationSnapshotProperties() {
  return {
    aggregateContentHash: sha256,
    allocationStatus,
    costAllocationRunSnapshotId: nullableIdentifier,
    costAllocationRunContentHash: nullableSha256,
    costAllocationPolicyVersionId: nullableIdentifier,
    costAllocationLineageMode: nullableLineageMode,
  };
}

function postCloseReconciliationSchemas() {
  return {
    PostCloseAllocationReconciliationInput: {
      type: 'object',
      additionalProperties: false,
      required: ['costAllocationRunSnapshotId'],
      properties: { costAllocationRunSnapshotId: identifier },
    },
    PostCloseAllocationReconciliationSnapshot: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'costCloseSnapshotId', 'postCloseAdjustmentId',
        'pendingMarginActualizationSnapshotId', 'landedCostSnapshotId', 'costAllocationRunSnapshotId',
        'costAllocationRunContentHash', 'costAllocationPolicyVersionId', 'costAllocationLineageMode',
        'marginActualizationSnapshotId', 'previousAllocationStatus', 'resultingAllocationStatus',
        'status', 'reconciledAt', 'contentHash',
      ],
      properties: {
        id: identifier,
        orderId: identifier,
        orderVersion: { type: 'integer', minimum: 1 },
        orderCommitSnapshotId: identifier,
        costCloseSnapshotId: identifier,
        postCloseAdjustmentId: identifier,
        pendingMarginActualizationSnapshotId: identifier,
        landedCostSnapshotId: identifier,
        costAllocationRunSnapshotId: identifier,
        costAllocationRunContentHash: sha256,
        costAllocationPolicyVersionId: identifier,
        costAllocationLineageMode: { type: 'string', enum: ['product-sku-v2'] },
        marginActualizationSnapshotId: identifier,
        previousAllocationStatus: { type: 'string', enum: ['pending-post-close'] },
        resultingAllocationStatus: { type: 'string', enum: ['current'] },
        status: { type: 'string', enum: ['reconciled'] },
        reconciledAt: { type: 'string', format: 'date-time' },
        contentHash: sha256,
      },
    },
    PostCloseAllocationReconciliationResult: {
      type: 'object',
      additionalProperties: false,
      required: ['reconciliation', 'marginActualization'],
      properties: {
        reconciliation: { $ref: '#/components/schemas/PostCloseAllocationReconciliationSnapshot' },
        marginActualization: { $ref: '#/components/schemas/MarginActualizationSnapshot' },
      },
    },
  };
}

function enrichEconomicsPosition(schema) {
  if (!schema || schema.type !== 'object') return;
  const properties = {
    postCloseAllocationReconciliationSnapshotId: nullableIdentifier,
    allocationStatus: nullableAllocationStatus,
    costAllocationRunSnapshotId: nullableIdentifier,
    costAllocationRunContentHash: nullableSha256,
    costAllocationPolicyVersionId: nullableIdentifier,
    costAllocationLineageMode: nullableLineageMode,
  };
  schema.properties = { ...(schema.properties ?? {}), ...properties };
  schema.required = [...new Set([...(schema.required ?? []), ...Object.keys(properties)])];
}

function addProperties(schema, properties) {
  if (!schema || schema.type !== 'object') return;
  schema.properties = { ...(schema.properties ?? {}), ...properties };
}

function body(reference) {
  return { required: true, content: { 'application/json': { schema: { $ref: reference } } } };
}
function dataResponse(description, reference) {
  return {
    description,
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
function mutationResponses(description, reference) {
  return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
