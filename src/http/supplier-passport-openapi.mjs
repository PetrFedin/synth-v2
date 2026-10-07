const SAFE_ID = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$';
const SUPPLIER_CODE = '^[A-Z0-9][A-Z0-9._/-]{1,63}$';
const SHA256 = '^[a-f0-9]{64}$';
const errorResponse = { description: 'Domain or transport error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };

export function withSupplierPassportOpenApi(base) {
  const specification = structuredClone(base);
  Object.assign(specification.components.schemas, schemas());
  Object.assign(specification.paths, paths());
  return deepFreeze(specification);
}

function schemas() {
  return {
    SupplierPassportDimension: {
      type: 'object', additionalProperties: false,
      required: ['code', 'valuePercent', 'numerator', 'denominator'],
      properties: {
        code: { type: 'string', minLength: 2, maxLength: 80 },
        valuePercent: nullablePercent(),
        numerator: count(),
        denominator: count(),
      },
    },
    SupplierPassportIdentity: {
      type: 'object', additionalProperties: false,
      required: ['id','supplierCode','brandId','legalName','status','countryCode','currency','leadTimeDays','minimumOrderQuantity','incoterms','categories','auditExpiresAt','version'],
      properties: {
        id: identifier(), supplierCode: { type: 'string', pattern: SUPPLIER_CODE }, brandId: identifier(),
        legalName: { type: 'string', minLength: 2, maxLength: 200 },
        status: { type: 'string', enum: ['draft','qualified','suspended','archived'] },
        countryCode: { type: 'string', pattern: '^[A-Z]{2}$' }, currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 },
        minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
        incoterms: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', minLength: 2, maxLength: 30 } },
        categories: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 120 } },
        auditExpiresAt: timestamp(), version: { type: 'integer', minimum: 1, maximum: 2147483647 },
      },
    },
    SupplierPassportQualification: {
      type: 'object', additionalProperties: false,
      required: ['state','supplierStatus','auditState','auditExpiresAt','asOf'],
      properties: {
        state: { type: 'string', enum: ['current','expired','not-qualified'] },
        supplierStatus: { type: 'string', enum: ['draft','qualified','suspended','archived'] },
        auditState: { type: 'string', enum: ['current','expired'] },
        auditExpiresAt: timestamp(), asOf: timestamp(),
      },
    },
    SupplierPassportPerformance: {
      type: 'object', additionalProperties: false,
      required: ['operations','quality','economicsByCurrency','attribution'],
      properties: {
        operations: { $ref: '#/components/schemas/SupplierOperationalPerformance' },
        quality: { $ref: '#/components/schemas/SupplierQualityPerformance' },
        economicsByCurrency: { type: 'array', maxItems: 200, items: { $ref: '#/components/schemas/SupplierFailureEconomics' } },
        attribution: {
          type: 'object', additionalProperties: false, required: ['version','mutableScoreUsed','rule'],
          properties: {
            version: { type: 'string', enum: ['unique-recovery-supplier-v1'] },
            mutableScoreUsed: { type: 'boolean', enum: [false] },
            rule: { type: 'string', minLength: 20, maxLength: 1000 },
          },
        },
      },
    },
    SupplierPassportTrustDimensions: {
      type: 'object', additionalProperties: false,
      required: ['delivery','firstPassQuality','inlineCoverage','universalScoreUsed'],
      properties: {
        delivery: { $ref: '#/components/schemas/SupplierPassportDimension' },
        firstPassQuality: { $ref: '#/components/schemas/SupplierPassportDimension' },
        inlineCoverage: { $ref: '#/components/schemas/SupplierPassportDimension' },
        universalScoreUsed: { type: 'boolean', enum: [false] },
      },
    },
    SupplierPassportLineage: {
      type: 'object', additionalProperties: false,
      required: ['supplierId','brandId','supplierCode','supplierVersion','operationalSource','economicsSource'],
      properties: {
        supplierId: identifier(), brandId: identifier(), supplierCode: { type: 'string', pattern: SUPPLIER_CODE },
        supplierVersion: { type: 'integer', minimum: 1, maximum: 2147483647 },
        operationalSource: { type: 'string', enum: ['supplier_operational_performance'] },
        economicsSource: { type: 'string', enum: ['supplier_failure_economics_by_currency'] },
      },
    },
    SupplierPassport: {
      type: 'object', additionalProperties: false,
      required: ['schemaVersion','generatedAt','supplier','qualification','performance','trustDimensions','lineage'],
      properties: {
        schemaVersion: { type: 'string', enum: ['supplier-passport-v1'] },
        generatedAt: timestamp(),
        supplier: { $ref: '#/components/schemas/SupplierPassportIdentity' },
        qualification: { $ref: '#/components/schemas/SupplierPassportQualification' },
        performance: { $ref: '#/components/schemas/SupplierPassportPerformance' },
        trustDimensions: { $ref: '#/components/schemas/SupplierPassportTrustDimensions' },
        lineage: { $ref: '#/components/schemas/SupplierPassportLineage' },
      },
    },
    SupplierPassportPartnerBundle: {
      type: 'object', additionalProperties: false,
      required: ['schemaVersion','generatedAt','supplier','qualification','evidenceDimensions','evidenceCounters','lineage','disclosureBoundary','signature','hashScope','bundleSha256'],
      properties: {
        schemaVersion: { type: 'string', enum: ['supplier-passport-partner-bundle-v1'] },
        generatedAt: timestamp(),
        supplier: {
          type: 'object', additionalProperties: false,
          required: ['supplierCode','legalName','countryCode','categories','incoterms','leadTimeDays','minimumOrderQuantity'],
          properties: {
            supplierCode: { type: 'string', pattern: SUPPLIER_CODE },
            legalName: { type: 'string', minLength: 2, maxLength: 200 },
            countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
            categories: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 120 } },
            incoterms: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 30 } },
            leadTimeDays: { type: 'integer', minimum: 1, maximum: 730 },
            minimumOrderQuantity: { type: 'integer', minimum: 1, maximum: 9007199254740991 },
          },
        },
        qualification: {
          type: 'object', additionalProperties: false,
          required: ['state','auditState','auditExpiresAt','asOf'],
          properties: {
            state: { type: 'string', enum: ['current','expired','not-qualified'] },
            auditState: { type: 'string', enum: ['current','expired'] },
            auditExpiresAt: timestamp(),
            asOf: timestamp(),
          },
        },
        evidenceDimensions: {
          type: 'object', additionalProperties: false,
          required: ['delivery','firstPassQuality','inlineCoverage','universalScoreUsed'],
          properties: {
            delivery: { $ref: '#/components/schemas/SupplierPassportDimension' },
            firstPassQuality: { $ref: '#/components/schemas/SupplierPassportDimension' },
            inlineCoverage: { $ref: '#/components/schemas/SupplierPassportDimension' },
            universalScoreUsed: { type: 'boolean', enum: [false] },
          },
        },
        evidenceCounters: {
          type: 'object', additionalProperties: false,
          required: ['productionOrders','executions','finalInspections','inlineChecks','openInlineChecks'],
          properties: {
            productionOrders: count(), executions: count(), finalInspections: count(), inlineChecks: count(), openInlineChecks: count(),
          },
        },
        lineage: {
          type: 'object', additionalProperties: false,
          required: ['supplierCode','supplierVersion','operationalSource'],
          properties: {
            supplierCode: { type: 'string', pattern: SUPPLIER_CODE },
            supplierVersion: { type: 'integer', minimum: 1, maximum: 2147483647 },
            operationalSource: { type: 'string', enum: ['supplier_operational_performance'] },
          },
        },
        disclosureBoundary: {
          type: 'object', additionalProperties: false,
          required: ['internalBrandIdIncluded','internalSupplierIdIncluded','failureEconomicsIncluded','commercialRecommendationIncluded'],
          properties: {
            internalBrandIdIncluded: { type: 'boolean', enum: [false] },
            internalSupplierIdIncluded: { type: 'boolean', enum: [false] },
            failureEconomicsIncluded: { type: 'boolean', enum: [false] },
            commercialRecommendationIncluded: { type: 'boolean', enum: [false] },
          },
        },
        signature: {
          type: 'object', additionalProperties: false,
          required: ['status','issuer'],
          properties: {
            status: { type: 'string', enum: ['unsigned'] },
            issuer: { type: 'null' },
          },
        },
        hashScope: { type: 'string', enum: ['stable-evidence-v1'] },
        bundleSha256: { type: 'string', pattern: SHA256 },
      },
    },
  };
}

function paths() {
  return {
    '/suppliers/{supplierCode}/passport': {
      get: {
        operationId: 'getSupplierPassport',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'supplierCode', in: 'path', required: true, schema: { type: 'string', pattern: SUPPLIER_CODE } }],
        responses: {
          200: dataResponse('Evidence-backed supplier passport derived from canonical sourcing, production, quality and recovery facts', '#/components/schemas/SupplierPassport'),
          400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse,
        },
      },
    },
    '/suppliers/{supplierCode}/passport/partner-bundle': {
      get: {
        operationId: 'getSupplierPassportPartnerBundle',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'supplierCode', in: 'path', required: true, schema: { type: 'string', pattern: SUPPLIER_CODE } }],
        responses: {
          200: dataResponse('Portable redacted supplier evidence bundle. Internal brand identifiers, failure economics and commercial recommendations are excluded.', '#/components/schemas/SupplierPassportPartnerBundle'),
          400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse,
        },
      },
    },
  };
}

function dataResponse(description, reference) {
  return { description, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['data','requestId'], properties: { data: { $ref: reference }, requestId: { type: 'string', pattern: SAFE_ID } } } } } };
}
function identifier() { return { type: 'string', minLength: 1, maxLength: 200, pattern: SAFE_ID }; }
function timestamp() { return { type: 'string', format: 'date-time', maxLength: 64 }; }
function count() { return { type: 'integer', minimum: 0, maximum: 9007199254740991 }; }
function nullablePercent() { return { oneOf: [{ type: 'number', minimum: 0, maximum: 100, multipleOf: 0.0001 }, { type: 'null' }] }; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
