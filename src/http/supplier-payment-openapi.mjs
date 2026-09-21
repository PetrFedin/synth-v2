const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const TRIGGERS = ['order-confirmed', 'shipment-released'];
const STATUSES = ['planned', 'due', 'overdue', 'paid'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const orderParameter = { name: 'productionOrderNumber', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withSupplierPaymentOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    // Веха платежа. `status` и `dueAt` вычисляются при чтении и нигде не хранятся: наступление
    // следует из события, и хранимая копия вывода разошлась бы с ним — отклонённая партия оставила
    // бы долг за неотгруженный товар.
    SupplierPaymentMilestone: {
      type: 'object', additionalProperties: false,
      required: ['sequence', 'triggerEvent', 'shareBasisPoints', 'amountMinor', 'labelRu', 'labelEn', 'paidAt', 'paidBy', 'paymentReference', 'triggerOccurredAt', 'dueAt', 'status'],
      properties: {
        sequence: { type: 'integer', minimum: 1, maximum: 12 },
        triggerEvent: { type: 'string', enum: TRIGGERS },
        shareBasisPoints: { type: 'integer', minimum: 1, maximum: 10000 },
        amountMinor: minorAmount(), labelRu: text(2, 160), labelEn: text(2, 160),
        paidAt: nullableDate(), paidBy: nullableText(200), paymentReference: nullableText(200),
        triggerOccurredAt: nullableDate(), dueAt: nullableDate(),
        status: { type: 'string', enum: STATUSES },
      },
    },
    SupplierPaymentSchedule: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'productionOrderNumber', 'supplierCode', 'sku', 'quantity', 'currency', 'totalAmountMinor', 'paymentTermsDays', 'milestones', 'version', 'createdAt', 'createdBy', 'updatedAt'],
      properties: {
        id: text(1, 200), brandId: text(1, 200), productionOrderNumber: { type: 'string', pattern: CODE },
        supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE },
        quantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' }, totalAmountMinor: minorAmount(),
        paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 },
        milestones: { type: 'array', minItems: 1, maxItems: 12, items: { $ref: '#/components/schemas/SupplierPaymentMilestone' } },
        version: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        createdAt: date(), createdBy: text(1, 200), updatedAt: date(),
        // Итоги по состояниям: «причитается» — только наступившее, потому что деньги, событие для
        // которых не произошло, ещё не долг, а прогноз.
        paidAmountMinor: nonNegativeMinor(), dueAmountMinor: nonNegativeMinor(), overdueAmountMinor: nonNegativeMinor(),
        plannedAmountMinor: nonNegativeMinor(), outstandingAmountMinor: nonNegativeMinor(),
      },
    },
    SupplierPaymentSchedules: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/SupplierPaymentSchedule' } },
    SupplierPaymentScheduleInput: {
      type: 'object', additionalProperties: false, required: ['split'],
      properties: {
        split: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object', additionalProperties: false, required: ['triggerEvent', 'shareBasisPoints', 'labelRu', 'labelEn'],
            properties: { triggerEvent: { type: 'string', enum: TRIGGERS }, shareBasisPoints: { type: 'integer', minimum: 1, maximum: 10000 }, labelRu: text(2, 160), labelEn: text(2, 160) },
          },
        },
      },
    },
    SupplierPaymentInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'sequence', 'reference'],
      properties: {
        expectedVersion: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        sequence: { type: 'integer', minimum: 1, maximum: 12 },
        paidAt: date(), reference: text(2, 200),
      },
    },
  };
}

function paths() {
  return {
    '/payment-schedules': { get: { operationId: 'listSupplierPaymentSchedules', security: [{ bearerAuth: [] }], responses: { 200: dataResponse('Supplier payment schedules', '#/components/schemas/SupplierPaymentSchedules'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/production-orders/{productionOrderNumber}/payment-schedule': {
      get: { operationId: 'getSupplierPaymentSchedule', security: [{ bearerAuth: [] }], parameters: [orderParameter], responses: { 200: dataResponse('Supplier payment schedule', '#/components/schemas/SupplierPaymentSchedule'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
      post: { operationId: 'createSupplierPaymentSchedule', security: [{ bearerAuth: [] }], parameters: [orderParameter, idempotency], requestBody: body('#/components/schemas/SupplierPaymentScheduleInput'), responses: mutationResponses('Created payment schedule') },
    },
    '/production-orders/{productionOrderNumber}/payment-schedule/payments': {
      post: { operationId: 'recordSupplierPayment', security: [{ bearerAuth: [] }], parameters: [orderParameter, idempotency], requestBody: body('#/components/schemas/SupplierPaymentInput'), responses: mutationResponses('Recorded supplier payment') },
    },
  };
}

function minorAmount() { return { type: 'integer', minimum: 1, maximum: 9_007_199_254_740_991 }; }
function nonNegativeMinor() { return { type: 'integer', minimum: 0, maximum: 9_007_199_254_740_991 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/SupplierPaymentSchedule'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
