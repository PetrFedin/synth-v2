import { invariant } from '../../core/errors.mjs';

export const PRODUCTION_RUN_STATUSES = Object.freeze(['planned', 'in_progress', 'completed', 'cancelled']);
export const PRODUCTION_RISK_STATUSES = Object.freeze(['on_track', 'at_risk', 'delayed']);
export const PRODUCTION_MILESTONE_CODES = Object.freeze(['materials_ready', 'cutting', 'sewing', 'finishing', 'packing']);

const MAX_INTEGER = 2_147_483_647;
const RUN_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const EXCEPTION_SEVERITIES = Object.freeze(['warning', 'critical']);

export function createProductionRun({ id, productionRunCode, productionOrder, milestones, createdAt }) {
  assertConfirmedProductionOrder(productionOrder);
  const plannedMilestones = normalizePlan(milestones, productionOrder);
  const at = timestamp(createdAt, 'PRODUCTION_RUN_CREATED_AT_INVALID', 'Production Run creation time');
  return freezeRun({
    id: identifier(id, 'PRODUCTION_RUN_ID_REQUIRED', 'Production Run id'),
    productionRunCode: code(productionRunCode, 'PRODUCTION_RUN_CODE_INVALID', 'Production Run code'),
    productionOrderId: identifier(productionOrder.id, 'PRODUCTION_RUN_PO_ID_REQUIRED', 'Production Order id'),
    productionOrderNumber: code(productionOrder.productionOrderNumber, 'PRODUCTION_RUN_PO_NUMBER_INVALID', 'Production Order number'),
    productionOrderVersion: positiveInteger(productionOrder.version, 'PRODUCTION_RUN_PO_VERSION_INVALID', 'Production Order version'),
    brandId: identifier(productionOrder.brandId, 'PRODUCTION_RUN_BRAND_REQUIRED', 'Brand'),
    supplierCode: code(productionOrder.supplierCode, 'PRODUCTION_RUN_SUPPLIER_INVALID', 'Supplier code'),
    sku: identifier(productionOrder.sku, 'PRODUCTION_RUN_SKU_REQUIRED', 'SKU'),
    orderedQuantity: positiveInteger(productionOrder.quantity, 'PRODUCTION_RUN_QUANTITY_INVALID', 'Ordered quantity'),
    productionStartAt: timestamp(productionOrder.productionStartAt, 'PRODUCTION_RUN_START_INVALID', 'Production start'),
    deliveryDueAt: timestamp(productionOrder.deliveryDueAt, 'PRODUCTION_RUN_DELIVERY_INVALID', 'Delivery due date'),
    sourceSnapshot: Object.freeze({
      productionOrderNumber: productionOrder.productionOrderNumber,
      productionOrderVersion: productionOrder.version,
      supplierCode: productionOrder.supplierCode,
      sku: productionOrder.sku,
      orderedQuantity: productionOrder.quantity,
      techPackCode: productionOrder.techPackSnapshot.techPackCode,
      techPackRevision: productionOrder.techPackSnapshot.revision,
      techPackVersion: productionOrder.techPackSnapshot.version,
      techPackAcknowledgementReference: productionOrder.techPackSnapshot.acknowledgementReference,
    }),
    milestones: plannedMilestones,
    status: 'planned',
    riskStatus: 'on_track',
    version: 1,
    startedAt: null,
    startedBy: null,
    completedAt: null,
    completedBy: null,
    finalGoodQuantity: null,
    shortageReason: null,
    activeException: null,
    exceptionHistory: Object.freeze([]),
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: at,
    updatedAt: at,
  });
}

export function startProductionRun(run, { actorId, startedAt }) {
  invariant(run?.status === 'planned', 'PRODUCTION_RUN_NOT_PLANNED', 'Only a planned Production Run can start', { status: run?.status });
  const at = timestamp(startedAt, 'PRODUCTION_RUN_STARTED_AT_INVALID', 'Production Run start time');
  invariant(Date.parse(at) >= Date.parse(run.createdAt), 'PRODUCTION_RUN_START_BEFORE_CREATION', 'Production Run cannot start before it was created');
  return freezeRun({
    ...run,
    status: 'in_progress',
    version: run.version + 1,
    startedAt: at,
    startedBy: identifier(actorId, 'PRODUCTION_RUN_STARTED_BY_REQUIRED', 'Production Run starter'),
    riskStatus: Date.parse(at) > Date.parse(run.productionStartAt) ? 'delayed' : run.riskStatus,
    updatedAt: at,
  });
}

export function completeProductionMilestone(run, { milestoneCode, goodQuantity, rejectedQuantity, notes, actorId, completedAt }) {
  invariant(run?.status === 'in_progress', 'PRODUCTION_RUN_NOT_IN_PROGRESS', 'Milestones can be completed only while production is in progress', { status: run?.status });
  invariant(!run.activeException || run.activeException.severity !== 'critical', 'PRODUCTION_RUN_CRITICAL_EXCEPTION_OPEN', 'A critical production exception must be resolved before completing a milestone', { exceptionCode: run.activeException?.code });
  const nextIndex = run.milestones.findIndex((milestone) => milestone.actualAt === null);
  invariant(nextIndex >= 0, 'PRODUCTION_RUN_ALL_MILESTONES_COMPLETE', 'All Production Run milestones are already complete');
  const expected = run.milestones[nextIndex];
  invariant(milestoneCode === expected.code, 'PRODUCTION_RUN_MILESTONE_OUT_OF_SEQUENCE', 'Production milestones must be completed in sequence', { expectedMilestoneCode: expected.code, actualMilestoneCode: milestoneCode });
  const at = timestamp(completedAt, 'PRODUCTION_RUN_MILESTONE_AT_INVALID', 'Milestone completion time');
  invariant(Date.parse(at) >= Date.parse(run.startedAt), 'PRODUCTION_RUN_MILESTONE_BEFORE_START', 'Milestone cannot complete before production starts');
  const upstreamGood = nextIndex === 0 ? run.orderedQuantity : run.milestones[nextIndex - 1].goodQuantity;
  const good = nonNegativeInteger(goodQuantity, 'PRODUCTION_RUN_GOOD_QUANTITY_INVALID', 'Good quantity');
  const rejected = nonNegativeInteger(rejectedQuantity, 'PRODUCTION_RUN_REJECTED_QUANTITY_INVALID', 'Rejected quantity');
  invariant(good + rejected === upstreamGood, 'PRODUCTION_RUN_QUANTITY_NOT_RECONCILED', 'Milestone quantities must reconcile to the previous stage', { milestoneCode, upstreamGood, goodQuantity: good, rejectedQuantity: rejected });
  const milestones = run.milestones.map((milestone, index) => index === nextIndex
    ? Object.freeze({ ...milestone, actualAt: at, goodQuantity: good, rejectedQuantity: rejected, completedBy: identifier(actorId, 'PRODUCTION_RUN_MILESTONE_BY_REQUIRED', 'Milestone completer'), notes: optionalText(notes, 2_000, 'PRODUCTION_RUN_MILESTONE_NOTES_INVALID', 'Milestone notes') })
    : milestone);
  const late = Date.parse(at) > Date.parse(expected.plannedAt);
  return freezeRun({
    ...run,
    milestones: Object.freeze(milestones),
    version: run.version + 1,
    riskStatus: late && run.riskStatus === 'on_track' ? 'at_risk' : run.riskStatus,
    updatedAt: at,
  });
}

export function raiseProductionException(run, { code: exceptionCode, severity, reason, expectedResolutionAt, actorId, raisedAt }) {
  invariant(run && ['planned', 'in_progress'].includes(run.status), 'PRODUCTION_RUN_EXCEPTION_NOT_ALLOWED', 'Production exceptions can be raised only before completion or cancellation', { status: run?.status });
  invariant(run.activeException === null, 'PRODUCTION_RUN_EXCEPTION_ALREADY_OPEN', 'Resolve the active production exception before raising another', { activeExceptionCode: run.activeException?.code });
  invariant(EXCEPTION_SEVERITIES.includes(severity), 'PRODUCTION_RUN_EXCEPTION_SEVERITY_INVALID', 'Production exception severity is invalid', { severity });
  const at = timestamp(raisedAt, 'PRODUCTION_RUN_EXCEPTION_AT_INVALID', 'Exception raised time');
  const resolutionAt = timestamp(expectedResolutionAt, 'PRODUCTION_RUN_EXCEPTION_RESOLUTION_INVALID', 'Expected resolution time');
  invariant(Date.parse(resolutionAt) > Date.parse(at), 'PRODUCTION_RUN_EXCEPTION_RESOLUTION_NOT_FUTURE', 'Expected resolution must be after exception creation');
  const exception = Object.freeze({
    code: code(exceptionCode, 'PRODUCTION_RUN_EXCEPTION_CODE_INVALID', 'Exception code'),
    severity,
    reason: requiredText(reason, 5, 2_000, 'PRODUCTION_RUN_EXCEPTION_REASON_INVALID', 'Exception reason'),
    expectedResolutionAt: resolutionAt,
    raisedAt: at,
    raisedBy: identifier(actorId, 'PRODUCTION_RUN_EXCEPTION_BY_REQUIRED', 'Exception owner'),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  });
  return freezeRun({
    ...run,
    activeException: exception,
    riskStatus: severity === 'critical' ? 'delayed' : 'at_risk',
    version: run.version + 1,
    updatedAt: at,
  });
}

export function resolveProductionException(run, { resolutionNotes, actorId, resolvedAt }) {
  invariant(run?.activeException, 'PRODUCTION_RUN_EXCEPTION_NOT_FOUND', 'Production Run has no active exception');
  const at = timestamp(resolvedAt, 'PRODUCTION_RUN_EXCEPTION_RESOLVED_AT_INVALID', 'Exception resolution time');
  invariant(Date.parse(at) >= Date.parse(run.activeException.raisedAt), 'PRODUCTION_RUN_EXCEPTION_RESOLVED_BEFORE_RAISED', 'Exception cannot be resolved before it was raised');
  const resolved = Object.freeze({
    ...run.activeException,
    resolvedAt: at,
    resolvedBy: identifier(actorId, 'PRODUCTION_RUN_EXCEPTION_RESOLVED_BY_REQUIRED', 'Exception resolver'),
    resolutionNotes: requiredText(resolutionNotes, 5, 2_000, 'PRODUCTION_RUN_EXCEPTION_RESOLUTION_NOTES_INVALID', 'Resolution notes'),
  });
  const hasLateMilestone = run.milestones.some((milestone) => milestone.actualAt && Date.parse(milestone.actualAt) > Date.parse(milestone.plannedAt));
  return freezeRun({
    ...run,
    activeException: null,
    exceptionHistory: Object.freeze([...run.exceptionHistory, resolved]),
    riskStatus: hasLateMilestone ? 'at_risk' : 'on_track',
    version: run.version + 1,
    updatedAt: at,
  });
}

export function completeProductionRun(run, { shortageReason, actorId, completedAt }) {
  invariant(run?.status === 'in_progress', 'PRODUCTION_RUN_NOT_IN_PROGRESS', 'Only an in-progress Production Run can complete', { status: run?.status });
  invariant(run.activeException === null, 'PRODUCTION_RUN_EXCEPTION_OPEN', 'Resolve the active production exception before completing the run', { exceptionCode: run.activeException?.code });
  invariant(run.milestones.every((milestone) => milestone.actualAt !== null), 'PRODUCTION_RUN_MILESTONES_INCOMPLETE', 'All Production Run milestones must be completed');
  const finalGood = run.milestones.at(-1).goodQuantity;
  const shortage = finalGood < run.orderedQuantity;
  const normalizedShortageReason = shortage
    ? requiredText(shortageReason, 5, 2_000, 'PRODUCTION_RUN_SHORTAGE_REASON_REQUIRED', 'Shortage reason')
    : null;
  invariant(!shortageReason || shortage, 'PRODUCTION_RUN_SHORTAGE_REASON_UNEXPECTED', 'Shortage reason is allowed only when final quantity is below the order quantity');
  const at = timestamp(completedAt, 'PRODUCTION_RUN_COMPLETED_AT_INVALID', 'Production Run completion time');
  invariant(Date.parse(at) >= Date.parse(run.milestones.at(-1).actualAt), 'PRODUCTION_RUN_COMPLETED_BEFORE_PACKING', 'Production Run cannot complete before packing');
  return freezeRun({
    ...run,
    status: 'completed',
    riskStatus: Date.parse(at) > Date.parse(run.deliveryDueAt) || shortage ? 'delayed' : run.riskStatus,
    version: run.version + 1,
    completedAt: at,
    completedBy: identifier(actorId, 'PRODUCTION_RUN_COMPLETED_BY_REQUIRED', 'Production Run completer'),
    finalGoodQuantity: finalGood,
    shortageReason: normalizedShortageReason,
    updatedAt: at,
  });
}

export function cancelProductionRun(run, { reason, actorId, cancelledAt }) {
  invariant(run && ['planned', 'in_progress'].includes(run.status), 'PRODUCTION_RUN_NOT_CANCELLABLE', 'Only a planned or in-progress Production Run can be cancelled', { status: run?.status });
  const at = timestamp(cancelledAt, 'PRODUCTION_RUN_CANCELLED_AT_INVALID', 'Production Run cancellation time');
  return freezeRun({
    ...run,
    status: 'cancelled',
    version: run.version + 1,
    cancelledAt: at,
    cancelledBy: identifier(actorId, 'PRODUCTION_RUN_CANCELLED_BY_REQUIRED', 'Production Run canceller'),
    cancellationReason: requiredText(reason, 5, 2_000, 'PRODUCTION_RUN_CANCELLATION_REASON_INVALID', 'Cancellation reason'),
    updatedAt: at,
  });
}

export function assertProductionRunVersion(run, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1 && expectedVersion <= MAX_INTEGER, 'PRODUCTION_RUN_EXPECTED_VERSION_INVALID', 'Expected Production Run version is invalid', { expectedVersion });
  invariant(run?.version === expectedVersion, 'PRODUCTION_RUN_CONCURRENCY_CONFLICT', 'Production Run was changed by another operation', { productionRunCode: run?.productionRunCode, expectedVersion, actualVersion: run?.version });
}

function normalizePlan(milestones, productionOrder) {
  invariant(Array.isArray(milestones) && milestones.length === PRODUCTION_MILESTONE_CODES.length, 'PRODUCTION_RUN_PLAN_INVALID', 'Production Run plan must contain every required milestone exactly once');
  const start = Date.parse(productionOrder.productionStartAt);
  const delivery = Date.parse(productionOrder.deliveryDueAt);
  let previous = start - 1;
  const normalized = milestones.map((milestone, index) => {
    invariant(milestone && typeof milestone === 'object' && !Array.isArray(milestone), 'PRODUCTION_RUN_MILESTONE_INVALID', 'Production milestone is invalid', { index });
    invariant(milestone.code === PRODUCTION_MILESTONE_CODES[index], 'PRODUCTION_RUN_PLAN_SEQUENCE_INVALID', 'Production Run plan must use the required milestone sequence', { index, expectedCode: PRODUCTION_MILESTONE_CODES[index], actualCode: milestone.code });
    const plannedAt = timestamp(milestone.plannedAt, 'PRODUCTION_RUN_MILESTONE_PLANNED_AT_INVALID', 'Milestone planned time');
    const planned = Date.parse(plannedAt);
    invariant(planned >= start && planned <= delivery, 'PRODUCTION_RUN_MILESTONE_OUTSIDE_WINDOW', 'Milestone must be planned inside the Production Order window', { milestoneCode: milestone.code, productionStartAt: productionOrder.productionStartAt, deliveryDueAt: productionOrder.deliveryDueAt });
    invariant(planned > previous, 'PRODUCTION_RUN_MILESTONE_DATES_NOT_ASCENDING', 'Milestone dates must be strictly ascending', { milestoneCode: milestone.code });
    previous = planned;
    return Object.freeze({ sequence: index + 1, code: milestone.code, plannedAt, actualAt: null, goodQuantity: null, rejectedQuantity: null, completedBy: null, notes: null });
  });
  return Object.freeze(normalized);
}

function assertConfirmedProductionOrder(order) {
  invariant(order?.status === 'confirmed', 'PRODUCTION_RUN_PO_NOT_CONFIRMED', 'Production Run requires a supplier-confirmed Production Order', { productionOrderNumber: order?.productionOrderNumber, status: order?.status });
  invariant(order.confirmation?.supplierCode === order.supplierCode, 'PRODUCTION_RUN_PO_CONFIRMATION_INVALID', 'Production Order supplier confirmation is inconsistent');
  invariant(order.techPackSnapshot?.acknowledgementReference, 'PRODUCTION_RUN_TECH_PACK_SNAPSHOT_REQUIRED', 'Production Run requires the acknowledged Tech Pack snapshot');
  invariant(Date.parse(order.deliveryDueAt) > Date.parse(order.productionStartAt), 'PRODUCTION_RUN_PO_DATES_INVALID', 'Production Order delivery must follow production start');
}

function freezeRun(value) {
  invariant(PRODUCTION_RUN_STATUSES.includes(value.status), 'PRODUCTION_RUN_STATUS_INVALID', 'Production Run status is invalid', { status: value.status });
  invariant(PRODUCTION_RISK_STATUSES.includes(value.riskStatus), 'PRODUCTION_RUN_RISK_STATUS_INVALID', 'Production Run risk status is invalid', { riskStatus: value.riskStatus });
  return Object.freeze(value);
}
function identifier(value, codeValue, label) { return requiredText(value, 1, 200, codeValue, label); }
function code(value, codeValue, label) { const normalized = requiredText(value, 3, 80, codeValue, label).toUpperCase(); invariant(RUN_CODE_PATTERN.test(normalized), codeValue, `${label} is invalid`); return normalized; }
function positiveInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, codeValue, `${label} must be a positive PostgreSQL integer`); return value; }
function nonNegativeInteger(value, codeValue, label) { invariant(Number.isInteger(value) && value >= 0 && value <= MAX_INTEGER, codeValue, `${label} must be a non-negative PostgreSQL integer`); return value; }
function timestamp(value, codeValue, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), codeValue, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function requiredText(value, min, max, codeValue, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, codeValue, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optionalText(value, max, codeValue, label) { if (value === null || value === undefined || value === '') return null; return requiredText(value, 1, max, codeValue, label); }
