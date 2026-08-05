const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const CODE = '^[A-Z0-9][A-Z0-9._/-]{2,159}$';
const STATUSES = ['planned','in-progress','review-pending','rework-required','released','rejected','cancelled'];
const RUN_STATUSES = ['in-progress','completed','reviewed'];
const RECOMMENDATIONS = ['pass','rework','reject'];
const DECISIONS = ['release','rework','reject'];
const SEVERITIES = ['critical','major','minor'];
const CHECKPOINT_RESULTS = ['pass','fail','not-applicable'];
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const idempotency = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } };
const inspectionParameter = { name: 'inspectionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } };

export function withFinalQualityOpenApi(base) {
  const specification = structuredClone(base);
  specification.info.version = '1.17.0';
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    FinalQualityEmptyInput: { type: 'object', additionalProperties: false, maxProperties: 0 },
    FinalQualitySamplingPlan: { type: 'object', additionalProperties: false, required: ['sampleSize','allowedMajorDefects','allowedMinorDefects','criticalTolerance'], properties: {
      sampleSize: quantity(), allowedMajorDefects: nonNegative(), allowedMinorDefects: nonNegative(), criticalTolerance: { type: 'integer', enum: [0] },
    } },
    FinalQualityStartInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','inspectorName','sampleSize','allowedMajorDefects','allowedMinorDefects'], properties: {
      expectedVersion: version(), inspectorName: text(2,160), sampleSize: quantity(), allowedMajorDefects: nonNegative(), allowedMinorDefects: nonNegative(),
    } },
    FinalQualityReinspectionInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','inspectorName','sampleSize','allowedMajorDefects','allowedMinorDefects','reworkReference','resolutionNotes'], properties: {
      expectedVersion: version(), inspectorName: text(2,160), sampleSize: quantity(), allowedMajorDefects: nonNegative(), allowedMinorDefects: nonNegative(), reworkReference: text(2,120), resolutionNotes: text(5,2000),
    } },
    FinalQualityDefect: { type: 'object', additionalProperties: false, required: ['defectCode','severity','category','description','quantity','evidenceReferences'], properties: {
      defectCode: text(2,80), severity: { type: 'string', enum: SEVERITIES }, category: text(2,120), description: text(3,1000), quantity: quantity(), evidenceReferences: references(),
    } },
    FinalQualityMeasurementFailure: { type: 'object', additionalProperties: false, required: ['pointCode','sizeCode','measuredValue','lowerLimit','upperLimit'], properties: {
      pointCode: text(1,80), sizeCode: text(1,40), measuredValue: number(), lowerLimit: number(), upperLimit: number(),
    } },
    FinalQualityCheckpoint: { type: 'object', additionalProperties: false, required: ['checkpointCode','name','result','severity','notes'], properties: {
      checkpointCode: text(2,80), name: text(2,160), result: { type: 'string', enum: CHECKPOINT_RESULTS }, severity: nullableEnum(SEVERITIES), notes: nullableText(1000),
    } },
    FinalQualityDefectCounts: { type: 'object', additionalProperties: false, required: ['critical','major','minor'], properties: { critical: nonNegative(), major: nonNegative(), minor: nonNegative() } },
    FinalQualityCompleteInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','inspectedQuantity','defects','measurementFailures','checkpoints','evidenceReferences','notes'], properties: {
      expectedVersion: version(), inspectedQuantity: quantity(), defects: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/FinalQualityDefect' } }, measurementFailures: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/FinalQualityMeasurementFailure' } }, checkpoints: { type: 'array', minItems: 1, maxItems: 300, items: { $ref: '#/components/schemas/FinalQualityCheckpoint' } }, evidenceReferences: references(), notes: nullableText(2000),
    } },
    FinalQualityReviewInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','decision','releaseCode','notes'], properties: {
      expectedVersion: version(), decision: { type: 'string', enum: DECISIONS }, releaseCode: nullableText(120), notes: text(5,2000),
    } },
    FinalQualityCancellationInput: { type: 'object', additionalProperties: false, required: ['expectedVersion','reason'], properties: { expectedVersion: version(), reason: text(5,1000) } },
    FinalQualitySourceSnapshot: { type: 'object', additionalProperties: false, required: ['executionCode','executionVersion','productionOrderNumber','productionOrderVersion','supplierCode','quantity','techPackCode','techPackVersion','readyForQcAt'], properties: {
      executionCode: { type: 'string', pattern: CODE }, executionVersion: version(), productionOrderNumber: { type: 'string', pattern: CODE }, productionOrderVersion: version(), supplierCode: { type: 'string', pattern: CODE }, quantity: quantity(), techPackCode: { type: 'string', pattern: CODE }, techPackVersion: version(), readyForQcAt: date(),
    } },
    FinalQualityRun: { type: 'object', additionalProperties: false, required: ['runNumber','status','inspectorId','inspectorName','samplingPlan','reworkReference','resolutionNotes','startedAt','inspectedQuantity','defects','measurementFailures','checkpoints','evidenceReferences','defectCounts','recommendation','completionNotes','completedAt','completedBy','disposition','reviewedAt','reviewedBy','reviewNotes'], properties: {
      runNumber: version(), status: { type: 'string', enum: RUN_STATUSES }, inspectorId: text(1,200), inspectorName: text(2,160), samplingPlan: { $ref: '#/components/schemas/FinalQualitySamplingPlan' }, reworkReference: nullableText(120), resolutionNotes: nullableText(2000), startedAt: date(), inspectedQuantity: nullableInteger(), defects: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/FinalQualityDefect' } }, measurementFailures: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/FinalQualityMeasurementFailure' } }, checkpoints: { type: 'array', maxItems: 300, items: { $ref: '#/components/schemas/FinalQualityCheckpoint' } }, evidenceReferences: references(), defectCounts: nullableRef('#/components/schemas/FinalQualityDefectCounts'), recommendation: nullableEnum(RECOMMENDATIONS), completionNotes: nullableText(2000), completedAt: nullableDate(), completedBy: nullableText(200), disposition: nullableEnum(DECISIONS), reviewedAt: nullableDate(), reviewedBy: nullableText(200), reviewNotes: nullableText(2000),
    } },
    FinalQualityShipmentRelease: { type: 'object', additionalProperties: false, required: ['releaseCode','inspectionCode','inspectionVersion','executionCode','productionOrderNumber','supplierCode','sku','quantity','runNumber','releasedAt','releasedBy','notes'], properties: {
      releaseCode: { type: 'string', pattern: CODE }, inspectionCode: { type: 'string', pattern: CODE }, inspectionVersion: version(), executionCode: { type: 'string', pattern: CODE }, productionOrderNumber: { type: 'string', pattern: CODE }, supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), runNumber: version(), releasedAt: date(), releasedBy: text(1,200), notes: text(5,2000),
    } },
    FinalQualityRejection: { type: 'object', additionalProperties: false, required: ['runNumber','rejectedAt','rejectedBy','notes'], properties: { runNumber: version(), rejectedAt: date(), rejectedBy: text(1,200), notes: text(5,2000) } },
    FinalQualityInspection: { type: 'object', additionalProperties: false, required: ['id','inspectionCode','executionId','executionCode','executionVersion','productionOrderNumber','productionOrderVersion','brandId','supplierCode','sku','quantity','sourceSnapshot','status','version','currentRun','runs','shipmentRelease','rejection','cancelledAt','cancelledBy','cancellationReason','createdAt','updatedAt'], properties: {
      id: text(1,200), inspectionCode: { type: 'string', pattern: CODE }, executionId: text(1,200), executionCode: { type: 'string', pattern: CODE }, executionVersion: version(), productionOrderNumber: { type: 'string', pattern: CODE }, productionOrderVersion: version(), brandId: text(1,200), supplierCode: { type: 'string', pattern: CODE }, sku: { type: 'string', pattern: CODE }, quantity: quantity(), sourceSnapshot: { $ref: '#/components/schemas/FinalQualitySourceSnapshot' }, status: { type: 'string', enum: STATUSES }, version: version(), currentRun: nonNegative(), runs: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/FinalQualityRun' } }, shipmentRelease: nullableRef('#/components/schemas/FinalQualityShipmentRelease'), rejection: nullableRef('#/components/schemas/FinalQualityRejection'), cancelledAt: nullableDate(), cancelledBy: nullableText(200), cancellationReason: nullableText(1000), createdAt: date(), updatedAt: date(),
    } },
    FinalQualityPage: { type: 'object', additionalProperties: false, required: ['items','nextCursor'], properties: { items: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/FinalQualityInspection' } }, nextCursor: nullableText(2048) } },
  };
}

function paths() {
  const mutation = (operationId, schema, description) => ({ operationId, security: [{ bearerAuth: [] }], parameters: [inspectionParameter, idempotency], requestBody: body(schema), responses: mutationResponses(description) });
  return {
    '/final-quality-inspections': { get: { operationId: 'listFinalQualityInspections', security: [{ bearerAuth: [] }], parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, { name: 'cursor', in: 'query', schema: { type: 'string', maxLength: 2048 } }, { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 80 } }, { name: 'status', in: 'query', schema: { type: 'string', enum: STATUSES } }, { name: 'brandId', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 200 } }, { name: 'supplierCode', in: 'query', schema: { type: 'string', pattern: CODE } }, { name: 'sku', in: 'query', schema: { type: 'string', pattern: CODE } },
    ], responses: { 200: dataResponse('Final Quality inspection page', '#/components/schemas/FinalQualityPage'), 400: errorResponse, 401: errorResponse, 403: errorResponse } } },
    '/final-quality-inspections/{inspectionCode}': { get: { operationId: 'getFinalQualityInspection', security: [{ bearerAuth: [] }], parameters: [inspectionParameter], responses: { 200: dataResponse('Final Quality inspection', '#/components/schemas/FinalQualityInspection'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/final-quality-shipment-releases/{releaseCode}': { get: { operationId: 'getFinalQualityShipmentRelease', security: [{ bearerAuth: [] }], parameters: [{ name: 'releaseCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }], responses: { 200: dataResponse('Shipment release', '#/components/schemas/FinalQualityShipmentRelease'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } },
    '/final-quality-inspections/from-execution/{executionCode}': { post: { operationId: 'createFinalQualityInspectionFromExecution', security: [{ bearerAuth: [] }], parameters: [{ name: 'executionCode', in: 'path', required: true, schema: { type: 'string', pattern: CODE } }, idempotency], requestBody: body('#/components/schemas/FinalQualityEmptyInput'), responses: mutationResponses('Created Final Quality inspection') } },
    '/final-quality-inspections/{inspectionCode}/start': { post: mutation('startFinalQualityInspection', '#/components/schemas/FinalQualityStartInput', 'Started Final Quality inspection') },
    '/final-quality-inspections/{inspectionCode}/complete-run': { post: mutation('completeFinalQualityRun', '#/components/schemas/FinalQualityCompleteInput', 'Completed Final Quality run') },
    '/final-quality-inspections/{inspectionCode}/review': { post: mutation('reviewFinalQualityInspection', '#/components/schemas/FinalQualityReviewInput', 'Reviewed Final Quality inspection') },
    '/final-quality-inspections/{inspectionCode}/reinspect': { post: mutation('startFinalQualityReinspection', '#/components/schemas/FinalQualityReinspectionInput', 'Started Final Quality reinspection') },
    '/final-quality-inspections/{inspectionCode}/cancel': { post: mutation('cancelFinalQualityInspection', '#/components/schemas/FinalQualityCancellationInput', 'Cancelled Final Quality inspection') },
  };
}
function version() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function quantity() { return { type: 'integer', minimum: 1, maximum: 2_147_483_647 }; }
function nonNegative() { return { type: 'integer', minimum: 0, maximum: 2_147_483_647 }; }
function nullableInteger() { return { oneOf: [nonNegative(), { type: 'null' }] }; }
function number() { return { type: 'number', minimum: -1_000_000_000, maximum: 1_000_000_000 }; }
function text(minLength, maxLength) { return { type: 'string', minLength, maxLength }; }
function nullableText(maxLength) { return { oneOf: [text(1, maxLength), { type: 'null' }] }; }
function nullableEnum(values) { return { oneOf: [{ type: 'string', enum: values }, { type: 'null' }] }; }
function date() { return { type: 'string', format: 'date-time' }; }
function nullableDate() { return { oneOf: [date(), { type: 'null' }] }; }
function references() { return { type: 'array', maxItems: 100, uniqueItems: true, items: text(2,500) }; }
function nullableRef(reference) { return { oneOf: [{ $ref: reference }, { type: 'null' }] }; }
function body(reference) { return { required: true, content: { 'application/json': { schema: { $ref: reference } } } }; }
function mutationResponses(description) { return { 200: dataResponse(description, '#/components/schemas/FinalQualityInspection'), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }; }
function dataResponse(description, reference) { return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', minLength: 1, maxLength: 128, pattern: SAFE_ID } } } } } }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
