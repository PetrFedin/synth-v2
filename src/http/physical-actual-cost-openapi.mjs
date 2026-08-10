const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const nullableIdentifier = { oneOf: [identifier, { type: 'null' }] };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001, not: { const: 0 } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const shipmentNoticeId = { name: 'shipmentNoticeId', in: 'path', required: true, schema: identifier };
const physicalCostTypes = ['freight', 'insurance', 'duty', 'brokerage', 'warehouse', 'quality', 'rework', 'packaging', 'other'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withPhysicalActualCostOpenApi(base) {
  const specification = structuredClone(base);
  const actualCost = specification.components.schemas.ActualCostLedgerEntry;
  if (!actualCost) throw new Error('ActualCostLedgerEntry schema must be composed before physical actual cost API');

  const physicalProperties = {
    physicalLineageVersion: { type: 'integer', enum: [2] },
    fulfillmentPlanSnapshotId: identifier,
    shipmentNoticeSnapshotId: identifier,
    receiptSnapshotId: nullableIdentifier,
    receiptDiscrepancySnapshotId: nullableIdentifier,
  };
  specification.components.schemas.ActualCostLedgerEntry = {
    ...actualCost,
    properties: { ...actualCost.properties, ...physicalProperties },
  };
  specification.components.schemas.PhysicalActualCostInput = {
    type: 'object',
    additionalProperties: false,
    required: ['costType', 'amount', 'currency', 'sourceRef', 'occurredAt'],
    properties: {
      costType: { type: 'string', enum: physicalCostTypes },
      amount: money,
      currency,
      fxRateSnapshotId: nullableIdentifier,
      sku: { oneOf: [{ type: 'string', pattern: SKU }, { type: 'null' }] },
      sourceRef: { type: 'string', minLength: 1, maxLength: 240 },
      occurredAt: { type: 'string', format: 'date-time' },
      receiptSnapshotId: nullableIdentifier,
      receiptDiscrepancySnapshotId: nullableIdentifier,
    },
  };
  specification.components.schemas.PhysicalActualCostLedgerEntry = {
    ...structuredClone(specification.components.schemas.ActualCostLedgerEntry),
    required: [
      ...specification.components.schemas.ActualCostLedgerEntry.required,
      'physicalLineageVersion',
      'fulfillmentPlanSnapshotId',
      'shipmentNoticeSnapshotId',
      'receiptSnapshotId',
      'receiptDiscrepancySnapshotId',
    ],
  };

  specification.paths['/shipment-notices/{shipmentNoticeId}/actual-costs'] = {
    post: {
      operationId: 'recordPhysicalActualCost',
      description: 'Append a physical execution cost to the canonical order actual-cost ledger while pinning the exact shipment/receipt execution lineage.',
      security: [{ bearerAuth: [] }],
      parameters: [shipmentNoticeId, idempotency],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PhysicalActualCostInput' } } },
      },
      responses: {
        200: dataResponse('Recorded physical actual cost', '#/components/schemas/PhysicalActualCostLedgerEntry'),
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
        409: errorResponse,
        422: errorResponse,
      },
    },
  };
  return deepFreeze(specification);
}

function dataResponse(description, reference) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'requestId'],
          properties: {
            data: { $ref: reference },
            requestId: { type: 'string', pattern: SAFE_ID },
          },
        },
      },
    },
  };
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
