const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const percent = { type: 'number', minimum: -1_000_000, maximum: 100, multipleOf: 0.0001 };
const orderId = { name: 'orderId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withOrderMarginBridgeOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  specification.paths['/orders/{orderId}/margin-bridge'] = {
    get: {
      operationId: 'getOrderMarginBridge',
      security: [{ bearerAuth: [] }],
      parameters: [orderId],
      responses: readResponses('Explainable order margin bridge', '#/components/schemas/OrderMarginBridge'),
    },
  };
  return deepFreeze(specification);
}

function schemas() {
  return {
    MarginBridgeEconomicsPoint: {
      type: 'object', additionalProperties: false,
      required: ['landedCostSnapshotId', 'marginActualizationSnapshotId', 'totalLandedCost', 'contributionMarginAmount', 'contributionMarginPercent'],
      properties: {
        landedCostSnapshotId: identifier,
        marginActualizationSnapshotId: identifier,
        totalLandedCost: money,
        contributionMarginAmount: money,
        contributionMarginPercent: percent,
      },
    },
    OrderMarginBridgeStep: {
      type: 'object', additionalProperties: false,
      required: [
        'adjustmentId', 'costCloseSnapshotId', 'previousAdjustmentId', 'orderId', 'orderCommitSnapshotId', 'stepNumber',
        'actualCostEntryId', 'costType', 'sku', 'sourceRef', 'sourceAmount', 'sourceCurrency', 'fxRateSnapshotId', 'fxRate', 'fxRateType', 'fxSourceRef',
        'convertedAmount', 'currency', 'costDeltaAmount', 'marginDeltaAmount', 'reason',
        'priorLandedCostSnapshotId', 'priorLandedCost', 'landedCostSnapshotId', 'landedCost',
        'priorMarginActualizationSnapshotId', 'priorContributionMarginAmount', 'priorContributionMarginPercent',
        'marginActualizationSnapshotId', 'contributionMarginAmount', 'contributionMarginPercent',
        'baseLandedCost', 'baseContributionMarginAmount', 'baseContributionMarginPercent',
        'cumulativeCostDeltaAmount', 'cumulativeMarginDeltaAmount', 'recordedAt',
      ],
      properties: {
        adjustmentId: identifier, costCloseSnapshotId: identifier, previousAdjustmentId: nullableIdentifier(),
        orderId: identifier, orderCommitSnapshotId: identifier, stepNumber: { type: 'integer', minimum: 1 },
        actualCostEntryId: identifier,
        costType: { type: 'string', minLength: 1, maxLength: 80 },
        sku: nullableString(160), sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
        sourceAmount: money, sourceCurrency: currency,
        fxRateSnapshotId: nullableIdentifier(), fxRate: nullableNumber(), fxRateType: nullableString(80), fxSourceRef: nullableString(240),
        convertedAmount: money, currency,
        costDeltaAmount: money, marginDeltaAmount: money,
        reason: { type: 'string', minLength: 1, maxLength: 1000 },
        priorLandedCostSnapshotId: identifier, priorLandedCost: money,
        landedCostSnapshotId: identifier, landedCost: money,
        priorMarginActualizationSnapshotId: identifier,
        priorContributionMarginAmount: money, priorContributionMarginPercent: percent,
        marginActualizationSnapshotId: identifier,
        contributionMarginAmount: money, contributionMarginPercent: percent,
        baseLandedCost: money, baseContributionMarginAmount: money, baseContributionMarginPercent: percent,
        cumulativeCostDeltaAmount: money, cumulativeMarginDeltaAmount: money,
        recordedAt: { type: 'string', format: 'date-time' },
      },
    },
    OrderMarginBridge: {
      type: 'object', additionalProperties: false,
      required: [
        'orderId', 'orderCommitSnapshotId', 'costCloseReadinessSnapshotId', 'costCloseSnapshotId', 'currency', 'status',
        'base', 'steps', 'effective', 'cumulativePostCloseCostDelta', 'cumulativePostCloseMarginDelta',
      ],
      properties: {
        orderId: identifier,
        orderCommitSnapshotId: identifier,
        costCloseReadinessSnapshotId: nullableIdentifier(),
        costCloseSnapshotId: identifier,
        currency,
        status: { type: 'string', enum: ['CLOSED', 'ADJUSTED'] },
        base: { $ref: '#/components/schemas/MarginBridgeEconomicsPoint' },
        steps: { type: 'array', maxItems: 100_000, items: { $ref: '#/components/schemas/OrderMarginBridgeStep' } },
        effective: { $ref: '#/components/schemas/MarginBridgeEconomicsPoint' },
        cumulativePostCloseCostDelta: money,
        cumulativePostCloseMarginDelta: money,
      },
    },
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse }; }
function nullableIdentifier() { return { oneOf: [identifier, { type: 'null' }] }; }
function nullableString(maxLength) { return { oneOf: [{ type: 'string', minLength: 1, maxLength }, { type: 'null' }] }; }
function nullableNumber() { return { oneOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'null' }] }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
