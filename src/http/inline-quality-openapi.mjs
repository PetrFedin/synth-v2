const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const DEFECT_CODE = '^[A-Z0-9][A-Z0-9-]{1,63}$';
const SEVERITIES = ['critical', 'major', 'minor'];
const STAGES = ['materials-ready', 'cutting-complete', 'assembly-complete', 'finishing-complete', 'packing-complete', 'ready-for-qc'];
const DISPOSITIONS = ['rework', 'scrap', 'accepted'];
const CHECK_STATUSES = ['open', 'closed'];
const TYPE_STATUSES = ['active', 'retired'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };

export function withInlineQualityOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    // Каталог дефектов бренда. Severity lives here and not on the occurrence: a fault that is major
    // in one check and minor in the next cannot be counted, and counting is the only reason to have
    // codes at all.
    DefectType: { type: 'object', additionalProperties: false, required: ['id', 'brandId', 'code', 'severity', 'originStage', 'nameRu', 'nameEn', 'status', 'version', 'createdAt', 'createdBy', 'updatedAt'], properties: {
      id: text(1, 200), brandId: text(1, 200), code: { type: 'string', pattern: DEFECT_CODE },
      severity: { type: 'string', enum: SEVERITIES }, originStage: nullableEnum(STAGES),
      nameRu: text(2, 160), nameEn: text(2, 160), status: { type: 'string', enum: TYPE_STATUSES },
      version: version(), createdAt: date(), createdBy: text(1, 200), updatedAt: date(),
      retiredAt: nullableDate(), retiredBy: nullableText(200),
    } },
    DefectTypes: { type: 'array', maxItems: 2000, items: { $ref: '#/components/schemas/DefectType' } },
    DefectTypeInput: { type: 'object', additionalProperties: false, required: ['brandId', 'code', 'severity', 'nameRu', 'nameEn'], properties: {
      brandId: text(1, 200), code: { type: 'string', pattern: DEFECT_CODE }, severity: { type: 'string', enum: SEVERITIES },
      originStage: { type: 'string', enum: STAGES }, nameRu: text(2, 160), nameEn: text(2, 160),
    } },
    DefectTypeRetireInput: { type: 'object', additionalProperties: false, required: ['brandId'], properties: { brandId: text(1, 200) } },
    InlineQualityDefect: { type: 'object', additionalProperties: false, required: ['defectTypeId', 'defectCode', 'severity', 'quantity', 'notes'], properties: {
      defectTypeId: text(1, 200), defectCode: { type: 'string', pattern: DEFECT_CODE },
      severity: { type: 'string', enum: SEVERITIES }, quantity: quantity(), notes: nullableText(500),
    } },
    // Из какого рулона это выкроено. Собирается при чтении из «настил ↔ исполнение» и «настил ↔
    // партия» — обе связи уже существуют для прослеживаемости материала, и на вехе раскроя они же
    // отвечают на вопрос, где искать причину найденного дефекта. Применимо только к самому раскрою:
    // на остальных вехах список пуст, а не гадателен.
    CulpableLot: { type: 'object', additionalProperties: false, required: ['lotId', 'lotReference', 'materialCode'], properties: {
      lotId: text(1, 200), lotReference: text(1, 200), materialCode: text(1, 200),
    } },
    InlineQualityCheck: { type: 'object', additionalProperties: false, required: ['id', 'brandId', 'executionId', 'executionCode', 'supplierCode', 'sku', 'lotQuantity', 'milestoneCode', 'checkNumber', 'checkedQuantity', 'defectiveQuantity', 'defects', 'defectRate', 'status', 'disposition', 'dispositionNotes', 'inspectorName', 'notes', 'version', 'recordedAt', 'recordedBy', 'dispositionedAt', 'dispositionedBy', 'culpableLots'], properties: {
      id: text(1, 200), brandId: text(1, 200), executionId: text(1, 200), executionCode: { type: 'string', pattern: CODE },
      supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, lotQuantity: quantity(),
      milestoneCode: { type: 'string', enum: STAGES }, checkNumber: version(), checkedQuantity: quantity(),
      defectiveQuantity: nonNegative(), defects: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/InlineQualityDefect' } },
      defectRate: { type: 'number', minimum: 0, maximum: 1 }, status: { type: 'string', enum: CHECK_STATUSES },
      disposition: nullableEnum(DISPOSITIONS), dispositionNotes: nullableText(2000), inspectorName: text(2, 160),
      notes: nullableText(2000), version: version(), recordedAt: date(), recordedBy: text(1, 200),
      dispositionedAt: nullableDate(), dispositionedBy: nullableText(200),
      culpableLots: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/CulpableLot' } },
    } },
    // Итог и Парето едут вместе со списком: a defect rate computed three different ways in three
    // screens is three different numbers with one name.
    InlineQualityChecksPage: { type: 'object', additionalProperties: false, required: ['items', 'summary', 'pareto'], properties: {
      items: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/InlineQualityCheck' } },
      summary: { type: 'object', additionalProperties: false, required: ['checks', 'open', 'checkedQuantity', 'defectiveQuantity', 'defectRate', 'severityCounts'], properties: {
        checks: nonNegative(), open: nonNegative(), checkedQuantity: nonNegative(), defectiveQuantity: nonNegative(),
        defectRate: { type: 'number', minimum: 0, maximum: 1 },
        severityCounts: { type: 'object', additionalProperties: false, required: SEVERITIES, properties: Object.fromEntries(SEVERITIES.map((key) => [key, nonNegative()])) },
      } },
      pareto: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false, required: ['defectCode', 'severity', 'quantity', 'originStage'], properties: {
        defectCode: { type: 'string', pattern: DEFECT_CODE }, severity: { type: 'string', enum: SEVERITIES },
        quantity: nonNegative(), originStage: nullableEnum(STAGES),
      } } },
    } },
    InlineQualityCheckInput: { type: 'object', additionalProperties: false, required: ['milestoneCode', 'checkedQuantity', 'inspectorName', 'defects'], properties: {
      milestoneCode: { type: 'string', enum: STAGES }, checkedQuantity: quantity(), inspectorName: text(2, 160),
      defects: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['defectCode', 'quantity'], properties: {
        defectCode: { type: 'string', pattern: DEFECT_CODE }, quantity: quantity(), notes: text(2, 500),
      } } },
      notes: text(2, 2000),
    } },
    InlineQualityDispositionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'disposition'], properties: {
      expectedVersion: version(), disposition: { type: 'string', enum: DISPOSITIONS }, notes: text(2, 2000),
    } },
  };
}

function paths() {
  return {
    '/defect-types': {
      get: { operationId: 'listDefectTypes', security: [{ bearerAuth: [] }], responses: { 200: dataResponse('Defect catalogue', '#/components/schemas/DefectTypes'), 400: errorResponse, 401: errorResponse, 403: errorResponse } },
      post: { operationId: 'registerDefectType', security: [{ bearerAuth: [] }], parameters: [idempotency], requestBody: body('#/components/schemas/DefectTypeInput'), responses: mutationResponses('Registered defect type', '#/components/schemas/DefectType') },
    },
    '/defect-types/{code}/retire': { post: { operationId: 'retireDefectType', security: [{ bearerAuth: [] }], parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string', pattern: DEFECT_CODE } }, idempotency], requestBody: body('#/components/schemas/DefectTypeRetireInput'), responses: mutationResponses('Retired defect type', '#/components/schemas/DefectType') } },
    '/production-executions/{executionCode}/inline-quality-checks': {
      get: { operationId: 'listInlineQualityChecks', security: [{ bearerAuth: [] }], parameters: [executionParameter()], responses: { 200: dataResponse('Inline quality checks for a lot', '#/components/schemas/InlineQualityChecksPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
      post: { operationId: 'recordInlineQualityCheck', security: [{ bearerAuth: [] }], parameters: [executionParameter(), idempotency], requestBody: body('#/components/schemas/InlineQualityCheckInput'), responses: mutationResponses('Recorded inline quality check', '#/components/schemas/InlineQualityCheck') },
    },
    '/inline-quality-checks/{checkId}/disposition': { post: { operationId: 'dispositionInlineQualityCheck', security: [{ bearerAuth: [] }], parameters: [{ name: 'checkId', in: 'path', required: true, schema: { type: 'string', pattern: SAFE_ID } }, idempotency], requestBody: body('#/components/schemas/InlineQualityDispositionInput'), responses: mutationResponses('Dispositioned inline quality check', '#/components/schemas/InlineQualityCheck') } },
  };
}

function executionParameter() { return { name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }; }
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function nullableEnum(values) { return { oneOf: [{ type: 'string', enum: values }, { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
