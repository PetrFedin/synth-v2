import { invariant } from '../../core/errors.mjs';

// Which plan judges this lot, and why that one.
//
// Acceptance sampling answers a question the inspector should not have to answer from memory: for a
// lot of this size, how many pieces are inspected and at how many defects is the lot refused. The
// answer belongs to a standard the brand has adopted — in Russia ГОСТ Р ИСО 2859-1 — and the point
// of resolving it here rather than typing it into the run is that the record can then say which
// criterion was applied, which is the one thing an acceptance decision must be able to say.
//
// A lot that no row covers is refused rather than judged by the nearest row. "Nearest" is a guess,
// and a guess about how many defective garments may ship is not a thing to make quietly.

export const PLAN_SOURCES = Object.freeze(['standard', 'agreed']);

/**
 * Resolve the single plan covering a lot, from the rows a brand holds.
 */
export function resolveSamplingPlan({ plans, lotSize, standardCode, inspectionLevel, aql }) {
  const size = positiveInteger(lotSize, 'QUALITY_LOT_SIZE_INVALID', 'Lot size');
  const standard = requiredCode(standardCode, 2, 'QUALITY_SAMPLING_STANDARD_INVALID', 'Sampling standard code');
  // Inspection levels are named «I», «II», «III» and S-1..S-4, so one character is a real level and
  // the schema allows it; the domain was stricter than the schema, which is its own kind of bug.
  const level = requiredCode(inspectionLevel, 1, 'QUALITY_SAMPLING_LEVEL_INVALID', 'Inspection level');
  const limit = acceptedQualityLimit(aql);
  const candidates = list(plans).filter((plan) => plan
    && plan.standardCode === standard
    && plan.inspectionLevel === level
    && Number(plan.aql) === limit);
  invariant(candidates.length > 0, 'QUALITY_SAMPLING_PLAN_SET_MISSING',
    'No sampling plan set is loaded for this standard, level and AQL', { standardCode: standard, inspectionLevel: level, aql: limit });

  const covering = candidates.filter((plan) => size >= Number(plan.lotFrom) && size <= Number(plan.lotTo));
  invariant(covering.length > 0, 'QUALITY_SAMPLING_PLAN_NOT_FOUND',
    'No sampling plan covers a lot of this size', { standardCode: standard, inspectionLevel: level, aql: limit, lotSize: size });
  // The database keeps ranges of one plan set disjoint, so more than one covering row means the set
  // in hand did not come from there. Judging by whichever was read first would make the outcome
  // depend on row order.
  invariant(covering.length === 1, 'QUALITY_SAMPLING_PLAN_AMBIGUOUS',
    'More than one sampling plan covers a lot of this size', { standardCode: standard, inspectionLevel: level, aql: limit, lotSize: size });

  const plan = covering[0];
  const sampleSize = positiveInteger(plan.sampleSize, 'QUALITY_SAMPLE_SIZE_INVALID', 'Sample size');
  const acceptAt = nonNegativeInteger(plan.acceptAt, 'QUALITY_ACCEPT_NUMBER_INVALID', 'Acceptance number');
  const rejectAt = positiveInteger(plan.rejectAt, 'QUALITY_REJECT_NUMBER_INVALID', 'Rejection number');
  invariant(rejectAt === acceptAt + 1, 'QUALITY_SAMPLING_PLAN_UNDECIDABLE',
    'Single sampling leaves no gap between acceptance and rejection', { acceptAt, rejectAt });
  invariant(sampleSize <= size, 'QUALITY_SAMPLE_EXCEEDS_LOT',
    'Sample size cannot exceed the lot it is drawn from', { sampleSize, lotSize: size });

  return Object.freeze({
    source: 'standard',
    standardCode: standard,
    inspectionLevel: level,
    aql: limit,
    lotSize: size,
    lotFrom: Number(plan.lotFrom),
    lotTo: Number(plan.lotTo),
    sampleSize,
    acceptAt,
    rejectAt,
  });
}

/**
 * The plan a run is actually judged by.
 *
 * A brand does not inspect to one limit. It inspects to two — a tighter one for major defects and a
 * looser one for minor — and that is exactly the pair of thresholds a run already carries. Both are
 * resolved from the same standard and the same level, so the two limits are read off one table
 * rather than argued about separately.
 *
 * The two plans must agree on how many pieces are inspected, because there is one sample. In a
 * published table they always do: the sample size follows from the lot and the level, not from the
 * limit. If the rows in hand disagree, the set is wrong and the run is refused rather than run
 * against whichever sample size was read first.
 */
export function samplingPlanForRun({ plans, lotSize, standardCode, inspectionLevel, aqlMajor, aqlMinor }) {
  const major = resolveSamplingPlan({ plans, lotSize, standardCode, inspectionLevel, aql: aqlMajor });
  const minor = resolveSamplingPlan({ plans, lotSize, standardCode, inspectionLevel, aql: aqlMinor });
  invariant(major.sampleSize === minor.sampleSize, 'QUALITY_SAMPLING_PLAN_SAMPLE_MISMATCH',
    'One run draws one sample, so both limits must be read off the same sample size',
    { majorSampleSize: major.sampleSize, minorSampleSize: minor.sampleSize });
  invariant(major.acceptAt <= minor.acceptAt, 'QUALITY_SAMPLING_PLAN_LIMITS_INVERTED',
    'A major defect cannot be tolerated more readily than a minor one',
    { majorAcceptAt: major.acceptAt, minorAcceptAt: minor.acceptAt });
  return Object.freeze({
    source: 'standard',
    standardCode: major.standardCode,
    inspectionLevel: major.inspectionLevel,
    lotSize: major.lotSize,
    sampleSize: major.sampleSize,
    criticalTolerance: 0,
    aqlMajor: major.aql,
    aqlMinor: minor.aql,
    allowedMajorDefects: major.acceptAt,
    allowedMinorDefects: minor.acceptAt,
    rejectMajorAt: major.rejectAt,
    rejectMinorAt: minor.rejectAt,
  });
}

/**
 * A plan agreed with one factory rather than taken from a standard. It is allowed, and it is
 * recorded as agreed, so a reader can tell a bespoke arrangement from the published table.
 */
export function agreedSamplingPlan({ lotSize, sampleSize, acceptAt, note }) {
  const size = positiveInteger(lotSize, 'QUALITY_LOT_SIZE_INVALID', 'Lot size');
  const sample = positiveInteger(sampleSize, 'QUALITY_SAMPLE_SIZE_INVALID', 'Sample size');
  const accept = nonNegativeInteger(acceptAt, 'QUALITY_ACCEPT_NUMBER_INVALID', 'Acceptance number');
  invariant(sample <= size, 'QUALITY_SAMPLE_EXCEEDS_LOT', 'Sample size cannot exceed the lot it is drawn from', { sampleSize: sample, lotSize: size });
  invariant(accept < sample, 'QUALITY_ACCEPT_EXCEEDS_SAMPLE',
    'A lot accepted at as many defects as pieces inspected is not being inspected', { sampleSize: sample, acceptAt: accept });
  return Object.freeze({
    source: 'agreed',
    standardCode: null,
    inspectionLevel: null,
    aql: null,
    lotSize: size,
    lotFrom: size,
    lotTo: size,
    sampleSize: sample,
    acceptAt: accept,
    rejectAt: accept + 1,
    note: optionalText(note, 400, 'QUALITY_SAMPLING_NOTE_INVALID', 'Sampling plan note'),
  });
}

function list(value) { return Array.isArray(value) ? value : []; }

function acceptedQualityLimit(value) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0 && number <= 100, 'QUALITY_AQL_INVALID', 'Accepted quality limit must be a positive percentage', { aql: value });
  const scaled = Math.round(number * 1000);
  invariant(Math.abs(number * 1000 - scaled) < 1e-6, 'QUALITY_AQL_INVALID', 'Accepted quality limit must use at most three decimal places', { aql: value });
  return scaled / 1000;
}

function requiredCode(value, minimum, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= 64, code, `${label} is required`);
  return value.trim();
}

function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer`, { value });
  return Number(value);
}

function nonNegativeInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 0, code, `${label} must be a non-negative integer`, { value });
  return Number(value);
}

function optionalText(value, maximum, code, label) {
  if (value === undefined || value === null || value === '') return null;
  invariant(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= maximum, code, `${label} is invalid`);
  return value.trim();
}
