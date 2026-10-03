const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$';
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, description: 'Globally unique command key. Reuse with another payload returns HTTP 409.', schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } };
const rfqCodeParameter = { name: 'rfqCode', in: 'path', required: true, schema: { type: 'string', pattern: '^[A-Z0-9][A-Z0-9._/-]{1,63}$' } };
const orderParameter = { name: 'productionOrderNumber', in: 'path', required: true, schema: { type: 'string', minLength: 1, maxLength: 80 } };

// S-01. The supplier's own commands. The grant is the whole of the caller's standing: every command
// names the supplier it answers for, which must be one the caller holds an active grant for, and the
// answer is the supplier's own receipt, never the brand's aggregate.
export function withSupplierPortalOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const version = { type: 'integer', minimum: 1, maximum: 2147483647 };
  const supplierCode = { type: 'string', pattern: CODE_PATTERN, description: 'A supplier the caller holds an active portal grant for.' };
  const nullableText = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
  return {
    SupplierPortalQuoteInput: {
      type: 'object', additionalProperties: false,
      required: ['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes', 'tiers'],
      properties: {
        expectedVersion: version,
        supplierCode,
        unitPriceMinor: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        fixedCostMinor: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 },
        minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2147483647 },
        validUntil: { type: 'string', format: 'date-time' },
        notes: nullableText(1000),
        tiers: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['quantity', 'unitPriceMinor'], properties: { quantity: { type: 'integer', minimum: 1 }, unitPriceMinor: { type: 'integer', minimum: 1 } } } },
      },
    },
    SupplierPortalCounterAcceptInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'supplierCode'],
      properties: { expectedVersion: version, supplierCode },
    },
    SupplierPortalOrderConfirmInput: {
      type: 'object', additionalProperties: false, required: ['expectedVersion', 'supplierCode', 'confirmationReference', 'notes'],
      description: 'The confirming person is the grant contact; it cannot be supplied.',
      properties: {
        expectedVersion: version,
        supplierCode,
        confirmationReference: { type: 'string', minLength: 2, maxLength: 120 },
        notes: nullableText(2000),
      },
    },
    SupplierPortalRfqReceipt: {
      type: 'object', additionalProperties: false, required: ['rfqCode', 'supplierCode', 'supplierStatus', 'version', 'ownQuote'],
      description: 'The supplier\'s own part of the request. Other suppliers\' quotations, the invited list and the award are never returned.',
      properties: {
        rfqCode: { type: 'string' },
        supplierCode,
        supplierStatus: { type: 'string', enum: ['awaiting_quote', 'quote_submitted', 'won', 'lost', 'cancelled'] },
        version,
        ownQuote: { oneOf: [{ type: 'object' }, { type: 'null' }] },
      },
    },
    SupplierPortalOrderReceipt: {
      type: 'object', additionalProperties: false, required: ['productionOrderNumber', 'supplierCode', 'status', 'version', 'confirmedAt', 'confirmation'],
      properties: {
        productionOrderNumber: { type: 'string' },
        supplierCode,
        status: { type: 'string', enum: ['issued', 'confirmed', 'cancelled'] },
        version,
        confirmedAt: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        confirmation: { oneOf: [{ type: 'object' }, { type: 'null' }] },
      },
    },
  };
}

function paths() {
  const command = (operationId, summary, parameter, requestSchema, receiptSchema) => ({
    post: {
      operationId, summary, security: [{ bearerAuth: [] }], parameters: [parameter, idempotencyHeader],
      description: 'Gated on an active supplier portal grant for the supplier named in the body, not on a brand membership. The supplier must be qualified. Idempotent on the Idempotency-Key; optimistic on expectedVersion.',
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${requestSchema}` } } } },
      responses: { 200: dataResponse(summary, `#/components/schemas/${receiptSchema}`), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse },
    },
  });
  return {
    '/supplier-portal/rfqs/{rfqCode}/quote': command('submitSupplierPortalQuote', 'Submit or revise this supplier\'s quotation', rfqCodeParameter, 'SupplierPortalQuoteInput', 'SupplierPortalRfqReceipt'),
    '/supplier-portal/rfqs/{rfqCode}/counter-offer/accept': command('acceptSupplierPortalCounterOffer', 'Accept the brand\'s counter-offer', rfqCodeParameter, 'SupplierPortalCounterAcceptInput', 'SupplierPortalRfqReceipt'),
    '/supplier-portal/orders/{productionOrderNumber}/confirm': command('confirmSupplierPortalOrder', 'Confirm an order placed with this supplier', orderParameter, 'SupplierPortalOrderConfirmInput', 'SupplierPortalOrderReceipt'),
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } } } } } };
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
