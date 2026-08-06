const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const STATUSES = ['planned','booked','ready-to-dispatch','dispatched','cancelled'];
const MODES = ['road','air','sea','rail','courier'];
const DOCUMENT_TYPES = ['packing-list','commercial-invoice','transport-document','customs-declaration','certificate-of-origin','other'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const shipmentParameter = { name: 'shipmentCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withOutboundShipmentOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.18.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    OutboundShipmentConsignee: { type: 'object', additionalProperties: false, required: ['organisationName','locationCode','countryCode','city','postalCode','addressLine1','addressLine2','contactName','email','phone'], properties: {
      organisationName: text(2,200), locationCode: nullableText(80), countryCode: { type: 'string', pattern: '^[A-Z]{2}$' }, city: text(2,120), postalCode: text(2,32), addressLine1: text(3,240), addressLine2: nullableText(240), contactName: text(2,160), email: nullableText(254), phone: nullableText(80),
    } },
    OutboundShipmentCreateInput: { type: 'object', additionalProperties: false, required: ['consignee'], properties: { consignee: { $ref: '#/components/schemas/OutboundShipmentConsignee' } } },
    OutboundShipmentConsigneeInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','consignee'], properties: { expectedVersion: version(), consignee: { $ref: '#/components/schemas/OutboundShipmentConsignee' } } },
    OutboundShipmentBookInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','carrierCode','carrierName','transportMode','bookingReference','serviceLevel','pickupWindowStart','pickupWindowEnd','expectedDeliveryAt','vehicleOrVoyageReference'], properties: {
      expectedVersion: version(), carrierCode: text(2,80), carrierName: text(2,160), transportMode: { type: 'string', enum: MODES }, bookingReference: text(2,120), serviceLevel: nullableText(120), pickupWindowStart: date(), pickupWindowEnd: date(), expectedDeliveryAt: date(), vehicleOrVoyageReference: nullableText(160),
    } },
    OutboundShipmentPackage: { type: 'object', additionalProperties: false, required: ['packageId','packageType','quantity','grossWeightKg','lengthCm','widthCm','heightCm','marks'], properties: {
      packageId: text(1,80), packageType: text(2,80), quantity: quantity(), grossWeightKg: positiveNumber(), lengthCm: positiveNumber(), widthCm: positiveNumber(), heightCm: positiveNumber(), marks: nullableText(240),
    } },
    OutboundShipmentPackingInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','packages'], properties: { expectedVersion: version(), packages: { type: 'array', minItems: 1, maxItems: 500, items: { $ref: '#/components/schemas/OutboundShipmentPackage' } } } },
    OutboundShipmentDocument: { type: 'object', additionalProperties: false, required: ['type','reference','issuedAt'], properties: { type: { type: 'string', enum: DOCUMENT_TYPES }, reference: text(2,500), issuedAt: nullableDate() } },
    OutboundShipmentDocumentsInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','documents'], properties: { expectedVersion: version(), documents: { type: 'array', minItems: 1, maxItems: 100, items: { $ref: '#/components/schemas/OutboundShipmentDocument' } } } },
    OutboundShipmentVersionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    OutboundShipmentDispatchInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','handoverReference','trackingNumber','sealNumbers','notes'], properties: { expectedVersion: version(), handoverReference: text(2,160), trackingNumber: text(2,160), sealNumbers: { type: 'array', maxItems: 50, uniqueItems: true, items: text(1,120) }, notes: nullableText(2000) } },
    OutboundShipmentCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','reason'], properties: { expectedVersion: version(), reason: text(5,1000) } },
    OutboundShipmentSourceSnapshot: { type: 'object', additionalProperties: false, required: ['releaseCode','inspectionCode','inspectionVersion','executionCode','productionOrderNumber','supplierCode','sku','quantity','runNumber','releasedAt','releasedBy','releaseNotes'], properties: {
      releaseCode: { type: 'string', pattern: CODE }, inspectionCode: { type: 'string', pattern: CODE }, inspectionVersion: version(), executionCode: { type: 'string', pattern: CODE }, productionOrderNumber: { type: 'string', pattern: CODE }, supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), runNumber: version(), releasedAt: date(), releasedBy: text(1,200), releaseNotes: nullableText(2000),
    } },
    OutboundShipmentBooking: { type: 'object', additionalProperties: false, required: ['carrierCode','carrierName','transportMode','bookingReference','serviceLevel','pickupWindowStart','pickupWindowEnd','expectedDeliveryAt','vehicleOrVoyageReference','bookedAt','bookedBy'], properties: {
      carrierCode: text(2,80), carrierName: text(2,160), transportMode: { type: 'string', enum: MODES }, bookingReference: text(2,120), serviceLevel: nullableText(120), pickupWindowStart: date(), pickupWindowEnd: date(), expectedDeliveryAt: date(), vehicleOrVoyageReference: nullableText(160), bookedAt: date(), bookedBy: text(1,200),
    } },
    OutboundShipmentDispatch: { type: 'object', additionalProperties: false, required: ['dispatchedAt','dispatchedBy','handoverReference','trackingNumber','sealNumbers','notes'], properties: { dispatchedAt: date(), dispatchedBy: text(1,200), handoverReference: text(2,160), trackingNumber: text(2,160), sealNumbers: { type: 'array', maxItems: 50, uniqueItems: true, items: text(1,120) }, notes: nullableText(2000) } },
    OutboundShipment: { type: 'object', additionalProperties: false, required: ['id','shipmentCode','releaseId','releaseCode','inspectionCode','inspectionVersion','executionCode','productionOrderNumber','brandId','supplierCode','sku','quantity','sourceSnapshot','consignee','status','version','booking','packages','documents','readyAt','readyBy','dispatch','cancelledAt','cancelledBy','cancellationReason','createdAt','updatedAt'], properties: {
      id: text(1,200), shipmentCode: { type: 'string', pattern: CODE }, releaseId: text(1,200), releaseCode: { type: 'string', pattern: CODE }, inspectionCode: { type: 'string', pattern: CODE }, inspectionVersion: version(), executionCode: { type: 'string', pattern: CODE }, productionOrderNumber: { type: 'string', pattern: CODE }, brandId: text(1,200), supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), sourceSnapshot: { $ref: '#/components/schemas/OutboundShipmentSourceSnapshot' }, consignee: { $ref: '#/components/schemas/OutboundShipmentConsignee' }, status: { type: 'string', enum: STATUSES }, version: version(), booking: nullableRef('#/components/schemas/OutboundShipmentBooking'), packages: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/OutboundShipmentPackage' } }, documents: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/OutboundShipmentDocument' } }, readyAt: nullableDate(), readyBy: nullableText(200), dispatch: nullableRef('#/components/schemas/OutboundShipmentDispatch'), cancelledAt: nullableDate(), cancelledBy: nullableText(200), cancellationReason: nullableText(1000), createdAt: date(), updatedAt: date(),
    } },
    OutboundShipmentPage: { type: 'object', additionalProperties: false, required: ['items','nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/OutboundShipment' } }, nextCursor: nullableText(2048) } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [shipmentParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/outbound-shipments': { get: { operationId: 'listOutboundShipments', security: [{ bearerAuth: [] }], parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 200 } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'carrierCode', in: 'query', schema: { type: 'string', pattern: CODE } },
    ], responses: { 200: dataResponse('Outbound Shipment page', '#/components/schemas/OutboundShipmentPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/outbound-shipments/{shipmentCode}': { get: { operationId: 'getOutboundShipment', security: [{ bearerAuth: [] }], parameters: [shipmentParameter], responses: { 200: dataResponse('Outbound Shipment', '#/components/schemas/OutboundShipment'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/outbound-shipments/from-release/{releaseCode}': { post: { operationId: 'createOutboundShipmentFromRelease', security: [{ bearerAuth: [] }], parameters: [{ name: 'releaseCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }, idempotency], requestBody: body('#/components/schemas/OutboundShipmentCreateInput'), responses: mutationResponses('Created Outbound Shipment') } },
    '/outbound-shipments/{shipmentCode}/consignee': { post: mutation('reviseOutboundShipmentConsignee', '#/components/schemas/OutboundShipmentConsigneeInput', 'Revised shipment consignee') },
    '/outbound-shipments/{shipmentCode}/book': { post: mutation('bookOutboundShipment', '#/components/schemas/OutboundShipmentBookInput', 'Booked Outbound Shipment') },
    '/outbound-shipments/{shipmentCode}/packing': { post: mutation('setOutboundShipmentPacking', '#/components/schemas/OutboundShipmentPackingInput', 'Set shipment packing') },
    '/outbound-shipments/{shipmentCode}/documents': { post: mutation('setOutboundShipmentDocuments', '#/components/schemas/OutboundShipmentDocumentsInput', 'Set shipment documents') },
    '/outbound-shipments/{shipmentCode}/ready': { post: mutation('markOutboundShipmentReady', '#/components/schemas/OutboundShipmentVersionInput', 'Marked shipment ready to dispatch') },
    '/outbound-shipments/{shipmentCode}/dispatch': { post: mutation('dispatchOutboundShipment', '#/components/schemas/OutboundShipmentDispatchInput', 'Dispatched shipment') },
    '/outbound-shipments/{shipmentCode}/cancel': { post: mutation('cancelOutboundShipment', '#/components/schemas/OutboundShipmentCancellationInput', 'Cancelled shipment') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function positiveNumber() { return { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000_000 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function nullableRef(reference) { return { oneOf: [{ $ref: reference }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/OutboundShipment'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
