const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SUPPLIER_CODE = '^[A-Z0-9][A-Z0-9._/-]{1,63}$';
const identifier = { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID };
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withSupplierEconomicPerformanceOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    SupplierPerformanceIdentity: {
      type: 'object', additionalProperties: false,
      required: ['id', 'supplierCode', 'brandId', 'legalName', 'status', 'countryCode', 'currency'],
      properties: {
        id: identifier,
        supplierCode: { type: 'string', pattern: SUPPLIER_CODE },
        brandId: identifier,
        legalName: { type: 'string', minLength: 2, maxLength: 200 },
        status: { type: 'string', enum: ['draft', 'qualified', 'suspended', 'archived'] },
        countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
      },
    },
    SupplierOperationalPerformance: {
      type: 'object', additionalProperties: false,
      required: ['productionOrderCount', 'confirmedOrderCount', 'orderedUnits', 'executionCount', 'readyForQcCount', 'onTimeReadyForQcCount', 'lateReadyForQcCount', 'onTimeQcPercent'],
      properties: {
        productionOrderCount: count(), confirmedOrderCount: count(), orderedUnits: count(), executionCount: count(), readyForQcCount: count(),
        onTimeReadyForQcCount: count(), lateReadyForQcCount: count(), onTimeQcPercent: nullablePercent(),
      },
    },
    SupplierQualityPerformance: {
      type: 'object', additionalProperties: false,
      required: ['inspectionCount', 'releasedInspectionCount', 'rejectedInspectionCount', 'reworkInspectionCount', 'reviewedFirstRunCount', 'firstPassReleaseCount', 'firstPassYieldPercent', 'releaseRatePercent', 'reworkIncidencePercent', 'rejectionRatePercent', 'reworkRunCount', 'defectCounts'],
      properties: {
        inspectionCount: count(), releasedInspectionCount: count(), rejectedInspectionCount: count(), reworkInspectionCount: count(),
        reviewedFirstRunCount: count(), firstPassReleaseCount: count(), firstPassYieldPercent: nullablePercent(), releaseRatePercent: nullablePercent(),
        reworkIncidencePercent: nullablePercent(), rejectionRatePercent: nullablePercent(), reworkRunCount: count(),
        defectCounts: {
          type: 'object', additionalProperties: false, required: ['critical', 'major', 'minor'],
          properties: { critical: count(), major: count(), minor: count() },
        },
      },
    },
    SupplierFailureEconomics: {
      type: 'object', additionalProperties: false,
      required: ['currency', 'attributedDiscrepancyCount', 'recoveryCount', 'recoveredDiscrepancyCount', 'confirmedFailureCost', 'recoveryCreditAmount', 'netConfirmedFailureCost'],
      properties: {
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        attributedDiscrepancyCount: count(), recoveryCount: count(), recoveredDiscrepancyCount: count(),
        confirmedFailureCost: nonNegativeMoney(), recoveryCreditAmount: nonNegativeMoney(), netConfirmedFailureCost: money(),
      },
    },
    SupplierPerformanceAttribution: {
      type: 'object', additionalProperties: false,
      required: ['version', 'rule', 'supplierCreditsSource', 'mutableScoreUsed'],
      properties: {
        version: { type: 'string', enum: ['unique-recovery-supplier-v1'] },
        rule: { type: 'string', minLength: 20, maxLength: 1000 },
        supplierCreditsSource: { type: 'string', minLength: 10, maxLength: 300 },
        mutableScoreUsed: { type: 'boolean', enum: [false] },
      },
    },
    SupplierEconomicPerformance: {
      type: 'object', additionalProperties: false,
      required: ['supplier', 'operations', 'quality', 'economicsByCurrency', 'attribution'],
      properties: {
        supplier: { $ref: '#/components/schemas/SupplierPerformanceIdentity' },
        operations: { $ref: '#/components/schemas/SupplierOperationalPerformance' },
        quality: { $ref: '#/components/schemas/SupplierQualityPerformance' },
        economicsByCurrency: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/SupplierFailureEconomics' } },
        attribution: { $ref: '#/components/schemas/SupplierPerformanceAttribution' },
      },
    },
  };
}

function paths() {
  return {
    '/suppliers/{supplierCode}/economic-performance': {
      get: {
        operationId: 'getSupplierEconomicPerformance',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'supplierCode', in: 'path', required: true, schema: { type: 'string', pattern: SUPPLIER_CODE } }],
        responses: readResponses('Derived supplier execution, quality and confirmed cost-of-failure performance', '#/components/schemas/SupplierEconomicPerformance'),
      },
    },
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data', 'requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function readResponses(description, reference) { return { 200: dataResponse(description, reference), 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }; }
function count() { return { type: 'integer', minimum: 0, maximum: 9_007_199_254_740_991 }; }
function nullablePercent() { return { oneOf: [{ type: 'number', minimum: 0, maximum: 100, multipleOf: 0.0001 }, { type: 'null' }] }; }
function nonNegativeMoney() { return { type: 'number', minimum: 0, maximum: 900_719_925_474.0991, multipleOf: 0.0001 }; }
function money() { return { type: 'number', minimum: -900_719_925_474.0991, maximum: 900_719_925_474.0991, multipleOf: 0.0001 }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
