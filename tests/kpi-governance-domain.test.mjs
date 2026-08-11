import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KPI_DATA_STATES,
  calculateContributionMarginRatio,
  calculateFinalizedShortageRatio,
  calculateNormalizedEventRate,
  calculateOnTimeFinalReceiptRate,
  calculateOverageRatio,
  calculateReceiptDispositionRates,
  calculateTrueSubsetShare,
  calculateUnitRate,
  reconcileIdentity,
} from '../src/modules/kpi-governance/public.mjs';

test('true subset share distinguishes zero, N/A and invalid states', () => {
  assert.deepEqual(calculateTrueSubsetShare({ numerator: 0, denominator: 100 }), {
    state: KPI_DATA_STATES.ZERO,
    value: 0,
    issues: [],
  });
  assert.equal(calculateTrueSubsetShare({ numerator: 0, denominator: 0 }).state, KPI_DATA_STATES.NOT_APPLICABLE);
  assert.equal(calculateTrueSubsetShare({ numerator: 5, denominator: 0 }).state, KPI_DATA_STATES.INVALID);
  assert.equal(calculateTrueSubsetShare({ numerator: 110, denominator: 100 }).state, KPI_DATA_STATES.INVALID);
});

test('normalized event rate keeps K separate from percentage semantics', () => {
  const result = calculateNormalizedEventRate({ events: 130, exposure: 100, normalizerK: 100 });
  assert.equal(result.state, KPI_DATA_STATES.VALUE);
  assert.equal(result.value, 130);
  assert.equal(result.normalizerK, 100);
});

test('unit rate is ratio of components and preserves signed amount', () => {
  assert.equal(calculateUnitRate({ amount: 1250, units: 50 }).value, 25);
  assert.equal(calculateUnitRate({ amount: -100, units: 20 }).value, -5);
});

test('contribution margin canonical ratio reconciles 0-100 source percentage-points scale', () => {
  const result = calculateContributionMarginRatio({
    contributionMarginAmount: 240,
    netRevenue: 1000,
    sourcePercentagePoints: 24,
  });
  assert.equal(result.state, KPI_DATA_STATES.VALUE);
  assert.equal(result.value, 0.24);
  assert.equal(result.sourceRatio, 0.24);
  assert.equal(result.reconciliationDifference, 0);
});

test('contribution margin rejects silent 100x source-scale mismatch', () => {
  const result = calculateContributionMarginRatio({
    contributionMarginAmount: 240,
    netRevenue: 1000,
    sourcePercentagePoints: 0.24,
  });
  assert.equal(result.state, KPI_DATA_STATES.INVALID);
  assert.equal(result.calculatedCanonicalRatio, 0.24);
});

test('receipt disposition identity produces acceptance, damage and rejection rates', () => {
  const result = calculateReceiptDispositionRates({
    receivedQuantity: 500,
    acceptedQuantity: 482,
    damagedQuantity: 9,
    rejectedQuantity: 9,
  });
  assert.equal(result.state, KPI_DATA_STATES.VALUE);
  assert.equal(result.rates.acceptanceRate, 0.964);
  assert.equal(result.rates.damageRate, 0.018);
  assert.equal(result.rates.rejectionRate, 0.018);
  assert.equal(result.rates.acceptanceRate + result.rates.damageRate + result.rates.rejectionRate, 1);
});

test('receipt disposition rejects non-reconciling quantities', () => {
  const result = calculateReceiptDispositionRates({
    receivedQuantity: 500,
    acceptedQuantity: 483,
    damagedQuantity: 9,
    rejectedQuantity: 9,
  });
  assert.equal(result.state, KPI_DATA_STATES.INVALID);
  assert.equal(result.rates, null);
});

test('shortage is not applicable before finalization and is calculated after finalization', () => {
  const interim = calculateFinalizedShortageRatio({ shippedQuantity: 1000, receivedQuantity: 970, finalized: false });
  assert.equal(interim.state, KPI_DATA_STATES.NOT_APPLICABLE);
  const final = calculateFinalizedShortageRatio({ shippedQuantity: 1000, receivedQuantity: 970, finalized: true });
  assert.equal(final.state, KPI_DATA_STATES.VALUE);
  assert.equal(final.shortageQuantity, 30);
  assert.equal(final.value, 0.03);
});

test('overage ratio is not silently capped at one', () => {
  const result = calculateOverageRatio({ shippedQuantity: 100, receivedQuantity: 220 });
  assert.equal(result.state, KPI_DATA_STATES.VALUE);
  assert.equal(result.overageQuantity, 120);
  assert.equal(result.value, 1.2);
});

test('due cohort keeps open overdue shipments in denominator', () => {
  const shipments = [];
  for (let index = 0; index < 7; index += 1) {
    shipments.push({
      id: `ontime-${index}`,
      expectedDeliveryAt: '2026-08-05T12:00:00.000Z',
      finalReceivedAt: '2026-08-05T10:00:00.000Z',
    });
  }
  shipments.push({
    id: 'late-1',
    expectedDeliveryAt: '2026-08-05T12:00:00.000Z',
    finalReceivedAt: '2026-08-06T10:00:00.000Z',
  });
  shipments.push({ id: 'open-1', expectedDeliveryAt: '2026-08-05T12:00:00.000Z', finalReceivedAt: null });
  shipments.push({ id: 'open-2', expectedDeliveryAt: '2026-08-05T12:00:00.000Z', finalReceivedAt: null });

  const result = calculateOnTimeFinalReceiptRate({
    shipments,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-08T00:00:00.000Z',
    asOfTimestamp: '2026-08-08T00:00:00.000Z',
  });
  assert.equal(result.state, KPI_DATA_STATES.VALUE);
  assert.equal(result.dueCount, 10);
  assert.equal(result.onTimeCount, 7);
  assert.equal(result.lateCount, 1);
  assert.equal(result.openOverdueCount, 2);
  assert.equal(result.value, 0.7);
});

test('due cohort excludes deadlines after as-of inside an open reporting period', () => {
  const result = calculateOnTimeFinalReceiptRate({
    shipments: [
      { id: 'due', expectedDeliveryAt: '2026-08-03T00:00:00.000Z', finalReceivedAt: null },
      { id: 'future', expectedDeliveryAt: '2026-08-20T00:00:00.000Z', finalReceivedAt: null },
    ],
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    asOfTimestamp: '2026-08-11T00:00:00.000Z',
  });
  assert.equal(result.dueCount, 1);
  assert.equal(result.openOverdueCount, 1);
  assert.equal(result.value, 0);
});

test('no due shipments returns not applicable instead of artificial 0 or 100 percent', () => {
  const result = calculateOnTimeFinalReceiptRate({
    shipments: [{ id: 'future', expectedDeliveryAt: '2026-09-01T00:00:00.000Z', finalReceivedAt: null }],
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-08T00:00:00.000Z',
  });
  assert.equal(result.state, KPI_DATA_STATES.NOT_APPLICABLE);
  assert.equal(result.value, null);
});

test('reconciliation identity supports hard and tolerance checks', () => {
  assert.equal(reconcileIdentity({ observed: 100, expected: 100 }).pass, true);
  assert.equal(reconcileIdentity({ observed: 100.0001, expected: 100, tolerance: 0.001 }).pass, true);
  const failed = reconcileIdentity({ observed: 100.01, expected: 100, tolerance: 0.001 });
  assert.equal(failed.pass, false);
  assert.equal(failed.state, KPI_DATA_STATES.INVALID);
});
