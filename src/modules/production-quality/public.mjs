import { invariant } from '../../core/errors.mjs';

export const PRODUCTION_QUALITY_STATUSES = Object.freeze(['planned', 'in-inspection', 'rework-required', 'passed', 'rejected']);
export const QUALITY_ROUND_STATUSES = Object.freeze(['planned', 'in-inspection', 'rework-required', 'passed', 'rejected']);
export const DEFECT_CLASSIFICATIONS = Object.freeze(['critical', 'major', 'minor']);
export const QUALITY_POLICY_VERSION = 'syntha-aql-v1';
export const MAX_INSPECTION_ROUNDS = 3;

export function createProductionQualityCase({ id, execution, createdAt }) {
  invariant(execution?.status === 'ready-for-qc', 'PRODUCTION_QUALITY_EXECUTION_NOT_READY', 'Quality control requires a production execution ready for QC', { executionCode: execution?.executionCode, status: execution?.status });
  invariant(Array.isArray(execution.milestones) && execution.milestones.length === 6 && execution.milestones.every((milestone) => milestone.status === 'completed'), 'PRODUCTION_QUALITY_MILESTONES_INCOMPLETE', 'Every production milestone must be completed before quality control');
  const created = timestamp(createdAt, 'PRODUCTION_QUALITY_CREATED_AT_INVALID', 'Quality case creation time');
  const sampleSize = sampleSizeFor(execution.quantity);
  const firstRound = createRound({ round: 1, sampleSize, quantity: execution.quantity, createdAt: created });
  return freezeCase({
    id: required(id, 'PRODUCTION_QUALITY_ID_REQUIRED', 'Quality case id'),
    qualityCaseCode: `QC-${execution.executionCode}`,
    executionId: execution.id,
    executionCode: execution.executionCode,
    executionVersion: execution.version,
    productionOrderNumber: execution.productionOrderNumber,
    brandId: execution.brandId,
    supplierCode: execution.supplierCode,
    sku: execution.sku,
    quantity: execution.quantity,
    sourceSnapshot: Object.freeze({
      executionCode: execution.executionCode,
      executionVersion: execution.version,
      productionOrderNumber: execution.productionOrderNumber,
      supplierCode: execution.supplierCode,
      quantity: execution.quantity,
      readyForQcAt: execution.readyForQcAt,
      techPackCode: execution.sourceSnapshot.techPackCode,
      techPackVersion: execution.sourceSnapshot.techPackVersion,
    }),
    policyVersion: QUALITY_POLICY_VERSION,
    status: 'planned',
    version: 1,
    rounds: Object.freeze([firstRound]),
    passedAt: null,
    rejectedAt: null,
    shippingReleaseAt: null,
    createdAt: created,
    updatedAt: created,
  });
}

export function startQualityInspection(qualityCase, { actorId, startedAt }) {
  invariant(qualityCase?.status === 'planned', 'PRODUCTION_QUALITY_NOT_PLANNED', 'Only a planned quality inspection can start', { status: qualityCase?.status });
  const at = timestamp(startedAt, 'PRODUCTION_QUALITY_STARTED_AT_INVALID', 'Inspection start time');
  const index = currentRoundIndex(qualityCase);
  const round = qualityCase.rounds[index];
  invariant(round.status === 'planned', 'PRODUCTION_QUALITY_ROUND_NOT_PLANNED', 'Current quality round is not planned');
  const updatedRound = Object.freeze({ ...round, status: 'in-inspection', startedAt: at, startedBy: required(actorId, 'PRODUCTION_QUALITY_STARTED_BY_REQUIRED', 'Inspector') });
  return freezeCase({ ...replaceRound(qualityCase, index, updatedRound), status: 'in-inspection', version: qualityCase.version + 1, updatedAt: at });
}

export function recordQualityInspection(qualityCase, { actorId, inspectedQuantity, defects, completedAt }) {
  invariant(qualityCase?.status === 'in-inspection', 'PRODUCTION_QUALITY_NOT_IN_INSPECTION', 'Quality results can be recorded only during an active inspection', { status: qualityCase?.status });
  const index = currentRoundIndex(qualityCase);
  const round = qualityCase.rounds[index];
  invariant(round.status === 'in-inspection', 'PRODUCTION_QUALITY_ROUND_NOT_IN_INSPECTION', 'Current quality round is not in inspection');
  invariant(Number.isInteger(inspectedQuantity) && inspectedQuantity === round.sampleSize, 'PRODUCTION_QUALITY_SAMPLE_INCOMPLETE', 'Inspected quantity must equal the governed sample size', { expectedSampleSize: round.sampleSize, inspectedQuantity });
  const normalizedDefects = normalizeDefects(defects);
  const totals = defectTotals(normalizedDefects);
  const completed = timestamp(completedAt, 'PRODUCTION_QUALITY_COMPLETED_AT_INVALID', 'Inspection completion time');
  invariant(Date.parse(completed) >= Date.parse(round.startedAt), 'PRODUCTION_QUALITY_COMPLETED_BEFORE_START', 'Inspection cannot complete before it starts');
  const decision = decide({ totals, limits: round.limits, round: round.round });
  const updatedRound = Object.freeze({
    ...round,
    status: decision,
    inspectedQuantity,
    defects: Object.freeze(normalizedDefects),
    totals,
    decision,
    completedAt: completed,
    completedBy: required(actorId, 'PRODUCTION_QUALITY_COMPLETED_BY_REQUIRED', 'Inspector'),
  });
  const terminal = decision === 'passed' || decision === 'rejected';
  return freezeCase({
    ...replaceRound(qualityCase, index, updatedRound),
    status: decision,
    version: qualityCase.version + 1,
    passedAt: decision === 'passed' ? completed : null,
    rejectedAt: decision === 'rejected' ? completed : null,
    shippingReleaseAt: decision === 'passed' ? completed : null,
    updatedAt: completed,
    ...(terminal ? {} : { passedAt: null, rejectedAt: null, shippingReleaseAt: null }),
  });
}

export function submitQualityRework(qualityCase, { actorId, reference, notes, submittedAt }) {
  invariant(qualityCase?.status === 'rework-required', 'PRODUCTION_QUALITY_REWORK_NOT_REQUIRED', 'Rework can be submitted only when quality control requires it', { status: qualityCase?.status });
  const index = currentRoundIndex(qualityCase);
  const current = qualityCase.rounds[index];
  invariant(current.status === 'rework-required', 'PRODUCTION_QUALITY_ROUND_REWORK_NOT_REQUIRED', 'Current quality round does not require rework');
  invariant(current.round < MAX_INSPECTION_ROUNDS, 'PRODUCTION_QUALITY_MAX_ROUNDS_REACHED', 'Maximum quality inspection rounds reached');
  const at = timestamp(submittedAt, 'PRODUCTION_QUALITY_REWORK_AT_INVALID', 'Rework submission time');
  invariant(Date.parse(at) >= Date.parse(current.completedAt), 'PRODUCTION_QUALITY_REWORK_BEFORE_DECISION', 'Rework cannot be submitted before the inspection decision');
  const rework = Object.freeze({
    reference: text(reference, 2, 160, 'PRODUCTION_QUALITY_REWORK_REFERENCE_INVALID', 'Rework reference'),
    notes: text(notes, 5, 2000, 'PRODUCTION_QUALITY_REWORK_NOTES_INVALID', 'Rework notes'),
    submittedAt: at,
    submittedBy: required(actorId, 'PRODUCTION_QUALITY_REWORK_BY_REQUIRED', 'Rework submitter'),
  });
  const completedRound = Object.freeze({ ...current, rework });
  const nextSampleSize = Math.min(qualityCase.quantity, Math.max(current.sampleSize + 1, Math.ceil(current.sampleSize * 1.5)));
  const nextRound = createRound({ round: current.round + 1, sampleSize: nextSampleSize, quantity: qualityCase.quantity, createdAt: at });
  const rounds = qualityCase.rounds.map((round, position) => position === index ? completedRound : round);
  rounds.push(nextRound);
  return freezeCase({ ...qualityCase, rounds: Object.freeze(rounds), status: 'planned', version: qualityCase.version + 1, updatedAt: at });
}

export function assertProductionQualityVersion(qualityCase, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'PRODUCTION_QUALITY_EXPECTED_VERSION_INVALID', 'Expected quality case version is invalid');
  invariant(qualityCase?.version === expectedVersion, 'PRODUCTION_QUALITY_CONCURRENCY_CONFLICT', 'Quality case was changed by another operation', { qualityCaseCode: qualityCase?.qualityCaseCode, expectedVersion, actualVersion: qualityCase?.version });
}

export function sampleSizeFor(quantity) {
  invariant(Number.isInteger(quantity) && quantity >= 1, 'PRODUCTION_QUALITY_QUANTITY_INVALID', 'Production quantity is invalid');
  if (quantity <= 50) return Math.min(quantity, 8);
  if (quantity <= 150) return 20;
  if (quantity <= 500) return 32;
  if (quantity <= 1200) return 50;
  return 80;
}

function createRound({ round, sampleSize, quantity, createdAt }) {
  const limits = acceptanceLimits(sampleSize);
  return Object.freeze({
    round,
    status: 'planned',
    sampleSize: Math.min(quantity, sampleSize),
    limits,
    inspectedQuantity: null,
    defects: Object.freeze([]),
    totals: Object.freeze({ critical: 0, major: 0, minor: 0 }),
    decision: null,
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    rework: null,
    createdAt,
  });
}
function acceptanceLimits(sampleSize) {
  return Object.freeze({ critical: 0, major: Math.max(1, Math.floor(sampleSize * 0.03)), minor: Math.max(2, Math.floor(sampleSize * 0.08)) });
}
function decide({ totals, limits, round }) {
  if (totals.critical > limits.critical) return 'rejected';
  if (totals.major > limits.major || totals.minor > limits.minor) return round >= MAX_INSPECTION_ROUNDS ? 'rejected' : 'rework-required';
  return 'passed';
}
function normalizeDefects(value) {
  invariant(Array.isArray(value) && value.length <= 200, 'PRODUCTION_QUALITY_DEFECTS_INVALID', 'Quality defects must be an array with at most 200 entries');
  const seen = new Set();
  return value.map((defect, index) => {
    invariant(defect && typeof defect === 'object' && !Array.isArray(defect), 'PRODUCTION_QUALITY_DEFECT_INVALID', 'Quality defect is invalid', { index });
    const allowed = new Set(['defectCode', 'classification', 'quantity', 'description', 'evidenceReference']);
    const forbidden = Object.keys(defect).filter((field) => !allowed.has(field));
    invariant(forbidden.length === 0, 'PRODUCTION_QUALITY_DEFECT_FIELD_FORBIDDEN', 'Quality defect contains unsupported fields', { index, fields: forbidden });
    const defectCode = text(defect.defectCode, 2, 80, 'PRODUCTION_QUALITY_DEFECT_CODE_INVALID', 'Defect code');
    invariant(!seen.has(defectCode), 'PRODUCTION_QUALITY_DEFECT_DUPLICATE', 'Defect codes must be unique within an inspection round', { defectCode });
    seen.add(defectCode);
    invariant(DEFECT_CLASSIFICATIONS.includes(defect.classification), 'PRODUCTION_QUALITY_DEFECT_CLASS_INVALID', 'Defect classification is invalid', { classification: defect.classification });
    invariant(Number.isInteger(defect.quantity) && defect.quantity >= 1 && defect.quantity <= 1000000, 'PRODUCTION_QUALITY_DEFECT_QUANTITY_INVALID', 'Defect quantity is invalid');
    return Object.freeze({
      defectCode,
      classification: defect.classification,
      quantity: defect.quantity,
      description: text(defect.description, 3, 1000, 'PRODUCTION_QUALITY_DEFECT_DESCRIPTION_INVALID', 'Defect description'),
      evidenceReference: optional(defect.evidenceReference, 500, 'PRODUCTION_QUALITY_EVIDENCE_REFERENCE_INVALID', 'Evidence reference'),
    });
  });
}
function defectTotals(defects) {
  const totals = { critical: 0, major: 0, minor: 0 };
  for (const defect of defects) totals[defect.classification] += defect.quantity;
  return Object.freeze(totals);
}
function currentRoundIndex(qualityCase) { invariant(Array.isArray(qualityCase?.rounds) && qualityCase.rounds.length >= 1, 'PRODUCTION_QUALITY_ROUNDS_INVALID', 'Quality rounds are invalid'); return qualityCase.rounds.length - 1; }
function replaceRound(qualityCase, index, round) { const rounds = qualityCase.rounds.map((value, position) => position === index ? round : value); return { ...qualityCase, rounds: Object.freeze(rounds) }; }
function freezeCase(value) { invariant(PRODUCTION_QUALITY_STATUSES.includes(value.status), 'PRODUCTION_QUALITY_STATUS_INVALID', 'Quality case status is invalid'); invariant(Array.isArray(value.rounds) && value.rounds.length >= 1 && value.rounds.length <= MAX_INSPECTION_ROUNDS, 'PRODUCTION_QUALITY_ROUNDS_INVALID', 'Quality rounds are invalid'); return Object.freeze(value); }
function required(value, code, label) { return text(value, 1, 200, code, label); }
function text(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optional(value, max, code, label) { return value === null || value === undefined || value === '' ? null : text(value, 1, max, code, label); }
function timestamp(value, code, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
