import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

const ATTRIBUTION_VERSION = 'unique-recovery-supplier-v1';

export function createSupplierEconomicPerformanceService({ reader } = {}) {
  invariant(reader && typeof reader.transaction === 'function', 'SUPPLIER_PERFORMANCE_READER_REQUIRED', 'Supplier economic performance reader is required');

  return Object.freeze({
    getSupplierEconomicPerformanceForActor(actorId, supplierCode) {
      invariant(typeof actorId === 'string' && actorId.length > 0, 'ACTOR_ID_REQUIRED', 'Actor id is required');
      invariant(typeof supplierCode === 'string' && supplierCode.length > 0, 'SUPPLIER_CODE_REQUIRED', 'Supplier code is required');
      return reader.transaction(async (tx) => {
        const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
        const membership = await tx.getMembership(supplier.brandId, actorId);
        assertCapability(membership, CAPABILITIES.MARGIN_READ);
        invariant(membership.organisationType === 'brand', 'SUPPLIER_PERFORMANCE_BRAND_MEMBERSHIP_REQUIRED', 'Supplier economic performance requires a brand membership', { supplierCode, brandId: supplier.brandId });

        const operational = requireEntity(
          await tx.getOperationalPerformance(supplier.brandId, supplier.supplierCode),
          'SUPPLIER_PERFORMANCE_READ_MODEL_MISSING',
          { supplierCode, brandId: supplier.brandId },
        );
        invariant(operational.supplierId === supplier.id && operational.brandId === supplier.brandId && operational.supplierCode === supplier.supplierCode, 'SUPPLIER_PERFORMANCE_LINEAGE_MISMATCH', 'Supplier performance row belongs to another supplier', { supplierCode });
        const economicsByCurrency = await tx.listFailureEconomics(supplier.brandId, supplier.supplierCode);
        for (const row of economicsByCurrency) {
          invariant(row.brandId === supplier.brandId && row.supplierCode === supplier.supplierCode, 'SUPPLIER_PERFORMANCE_ECONOMIC_LINEAGE_MISMATCH', 'Supplier economics row belongs to another supplier', { supplierCode, currency: row.currency });
        }

        return buildPerformance(supplier, operational, economicsByCurrency);
      });
    },
  });
}

function buildPerformance(supplier, operational, economicsByCurrency) {
  const onTimeQcPercent = percent(operational.onTimeReadyForQcCount, operational.readyForQcCount);
  const firstPassYieldPercent = percent(operational.firstPassReleaseCount, operational.reviewedFirstRunCount);
  const releaseRatePercent = percent(operational.releasedInspectionCount, operational.qualityInspectionCount);
  const reworkIncidencePercent = percent(operational.reworkInspectionCount, operational.qualityInspectionCount);
  const rejectionRatePercent = percent(operational.rejectedInspectionCount, operational.qualityInspectionCount);
  // Отсутствующее поле — это сломанный читатель, а не фабрика без контроля.
  //
  // Defaulting these to zero would report «no inline control at this supplier», which is a claim
  // about the factory, from what is actually a claim about our own read model. The view always
  // provides them, so a missing one is a bug and says so.
  for (const field of ['inlineCheckCount', 'openInlineCheckCount', 'executionsWithInlineChecks', 'inlineCheckedUnits', 'inlineDefectiveUnits', 'inlineCriticalDefectCount', 'inlineMajorDefectCount', 'inlineMinorDefectCount', 'inlineReworkCount', 'inlineScrapCount', 'inlineAcceptedCount']) {
    invariant(Number.isFinite(operational[field]), 'SUPPLIER_PERFORMANCE_READ_MODEL_INCOMPLETE',
      'The supplier performance read model is missing an inline quality measure', { field });
  }

  // Каждая доля называет свой знаменатель, и общей оценки здесь нет намеренно.
  //
  // Coverage says how many of this supplier's lots were inspected during production at all — a
  // factory with no inline checks is not a factory with no faults, it is one nobody looked at. The
  // defect rate is measured against pieces checked in production, which is a different denominator
  // from the final gate's sample, so the two are reported side by side rather than blended: a single
  // score would hide exactly the difference worth looking at.
  const inlineCoveragePercent = percent(operational.executionsWithInlineChecks, operational.executionCount);
  const inlineDefectRatePercent = percent(operational.inlineDefectiveUnits, operational.inlineCheckedUnits);
  const dispositionedCount = operational.inlineReworkCount + operational.inlineScrapCount + operational.inlineAcceptedCount;
  // Доля принятого с известным браком — решение бренда, а не фабрики, но читается в её карточке:
  // высокий процент значит, что мы соглашаемся с тем, что находим, и тогда находки ничего не меняют.
  const inlineAcceptedSharePercent = percent(operational.inlineAcceptedCount, dispositionedCount);

  return Object.freeze({
    supplier: Object.freeze({
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      brandId: supplier.brandId,
      legalName: supplier.legalName,
      status: supplier.status,
      countryCode: supplier.countryCode,
      currency: supplier.currency,
    }),
    operations: Object.freeze({
      productionOrderCount: operational.productionOrderCount,
      confirmedOrderCount: operational.confirmedOrderCount,
      orderedUnits: operational.orderedUnits,
      executionCount: operational.executionCount,
      readyForQcCount: operational.readyForQcCount,
      onTimeReadyForQcCount: operational.onTimeReadyForQcCount,
      lateReadyForQcCount: operational.lateReadyForQcCount,
      onTimeQcPercent,
    }),
    quality: Object.freeze({
      inspectionCount: operational.qualityInspectionCount,
      releasedInspectionCount: operational.releasedInspectionCount,
      rejectedInspectionCount: operational.rejectedInspectionCount,
      reworkInspectionCount: operational.reworkInspectionCount,
      reviewedFirstRunCount: operational.reviewedFirstRunCount,
      firstPassReleaseCount: operational.firstPassReleaseCount,
      firstPassYieldPercent,
      releaseRatePercent,
      reworkIncidencePercent,
      rejectionRatePercent,
      reworkRunCount: operational.reworkRunCount,
      inline: Object.freeze({
        checkCount: operational.inlineCheckCount,
        openCheckCount: operational.openInlineCheckCount,
        executionsWithChecks: operational.executionsWithInlineChecks,
        coveragePercent: inlineCoveragePercent,
        checkedUnits: operational.inlineCheckedUnits,
        defectiveUnits: operational.inlineDefectiveUnits,
        defectRatePercent: inlineDefectRatePercent,
        defectCounts: Object.freeze({
          critical: operational.inlineCriticalDefectCount,
          major: operational.inlineMajorDefectCount,
          minor: operational.inlineMinorDefectCount,
        }),
        dispositions: Object.freeze({
          rework: operational.inlineReworkCount,
          scrap: operational.inlineScrapCount,
          accepted: operational.inlineAcceptedCount,
          acceptedSharePercent: inlineAcceptedSharePercent,
        }),
      }),
      defectCounts: Object.freeze({
        critical: operational.criticalDefectCount,
        major: operational.majorDefectCount,
        minor: operational.minorDefectCount,
      }),
    }),
    economicsByCurrency: Object.freeze(economicsByCurrency.map((row) => Object.freeze({
      currency: row.currency,
      attributedDiscrepancyCount: row.attributedDiscrepancyCount,
      recoveryCount: row.recoveryCount,
      recoveredDiscrepancyCount: row.recoveredDiscrepancyCount,
      confirmedFailureCost: row.confirmedFailureCost,
      recoveryCreditAmount: row.recoveryCreditAmount,
      netConfirmedFailureCost: row.netConfirmedFailureCost,
    }))),
    attribution: Object.freeze({
      version: ATTRIBUTION_VERSION,
      rule: 'Positive physical quality/rework costs are supplier-attributed only when their exact receipt discrepancy has recorded recoveries to one unique supplier. Ambiguous or unattributed costs are excluded rather than guessed.',
      supplierCreditsSource: 'supplier_claim_recovery_snapshots -> actual_cost_ledger_entries',
      mutableScoreUsed: false,
    }),
  });
}

function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 10_000;
}
function requireEntity(value, code, details) {
  invariant(value, code, 'Entity not found', details);
  return value;
}
