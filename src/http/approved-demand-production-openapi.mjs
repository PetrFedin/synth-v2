const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{1,79}$';
const HASH = '^[0-9a-f]{64}$';
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } };

export function withApprovedDemandProductionOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  extendRfqSchema(specification.components.schemas.Rfq);
  extendProductionOrderSchema(specification.components.schemas.ProductionOrder);
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    ProductionRequirementEmptyInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    ApprovedProductionRfqCreate: {
      type: 'object',
      additionalProperties: false,
      required: ['rfqCode', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes'],
      properties: {
        rfqCode: { type: 'string', pattern: CODE },
        responseDueAt: { type: 'string', format: 'date-time' },
        deliveryDueAt: { type: 'string', format: 'date-time' },
        incoterm: { type: 'string', enum: INCOTERMS },
        supplierCodes: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true, items: { type: 'string', pattern: CODE } },
        notes: nullableText(2000),
      },
    },
    ProductionRequirementAllocation: {
      type: 'object', additionalProperties: false,
      required: ['quantity', 'sourceRef', 'expectedAvailabilityAt'],
      properties: {
        quantity: positiveInteger(),
        sourceRef: text(1, 200),
        expectedAvailabilityAt: dateOrNull(),
      },
    },
    ProductionRequirementLine: {
      type: 'object', additionalProperties: false,
      required: [
        'orderLineNo', 'productSkuId', 'sku', 'gtin', 'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId',
        'sizeCode', 'sizeLabelRu', 'sizeLabelEn', 'sizeSortOrder', 'orderedQuantity', 'productionQuantity', 'allocations',
      ],
      properties: {
        orderLineNo: positiveInteger(),
        productSkuId: identifier(),
        sku: text(1, 160),
        gtin: nullableText(64),
        styleId: identifier(),
        styleVersionId: identifier(),
        colorwayId: identifier(),
        sizeValueId: identifier(),
        sizeCode: text(1, 64),
        sizeLabelRu: text(1, 120),
        sizeLabelEn: text(1, 120),
        sizeSortOrder: { type: 'integer', minimum: 0, maximum: 2147483647 },
        orderedQuantity: positiveInteger(),
        productionQuantity: positiveInteger(),
        allocations: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/ProductionRequirementAllocation' } },
      },
    },
    ProductionRequirement: {
      type: 'object', additionalProperties: false,
      required: [
        'id', 'orderId', 'orderVersion', 'orderCommitSnapshotId', 'orderCommitContentHash',
        'supplyCommitmentSnapshotId', 'supplyCommitmentContentHash', 'brandId', 'shopId',
        'collectionId', 'showroomId', 'commercialPublicationId', 'buyerCatalogVersionId',
        'commercialProjectionId', 'commercialProjectionVersionNo', 'readinessSnapshotId',
        'totalProductionQuantity', 'lines', 'status', 'contentHash', 'createdAt',
      ],
      properties: {
        id: identifier(), orderId: identifier(), orderVersion: positiveInteger(),
        orderCommitSnapshotId: identifier(), orderCommitContentHash: hash(),
        supplyCommitmentSnapshotId: identifier(), supplyCommitmentContentHash: hash(),
        brandId: identifier(), shopId: identifier(),
        collectionId: nullableIdentifier(), showroomId: nullableIdentifier(),
        commercialPublicationId: nullableIdentifier(), buyerCatalogVersionId: nullableIdentifier(),
        commercialProjectionId: nullableIdentifier(), commercialProjectionVersionNo: nullablePositiveInteger(),
        readinessSnapshotId: nullableIdentifier(), totalProductionQuantity: positiveInteger(),
        lines: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/ProductionRequirementLine' } },
        status: { type: 'string', enum: ['required'] }, contentHash: hash(), createdAt: { type: 'string', format: 'date-time' },
      },
    },
  };
}

function extendRfqSchema(schema) {
  if (!schema?.properties) return;
  Object.assign(schema.properties, approvedDemandProperties());
}

function extendProductionOrderSchema(schema) {
  if (!schema?.properties) return;
  Object.assign(schema.properties, approvedDemandProperties());
}

function approvedDemandProperties() {
  return {
    lineageVersion: { type: 'integer', enum: [2] },
    productionRequirementSnapshotId: identifier(),
    productionRequirementContentHash: hash(),
    productionRequirementOrderLineNo: positiveInteger(),
    orderId: identifier(),
    orderCommitSnapshotId: identifier(),
    supplyCommitmentSnapshotId: identifier(),
    productSkuId: identifier(),
    styleId: identifier(),
    styleVersionId: identifier(),
    colorwayId: identifier(),
    sizeValueId: identifier(),
    sizeCode: text(1, 64),
    collectionId: nullableIdentifier(),
    showroomId: nullableIdentifier(),
    commercialPublicationId: nullableIdentifier(),
    buyerCatalogVersionId: nullableIdentifier(),
  };
}

function paths() {
  const orderId = pathParameter('orderId');
  const supplyId = pathParameter('supplyCommitmentSnapshotId');
  const requirementId = pathParameter('productionRequirementSnapshotId');
  const orderLineNo = { name: 'orderLineNo', in: 'path', required: true, schema: positiveInteger() };
  return {
    '/orders/{orderId}/supply-commitments/{supplyCommitmentSnapshotId}/production-requirement': {
      post: {
        operationId: 'createProductionRequirementFromSupplyCommitment', security: [{ bearerAuth: [] }],
        parameters: [orderId, supplyId, idempotencyHeader], requestBody: body('#/components/schemas/ProductionRequirementEmptyInput'),
        responses: mutationResponses('Created immutable approved production requirement', '#/components/schemas/ProductionRequirement'),
      },
    },
    '/production-requirements/{productionRequirementSnapshotId}': {
      get: {
        operationId: 'getProductionRequirement', security: [{ bearerAuth: [] }], parameters: [requirementId],
        responses: readResponses('Production requirement', '#/components/schemas/ProductionRequirement'),
      },
    },
    '/supply-commitments/{supplyCommitmentSnapshotId}/production-requirement': {
      get: {
        operationId: 'getProductionRequirementBySupplyCommitment', security: [{ bearerAuth: [] }], parameters: [supplyId],
        responses: readResponses('Production requirement', '#/components/schemas/ProductionRequirement'),
      },
    },
    '/production-requirements/{productionRequirementSnapshotId}/lines/{orderLineNo}/rfq': {
      post: {
        operationId: 'createRfqFromProductionRequirementLine', security: [{ bearerAuth: [] }],
        parameters: [requirementId, orderLineNo, idempotencyHeader], requestBody: body('#/components/schemas/ApprovedProductionRfqCreate'),
        responses: mutationResponses('Created RFQ from approved ProductSku demand', '#/components/schemas/Rfq'),
      },
    },
  };
}

function pathParameter(name) { return { name, in: 'path', required: true, schema: identifier() }; }
function identifier() { return { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID }; }
function nullableIdentifier() { return { oneOf: [identifier(), { type: 'null' }] }; }
function positiveInteger() { return { type: 'integer', minimum: 1, maximum: 2147483647 }; }
function nullablePositiveInteger() { return { oneOf: [positiveInteger(), { type: 'null' }] }; }
function hash() { return { type: 'string', pattern: HASH }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function dateOrNull() { return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128 } } } } } }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
