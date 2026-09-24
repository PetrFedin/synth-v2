const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const LOT_REFERENCE = '^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$';
const STATUSES = ['quarantine', 'released', 'rejected'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const lotParameter = { name: 'lotId', in: 'path', required: true, schema: { type: 'string', pattern: SAFE_ID } };

export function withMaterialLotOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    MaterialLotIssue: {
      type: 'object', additionalProperties: false,
      required: ['lotId', 'lotReference', 'dyeLot', 'materialCode', 'unit', 'executionId', 'executionCode', 'quantity', 'issuedAt', 'issuedBy', 'notes'],
      properties: {
        lotId: text(1, 200), lotReference: { type: 'string', pattern: LOT_REFERENCE }, dyeLot: nullableText(64),
        materialCode: text(1, 200), unit: text(1, 32), executionId: text(1, 200), executionCode: { type: 'string', pattern: CODE },
        quantity: quantity(), issuedAt: date(), issuedBy: text(1, 200), notes: nullableText(1000),
      },
    },
    // «Израсходован» статусом не является: `remainingQuantity` — это полученное минус выданное, и
    // третьего числа здесь нет намеренно.
    MaterialLot: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'materialCode', 'materialName', 'materialVersion', 'unit', 'lotReference', 'dyeLot', 'supplierCode', 'receivedQuantity', 'issuedQuantity', 'status', 'receivedAt', 'certificateReference', 'notes', 'version', 'createdAt', 'createdBy', 'updatedAt'],
      properties: {
        id: text(1, 200), brandId: text(1, 200), materialCode: text(1, 200), materialName: text(1, 300),
        materialVersion: version(), unit: text(1, 32), lotReference: { type: 'string', pattern: LOT_REFERENCE },
        dyeLot: nullableText(64), supplierCode: nullableText(64),
        receivedQuantity: quantity(), issuedQuantity: nonNegativeQuantity(), remainingQuantity: nonNegativeQuantity(),
        status: { type: 'string', enum: STATUSES }, receivedAt: date(),
        certificateReference: nullableText(200), notes: nullableText(1000),
        releaseNotes: nullableText(1000), quarantineReason: nullableText(1000), rejectionReason: nullableText(1000),
        version: version(), createdAt: date(), createdBy: text(1, 200), updatedAt: date(), updatedBy: nullableText(200),
        issues: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/MaterialLotIssue' } },
      },
    },
    MaterialLots: { type: 'array', maxItems: 2000, items: { $ref: '#/components/schemas/MaterialLot' } },
    MaterialLotReceiveInput: {
      type: 'object', additionalProperties: false, required: ['materialCode', 'lotReference', 'receivedQuantity'],
      properties: {
        materialCode: text(1, 200), lotReference: { type: 'string', pattern: LOT_REFERENCE }, dyeLot: text(2, 64),
        supplierCode: text(2, 64), receivedQuantity: quantity(), certificateReference: text(2, 200), notes: text(2, 1000),
      },
    },
    MaterialLotVerdictInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion'],
      properties: { expectedVersion: version(), reason: text(5, 1000), certificateReference: text(2, 200), notes: text(2, 1000) },
    },
    MaterialLotIssueInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'executionCode', 'quantity'],
      properties: { expectedVersion: version(), executionCode: { type: 'string', pattern: CODE }, quantity: quantity(), notes: text(2, 1000) },
    },
    // Недостача и разнооттеночность — сравнения, посчитанные при чтении: хранимое сравнение
    // устаревает при первой же правке выдачи.
    MaterialTraceability: {
      type: 'object', additionalProperties: false, required: ['executionCode', 'quantity', 'materials', 'shortfalls', 'mixedDyeLots'],
      properties: {
        executionCode: { type: 'string', pattern: CODE }, quantity: version(),
        materials: { type: 'array', maxItems: 500, items: {
          type: 'object', additionalProperties: false,
          required: ['materialCode', 'unit', 'requiredQuantity', 'issuedQuantity', 'lots', 'dyeLots', 'shortfallQuantity', 'multipleDyeLots'],
          properties: {
            materialCode: text(1, 200), unit: text(1, 32),
            requiredQuantity: { oneOf: [nonNegativeQuantity(), { type: 'null' }] },
            issuedQuantity: nonNegativeQuantity(),
            shortfallQuantity: { oneOf: [nonNegativeQuantity(), { type: 'null' }] },
            multipleDyeLots: { type: 'boolean' },
            dyeLots: { type: 'array', maxItems: 100, items: text(1, 64) },
            lots: { type: 'array', maxItems: 500, items: {
              type: 'object', additionalProperties: false, required: ['lotId', 'lotReference', 'dyeLot', 'quantity', 'issuedAt'],
              properties: { lotId: text(1, 200), lotReference: { type: 'string', pattern: LOT_REFERENCE }, dyeLot: nullableText(64), quantity: quantity(), issuedAt: date() },
            } },
          },
        } },
        shortfalls: { type: 'array', maxItems: 500, items: text(1, 200) },
        mixedDyeLots: { type: 'array', maxItems: 500, items: text(1, 200) },
      },
    },
  };
}

function paths() {
  return {
    '/material-lots': {
      get: { operationId: 'listMaterialLots', security: [{ bearerAuth: [] }], responses: { 200: dataResponse('Material lots and where they went', '#/components/schemas/MaterialLots'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'receiveMaterialLot', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/MaterialLotReceiveInput'), responses: mutationResponses('Received material lot') },
    },
    '/material-lots/{lotId}/release': { post: { operationId: 'releaseMaterialLot', security: [{ bearerAuth: [] }], parameters: [lotParameter, idempotency], requestBody: body('#/components/schemas/MaterialLotVerdictInput'), responses: mutationResponses('Released material lot') } },
    '/material-lots/{lotId}/quarantine': { post: { operationId: 'quarantineMaterialLot', security: [{ bearerAuth: [] }], parameters: [lotParameter, idempotency], requestBody: body('#/components/schemas/MaterialLotVerdictInput'), responses: mutationResponses('Quarantined material lot') } },
    '/material-lots/{lotId}/reject': { post: { operationId: 'rejectMaterialLot', security: [{ bearerAuth: [] }], parameters: [lotParameter, idempotency], requestBody: body('#/components/schemas/MaterialLotVerdictInput'), responses: mutationResponses('Rejected material lot') } },
    '/material-lots/{lotId}/issue': { post: { operationId: 'issueMaterialLot', security: [{ bearerAuth: [] }], parameters: [lotParameter, idempotency], requestBody: body('#/components/schemas/MaterialLotIssueInput'), responses: mutationResponses('Issued material lot') } },
    '/production-executions/{executionCode}/material-traceability': { get: { operationId: 'getMaterialTraceability', security: [{ bearerAuth: [] }], parameters: [{ name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }], responses: { 200: dataResponse('What is in this lot of garments', '#/components/schemas/MaterialTraceability'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
  };
}

function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000_000 }; }
function nonNegativeQuantity() { return { type: 'number', minimum: 0, maximum: 1_000_000_000 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/MaterialLot'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
