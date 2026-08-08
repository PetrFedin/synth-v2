const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const publicationId = { name: 'publicationId', in: 'path', required: true, schema: identifier };
const buyerCatalogVersionId = { name: 'buyerCatalogVersionId', in: 'path', required: true, schema: identifier };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withCommercialPublicationOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    CommercialPublicationInput: {
      type: 'object', additionalProperties: false, required: ['collectionId', 'skuCodes'],
      properties: {
        collectionId: identifier,
        skuCodes: { type: 'array', minItems: 1, maxItems: 10_000, uniqueItems: true, items: { type: 'string', pattern: SKU } },
      },
    },
    CommercialPublicationLine: {
      type: 'object', additionalProperties: false,
      required: ['sku', 'name', 'catalogVersion', 'unitPrice', 'currency', 'minimumOrderQuantity'],
      properties: {
        sku: { type: 'string', pattern: SKU }, name: { type: 'string', minLength: 1, maxLength: 240 },
        catalogVersion: version(), unitPrice: money, currency,
        minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
      },
    },
    CommercialPublication: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'collectionId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: {
        id: identifier, brandId: identifier, collectionId: identifier, currency,
        lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/CommercialPublicationLine' } },
        status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date(),
      },
    },
    PriceOverride: {
      type: 'object', additionalProperties: false, required: ['sku', 'unitPrice'],
      properties: { sku: { type: 'string', pattern: SKU }, unitPrice: money },
    },
    BuyerCatalogPublicationInput: {
      type: 'object', additionalProperties: false, required: ['showroomId', 'shopId'],
      properties: {
        showroomId: identifier, shopId: identifier,
        priceOverrides: { type: 'array', maxItems: 10_000, items: { $ref: '#/components/schemas/PriceOverride' } },
      },
    },
    PriceListLine: {
      type: 'object', additionalProperties: false,
      required: ['sku', 'catalogVersion', 'unitPrice', 'currency', 'minimumOrderQuantity'],
      properties: {
        sku: { type: 'string', pattern: SKU }, catalogVersion: version(), unitPrice: money, currency,
        minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
      },
    },
    PriceListVersion: {
      type: 'object', additionalProperties: false,
      required: ['id', 'publicationId', 'brandId', 'shopId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: {
        id: identifier, publicationId: identifier, brandId: identifier, shopId: identifier, currency,
        lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/PriceListLine' } },
        status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date(),
      },
    },
    BuyerCatalogVersion: {
      type: 'object', additionalProperties: false,
      required: ['id', 'publicationId', 'priceListVersionId', 'brandId', 'shopId', 'showroomId', 'accessGrantId', 'collectionId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: {
        id: identifier, publicationId: identifier, priceListVersionId: identifier, brandId: identifier, shopId: identifier,
        showroomId: identifier, accessGrantId: identifier, collectionId: identifier, currency,
        lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/PriceListLine' } },
        status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date(),
      },
    },
    BuyerCatalogPublicationResult: {
      type: 'object', additionalProperties: false, required: ['priceListVersion', 'buyerCatalogVersion'],
      properties: {
        priceListVersion: { $ref: '#/components/schemas/PriceListVersion' },
        buyerCatalogVersion: { $ref: '#/components/schemas/BuyerCatalogVersion' },
      },
    },
  };
}

function paths() {
  return {
    '/commercial-publications': {
      post: {
        operationId: 'publishCommercialPublication', security: [{ bearerAuth: [] }], parameters: [idempotency],
        requestBody: body('#/components/schemas/CommercialPublicationInput'),
        responses: mutationResponses('Published commercial snapshot', '#/components/schemas/CommercialPublication'),
      },
    },
    '/commercial-publications/{publicationId}': {
      get: {
        operationId: 'getCommercialPublication', security: [{ bearerAuth: [] }], parameters: [publicationId],
        responses: readResponses('Commercial publication', '#/components/schemas/CommercialPublication'),
      },
    },
    '/commercial-publications/{publicationId}/buyer-catalogs': {
      post: {
        operationId: 'publishBuyerCatalogVersion', security: [{ bearerAuth: [] }], parameters: [publicationId, idempotency],
        requestBody: body('#/components/schemas/BuyerCatalogPublicationInput'),
        responses: mutationResponses('Published buyer-specific catalog and price list', '#/components/schemas/BuyerCatalogPublicationResult'),
      },
    },
    '/buyer-catalog-versions/{buyerCatalogVersionId}': {
      get: {
        operationId: 'getBuyerCatalogVersion', security: [{ bearerAuth: [] }], parameters: [buyerCatalogVersionId],
        responses: readResponses('Buyer catalog version', '#/components/schemas/BuyerCatalogVersion'),
      },
    },
  };
}

function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function date() { return { type: 'string', format: 'date-time' }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
