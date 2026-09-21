const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const REFERENCE = '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$';
const STATUSES = ['laid', 'cut', 'cancelled'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const spreadParameter = { name: 'spreadId', in: 'path', required: true, schema: { type: 'string', pattern: SAFE_ID } };

export function withCuttingOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    // Карта раскроя: сколько изделий этой партии лежит в одном слое. Размер у нас — это SKU, а
    // значит исполнение, поэтому один настил обслуживает несколько партий сразу.
    CuttingMarkerEntry: {
      type: 'object', additionalProperties: false, required: ['executionId', 'executionCode', 'sku', 'garmentsPerPly'],
      properties: { executionId: text(1, 200), executionCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, garmentsPerPly: count() },
    },
    CuttingSpreadLot: {
      type: 'object', additionalProperties: false, required: ['lotId', 'lotReference', 'dyeLot', 'quantity'],
      properties: { lotId: text(1, 200), lotReference: { type: 'string', pattern: REFERENCE }, dyeLot: nullableText(64), quantity: quantity() },
    },
    // `clothLaid`, `garmentsPerPly` и `consumptionPerGarment` считаются при записи и приводятся
    // читателю, чтобы он не повторял деление, которое легко сделать иначе; в базе их нет.
    CuttingSpread: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'materialCode', 'unit', 'spreadReference', 'markerLength', 'plies', 'fabricWidth', 'marker', 'lots', 'status', 'laidAt', 'laidBy', 'notes', 'version', 'createdAt', 'updatedAt', 'garmentsPerPly', 'clothLaid', 'consumptionPerGarment'],
      properties: {
        id: text(1, 200), brandId: text(1, 200), materialCode: text(1, 200), unit: text(1, 32),
        spreadReference: { type: 'string', pattern: REFERENCE }, markerLength: quantity(), plies: count(),
        fabricWidth: { oneOf: [quantity(), { type: 'null' }] },
        marker: { type: 'array', minItems: 1, maxItems: 40, items: { $ref: '#/components/schemas/CuttingMarkerEntry' } },
        lots: { type: 'array', minItems: 1, maxItems: 40, items: { $ref: '#/components/schemas/CuttingSpreadLot' } },
        status: { type: 'string', enum: STATUSES }, laidAt: date(), laidBy: text(1, 200), notes: nullableText(1000),
        version: count(), createdAt: date(), updatedAt: date(),
        garmentsPerPly: count(), clothLaid: quantity(), consumptionPerGarment: quantity(),
        cutAt: nullableDate(), cutBy: nullableText(200),
        cancelledAt: nullableDate(), cancelledBy: nullableText(200), cancellationReason: nullableText(1000),
      },
    },
    CuttingSpreads: { type: 'array', maxItems: 2000, items: { $ref: '#/components/schemas/CuttingSpread' } },
    CuttingSpreadInput: {
      type: 'object', additionalProperties: false, required: ['materialCode', 'spreadReference', 'markerLength', 'plies', 'marker', 'lots'],
      properties: {
        materialCode: text(1, 200), spreadReference: { type: 'string', pattern: REFERENCE },
        markerLength: quantity(), plies: count(), fabricWidth: quantity(),
        marker: { type: 'array', minItems: 1, maxItems: 40, items: {
          type: 'object', additionalProperties: false, required: ['executionCode', 'garmentsPerPly'],
          properties: { executionCode: { type: 'string', pattern: CODE }, garmentsPerPly: count() },
        } },
        lots: { type: 'array', minItems: 1, maxItems: 40, items: {
          type: 'object', additionalProperties: false, required: ['lotReference', 'quantity'],
          properties: { lotReference: { type: 'string', pattern: REFERENCE }, quantity: quantity() },
        } },
        notes: text(2, 1000),
      },
    },
    CuttingVerdictInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: count(), reason: text(5, 1000) },
    },
    // Норма берётся из ведомости, факт — из настилов; расхождение положительно при перерасходе.
    CuttingSummary: {
      type: 'object', additionalProperties: false, required: ['executionCode', 'orderedQuantity', 'garmentsCut', 'shortfall', 'overcut', 'materials', 'overConsuming'],
      properties: {
        executionCode: { type: 'string', pattern: CODE }, orderedQuantity: count(),
        garmentsCut: nonNegative(), shortfall: nonNegative(), overcut: nonNegative(),
        materials: { type: 'array', maxItems: 500, items: {
          type: 'object', additionalProperties: false,
          required: ['materialCode', 'unit', 'clothUsed', 'garmentsCut', 'spreads', 'plannedPerGarment', 'actualPerGarment', 'variancePerGarment', 'variancePercent'],
          properties: {
            materialCode: text(1, 200), unit: text(1, 32), clothUsed: nonNegativeQuantity(), garmentsCut: nonNegative(),
            plannedPerGarment: { oneOf: [quantity(), { type: 'null' }] },
            actualPerGarment: { oneOf: [quantity(), { type: 'null' }] },
            variancePerGarment: { oneOf: [{ type: 'number', minimum: -1_000_000_000, maximum: 1_000_000_000 }, { type: 'null' }] },
            variancePercent: { oneOf: [{ type: 'number', minimum: -1_000_000, maximum: 1_000_000 }, { type: 'null' }] },
            spreads: { type: 'array', maxItems: 500, items: {
              type: 'object', additionalProperties: false, required: ['spreadReference', 'plies', 'markerLength', 'garmentsPerPly', 'garmentsCut', 'clothUsed', 'lots'],
              properties: {
                spreadReference: { type: 'string', pattern: REFERENCE }, plies: count(), markerLength: quantity(),
                garmentsPerPly: count(), garmentsCut: nonNegative(), clothUsed: nonNegativeQuantity(),
                lots: { type: 'array', maxItems: 40, items: { type: 'string', pattern: REFERENCE } },
              },
            } },
          },
        } },
        overConsuming: { type: 'array', maxItems: 500, items: text(1, 200) },
      },
    },
  };
}

function paths() {
  return {
    '/cutting-spreads': {
      get: { operationId: 'listCuttingSpreads', security: [{ bearerAuth: [] }], responses: { 200: dataResponse('Cutting spreads', '#/components/schemas/CuttingSpreads'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'layCuttingSpread', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/CuttingSpreadInput'), responses: mutationResponses('Laid spread') },
    },
    '/cutting-spreads/{spreadId}/cut': { post: { operationId: 'markCuttingSpreadCut', security: [{ bearerAuth: [] }], parameters: [spreadParameter, idempotency], requestBody: body('#/components/schemas/CuttingVerdictInput'), responses: mutationResponses('Spread marked cut') } },
    '/cutting-spreads/{spreadId}/cancel': { post: { operationId: 'cancelCuttingSpread', security: [{ bearerAuth: [] }], parameters: [spreadParameter, idempotency], requestBody: body('#/components/schemas/CuttingVerdictInput'), responses: mutationResponses('Cancelled spread') } },
    '/production-executions/{executionCode}/cutting': { get: { operationId: 'getCuttingSummary', security: [{ bearerAuth: [] }], parameters: [{ name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }], responses: { 200: dataResponse('Cutting yield against the bill', '#/components/schemas/CuttingSummary'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
  };
}

function count() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000_000 }; }
function nonNegativeQuantity() { return { type: 'number', minimum: 0, maximum: 1_000_000_000 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/CuttingSpread'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
