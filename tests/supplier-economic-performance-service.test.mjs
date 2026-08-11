import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierEconomicPerformanceService } from '../src/application/supplier-economic-performance-service.mjs';

const supplier = Object.freeze({
  id: 'supplier-1', supplierCode: 'SUP-01', brandId: 'brand-1', legalName: 'Supplier One',
  status: 'qualified', countryCode: 'TR', currency: 'EUR',
});
const operational = Object.freeze({
  supplierId: 'supplier-1', brandId: 'brand-1', supplierCode: 'SUP-01', supplierStatus: 'qualified',
  productionOrderCount: 12, confirmedOrderCount: 10, orderedUnits: 2400,
  executionCount: 10, readyForQcCount: 10, onTimeReadyForQcCount: 8, lateReadyForQcCount: 2,
  qualityInspectionCount: 10, releasedInspectionCount: 9, rejectedInspectionCount: 1, reworkInspectionCount: 2,
  reviewedFirstRunCount: 8, firstPassReleaseCount: 7, reworkRunCount: 2,
  criticalDefectCount: 1, majorDefectCount: 5, minorDefectCount: 12,
});
const economics = Object.freeze([
  Object.freeze({ brandId: 'brand-1', supplierCode: 'SUP-01', currency: 'EUR', attributedDiscrepancyCount: 2, recoveryCount: 2, recoveredDiscrepancyCount: 2, confirmedFailureCost: 120, recoveryCreditAmount: 50, netConfirmedFailureCost: 70 }),
]);

function readerFor(role = 'finance', values = {}) {
  return {
    transaction(work) {
      return work({
        getSupplierByCode: async () => values.supplier ?? supplier,
        getMembership: async () => ({ organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role, status: 'active' }),
        getOperationalPerformance: async () => values.operational ?? operational,
        listFailureEconomics: async () => values.economics ?? economics,
      });
    },
  };
}

test('supplier economic performance derives rates and preserves currency-separated economics', async () => {
  const service = createSupplierEconomicPerformanceService({ reader: readerFor() });
  const result = await service.getSupplierEconomicPerformanceForActor('actor-1', 'SUP-01');
  assert.deepEqual(result.supplier, {
    id: 'supplier-1', supplierCode: 'SUP-01', brandId: 'brand-1', legalName: 'Supplier One', status: 'qualified', countryCode: 'TR', currency: 'EUR',
  });
  assert.equal(result.operations.onTimeQcPercent, 80);
  assert.equal(result.quality.firstPassYieldPercent, 87.5);
  assert.equal(result.quality.releaseRatePercent, 90);
  assert.equal(result.quality.reworkIncidencePercent, 20);
  assert.equal(result.quality.rejectionRatePercent, 10);
  assert.deepEqual(result.quality.defectCounts, { critical: 1, major: 5, minor: 12 });
  assert.deepEqual(result.economicsByCurrency, [{ currency: 'EUR', attributedDiscrepancyCount: 2, recoveryCount: 2, recoveredDiscrepancyCount: 2, confirmedFailureCost: 120, recoveryCreditAmount: 50, netConfirmedFailureCost: 70 }]);
  assert.equal(result.attribution.version, 'unique-recovery-supplier-v1');
  assert.equal(result.attribution.mutableScoreUsed, false);
});

test('supplier economic performance returns null rates when no denominator exists', async () => {
  const zero = Object.freeze({ ...operational, readyForQcCount: 0, onTimeReadyForQcCount: 0, lateReadyForQcCount: 0, qualityInspectionCount: 0, releasedInspectionCount: 0, rejectedInspectionCount: 0, reworkInspectionCount: 0, reviewedFirstRunCount: 0, firstPassReleaseCount: 0 });
  const service = createSupplierEconomicPerformanceService({ reader: readerFor('finance', { operational: zero, economics: [] }) });
  const result = await service.getSupplierEconomicPerformanceForActor('actor-1', 'SUP-01');
  assert.equal(result.operations.onTimeQcPercent, null);
  assert.equal(result.quality.firstPassYieldPercent, null);
  assert.equal(result.quality.releaseRatePercent, null);
  assert.deepEqual(result.economicsByCurrency, []);
});

test('supplier economic performance requires brand-side margin capability', async () => {
  const service = createSupplierEconomicPerformanceService({ reader: readerFor('buyer') });
  await assert.rejects(service.getSupplierEconomicPerformanceForActor('actor-1', 'SUP-01'), (error) => error.code === 'CAPABILITY_DENIED');
});

test('supplier economic performance fails closed on read-model lineage drift', async () => {
  const drifted = Object.freeze({ ...operational, supplierCode: 'SUP-OTHER' });
  const service = createSupplierEconomicPerformanceService({ reader: readerFor('finance', { operational: drifted }) });
  await assert.rejects(service.getSupplierEconomicPerformanceForActor('actor-1', 'SUP-01'), (error) => error.code === 'SUPPLIER_PERFORMANCE_LINEAGE_MISMATCH');
});
