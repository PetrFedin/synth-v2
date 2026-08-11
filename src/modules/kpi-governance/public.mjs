export const KPI_DATA_STATES = Object.freeze({
  VALUE: 'VALUE',
  ZERO: 'ZERO',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  MISSING: 'MISSING',
  INVALID: 'INVALID',
});

export function calculateRatio({
  numerator,
  denominator,
  subset = false,
  allowNegativeNumerator = true,
} = {}) {
  if (isMissing(numerator) || isMissing(denominator)) {
    return kpiResult(KPI_DATA_STATES.MISSING, null, ['required ratio input is missing']);
  }
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['ratio inputs must be finite numbers']);
  }
  if (denominator < 0) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['ratio denominator must not be negative']);
  }
  if (denominator === 0) {
    if (numerator === 0) return kpiResult(KPI_DATA_STATES.NOT_APPLICABLE, null, ['zero numerator and zero exposure']);
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['non-zero numerator with zero exposure']);
  }
  if (!allowNegativeNumerator && numerator < 0) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['negative numerator is not allowed by this ratio contract']);
  }
  if (subset && (numerator < 0 || numerator > denominator)) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['true subset numerator must be between zero and denominator']);
  }
  const value = numerator / denominator;
  return kpiResult(value === 0 ? KPI_DATA_STATES.ZERO : KPI_DATA_STATES.VALUE, value);
}

export function calculateTrueSubsetShare({ numerator, denominator } = {}) {
  return calculateRatio({ numerator, denominator, subset: true, allowNegativeNumerator: false });
}

export function calculateUnitRate({ amount, units } = {}) {
  return calculateRatio({ numerator: amount, denominator: units, subset: false, allowNegativeNumerator: true });
}

export function calculateNormalizedEventRate({ events, exposure, normalizerK } = {}) {
  if (isMissing(normalizerK)) {
    return kpiResult(KPI_DATA_STATES.MISSING, null, ['normalizer K is required']);
  }
  if (!Number.isFinite(normalizerK) || normalizerK <= 0) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['normalizer K must be a positive finite number']);
  }
  const ratio = calculateRatio({ numerator: events, denominator: exposure, subset: false, allowNegativeNumerator: false });
  if (!isPublishableValueState(ratio.state)) return ratio;
  const value = ratio.value * normalizerK;
  return kpiResult(value === 0 ? KPI_DATA_STATES.ZERO : KPI_DATA_STATES.VALUE, value, [], { normalizerK });
}

export function calculateContributionMarginRatio({
  contributionMarginAmount,
  netRevenue,
  sourcePercentagePoints = null,
  reconciliationTolerance = 1e-8,
} = {}) {
  const canonical = calculateRatio({
    numerator: contributionMarginAmount,
    denominator: netRevenue,
    subset: false,
    allowNegativeNumerator: true,
  });
  if (!isPublishableValueState(canonical.state)) return canonical;

  if (!isMissing(sourcePercentagePoints)) {
    if (!Number.isFinite(sourcePercentagePoints)) {
      return kpiResult(KPI_DATA_STATES.INVALID, null, ['source contribution margin percentage must be finite'], {
        calculatedCanonicalRatio: canonical.value,
      });
    }
    const sourceRatio = sourcePercentagePoints / 100;
    const difference = canonical.value - sourceRatio;
    if (Math.abs(difference) > reconciliationTolerance) {
      return kpiResult(KPI_DATA_STATES.INVALID, null, ['source percentage-points scale does not reconcile to canonical decimal ratio'], {
        calculatedCanonicalRatio: canonical.value,
        sourcePercentagePoints,
        sourceRatio,
        reconciliationDifference: difference,
        reconciliationTolerance,
      });
    }
    return kpiResult(canonical.state, canonical.value, [], {
      sourcePercentagePoints,
      sourceRatio,
      reconciliationDifference: difference,
      reconciliationTolerance,
    });
  }

  return canonical;
}

export function calculateReceiptDispositionRates({
  receivedQuantity,
  acceptedQuantity,
  damagedQuantity,
  rejectedQuantity,
} = {}) {
  const values = { receivedQuantity, acceptedQuantity, damagedQuantity, rejectedQuantity };
  if (Object.values(values).some(isMissing)) {
    return Object.freeze({
      state: KPI_DATA_STATES.MISSING,
      rates: null,
      issues: Object.freeze(['receipt disposition requires received, accepted, damaged and rejected quantities']),
    });
  }
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
    return Object.freeze({
      state: KPI_DATA_STATES.INVALID,
      rates: null,
      issues: Object.freeze(['receipt disposition quantities must be non-negative finite numbers']),
    });
  }
  if (acceptedQuantity + damagedQuantity + rejectedQuantity !== receivedQuantity) {
    return Object.freeze({
      state: KPI_DATA_STATES.INVALID,
      rates: null,
      issues: Object.freeze(['accepted + damaged + rejected must equal received']),
      quantities: Object.freeze({ ...values }),
    });
  }
  if (receivedQuantity === 0) {
    return Object.freeze({
      state: KPI_DATA_STATES.NOT_APPLICABLE,
      rates: null,
      issues: Object.freeze(['zero received exposure']),
      quantities: Object.freeze({ ...values }),
    });
  }

  const rates = Object.freeze({
    acceptanceRate: acceptedQuantity / receivedQuantity,
    damageRate: damagedQuantity / receivedQuantity,
    rejectionRate: rejectedQuantity / receivedQuantity,
  });
  return Object.freeze({
    state: rates.acceptanceRate === 0 && rates.damageRate === 0 && rates.rejectionRate === 0
      ? KPI_DATA_STATES.ZERO
      : KPI_DATA_STATES.VALUE,
    rates,
    quantities: Object.freeze({ ...values }),
    issues: Object.freeze([]),
  });
}

export function calculateFinalizedShortageRatio({ shippedQuantity, receivedQuantity, finalized } = {}) {
  if (isMissing(finalized)) return kpiResult(KPI_DATA_STATES.MISSING, null, ['finalization state is missing']);
  if (finalized !== true && finalized !== false) return kpiResult(KPI_DATA_STATES.INVALID, null, ['finalized must be boolean']);
  if (!finalized) return kpiResult(KPI_DATA_STATES.NOT_APPLICABLE, null, ['shortage is not final before receipt sequence finalization']);
  if (isMissing(shippedQuantity) || isMissing(receivedQuantity)) return kpiResult(KPI_DATA_STATES.MISSING, null, ['shipment/receipt quantities are missing']);
  if (!Number.isFinite(shippedQuantity) || shippedQuantity <= 0 || !Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['shipped must be positive and received must be non-negative']);
  }
  const shortageQuantity = Math.max(shippedQuantity - receivedQuantity, 0);
  const value = shortageQuantity / shippedQuantity;
  return kpiResult(value === 0 ? KPI_DATA_STATES.ZERO : KPI_DATA_STATES.VALUE, value, [], { shortageQuantity });
}

export function calculateOverageRatio({ shippedQuantity, receivedQuantity } = {}) {
  if (isMissing(shippedQuantity) || isMissing(receivedQuantity)) return kpiResult(KPI_DATA_STATES.MISSING, null, ['shipment/receipt quantities are missing']);
  if (!Number.isFinite(shippedQuantity) || shippedQuantity <= 0 || !Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
    return kpiResult(KPI_DATA_STATES.INVALID, null, ['shipped must be positive and received must be non-negative']);
  }
  const overageQuantity = Math.max(receivedQuantity - shippedQuantity, 0);
  const value = overageQuantity / shippedQuantity;
  return kpiResult(value === 0 ? KPI_DATA_STATES.ZERO : KPI_DATA_STATES.VALUE, value, [], { overageQuantity });
}

export function calculateOnTimeFinalReceiptRate({
  shipments,
  periodStart,
  periodEnd,
  asOfTimestamp = periodEnd,
} = {}) {
  if (!Array.isArray(shipments)) {
    return dueCohortResult(KPI_DATA_STATES.INVALID, null, ['shipments must be an array']);
  }
  const start = parseTimestamp(periodStart);
  const end = parseTimestamp(periodEnd);
  const asOf = parseTimestamp(asOfTimestamp);
  if (start === null || end === null || asOf === null || end <= start) {
    return dueCohortResult(KPI_DATA_STATES.INVALID, null, ['periodStart, periodEnd and asOfTimestamp must form a valid time window']);
  }

  const effectiveEnd = Math.min(end, asOf);
  if (effectiveEnd <= start) return dueCohortResult(KPI_DATA_STATES.NOT_APPLICABLE, null, ['no deadlines are due yet in the requested window']);

  const seen = new Set();
  let dueCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let openOverdueCount = 0;

  for (const shipment of shipments) {
    const id = shipment?.id;
    if (typeof id !== 'string' || id.length === 0) return dueCohortResult(KPI_DATA_STATES.INVALID, null, ['every shipment requires a stable id']);
    if (seen.has(id)) return dueCohortResult(KPI_DATA_STATES.INVALID, null, [`duplicate shipment id ${id}`]);
    seen.add(id);

    const dueAt = parseTimestamp(shipment.expectedDeliveryAt);
    if (dueAt === null) return dueCohortResult(KPI_DATA_STATES.INVALID, null, [`shipment ${id} has invalid expectedDeliveryAt`]);
    if (dueAt < start || dueAt >= effectiveEnd) continue;

    dueCount += 1;
    if (isMissing(shipment.finalReceivedAt)) {
      openOverdueCount += 1;
      continue;
    }
    const receivedAt = parseTimestamp(shipment.finalReceivedAt);
    if (receivedAt === null) return dueCohortResult(KPI_DATA_STATES.INVALID, null, [`shipment ${id} has invalid finalReceivedAt`]);
    if (receivedAt <= dueAt) onTimeCount += 1;
    else lateCount += 1;
  }

  if (dueCount === 0) return dueCohortResult(KPI_DATA_STATES.NOT_APPLICABLE, null, ['no shipments due in governed window']);
  const value = onTimeCount / dueCount;
  return dueCohortResult(value === 0 ? KPI_DATA_STATES.ZERO : KPI_DATA_STATES.VALUE, value, [], {
    dueCount,
    onTimeCount,
    lateCount,
    openOverdueCount,
    effectivePeriodEnd: new Date(effectiveEnd).toISOString(),
  });
}

export function reconcileIdentity({ observed, expected, tolerance = 0 } = {}) {
  if (isMissing(observed) || isMissing(expected)) return Object.freeze({ state: KPI_DATA_STATES.MISSING, pass: false, difference: null, issues: Object.freeze(['reconciliation input missing']) });
  if (!Number.isFinite(observed) || !Number.isFinite(expected) || !Number.isFinite(tolerance) || tolerance < 0) {
    return Object.freeze({ state: KPI_DATA_STATES.INVALID, pass: false, difference: null, issues: Object.freeze(['reconciliation inputs/tolerance must be finite and tolerance non-negative']) });
  }
  const difference = observed - expected;
  const pass = Math.abs(difference) <= tolerance;
  return Object.freeze({
    state: pass ? KPI_DATA_STATES.VALUE : KPI_DATA_STATES.INVALID,
    pass,
    difference,
    observed,
    expected,
    tolerance,
    issues: Object.freeze(pass ? [] : ['reconciliation outside tolerance']),
  });
}

function kpiResult(state, value, issues = [], metadata = {}) {
  return Object.freeze({ state, value, issues: Object.freeze([...issues]), ...metadata });
}

function dueCohortResult(state, value, issues = [], metadata = {}) {
  return Object.freeze({ state, value, issues: Object.freeze([...issues]), dueCount: 0, onTimeCount: 0, lateCount: 0, openOverdueCount: 0, ...metadata });
}

function isPublishableValueState(state) {
  return state === KPI_DATA_STATES.VALUE || state === KPI_DATA_STATES.ZERO;
}

function isMissing(value) {
  return value === undefined || value === null;
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
