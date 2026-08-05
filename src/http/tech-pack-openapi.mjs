const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,63}$';
const SKU = '^[A-Z0-9][A-Z0-9._-]{1,63}$';
const STATUSES = ['draft', 'issued', 'acknowledged', 'superseded', 'withdrawn'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const codeParameter = { name: 'techPackCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withTechPackOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.13.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  const nullable = (maximum) => ({ oneOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }] });
  const editable = {
    supplierCode: { oneOf: [{ type: 'string', pattern: CODE }, { type: 'null' }] }, supplierName: nullable(160), supplierEmail: nullable(254),
    title: { type: 'string', minLength: 3, maxLength: 200 }, description: nullable(4000), constructionNotes: nullable(8000), qualityNotes: nullable(4000), packingNotes: nullable(4000),
  };
  return {
    TechPackCreate: { type: 'object', additionalProperties: false, required: ['techPackCode', 'sku', ...Object.keys(editable)], properties: { techPackCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: SKU }, ...editable } },
    TechPackUpdate: { type: 'object', additionalProperties: false, required: ['expectedVersion', ...Object.keys(editable)], properties: { expectedVersion: version(), ...editable } },
    TechPackVersionExpectation: { type: 'object', additionalProperties: false, required: ['expectedVersion'], properties: { expectedVersion: version() } },
    TechPackAcknowledgementInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','supplierCode','acknowledgementReference','acknowledgedBy','notes'], properties: { expectedVersion: version(), supplierCode: { type: 'string', pattern: CODE }, acknowledgementReference: { type: 'string', minLength: 2, maxLength: 160 }, acknowledgedBy: { type: 'string', minLength: 2, maxLength: 160 }, notes: nullable(1000) } },
    TechPackAcknowledgement: { type: 'object', additionalProperties: false, required: ['supplierCode','acknowledgementReference','acknowledgedBy','notes','acknowledgedAt','issuedTechPackVersion'], properties: { supplierCode: { type: 'string', pattern: CODE }, acknowledgementReference: { type: 'string', minLength: 2, maxLength: 160 }, acknowledgedBy: { type: 'string', minLength: 2, maxLength: 160 }, notes: nullable(1000), acknowledgedAt: { type: 'string', format: 'date-time' }, issuedTechPackVersion: version() } },
    TechPackRevisionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'techPackCode'], properties: { expectedVersion: version(), techPackCode: { type: 'string', pattern: CODE }, ...editable } },
    TechPackWithdrawalInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'reason'], properties: { expectedVersion: version(), reason: { type: 'string', minLength: 5, maxLength: 500 } } },
    TechPackDependencySnapshot: { type: 'object', additionalProperties: false, required: ['skuVersion', 'bomId', 'bomVersion', 'measurementChartId', 'measurementChartVersion', 'sampleCode', 'sampleVersion'], properties: { skuVersion: version(), bomId: { type: 'string', minLength: 1, maxLength: 160 }, bomVersion: version(), measurementChartId: { type: 'string', minLength: 1, maxLength: 160 }, measurementChartVersion: version(), sampleCode: { type: 'string', pattern: CODE }, sampleVersion: version() } },
    TechPack: { type: 'object', additionalProperties: false, required: ['id','techPackCode','sku','brandId','skuVersion','revision','sourceTechPackCode','status','version','supplierCode','supplierName','supplierEmail','title','description','constructionNotes','qualityNotes','packingNotes','dependencySnapshot','issuedAt','issuedBy','acknowledgedAt','acknowledgement','withdrawnAt','withdrawalReason','createdAt','updatedAt'], properties: {
      id: { type: 'string', minLength: 1, maxLength: 160 }, techPackCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: SKU }, brandId: { type: 'string', minLength: 1, maxLength: 160 }, skuVersion: version(), revision: { type: 'integer', minimum: 1, maximum: 999 }, sourceTechPackCode: { oneOf: [{ type: 'string', pattern: CODE }, { type: 'null' }] }, status: { type: 'string', enum: STATUSES }, version: version(), ...editable,
      dependencySnapshot: { oneOf: [{ $ref: '#/components/schemas/TechPackDependencySnapshot' }, { type: 'null' }] }, issuedAt: dateOrNull(), issuedBy: nullable(160), acknowledgedAt: dateOrNull(), acknowledgement: { oneOf: [{ $ref: '#/components/schemas/TechPackAcknowledgement' }, { type: 'null' }] }, withdrawnAt: dateOrNull(), withdrawalReason: nullable(500), createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    } },
    TechPackPage: { type: 'object', additionalProperties: false, required: ['items','nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/TechPack' } }, nextCursor: { oneOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] } } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [codeParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/tech-packs': {
      get: { operationId: 'listTechPacks', security: [{ bearerAuth: [] }], parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 160 } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: SKU } },
      ], responses: { 200: dataResponse('Tech pack page', '#/components/schemas/TechPackPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'createTechPack', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/TechPackCreate'), responses: mutationResponses('Created tech pack') },
    },
    '/tech-packs/{techPackCode}': { get: { operationId: 'getTechPack', security: [{ bearerAuth: [] }], parameters: [codeParameter], responses: { 200: dataResponse('Tech pack', '#/components/schemas/TechPack'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } }, patch: mutation('updateTechPack', '#/components/schemas/TechPackUpdate', 'Updated tech pack') },
    '/tech-packs/{techPackCode}/issue': { post: mutation('issueTechPack', '#/components/schemas/TechPackVersionExpectation', 'Issued tech pack') },
    '/tech-packs/{techPackCode}/acknowledge': { post: mutation('acknowledgeTechPack', '#/components/schemas/TechPackAcknowledgementInput', 'Acknowledged tech pack') },
    '/tech-packs/{techPackCode}/revisions': { post: mutation('createTechPackRevision', '#/components/schemas/TechPackRevisionInput', 'Created tech pack revision') },
    '/tech-packs/{techPackCode}/withdraw': { post: mutation('withdrawTechPack', '#/components/schemas/TechPackWithdrawalInput', 'Withdrawn tech pack') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function dateOrNull() { return { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/TechPack'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
