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
        const supplier = requireEntity(await tx.getSupplierByCode(supplierCode, actorId), 'SUPPLIER_NOT_FOUND', { supplierCode });
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
