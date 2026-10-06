import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierPassportService } from '../src/application/supplier-passport-service.mjs';
import { createSupplierPassportRoutes } from '../src/http/supplier-passport-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const supplier = Object.freeze({
  id: 'supplier-1', supplierCode: 'SUP-01', brandId: 'brand-1', legalName: 'Factory One',
  status: 'qualified', countryCode: 'IT', currency: 'EUR', leadTimeDays: 45,
  minimumOrderQuantity: 120, auditExpiresAt: '2027-01-15T00:00:00.000Z',
  incoterms: ['EXW','FCA'], categories: ['tailoring','knitwear'], version: 7,
});
const operational = Object.freeze({
  supplierId: 'supplier-1', brandId: 'brand-1', supplierCode: 'SUP-01', supplierStatus: 'qualified',
  productionOrderCount: 12, confirmedOrderCount: 10, orderedUnits: 2400,
  executionCount: 10, readyForQcCount: 10, onTimeReadyForQcCount: 8, lateReadyForQcCount: 2,
  qualityInspectionCount: 10, releasedInspectionCount: 9, rejectedInspectionCount: 1, reworkInspectionCount: 2,
  reviewedFirstRunCount: 8, firstPassReleaseCount: 7, reworkRunCount: 2,
  criticalDefectCount: 1, majorDefectCount: 5, minorDefectCount: 12,
  inlineCheckCount: 9, openInlineCheckCount: 1, executionsWithInlineChecks: 6,
  inlineCheckedUnits: 400, inlineDefectiveUnits: 24,
  inlineCriticalDefectCount: 2, inlineMajorDefectCount: 14, inlineMinorDefectCount: 8,
  inlineReworkCount: 5, inlineScrapCount: 1, inlineAcceptedCount: 2,
});
const economics = Object.freeze([
  Object.freeze({ brandId: 'brand-1', supplierCode: 'SUP-01', currency: 'EUR', attributedDiscrepancyCount: 2, recoveryCount: 2, recoveredDiscrepancyCount: 2, confirmedFailureCost: 120, recoveryCreditAmount: 50, netConfirmedFailureCost: 70 }),
]);

function readerFor(values = {}) {
  return {
    transaction(work) {
      return work({
        getSupplierByCode: async () => values.supplier ?? supplier,
        getMembership: async () => ({ organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role: 'finance', status: 'active' }),
        getOperationalPerformance: async () => values.operational ?? operational,
        listFailureEconomics: async () => values.economics ?? economics,
      });
    },
  };
}

test('supplier passport exposes evidence-backed dimensions without a universal score', async () => {
  const service = createSupplierPassportService({ reader: readerFor(), clock: () => '2026-10-06T12:00:00.000Z' });
  const result = await service.getSupplierPassportForActor('actor-1', 'SUP-01');

  assert.equal(result.schemaVersion, 'supplier-passport-v1');
  assert.equal(result.qualification.state, 'current');
  assert.deepEqual(result.supplier.incoterms, ['EXW','FCA']);
  assert.deepEqual(result.supplier.categories, ['tailoring','knitwear']);
  assert.equal(result.performance.operations.onTimeQcPercent, 80);
  assert.equal(result.performance.quality.firstPassYieldPercent, 87.5);
  assert.equal(result.performance.quality.inline.coveragePercent, 60);
  assert.deepEqual(result.trustDimensions.delivery, { code: 'on-time-ready-for-qc', valuePercent: 80, numerator: 8, denominator: 10 });
  assert.equal(result.trustDimensions.universalScoreUsed, false);
  assert.equal(result.score, undefined);
  assert.equal(result.lineage.supplierVersion, 7);
});

test('supplier passport makes expired qualification evidence visible without rewriting supplier state', async () => {
  const expired = Object.freeze({ ...supplier, auditExpiresAt: '2026-01-15T00:00:00.000Z' });
  const service = createSupplierPassportService({ reader: readerFor({ supplier: expired }), clock: () => '2026-10-06T12:00:00.000Z' });
  const result = await service.getSupplierPassportForActor('actor-1', 'SUP-01');
  assert.equal(result.supplier.status, 'qualified');
  assert.equal(result.qualification.auditState, 'expired');
  assert.equal(result.qualification.state, 'expired');
});

test('supplier passport route is read-only and OpenAPI-visible', async () => {
  const calls = [];
  const [route] = createSupplierPassportRoutes({ supplierPassport: {
    getSupplierPassportForActor(actorId, supplierCode) { calls.push([actorId, supplierCode]); return { schemaVersion: 'supplier-passport-v1' }; },
  } });
  assert.equal(route.method, 'GET');
  assert.equal(route.mutation, false);
  assert.ok(route.pattern.test('/v2/suppliers/SUP-01/passport'));
  assert.deepEqual(await route.execute({ actorId: 'actor-1', params: ['SUP-01'], query: {} }), { schemaVersion: 'supplier-passport-v1' });
  assert.deepEqual(calls, [['actor-1','SUP-01']]);
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/suppliers/{supplierCode}/passport']?.get?.operationId, 'getSupplierPassport');
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplierPassport);
});
