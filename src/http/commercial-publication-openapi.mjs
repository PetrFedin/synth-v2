const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SKU = '^[A-Z0-9][A-Z0-9._/-]{0,159}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const currency = { type: 'string', pattern: '^[A-Z]{3}$' };
const money = { type: 'number', minimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const publicationId = { name: 'publicationId', in: 'path', required: true, schema: identifier };
const collectionId = { name: 'collectionId', in: 'path', required: true, schema: identifier };
const showroomId = { name: 'showroomId', in: 'path', required: true, schema: identifier };
const shopId = { name: 'shopId', in: 'query', required: true, schema: identifier };
const buyerCatalogVersionId = { name: 'buyerCatalogVersionId', in: 'path', required: true, schema: identifier };
const pageLimit = { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } };
const pageCursor = { name: 'cursor', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 512 } };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withCommercialPublicationOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const optionalIdentifier = { anyOf: [identifier, { type: 'null' }] };
  const mdmRef = { anyOf: [{ type: 'object', additionalProperties: false, required: ['entryId', 'version'], properties: { entryId: identifier, version: version() } }, { type: 'null' }] };
  const media = { type: 'object', additionalProperties: true, required: ['id', 'mediaType', 'mediaRole', 'uri', 'sortOrder'], properties: { id: identifier, colorwayId: optionalIdentifier, mediaType: { type: 'string' }, mediaRole: { type: 'string' }, uri: { type: 'string' }, sortOrder: { type: 'integer', minimum: 0 } } };
  const availability = { type: 'object', additionalProperties: false, required: ['mode', 'quantity'], properties: { mode: { type: 'string', enum: ['available_to_sell', 'made_to_order', 'preorder'] }, quantity: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] } } };
  const commercialTerms = { type: 'object', additionalProperties: false, required: ['currency','wholesalePriceMinor','rrpMinor','minimumOrderQuantity','minimumOrderValueMinor','packRatio','deliveryStart','deliveryEnd','availability'], properties: { currency, wholesalePriceMinor: { type: 'integer', minimum: 1 }, rrpMinor: { type: 'integer', minimum: 1 }, minimumOrderQuantity: { type: 'integer', minimum: 1 }, minimumOrderValueMinor: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] }, packRatio: { anyOf: [{ type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 } }, { type: 'null' }] }, deliveryStart: date(), deliveryEnd: date(), availability } };
  return {
    CommercialPublicationInput: {
      type: 'object', additionalProperties: false, required: ['collectionId', 'commercialProjectionId'],
      properties: { collectionId: identifier, commercialProjectionId: identifier },
    },
    CommercialPublicationLine: {
      type: 'object', additionalProperties: false,
      required: ['sku', 'name', 'catalogVersion', 'unitPrice', 'currency', 'minimumOrderQuantity'],
      properties: {
        sku: { type: 'string', pattern: SKU }, name: { type: 'string', minLength: 1, maxLength: 240 },
        catalogVersion: { ...version(), description: 'Compatibility sequencing field. For projection-backed V2 publications it equals CommercialProductProjectionVersion.versionNo and is not a flat catalog_skus version.' }, unitPrice: money, currency, minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
        productSkuId: identifier, styleVersionId: identifier, colorwayId: identifier, sizeValueId: identifier,
        rrpMinor: { type: 'integer', minimum: 1 }, wholesalePriceMinor: { type: 'integer', minimum: 1 }, deliveryStart: date(), deliveryEnd: date(), availability,
      },
    },
    CommercialProductSize: {
      type: 'object', additionalProperties: true,
      required: ['id', 'sizeScaleVersionId', 'code', 'labelRu', 'labelEn', 'sortOrder'],
      properties: { id: identifier, sizeScaleId: identifier, sizeScaleVersionId: identifier, sizeScaleVersionNo: version(), scaleCode: { type: 'string' }, scaleNameRu: { type: 'string' }, scaleNameEn: { type: 'string' }, code: { type: 'string' }, labelRu: { type: 'string' }, labelEn: { type: 'string' }, sortOrder: { type: 'integer', minimum: 0 }, mdmRef },
    },
    CommercialProductSku: {
      type: 'object', additionalProperties: false,
      required: ['productSkuId','skuCode','contentHash','gtin','sizeValueId','size','attributes','commercialTerms'],
      properties: { productSkuId: identifier, skuCode: { type: 'string', pattern: SKU }, contentHash: sha256(), gtin: { anyOf: [{ type: 'string' }, { type: 'null' }] }, sizeValueId: identifier, size: { $ref: '#/components/schemas/CommercialProductSize' }, attributes: { type: 'array', items: { type: 'object', additionalProperties: true } }, commercialTerms, buyerUnitPrice: money, buyerCurrency: currency, buyerMinimumOrderQuantity: { type: 'integer', minimum: 1 } },
    },
    CommercialProductColorway: {
      type: 'object', additionalProperties: false,
      required: ['colorwayId','colorwayCode','nameRu','nameEn','colorRef','swatchHex','media','attributes','skus'],
      properties: { colorwayId: identifier, colorwayCode: { type: 'string' }, nameRu: { type: 'string' }, nameEn: { type: 'string' }, colorRef: mdmRef, swatchHex: { anyOf: [{ type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }, { type: 'null' }] }, media: { type: 'array', items: media }, attributes: { type: 'array', items: { type: 'object', additionalProperties: true } }, skus: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/CommercialProductSku' } } },
    },
    CommercialProductStyle: {
      type: 'object', additionalProperties: false,
      required: ['styleId','styleCode','styleVersionId','styleVersionNo','styleVersionHash','titleRu','titleEn','descriptionRu','descriptionEn','compositionRu','compositionEn','countryOfOrigin','categoryRef','productTypeRef','genderRef','media','attributes','commercialTerms','colorways'],
      properties: { styleId: identifier, styleCode: { type: 'string' }, styleVersionId: identifier, styleVersionNo: version(), styleVersionHash: sha256(), titleRu: { type: 'string' }, titleEn: { type: 'string' }, descriptionRu: { type: 'string' }, descriptionEn: { type: 'string' }, compositionRu: { type: 'string' }, compositionEn: { type: 'string' }, countryOfOrigin: { type: 'string', pattern: '^[A-Z]{2}$' }, categoryRef: mdmRef, productTypeRef: mdmRef, genderRef: mdmRef, media: { type: 'array', items: media }, attributes: { type: 'array', items: { type: 'object', additionalProperties: true } }, commercialTerms, colorways: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/CommercialProductColorway' } } },
    },
    CommercialPublication: {
      type: 'object', additionalProperties: false,
      required: ['id', 'brandId', 'collectionId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: {
        id: identifier, formatVersion: { type: 'integer', enum: [2] }, commercialProjectionId: identifier, commercialProjectionVersionNo: version(), commercialProjectionContentHash: sha256(), readinessSnapshotId: identifier, styleVersionId: identifier,
        brandId: identifier, collectionId: identifier, currency,
        styles: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/CommercialProductStyle' } },
        lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/CommercialPublicationLine' } },
        status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date(),
      },
    },
    CommercialPublicationPage: { type: 'object', additionalProperties: false, required: ['items', 'nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/CommercialPublication' } }, nextCursor: { anyOf: [{ type: 'string', minLength: 1, maxLength: 512 }, { type: 'null' }] } } },
    PriceOverride: { type: 'object', additionalProperties: false, required: ['sku', 'unitPrice'], properties: { sku: { type: 'string', pattern: SKU }, unitPrice: money } },
    BuyerCatalogPublicationInput: { type: 'object', additionalProperties: false, required: ['showroomId', 'shopId'], properties: { showroomId: identifier, shopId: identifier, priceOverrides: { type: 'array', maxItems: 10_000, items: { $ref: '#/components/schemas/PriceOverride' } } } },
    PriceListLine: { $ref: '#/components/schemas/CommercialPublicationLine' },
    PriceListVersion: {
      type: 'object', additionalProperties: false,
      required: ['id', 'publicationId', 'brandId', 'shopId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: { id: identifier, publicationId: identifier, brandId: identifier, shopId: identifier, currency, lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/CommercialPublicationLine' } }, styles: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/CommercialProductStyle' } }, status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date() },
    },
    BuyerCatalogVersion: {
      type: 'object', additionalProperties: false,
      required: ['id', 'publicationId', 'priceListVersionId', 'brandId', 'shopId', 'showroomId', 'accessGrantId', 'collectionId', 'currency', 'lines', 'status', 'contentHash', 'publishedAt'],
      properties: { id: identifier, publicationId: identifier, priceListVersionId: identifier, brandId: identifier, shopId: identifier, showroomId: identifier, accessGrantId: identifier, collectionId: identifier, currency, lines: { type: 'array', minItems: 1, maxItems: 10_000, items: { $ref: '#/components/schemas/CommercialPublicationLine' } }, styles: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/CommercialProductStyle' } }, status: { type: 'string', enum: ['published'] }, contentHash: sha256(), publishedAt: date() },
    },
    BuyerCatalogPublicationResult: { type: 'object', additionalProperties: false, required: ['priceListVersion', 'buyerCatalogVersion'], properties: { priceListVersion: { $ref: '#/components/schemas/PriceListVersion' }, buyerCatalogVersion: { $ref: '#/components/schemas/BuyerCatalogVersion' } } },
  };
}

function paths() {
  return {
    '/commercial-publications': { post: { operationId: 'publishCommercialPublication', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/CommercialPublicationInput'), responses: mutationResponses('Published projection-backed commercial snapshot', '#/components/schemas/CommercialPublication') } },
    '/collections/{collectionId}/commercial-publications': { get: { operationId: 'listCommercialPublicationsByCollection', security: [{ bearerAuth: [] }], parameters: [collectionId, pageLimit, pageCursor], responses: readResponses('Published commercial snapshots for collection', '#/components/schemas/CommercialPublicationPage') } },
    '/commercial-publications/{publicationId}': { get: { operationId: 'getCommercialPublication', security: [{ bearerAuth: [] }], parameters: [publicationId], responses: readResponses('Commercial publication', '#/components/schemas/CommercialPublication') } },
    '/commercial-publications/{publicationId}/buyer-catalogs': { post: { operationId: 'publishBuyerCatalogVersion', security: [{ bearerAuth: [] }], parameters: [publicationId, idempotency], requestBody: body('#/components/schemas/BuyerCatalogPublicationInput'), responses: mutationResponses('Published buyer-specific catalog and price list', '#/components/schemas/BuyerCatalogPublicationResult') } },
    '/showrooms/{showroomId}/buyer-catalog': { get: { operationId: 'getBuyerCatalogForShowroomAccess', security: [{ bearerAuth: [] }], parameters: [showroomId, shopId], responses: readResponses('Latest buyer catalog version for showroom access', '#/components/schemas/BuyerCatalogVersion') } },
    '/buyer-catalog-versions/{buyerCatalogVersionId}': { get: { operationId: 'getBuyerCatalogVersion', security: [{ bearerAuth: [] }], parameters: [buyerCatalogVersionId], responses: readResponses('Buyer catalog version', '#/components/schemas/BuyerCatalogVersion') } },
  };
}

function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function date() { return { type: 'string', format: 'date-time' }; }
function sha256() { return { type: 'string', pattern: '^[a-f0-9]{64}$' }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
