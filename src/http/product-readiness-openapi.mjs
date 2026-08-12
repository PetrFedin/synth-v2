const SAFE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$';
const SHA256_PATTERN = '^[0-9a-f]{64}$';
const DEVELOPMENT_ROUTES = ['OWN_DEVELOPMENT', 'MATERIALS_SEPARATE', 'READY_GOODS'];
const READINESS_CODES = [
  'product_identity','category','colorways','size_scale','sku_matrix','product_attributes','bom','measurements','samples','tech_pack','sourcing','purchase_or_production_commitment','quality','compliance','commercial_media','commercial_content','commercial_terms','availability_delivery',
];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } };
const idParameter = (name) => ({ name, in: 'path', required: true, schema: id() });
const limitParameter = { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } };

export function withProductReadinessOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.21.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const externalEvidence = {
    type: 'object', additionalProperties: false,
    required: ['status', 'evidenceId', 'sourceSystem', 'version', 'contentHash', 'approvedAt', 'approvedBy'],
    properties: {
      status: { type: 'string', enum: ['ready'] }, evidenceId: id(), sourceSystem: id(), version: { type: 'string', minLength: 1, maxLength: 128 },
      contentHash: hash(), approvedAt: dateTime(), approvedBy: id(),
    },
  };
  return {
    ProductReadinessDimension: {
      type: 'object', additionalProperties: false, required: ['code', 'status', 'required', 'evidence'],
      properties: { code: { type: 'string', enum: READINESS_CODES }, status: { type: 'string', enum: ['ready', 'blocked', 'not_applicable'] }, required: { type: 'boolean' }, evidence: { type: 'object', additionalProperties: true } },
    },
    ProductReadinessExternalEvidence: externalEvidence,
    ProductReadinessCommercialPreparation: {
      type: 'object', additionalProperties: false,
      required: ['titleRu','titleEn','descriptionRu','descriptionEn','compositionRu','compositionEn','countryOfOrigin','currency','wholesalePriceMinor','rrpMinor','minimumOrderQuantity','deliveryStart','deliveryEnd','availability','mediaIds','attributeCoverageConfirmed'],
      properties: {
        titleRu: text(2, 200), titleEn: text(2, 200), descriptionRu: text(2, 4000), descriptionEn: text(2, 4000), compositionRu: text(2, 1000), compositionEn: text(2, 1000),
        countryOfOrigin: { type: 'string', pattern: '^[A-Z]{2}$' }, currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        wholesalePriceMinor: { type: 'integer', minimum: 1 }, rrpMinor: { type: 'integer', minimum: 1 }, minimumOrderQuantity: { type: 'integer', minimum: 1 },
        minimumOrderValueMinor: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
        packRatio: { oneOf: [{ type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } }, { type: 'null' }] },
        deliveryStart: dateTime(), deliveryEnd: dateTime(),
        availability: { type: 'object', additionalProperties: false, required: ['mode', 'quantity'], properties: { mode: { type: 'string', enum: ['available_to_sell', 'made_to_order', 'preorder'] }, quantity: { oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] } } },
        mediaIds: { type: 'array', minItems: 1, uniqueItems: true, items: id() }, documentRefs: { type: 'array', uniqueItems: true, items: id() }, attributeCoverageConfirmed: { type: 'boolean' },
      },
    },
    ProductReadinessAssessmentInput: {
      type: 'object', additionalProperties: false, required: ['developmentRoute', 'commercialPreparation'],
      properties: {
        developmentRoute: { type: 'string', enum: DEVELOPMENT_ROUTES },
        commercialPreparation: { $ref: '#/components/schemas/ProductReadinessCommercialPreparation' },
        externalEvidence: {
          type: 'object', additionalProperties: false,
          properties: {
            sourcing: { $ref: '#/components/schemas/ProductReadinessExternalEvidence' },
            purchase_or_production_commitment: { $ref: '#/components/schemas/ProductReadinessExternalEvidence' },
            quality: { $ref: '#/components/schemas/ProductReadinessExternalEvidence' },
            compliance: { $ref: '#/components/schemas/ProductReadinessExternalEvidence' },
          },
        },
      },
    },
    ProductReadinessSnapshot: {
      type: 'object', additionalProperties: false,
      required: ['id','styleVersionId','brandId','developmentRoute','readinessStatus','requiredDimensionCount','readyDimensionCount','notApplicableDimensionCount','blockedDimensionCount','dimensions','technicalSnapshot','commercialPreparationSnapshot','contentHash','assessedAt','assessedBy'],
      properties: {
        id: id(), styleVersionId: id(), brandId: id(), developmentRoute: { type: 'string', enum: DEVELOPMENT_ROUTES }, readinessStatus: { type: 'string', enum: ['blocked','ready'] },
        requiredDimensionCount: count(), readyDimensionCount: count(), notApplicableDimensionCount: count(), blockedDimensionCount: count(),
        dimensions: { type: 'array', minItems: 18, maxItems: 18, items: { $ref: '#/components/schemas/ProductReadinessDimension' } },
        technicalSnapshot: { type: 'object', additionalProperties: true }, commercialPreparationSnapshot: { type: 'object', additionalProperties: true }, contentHash: hash(), assessedAt: dateTime(), assessedBy: id(),
      },
    },
    CommercialProductProjectionPublishInput: { type: 'object', additionalProperties: false, required: ['expectedLatestVersionNo'], properties: { expectedLatestVersionNo: { type: 'integer', minimum: 0, maximum: 2147483647 } } },
    CommercialProductProjectionVersion: {
      type: 'object', additionalProperties: false,
      required: ['id','styleVersionId','brandId','readinessSnapshotId','versionNo','sourceProjectionId','status','payload','contentHash','publishedAt','publishedBy'],
      properties: {
        id: id(), styleVersionId: id(), brandId: id(), readinessSnapshotId: id(), versionNo: { type: 'integer', minimum: 1 }, sourceProjectionId: nullableId(), status: { type: 'string', enum: ['published'] }, payload: { type: 'object', additionalProperties: true }, contentHash: hash(), publishedAt: dateTime(), publishedBy: id(),
      },
    },
    ProductReadinessSnapshotList: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/ProductReadinessSnapshot' } },
    CommercialProductProjectionList: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/CommercialProductProjectionVersion' } },
  };
}

function paths() {
  return {
    '/product/style-versions/{styleVersionId}/readiness': {
      post: mutation('assessProductReadiness', [idParameter('styleVersionId')], '#/components/schemas/ProductReadinessAssessmentInput', '#/components/schemas/ProductReadinessSnapshot', 'Created immutable ProductReadinessSnapshot'),
      get: read('listProductReadinessSnapshots', [idParameter('styleVersionId'), limitParameter], '#/components/schemas/ProductReadinessSnapshotList', 'Readiness snapshots for exact StyleVersion'),
    },
    '/product/readiness/{readinessSnapshotId}': { get: read('getProductReadinessSnapshot', [idParameter('readinessSnapshotId')], '#/components/schemas/ProductReadinessSnapshot', 'ProductReadinessSnapshot') },
    '/product/readiness/{readinessSnapshotId}/commercial-projection': { post: mutation('publishCommercialProductProjection', [idParameter('readinessSnapshotId')], '#/components/schemas/CommercialProductProjectionPublishInput', '#/components/schemas/CommercialProductProjectionVersion', 'Published immutable CommercialProductProjectionVersion') },
    '/product/commercial-projections/{projectionId}': { get: read('getCommercialProductProjection', [idParameter('projectionId')], '#/components/schemas/CommercialProductProjectionVersion', 'CommercialProductProjectionVersion') },
    '/product/style-versions/{styleVersionId}/commercial-projections': { get: read('listCommercialProductProjections', [idParameter('styleVersionId'), limitParameter], '#/components/schemas/CommercialProductProjectionList', 'Commercial Product Projection versions') },
  };
}

function mutation(operationId, pathParameters, requestSchema, responseSchema, description) { return { operationId, security: [{ bearerAuth: [] }], parameters: [...pathParameters, idempotencyHeader], requestBody: body(requestSchema), responses: responses(description, responseSchema, true) }; }
function read(operationId, parameters, responseSchema, description) { return { operationId, security: [{ bearerAuth: [] }], parameters, responses: responses(description, responseSchema, false) }; }
function responses(description, reference, mutationMode) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, ...(mutationMode ? { 409: errorResponse, 422: errorResponse } : {}) }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID_PATTERN } } } } } }; }
function id() { return { type: 'string', minLength: 1, maxLength: 160, pattern: SAFE_ID_PATTERN }; }
function nullableId() { return { oneOf: [id(), { type: 'null' }] }; }
function dateTime() { return { type: 'string', format: 'date-time' }; }
function hash() { return { type: 'string', pattern: SHA256_PATTERN }; }
function count() { return { type: 'integer', minimum: 0, maximum: 18 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
