import crypto from 'node:crypto';
import { invariant, requireEntity } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

const PASSPORT_VERSION = 'supplier-passport-v1';
const ATTRIBUTION_VERSION = 'unique-recovery-supplier-v1';
const PARTNER_BUNDLE_VERSION = 'supplier-passport-partner-bundle-v1';

export function createSupplierPassportService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.transaction === 'function', 'SUPPLIER_PASSPORT_READER_REQUIRED', 'Supplier passport reader is required');
  invariant(typeof clock === 'function', 'SUPPLIER_PASSPORT_CLOCK_REQUIRED', 'Supplier passport clock is required');

  const getSupplierPassportForActor = (actorId, supplierCode) => {
    invariant(typeof actorId === 'string' && actorId.length > 0, 'ACTOR_ID_REQUIRED', 'Actor id is required');
    invariant(typeof supplierCode === 'string' && supplierCode.length > 0, 'SUPPLIER_CODE_REQUIRED', 'Supplier code is required');

    return reader.transaction(async (tx) => {
      const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
      const membership = await tx.getMembership(supplier.brandId, actorId);
      assertCapability(membership, CAPABILITIES.MARGIN_READ);
      invariant(membership.organisationType === 'brand', 'SUPPLIER_PASSPORT_BRAND_MEMBERSHIP_REQUIRED', 'Supplier passport requires a brand membership', { supplierCode, brandId: supplier.brandId });

      const operational = requireEntity(
        await tx.getOperationalPerformance(supplier.brandId, supplier.supplierCode),
        'SUPPLIER_PERFORMANCE_READ_MODEL_MISSING',
        { supplierCode, brandId: supplier.brandId },
      );
      invariant(
        operational.supplierId === supplier.id
          && operational.brandId === supplier.brandId
          && operational.supplierCode === supplier.supplierCode,
        'SUPPLIER_PASSPORT_LINEAGE_MISMATCH',
        'Supplier passport performance belongs to another supplier',
        { supplierCode },
      );
      const economicsByCurrency = await tx.listFailureEconomics(supplier.brandId, supplier.supplierCode);
      for (const row of economicsByCurrency) {
        invariant(
          row.brandId === supplier.brandId && row.supplierCode === supplier.supplierCode,
          'SUPPLIER_PASSPORT_ECONOMIC_LINEAGE_MISMATCH',
          'Supplier passport economics belongs to another supplier',
          { supplierCode, currency: row.currency },
        );
      }
      return buildPassport({ supplier, operational, economicsByCurrency, asOf: iso(clock()) });
    });
  };

  return Object.freeze({
    async getPartnerBundleForActor(actorId, supplierCode) {
      const passport = await getSupplierPassportForActor(actorId, supplierCode);
      return buildPartnerBundle(passport);
    },
    async assertManageForActor(actorId, supplierCode) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'ACTOR_ID_REQUIRED', 'Actor id is required');
      invariant(typeof supplierCode === 'string' && supplierCode.length > 0, 'SUPPLIER_CODE_REQUIRED', 'Supplier code is required');
      return reader.transaction(async (tx) => {
        const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
        const membership = await tx.getMembership(supplier.brandId, actorId);
        assertCapability(membership, CAPABILITIES.SUPPLIER_MANAGE);
        invariant(membership.organisationType === 'brand', 'SUPPLIER_TRUST_BRAND_MEMBERSHIP_REQUIRED', 'Supplier trust management requires a brand membership', { supplierCode, brandId: supplier.brandId });
        return Object.freeze({ supplierCode: supplier.supplierCode, brandId: supplier.brandId });
      });
    },
    async getPartnerBundleForSystem(supplierCode) {
      invariant(typeof supplierCode === 'string' && supplierCode.length > 0, 'SUPPLIER_CODE_REQUIRED', 'Supplier code is required');
      return reader.transaction(async (tx) => {
        const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
        const operational = requireEntity(
          await tx.getOperationalPerformance(supplier.brandId, supplier.supplierCode),
          'SUPPLIER_PERFORMANCE_READ_MODEL_MISSING',
          { supplierCode, brandId: supplier.brandId },
        );
        invariant(
          operational.supplierId === supplier.id
            && operational.brandId === supplier.brandId
            && operational.supplierCode === supplier.supplierCode,
          'SUPPLIER_PASSPORT_LINEAGE_MISMATCH',
          'Supplier passport performance belongs to another supplier',
          { supplierCode },
        );
        const economicsByCurrency = await tx.listFailureEconomics(supplier.brandId, supplier.supplierCode);
        for (const row of economicsByCurrency) {
          invariant(
            row.brandId === supplier.brandId && row.supplierCode === supplier.supplierCode,
            'SUPPLIER_PASSPORT_ECONOMIC_LINEAGE_MISMATCH',
            'Supplier passport economics belongs to another supplier',
            { supplierCode, currency: row.currency },
          );
        }
        return buildPartnerBundle(buildPassport({ supplier, operational, economicsByCurrency, asOf: iso(clock()) }));
      });
    },
    getSupplierPassportForActor,

  });
}

function buildPassport({ supplier, operational, economicsByCurrency, asOf }) {
  const auditExpiresAt = iso(supplier.auditExpiresAt);
  const auditState = Date.parse(auditExpiresAt) < Date.parse(asOf) ? 'expired' : 'current';
  const qualificationState = supplier.status === 'qualified'
    ? (auditState === 'current' ? 'current' : 'expired')
    : 'not-qualified';

  const operations = Object.freeze({
    productionOrderCount: operational.productionOrderCount,
    confirmedOrderCount: operational.confirmedOrderCount,
    orderedUnits: operational.orderedUnits,
    executionCount: operational.executionCount,
    readyForQcCount: operational.readyForQcCount,
    onTimeReadyForQcCount: operational.onTimeReadyForQcCount,
    lateReadyForQcCount: operational.lateReadyForQcCount,
    onTimeQcPercent: percent(operational.onTimeReadyForQcCount, operational.readyForQcCount),
  });

  for (const field of ['inlineCheckCount', 'openInlineCheckCount', 'executionsWithInlineChecks', 'inlineCheckedUnits', 'inlineDefectiveUnits', 'inlineCriticalDefectCount', 'inlineMajorDefectCount', 'inlineMinorDefectCount', 'inlineReworkCount', 'inlineScrapCount', 'inlineAcceptedCount']) {
    invariant(Number.isFinite(operational[field]), 'SUPPLIER_PASSPORT_READ_MODEL_INCOMPLETE', 'Supplier passport read model is missing an inline quality measure', { field });
  }

  const dispositionedCount = operational.inlineReworkCount + operational.inlineScrapCount + operational.inlineAcceptedCount;
  const quality = Object.freeze({
    inspectionCount: operational.qualityInspectionCount,
    releasedInspectionCount: operational.releasedInspectionCount,
    rejectedInspectionCount: operational.rejectedInspectionCount,
    reworkInspectionCount: operational.reworkInspectionCount,
    reviewedFirstRunCount: operational.reviewedFirstRunCount,
    firstPassReleaseCount: operational.firstPassReleaseCount,
    firstPassYieldPercent: percent(operational.firstPassReleaseCount, operational.reviewedFirstRunCount),
    releaseRatePercent: percent(operational.releasedInspectionCount, operational.qualityInspectionCount),
    reworkIncidencePercent: percent(operational.reworkInspectionCount, operational.qualityInspectionCount),
    rejectionRatePercent: percent(operational.rejectedInspectionCount, operational.qualityInspectionCount),
    reworkRunCount: operational.reworkRunCount,
    defectCounts: Object.freeze({
      critical: operational.criticalDefectCount,
      major: operational.majorDefectCount,
      minor: operational.minorDefectCount,
    }),
    inline: Object.freeze({
      checkCount: operational.inlineCheckCount,
      openCheckCount: operational.openInlineCheckCount,
      executionsWithChecks: operational.executionsWithInlineChecks,
      coveragePercent: percent(operational.executionsWithInlineChecks, operational.executionCount),
      checkedUnits: operational.inlineCheckedUnits,
      defectiveUnits: operational.inlineDefectiveUnits,
      defectRatePercent: percent(operational.inlineDefectiveUnits, operational.inlineCheckedUnits),
      defectCounts: Object.freeze({
        critical: operational.inlineCriticalDefectCount,
        major: operational.inlineMajorDefectCount,
        minor: operational.inlineMinorDefectCount,
      }),
      dispositions: Object.freeze({
        rework: operational.inlineReworkCount,
        scrap: operational.inlineScrapCount,
        accepted: operational.inlineAcceptedCount,
        acceptedSharePercent: percent(operational.inlineAcceptedCount, dispositionedCount),
      }),
    }),
  });

  const economics = Object.freeze(economicsByCurrency.map((row) => Object.freeze({
    currency: row.currency,
    attributedDiscrepancyCount: row.attributedDiscrepancyCount,
    recoveryCount: row.recoveryCount,
    recoveredDiscrepancyCount: row.recoveredDiscrepancyCount,
    confirmedFailureCost: row.confirmedFailureCost,
    recoveryCreditAmount: row.recoveryCreditAmount,
    netConfirmedFailureCost: row.netConfirmedFailureCost,
  })));

  return Object.freeze({
    schemaVersion: PASSPORT_VERSION,
    generatedAt: asOf,
    supplier: Object.freeze({
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      brandId: supplier.brandId,
      legalName: supplier.legalName,
      status: supplier.status,
      countryCode: supplier.countryCode,
      currency: supplier.currency,
      leadTimeDays: supplier.leadTimeDays,
      minimumOrderQuantity: supplier.minimumOrderQuantity,
      incoterms: strings(supplier.incoterms),
      categories: strings(supplier.categories),
      auditExpiresAt,
      version: supplier.version,
    }),
    qualification: Object.freeze({
      state: qualificationState,
      supplierStatus: supplier.status,
      auditState,
      auditExpiresAt,
      asOf,
    }),
    performance: Object.freeze({
      operations,
      quality,
      economicsByCurrency: economics,
      attribution: Object.freeze({
        version: ATTRIBUTION_VERSION,
        mutableScoreUsed: false,
        rule: 'Supplier performance is derived from production, quality and uniquely attributed recovery evidence; missing or ambiguous evidence is not guessed.',
      }),
    }),
    trustDimensions: Object.freeze({
      delivery: dimension('on-time-ready-for-qc', operations.onTimeQcPercent, operational.onTimeReadyForQcCount, operational.readyForQcCount),
      firstPassQuality: dimension('first-pass-release', quality.firstPassYieldPercent, operational.firstPassReleaseCount, operational.reviewedFirstRunCount),
      inlineCoverage: dimension('inline-quality-coverage', quality.inline.coveragePercent, operational.executionsWithInlineChecks, operational.executionCount),
      universalScoreUsed: false,
    }),
    lineage: Object.freeze({
      supplierId: supplier.id,
      brandId: supplier.brandId,
      supplierCode: supplier.supplierCode,
      supplierVersion: supplier.version,
      operationalSource: 'supplier_operational_performance',
      economicsSource: 'supplier_failure_economics_by_currency',
    }),
  });
}

function buildPartnerBundle(passport) {
  const canonical = {
    schemaVersion: PARTNER_BUNDLE_VERSION,
    generatedAt: passport.generatedAt,
    supplier: {
      supplierCode: passport.supplier.supplierCode,
      legalName: passport.supplier.legalName,
      countryCode: passport.supplier.countryCode,
      categories: passport.supplier.categories,
      incoterms: passport.supplier.incoterms,
      leadTimeDays: passport.supplier.leadTimeDays,
      minimumOrderQuantity: passport.supplier.minimumOrderQuantity,
    },
    qualification: {
      state: passport.qualification.state,
      auditState: passport.qualification.auditState,
      auditExpiresAt: passport.qualification.auditExpiresAt,
      asOf: passport.qualification.asOf,
    },
    evidenceDimensions: {
      delivery: passport.trustDimensions.delivery,
      firstPassQuality: passport.trustDimensions.firstPassQuality,
      inlineCoverage: passport.trustDimensions.inlineCoverage,
      universalScoreUsed: false,
    },
    evidenceCounters: {
      productionOrders: passport.performance.operations.productionOrderCount,
      executions: passport.performance.operations.executionCount,
      finalInspections: passport.performance.quality.inspectionCount,
      inlineChecks: passport.performance.quality.inline.checkCount,
      openInlineChecks: passport.performance.quality.inline.openCheckCount,
    },
    lineage: {
      supplierCode: passport.lineage.supplierCode,
      supplierVersion: passport.lineage.supplierVersion,
      operationalSource: passport.lineage.operationalSource,
    },
    disclosureBoundary: {
      internalBrandIdIncluded: false,
      internalSupplierIdIncluded: false,
      failureEconomicsIncluded: false,
      commercialRecommendationIncluded: false,
    },
    signature: {
      status: 'unsigned',
      issuer: null,
    },
  };
  const hashPayload = {
    schemaVersion: canonical.schemaVersion,
    supplier: canonical.supplier,
    qualification: {
      state: canonical.qualification.state,
      auditState: canonical.qualification.auditState,
      auditExpiresAt: canonical.qualification.auditExpiresAt,
    },
    evidenceDimensions: canonical.evidenceDimensions,
    evidenceCounters: canonical.evidenceCounters,
    lineage: canonical.lineage,
    disclosureBoundary: canonical.disclosureBoundary,
    signature: canonical.signature,
  };
  return Object.freeze({
    ...canonical,
    hashScope: 'stable-evidence-v1',
    bundleSha256: crypto.createHash('sha256').update(stable(hashPayload)).digest('hex'),
  });
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function dimension(code, valuePercent, numerator, denominator) {
  return Object.freeze({ code, valuePercent, numerator, denominator });
}
function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 10_000;
}
function strings(value) {
  invariant(Array.isArray(value) && value.every((item) => typeof item === 'string'), 'SUPPLIER_PASSPORT_ARRAY_INVALID', 'Supplier passport source array is invalid');
  return Object.freeze([...value]);
}
function iso(value) {
  const normalized = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  invariant(normalized !== 'Invalid Date', 'SUPPLIER_PASSPORT_TIME_INVALID', 'Supplier passport timestamp is invalid', { value });
  return normalized;
}
