import { invariant } from '../../core/errors.mjs';

export const QUALITY_INSPECTION_STATUSES = Object.freeze([
  'planned',
  'in-progress',
  'review-pending',
  'rework-required',
  'released',
  'rejected',
  'cancelled',
]);
export const QUALITY_RECOMMENDATIONS = Object.freeze(['pass', 'rework', 'reject']);
export const QUALITY_DECISIONS = Object.freeze(['release', 'rework', 'reject']);
export const QUALITY_DEFECT_SEVERITIES = Object.freeze(['critical', 'major', 'minor']);
export const QUALITY_CHECKPOINT_RESULTS = Object.freeze(['pass', 'fail', 'not-applicable']);

export function createQualityInspection({ id, execution, createdAt }) {
  invariant(execution?.status === 'ready-for-qc', 'QUALITY_EXECUTION_NOT_READY', 'Final Quality requires a ready-for-QC production execution', { executionCode: execution?.executionCode, status: execution?.status });
  invariant(Array.isArray(execution.milestones) && execution.milestones.length > 0 && execution.milestones.every((milestone) => milestone.status === 'completed'), 'QUALITY_EXECUTION_MILESTONES_INCOMPLETE', 'All production milestones must be completed before Final Quality');
  const created = timestamp(createdAt, 'QUALITY_INSPECTION_CREATED_AT_INVALID', 'Final Quality creation time');
  const quantity = positiveInteger(execution.quantity, 'QUALITY_INSPECTION_QUANTITY_INVALID', 'Production quantity');
  return freezeInspection({
    id: required(id, 'QUALITY_INSPECTION_ID_REQUIRED', 'Final Quality inspection id', 200),
    inspectionCode: `QCI-${required(execution.productionOrderNumber, 'QUALITY_PRODUCTION_ORDER_REQUIRED', 'Production Order number', 120)}`,
    executionId: required(execution.id, 'QUALITY_EXECUTION_ID_REQUIRED', 'Production execution id', 200),
    executionCode: required(execution.executionCode, 'QUALITY_EXECUTION_CODE_REQUIRED', 'Production execution code', 160),
    executionVersion: positiveInteger(execution.version, 'QUALITY_EXECUTION_VERSION_INVALID', 'Production execution version'),
    productionOrderNumber: execution.productionOrderNumber,
    productionOrderVersion: positiveInteger(execution.productionOrderVersion, 'QUALITY_PRODUCTION_ORDER_VERSION_INVALID', 'Production Order version'),
    brandId: required(execution.brandId, 'QUALITY_BRAND_REQUIRED', 'Brand id', 200),
    supplierCode: required(execution.supplierCode, 'QUALITY_SUPPLIER_REQUIRED', 'Supplier code', 160),
    sku: required(execution.sku, 'QUALITY_SKU_REQUIRED', 'SKU', 160),
    quantity,
    sourceSnapshot: Object.freeze({
      executionCode: execution.executionCode,
      executionVersion: execution.version,
      productionOrderNumber: execution.productionOrderNumber,
      productionOrderVersion: execution.productionOrderVersion,
      supplierCode: execution.supplierCode,
      quantity,
      techPackCode: required(execution.sourceSnapshot?.techPackCode, 'QUALITY_TECH_PACK_REQUIRED', 'Tech Pack code', 160),
      techPackVersion: positiveInteger(execution.sourceSnapshot?.techPackVersion, 'QUALITY_TECH_PACK_VERSION_INVALID', 'Tech Pack version'),
      readyForQcAt: timestamp(execution.readyForQcAt, 'QUALITY_READY_FOR_QC_AT_INVALID', 'Ready-for-QC time'),
    }),
    status: 'planned',
    version: 1,
    currentRun: 0,
    runs: Object.freeze([]),
    shipmentRelease: null,
    rejection: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: created,
    updatedAt: created,
  });
}

export function startQualityInspection(inspection, input) {
  invariant(inspection?.status === 'planned', 'QUALITY_INSPECTION_NOT_PLANNED', 'Only a planned Final Quality inspection can start', { status: inspection?.status });
  return appendRun(inspection, { ...input, runNumber: 1, reworkReference: null, resolutionNotes: null });
}

export function startQualityReinspection(inspection, input) {
  invariant(inspection?.status === 'rework-required', 'QUALITY_REINSPECTION_NOT_ALLOWED', 'Reinspection requires an approved rework disposition', { status: inspection?.status });
  const previous = inspection.runs.at(-1);
  invariant(previous?.status === 'reviewed' && previous.disposition === 'rework', 'QUALITY_REWORK_DISPOSITION_REQUIRED', 'Previous inspection run must be reviewed for rework');
  return appendRun(inspection, {
    ...input,
    runNumber: inspection.currentRun + 1,
    reworkReference: text(input.reworkReference, 2, 120, 'QUALITY_REWORK_REFERENCE_INVALID', 'Rework reference'),
    resolutionNotes: text(input.resolutionNotes, 5, 2000, 'QUALITY_REWORK_RESOLUTION_INVALID', 'Rework resolution notes'),
  });
}

export function completeQualityInspectionRun(inspection, input) {
  invariant(inspection?.status === 'in-progress', 'QUALITY_INSPECTION_NOT_IN_PROGRESS', 'Only an in-progress Final Quality inspection can be completed', { status: inspection?.status });
  const run = inspection.runs.at(-1);
  invariant(run?.status === 'in-progress' && run.runNumber === inspection.currentRun, 'QUALITY_CURRENT_RUN_INVALID', 'Current Final Quality run is invalid');
  const inspectedQuantity = positiveInteger(input.inspectedQuantity, 'QUALITY_INSPECTED_QUANTITY_INVALID', 'Inspected quantity');
  invariant(inspectedQuantity === run.samplingPlan.sampleSize, 'QUALITY_SAMPLE_NOT_COMPLETED', 'The full approved sample must be inspected', { sampleSize: run.samplingPlan.sampleSize, inspectedQuantity });
  const defects = normalizeDefects(input.defects);
  const measurements = normalizeMeasurementFailures(input.measurementFailures);
  const checkpoints = normalizeCheckpointResults(input.checkpoints);
  const evidenceReferences = normalizeReferences(input.evidenceReferences, 'QUALITY_EVIDENCE_REFERENCES_INVALID');
  const completedAt = timestamp(input.completedAt, 'QUALITY_INSPECTION_COMPLETED_AT_INVALID', 'Inspection completion time');
  invariant(Date.parse(completedAt) >= Date.parse(run.startedAt), 'QUALITY_INSPECTION_COMPLETED_BEFORE_START', 'Inspection cannot complete before it starts');
  const counts = defectCounts(defects, measurements, checkpoints);
  const recommendation = counts.critical > 0
    ? 'reject'
    : counts.major > run.samplingPlan.allowedMajorDefects || counts.minor > run.samplingPlan.allowedMinorDefects
      ? 'rework'
      : 'pass';
  const completedRun = Object.freeze({
    ...run,
    status: 'completed',
    inspectedQuantity,
    defects,
    measurementFailures: measurements,
    checkpoints,
    evidenceReferences,
    defectCounts: counts,
    recommendation,
    completionNotes: optional(input.notes, 2000, 'QUALITY_COMPLETION_NOTES_INVALID', 'Inspection completion notes'),
    completedAt,
    completedBy: required(input.actorId, 'QUALITY_COMPLETED_BY_REQUIRED', 'Inspection completer', 200),
  });
  return freezeInspection({
    ...inspection,
    status: 'review-pending',
    version: inspection.version + 1,
    runs: replaceLast(inspection.runs, completedRun),
    updatedAt: completedAt,
  });
}

export function reviewQualityInspection(inspection, input) {
  invariant(inspection?.status === 'review-pending', 'QUALITY_REVIEW_NOT_PENDING', 'Final Quality review is not pending', { status: inspection?.status });
  const run = inspection.runs.at(-1);
  invariant(run?.status === 'completed' && QUALITY_RECOMMENDATIONS.includes(run.recommendation), 'QUALITY_RUN_NOT_REVIEWABLE', 'Current Final Quality run is not reviewable');
  const decision = enumValue(input.decision, QUALITY_DECISIONS, 'QUALITY_DECISION_INVALID', 'Final Quality decision');
  assertDecisionNotMoreLenient(run.recommendation, decision);
  const reviewedAt = timestamp(input.reviewedAt, 'QUALITY_REVIEWED_AT_INVALID', 'Final Quality review time');
  invariant(Date.parse(reviewedAt) >= Date.parse(run.completedAt), 'QUALITY_REVIEW_BEFORE_COMPLETION', 'Final Quality review cannot precede run completion');
  const reviewedBy = required(input.actorId, 'QUALITY_REVIEWED_BY_REQUIRED', 'Final Quality reviewer', 200);
  const reviewNotes = text(input.notes, 5, 2000, 'QUALITY_REVIEW_NOTES_INVALID', 'Final Quality review notes');
  const reviewedRun = Object.freeze({ ...run, status: 'reviewed', disposition: decision, reviewedAt, reviewedBy, reviewNotes });
  const next = {
    ...inspection,
    version: inspection.version + 1,
    runs: replaceLast(inspection.runs, reviewedRun),
    updatedAt: reviewedAt,
  };
  if (decision === 'release') {
    const releaseCode = text(input.releaseCode, 3, 120, 'QUALITY_RELEASE_CODE_INVALID', 'Shipment release code');
    return freezeInspection({
      ...next,
      status: 'released',
      shipmentRelease: Object.freeze({
        releaseCode,
        inspectionCode: inspection.inspectionCode,
        inspectionVersion: next.version,
        executionCode: inspection.executionCode,
        productionOrderNumber: inspection.productionOrderNumber,
        supplierCode: inspection.supplierCode,
        sku: inspection.sku,
        quantity: inspection.quantity,
        runNumber: inspection.currentRun,
        releasedAt: reviewedAt,
        releasedBy: reviewedBy,
        notes: reviewNotes,
      }),
      rejection: null,
    });
  }
  if (decision === 'reject') {
    return freezeInspection({
      ...next,
      status: 'rejected',
      rejection: Object.freeze({ runNumber: inspection.currentRun, rejectedAt: reviewedAt, rejectedBy: reviewedBy, notes: reviewNotes }),
      shipmentRelease: null,
    });
  }
  return freezeInspection({ ...next, status: 'rework-required', shipmentRelease: null, rejection: null });
}

export function cancelQualityInspection(inspection, input) {
  invariant(['planned', 'rework-required'].includes(inspection?.status), 'QUALITY_INSPECTION_NOT_CANCELLABLE', 'Only a planned or rework-pending Final Quality inspection can be cancelled', { status: inspection?.status });
  const cancelledAt = timestamp(input.cancelledAt, 'QUALITY_CANCELLED_AT_INVALID', 'Final Quality cancellation time');
  return freezeInspection({
    ...inspection,
    status: 'cancelled',
    version: inspection.version + 1,
    cancelledAt,
    cancelledBy: required(input.actorId, 'QUALITY_CANCELLED_BY_REQUIRED', 'Final Quality canceller', 200),
    cancellationReason: text(input.reason, 5, 1000, 'QUALITY_CANCELLATION_REASON_INVALID', 'Final Quality cancellation reason'),
    updatedAt: cancelledAt,
  });
}

export function assertQualityInspectionVersion(inspection, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'QUALITY_EXPECTED_VERSION_INVALID', 'Expected Final Quality version is invalid');
  invariant(inspection?.version === expectedVersion, 'QUALITY_CONCURRENCY_CONFLICT', 'Final Quality inspection was changed by another operation', { inspectionCode: inspection?.inspectionCode, expectedVersion, actualVersion: inspection?.version });
}

function appendRun(inspection, input) {
  const startedAt = timestamp(input.startedAt, 'QUALITY_INSPECTION_STARTED_AT_INVALID', 'Inspection start time');
  invariant(Date.parse(startedAt) >= Date.parse(inspection.sourceSnapshot.readyForQcAt), 'QUALITY_INSPECTION_BEFORE_READY', 'Final Quality cannot start before production is ready for QC');
  const sampleSize = positiveInteger(input.sampleSize, 'QUALITY_SAMPLE_SIZE_INVALID', 'Sample size');
  invariant(sampleSize <= inspection.quantity, 'QUALITY_SAMPLE_EXCEEDS_LOT', 'Sample size cannot exceed production quantity', { sampleSize, quantity: inspection.quantity });
  const run = Object.freeze({
    runNumber: positiveInteger(input.runNumber, 'QUALITY_RUN_NUMBER_INVALID', 'Inspection run number'),
    status: 'in-progress',
    inspectorId: required(input.actorId, 'QUALITY_INSPECTOR_ID_REQUIRED', 'Inspector id', 200),
    inspectorName: text(input.inspectorName, 2, 160, 'QUALITY_INSPECTOR_NAME_INVALID', 'Inspector name'),
    samplingPlan: Object.freeze({
      sampleSize,
      allowedMajorDefects: nonNegativeInteger(input.allowedMajorDefects, 'QUALITY_ALLOWED_MAJOR_INVALID', 'Allowed major defects'),
      allowedMinorDefects: nonNegativeInteger(input.allowedMinorDefects, 'QUALITY_ALLOWED_MINOR_INVALID', 'Allowed minor defects'),
      criticalTolerance: 0,
    }),
    reworkReference: input.reworkReference ?? null,
    resolutionNotes: input.resolutionNotes ?? null,
    startedAt,
    inspectedQuantity: null,
    defects: Object.freeze([]),
    measurementFailures: Object.freeze([]),
    checkpoints: Object.freeze([]),
    evidenceReferences: Object.freeze([]),
    defectCounts: null,
    recommendation: null,
    completionNotes: null,
    completedAt: null,
    completedBy: null,
    disposition: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewNotes: null,
  });
  return freezeInspection({
    ...inspection,
    status: 'in-progress',
    version: inspection.version + 1,
    currentRun: run.runNumber,
    runs: Object.freeze([...inspection.runs, run]),
    updatedAt: startedAt,
  });
}

function normalizeDefects(value) {
  invariant(Array.isArray(value) && value.length <= 500, 'QUALITY_DEFECTS_INVALID', 'Defects must be an array with at most 500 records');
  const codes = new Set();
  return Object.freeze(value.map((defect, index) => {
    invariant(defect && typeof defect === 'object' && !Array.isArray(defect), 'QUALITY_DEFECT_INVALID', 'Defect record is invalid', { index });
    const defectCode = text(defect.defectCode, 2, 80, 'QUALITY_DEFECT_CODE_INVALID', 'Defect code');
    invariant(!codes.has(defectCode), 'QUALITY_DEFECT_CODE_DUPLICATE', 'Defect codes must be unique within a run', { defectCode });
    codes.add(defectCode);
    return Object.freeze({
      defectCode,
      severity: enumValue(defect.severity, QUALITY_DEFECT_SEVERITIES, 'QUALITY_DEFECT_SEVERITY_INVALID', 'Defect severity'),
      category: text(defect.category, 2, 120, 'QUALITY_DEFECT_CATEGORY_INVALID', 'Defect category'),
      description: text(defect.description, 3, 1000, 'QUALITY_DEFECT_DESCRIPTION_INVALID', 'Defect description'),
      quantity: positiveInteger(defect.quantity, 'QUALITY_DEFECT_QUANTITY_INVALID', 'Defect quantity'),
      evidenceReferences: normalizeReferences(defect.evidenceReferences ?? [], 'QUALITY_DEFECT_EVIDENCE_INVALID'),
    });
  }));
}

function normalizeMeasurementFailures(value) {
  invariant(Array.isArray(value) && value.length <= 500, 'QUALITY_MEASUREMENT_FAILURES_INVALID', 'Measurement failures must be an array with at most 500 records');
  const keys = new Set();
  return Object.freeze(value.map((failure, index) => {
    invariant(failure && typeof failure === 'object' && !Array.isArray(failure), 'QUALITY_MEASUREMENT_FAILURE_INVALID', 'Measurement failure is invalid', { index });
    const pointCode = text(failure.pointCode, 1, 80, 'QUALITY_POINT_CODE_INVALID', 'Measurement point code');
    const sizeCode = text(failure.sizeCode, 1, 40, 'QUALITY_SIZE_CODE_INVALID', 'Size code');
    const key = `${pointCode}:${sizeCode}`;
    invariant(!keys.has(key), 'QUALITY_MEASUREMENT_FAILURE_DUPLICATE', 'Measurement failure keys must be unique', { pointCode, sizeCode });
    keys.add(key);
    const measuredValue = finiteNumber(failure.measuredValue, 'QUALITY_MEASURED_VALUE_INVALID', 'Measured value');
    const lowerLimit = finiteNumber(failure.lowerLimit, 'QUALITY_LOWER_LIMIT_INVALID', 'Lower limit');
    const upperLimit = finiteNumber(failure.upperLimit, 'QUALITY_UPPER_LIMIT_INVALID', 'Upper limit');
    invariant(lowerLimit <= upperLimit, 'QUALITY_MEASUREMENT_LIMITS_INVALID', 'Measurement limits are invalid');
    invariant(measuredValue < lowerLimit || measuredValue > upperLimit, 'QUALITY_MEASUREMENT_WITHIN_LIMITS', 'Only out-of-tolerance measurements may be recorded as failures', { pointCode, sizeCode });
    return Object.freeze({ pointCode, sizeCode, measuredValue, lowerLimit, upperLimit });
  }));
}

function normalizeCheckpointResults(value) {
  invariant(Array.isArray(value) && value.length >= 1 && value.length <= 300, 'QUALITY_CHECKPOINTS_INVALID', 'Inspection checkpoints must contain 1 to 300 records');
  const codes = new Set();
  return Object.freeze(value.map((checkpoint, index) => {
    invariant(checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint), 'QUALITY_CHECKPOINT_INVALID', 'Inspection checkpoint is invalid', { index });
    const checkpointCode = text(checkpoint.checkpointCode, 2, 80, 'QUALITY_CHECKPOINT_CODE_INVALID', 'Checkpoint code');
    invariant(!codes.has(checkpointCode), 'QUALITY_CHECKPOINT_DUPLICATE', 'Checkpoint codes must be unique', { checkpointCode });
    codes.add(checkpointCode);
    const result = enumValue(checkpoint.result, QUALITY_CHECKPOINT_RESULTS, 'QUALITY_CHECKPOINT_RESULT_INVALID', 'Checkpoint result');
    const severity = result === 'fail'
      ? enumValue(checkpoint.severity, QUALITY_DEFECT_SEVERITIES, 'QUALITY_CHECKPOINT_SEVERITY_INVALID', 'Failed checkpoint severity')
      : null;
    return Object.freeze({
      checkpointCode,
      name: text(checkpoint.name, 2, 160, 'QUALITY_CHECKPOINT_NAME_INVALID', 'Checkpoint name'),
      result,
      severity,
      notes: optional(checkpoint.notes, 1000, 'QUALITY_CHECKPOINT_NOTES_INVALID', 'Checkpoint notes'),
    });
  }));
}

function defectCounts(defects, measurements, checkpoints) {
  const counts = { critical: 0, major: measurements.length, minor: 0 };
  for (const defect of defects) counts[defect.severity] += defect.quantity;
  for (const checkpoint of checkpoints) if (checkpoint.result === 'fail') counts[checkpoint.severity] += 1;
  return Object.freeze(counts);
}

function assertDecisionNotMoreLenient(recommendation, decision) {
  const allowed = recommendation === 'pass' ? ['release', 'rework', 'reject'] : recommendation === 'rework' ? ['rework', 'reject'] : ['reject'];
  invariant(allowed.includes(decision), 'QUALITY_DECISION_TOO_LENIENT', 'Final Quality decision cannot be more lenient than the computed recommendation', { recommendation, decision, allowed });
}

function normalizeReferences(value, code) {
  invariant(Array.isArray(value) && value.length <= 100, code, 'Evidence references must be an array with at most 100 items');
  const references = value.map((item) => text(item, 2, 500, code, 'Evidence reference'));
  invariant(new Set(references).size === references.length, code, 'Evidence references must be unique');
  return Object.freeze(references);
}
function replaceLast(values, value) { return Object.freeze([...values.slice(0, -1), value]); }
function freezeInspection(value) { invariant(QUALITY_INSPECTION_STATUSES.includes(value.status), 'QUALITY_STATUS_INVALID', 'Final Quality status is invalid'); return deepFreeze(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
function enumValue(value, allowed, code, label) { invariant(allowed.includes(value), code, `${label} is invalid`, { value, allowed }); return value; }
function required(value, code, label, max) { return text(value, 1, max, code, label); }
function text(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optional(value, max, code, label) { return value === null || value === undefined || value === '' ? null : text(value, 1, max, code, label); }
function positiveInteger(value, code, label) { invariant(Number.isSafeInteger(value) && value >= 1, code, `${label} must be a positive integer`); return value; }
function nonNegativeInteger(value, code, label) { invariant(Number.isSafeInteger(value) && value >= 0, code, `${label} must be a non-negative integer`); return value; }
function finiteNumber(value, code, label) { invariant(typeof value === 'number' && Number.isFinite(value), code, `${label} must be a finite number`); return value; }
function timestamp(value, code, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
