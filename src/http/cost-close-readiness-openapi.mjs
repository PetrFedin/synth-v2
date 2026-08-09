const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const positiveMoney = { type: 'number', exclusiveMinimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const metric = { type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
const readinessId = { name: 'costCloseReadinessSnapshotId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withCostCloseReadinessOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, readinessSchemas());

  const closeInput = specification.components.schemas.CostCloseInput;
  closeInput.required = [...new Set([...closeInput.required, 'costCloseReadinessSnapshotId'])];
  closeInput.properties.costCloseReadinessSnapshotId = identifier;

  const close = specification.components.schemas.CostCloseSnapshot;
  close.required = [...new Set([...close.required, 'costCloseReadinessSnapshotId', 'readinessContentHash'])];
  close.properties.costCloseReadinessSnapshotId = identifier;
  close.properties.readinessContentHash = sha256();

  Object.assign(specification.paths, readinessPaths());
  return deepFreeze(specification);
}

function readinessSchemas() {
  return {
    CostCloseReadinessRequirementInput: {
      type: 'object', additionalProperties: false, required: ['type', 'status'],
      properties: {
        type: requirementType(), status: requirementStatus(),
        evidenceEntryIds: { type: 'array', maxItems: 100_000, uniqueItems: true, items: identifier },
        waiverReason: nullableString(1000),
      },
    },
    CostCloseReadinessInput: {
      type: 'object', additionalProperties: false,
      required: ['landedCostSnapshotId', 'marginActualizationSnapshotId', 'requirements'],
      properties: {
        landedCostSnapshotId: identifier,
        marginActualizationSnapshotId: identifier,
        requirements: { type: 'array', minItems: 4, maxItems: 4, items: { $ref: '#/components/schemas/CostCloseReadinessRequirementInput' } },
      },
    },
    CostCloseReadinessRequirement: {
      type: 'object', additionalProperties: false, required: ['type', 'status', 'evidenceEntryIds', 'waiverReason'],
      properties: {
        type: requirementType(), status: requirementStatus(),
        evidenceEntryIds: { type: 'array', maxItems: 100_000, uniqueItems: true, items: identifier },
        waiverReason: nullableString(1000),
      },
    },
    CostCloseReadinessSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'brandId', 'shopId', 'landedCostSnapshotId', 'marginActualizationSnapshotId', 'currency', 'status', 'requirements', 'blockingReasons', 'evaluatedAt', 'contentHash'],
      properties: {
        id: identifier, orderId: identifier, orderVersion: { type: 'integer', minimum: 1 }, orderCommitSnapshotId: identifier,
        brandId: identifier, shopId: identifier, landedCostSnapshotId: identifier, marginActualizationSnapshotId: identifier, currency,
        status: readinessStatus(),
        requirements: { type: 'array', minItems: 4, maxItems: 4, items: { $ref: '#/components/schemas/CostCloseReadinessRequirement' } },
        blockingReasons: { type: 'array', maxItems: 4, uniqueItems: true, items: requirementType() },
        evaluatedAt: { type: 'string', format: 'date-time' }, contentHash: sha256(),
      },
    },
    CostCloseReadinessReadResult: {
      type: 'object', additionalProperties: false, required: ['readiness', 'orderId'],
      properties: { readiness: { $ref: '#/components/schemas/CostCloseReadinessSnapshot' }, orderId: identifier },
    },
    OrderEconomicsPosition: {
      type: 'object', additionalProperties: false,
      required: [
        'orderId', 'orderCommitSnapshotId', 'currency', 'status',
        'costCloseReadinessSnapshotId', 'costCloseSnapshotId', 'latestPostCloseAdjustmentId',
        'blockingReasons', 'effectiveLandedCostSnapshotId', 'effectiveMarginActualizationSnapshotId',
        'effectiveTotalLandedCost', 'effectiveContributionMarginAmount', 'effectiveContributionMarginPercent',
        'baseTotalLandedCost', 'baseContributionMarginAmount',
        'cumulativePostCloseCostDelta', 'cumulativePostCloseMarginDelta',
      ],
      properties: {
        orderId: identifier,
        orderCommitSnapshotId: identifier,
        currency,
        status: economicsPositionStatus(),
        costCloseReadinessSnapshotId: nullableIdentifier(),
        costCloseSnapshotId: nullableIdentifier(),
        latestPostCloseAdjustmentId: nullableIdentifier(),
        blockingReasons: {
          type: 'array', maxItems: 16, uniqueItems: true,
          items: { type: 'string', enum: ['factory', 'freight', 'duty', 'credits', 'ledger_changed', 'readiness_not_evaluated'] },
        },
        effectiveLandedCostSnapshotId: nullableIdentifier(),
        effectiveMarginActualizationSnapshotId: nullableIdentifier(),
        effectiveTotalLandedCost: nullableSchema(positiveMoney),
        effectiveContributionMarginAmount: nullableSchema(money),
        effectiveContributionMarginPercent: nullableSchema(metric),
        baseTotalLandedCost: nullableSchema(positiveMoney),
        baseContributionMarginAmount: nullableSchema(money),
        cumulativePostCloseCostDelta: nullableSchema(money),
        cumulativePostCloseMarginDelta: nullableSchema(money),
      },
    },
  };
}

function readinessPaths() {
  return {
    '/orders/{orderId}/cost-close/readiness': {
      post: {
        operationId: 'evaluateCostCloseReadiness', security: [{ bearerAuth: [] }], parameters: [orderId, idempotency],
        requestBody: body('#/components/schemas/CostCloseReadinessInput'),
        responses: mutationResponses('Evaluated immutable cost-close readiness', '#/components/schemas/CostCloseReadinessSnapshot'),
      },
    },
    '/orders/{orderId}/economics-position': {
      get: {
        operationId: 'getOrderEconomicsPosition', security: [{ bearerAuth: [] }], parameters: [orderId],
        responses: readResponses('Canonical effective order economics position', '#/components/schemas/OrderEconomicsPosition'),
      },
    },
    '/cost-close-readiness/{costCloseReadinessSnapshotId}': {
      get: {
        operationId: 'getCostCloseReadiness', security: [{ bearerAuth: [] }], parameters: [readinessId],
        responses: readResponses('Cost-close readiness', '#/components/schemas/CostCloseReadinessReadResult'),
      },
    },
  };
}

function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function requirementType() { return { type: 'string', enum: ['factory', 'freight', 'duty', 'credits'] }; }
function requirementStatus() { return { type: 'string', enum: ['pending', 'complete', 'waived'] }; }
function readinessStatus() { return { type: 'string', enum: ['OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE'] }; }
function economicsPositionStatus() { return { type: 'string', enum: ['OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE', 'STALE', 'CLOSED', 'ADJUSTED'] }; }
function nullableIdentifier() { return nullableSchema(identifier); }
function nullableString(maxLength) { return nullableSchema({ type: 'string', minLength: 1, maxLength }); }
function nullableSchema(schema) { return { oneOf: [schema, { type: 'null' }] }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
