const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const percent = { oneOf: [{ type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 }, { type: 'null' }] };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withCostAllocationOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    CostAllocationRule: {
      type: 'object', additionalProperties: false, required: ['costType', 'basis'],
      properties: { costType: { type: 'string', minLength: 1, maxLength: 80 }, basis: allocationBasis() },
    },
    CostAllocationPolicyInput: {
      type: 'object', additionalProperties: false, required: ['name', 'version', 'defaultBasis', 'rules'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'integer', minimum: 1 },
        defaultBasis: allocationBasis(), rules: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/CostAllocationRule' } },
      },
    },
    CostAllocationPolicyVersion: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'name', 'version', 'defaultBasis', 'rules', 'status', 'createdAt', 'contentHash'],
      properties: {
        id: identifier, brandId: identifier, name: { type: 'string', minLength: 1, maxLength: 160 }, version: { type: 'integer', minimum: 1 },
        defaultBasis: allocationBasis(), rules: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/CostAllocationRule' } },
        status: { type: 'string', enum: ['approved'] }, createdAt: date(), contentHash: sha256(),
      },
    },
    CostAllocationRunInput: {
      type: 'object', additionalProperties: false, required: ['landedCostSnapshotId', 'policyVersionId'],
      properties: {
        landedCostSnapshotId: identifier,
        policyVersionId: identifier,
        customWeightsByCostEntryId: {
          type: 'object', additionalProperties: {
            type: 'object', additionalProperties: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    CostAllocationRow: {
      type: 'object', additionalProperties: false,
      required: ['costEntryId', 'costType', 'sku', 'basis', 'basisWeight', 'share', 'allocatedAmount', 'currency'],
      properties: {
        costEntryId: identifier, costType: { type: 'string', minLength: 1, maxLength: 80 }, sku: { type: 'string', minLength: 1, maxLength: 160 },
        basis: allocationBasis(), basisWeight: { type: 'number', minimum: 0 }, share: { type: 'number', minimum: 0, maximum: 1 },
        allocatedAmount: money, currency,
      },
    },
    SkuEconomics: {
      type: 'object', additionalProperties: false,
      required: ['sku', 'quantity', 'netRevenue', 'allocatedLandedCost', 'contributionMarginAmount', 'contributionMarginPercent', 'currency'],
      properties: {
        sku: { type: 'string', minLength: 1, maxLength: 160 }, quantity: { type: 'number', exclusiveMinimum: 0 },
        netRevenue: money, allocatedLandedCost: money, contributionMarginAmount: money, contributionMarginPercent: percent, currency,
      },
    },
    CostAllocationRunSnapshot: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'landedCostSnapshotId', 'policyVersionId',
        'brandId', 'shopId', 'currency', 'costEntryIds', 'allocations', 'skuEconomics', 'allocatedTotal', 'status', 'createdAt', 'contentHash',
      ],
      properties: {
        id: identifier, orderId: identifier, orderVersion: { type: 'integer', minimum: 1 }, orderCommitSnapshotId: identifier,
        landedCostSnapshotId: identifier, policyVersionId: identifier, brandId: identifier, shopId: identifier, currency,
        costEntryIds: { type: 'array', minItems: 1, maxItems: 100_000, uniqueItems: true, items: identifier },
        allocations: { type: 'array', minItems: 1, maxItems: 1_000_000, items: { $ref: '#/components/schemas/CostAllocationRow' } },
        skuEconomics: { type: 'array', minItems: 1, maxItems: 100_000, items: { $ref: '#/components/schemas/SkuEconomics' } },
        allocatedTotal: money, status: { type: 'string', enum: ['actual'] }, createdAt: date(), contentHash: sha256(),
      },
    },
  };
}

function paths() {
  const brandId = { name: 'brandId', in: 'path', required: true, schema: identifier };
  const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
  const policyVersionId = { name: 'policyVersionId', in: 'path', required: true, schema: identifier };
  const allocationRunId = { name: 'allocationRunId', in: 'path', required: true, schema: identifier };
  return {
    '/brands/{brandId}/cost-allocation-policies': {
      post: {
        operationId: 'createCostAllocationPolicyVersion', security: [{ bearerAuth: [] }], parameters: [brandId, idempotency],
        requestBody: body('#/components/schemas/CostAllocationPolicyInput'),
        responses: mutationResponses('Approved immutable cost allocation policy version', '#/components/schemas/CostAllocationPolicyVersion'),
      },
    },
    '/orders/{orderId}/cost-allocation-runs': {
      post: {
        operationId: 'allocateOrderLandedCost', security: [{ bearerAuth: [] }], parameters: [orderId, idempotency],
        requestBody: body('#/components/schemas/CostAllocationRunInput'),
        responses: mutationResponses('Immutable SKU cost allocation run', '#/components/schemas/CostAllocationRunSnapshot'),
      },
    },
    '/cost-allocation-policies/{policyVersionId}': {
      get: { operationId: 'getCostAllocationPolicyVersion', security: [{ bearerAuth: [] }], parameters: [policyVersionId], responses: readResponses('Cost allocation policy version', '#/components/schemas/CostAllocationPolicyVersion') },
    },
    '/cost-allocation-runs/{allocationRunId}': {
      get: { operationId: 'getCostAllocationRun', security: [{ bearerAuth: [] }], parameters: [allocationRunId], responses: readResponses('Cost allocation run', '#/components/schemas/CostAllocationRunSnapshot') },
    },
  };
}

function allocationBasis() { return { type: 'string', enum: ['direct', 'unit', 'net_value', 'custom'] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function date() { return { type: 'string', format: 'date-time' }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
