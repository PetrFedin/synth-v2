import { invariant } from '../../core/errors.mjs';

export const PRODUCTION_EXECUTION_STATUSES = Object.freeze(['planned','active','ready-for-qc','cancelled']);
export const PRODUCTION_MILESTONE_CODES = Object.freeze([
  'materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc',
]);
const TEMPLATE = Object.freeze([
  ['materials-ready',0.10],['cutting-complete',0.25],['assembly-complete',0.60],
  ['finishing-complete',0.78],['packing-complete',0.90],['ready-for-qc',0.95],
]);

export function createProductionExecution({ id, productionOrder, createdAt }) {
  invariant(productionOrder?.status === 'confirmed', 'PRODUCTION_EXECUTION_PO_NOT_CONFIRMED', 'Production execution requires a supplier-confirmed Production Order', { productionOrderNumber: productionOrder?.productionOrderNumber, status: productionOrder?.status });
  invariant(productionOrder.confirmation && productionOrder.confirmedAt, 'PRODUCTION_EXECUTION_PO_CONFIRMATION_REQUIRED', 'Production Order confirmation snapshot is required');
  const start = timestamp(productionOrder.productionStartAt, 'PRODUCTION_EXECUTION_START_INVALID', 'Production start');
  const due = timestamp(productionOrder.deliveryDueAt, 'PRODUCTION_EXECUTION_DUE_INVALID', 'Delivery due');
  const created = timestamp(createdAt, 'PRODUCTION_EXECUTION_CREATED_AT_INVALID', 'Production execution creation time');
  invariant(Date.parse(due) > Date.parse(start), 'PRODUCTION_EXECUTION_WINDOW_INVALID', 'Production execution window is invalid');
  const windowMs = Date.parse(due) - Date.parse(start);
  const milestones = TEMPLATE.map(([code, ratio], index) => Object.freeze({
    code,
    sequence: index + 1,
    dueAt: new Date(Date.parse(start) + Math.floor(windowMs * ratio)).toISOString(),
    status: 'pending',
    completedAt: null,
    completedBy: null,
    completionNotes: null,
    varianceMinutes: null,
    blockedAt: null,
    blockedBy: null,
    blockReason: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  }));
  return freezeExecution({
    id: required(id, 'PRODUCTION_EXECUTION_ID_REQUIRED', 'Production execution id'),
    executionCode: `EXEC-${productionOrder.productionOrderNumber}`,
    productionOrderNumber: productionOrder.productionOrderNumber,
    productionOrderId: productionOrder.id,
    productionOrderVersion: productionOrder.version,
    brandId: productionOrder.brandId,
    supplierCode: productionOrder.supplierCode,
    sku: productionOrder.sku,
    quantity: productionOrder.quantity,
    productionStartAt: start,
    deliveryDueAt: due,
    sourceSnapshot: Object.freeze({
      productionOrderNumber: productionOrder.productionOrderNumber,
      productionOrderVersion: productionOrder.version,
      supplierCode: productionOrder.supplierCode,
      quantity: productionOrder.quantity,
      confirmationReference: productionOrder.confirmation.confirmationReference,
      confirmedAt: productionOrder.confirmedAt,
      techPackCode: productionOrder.techPackSnapshot.techPackCode,
      techPackVersion: productionOrder.techPackSnapshot.version,
    }),
    templateVersion: 'standard-apparel-v1',
    milestones: Object.freeze(milestones),
    status: 'planned',
    version: 1,
    startedAt: null,
    startedBy: null,
    readyForQcAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: created,
    updatedAt: created,
  });
}

export function startProductionExecution(execution, { actorId, startedAt }) {
  invariant(execution?.status === 'planned', 'PRODUCTION_EXECUTION_NOT_PLANNED', 'Only a planned production execution can start', { status: execution?.status });
  const at = timestamp(startedAt, 'PRODUCTION_EXECUTION_STARTED_AT_INVALID', 'Production start time');
  invariant(Date.parse(at) <= Date.parse(execution.deliveryDueAt), 'PRODUCTION_EXECUTION_START_AFTER_DUE', 'Production cannot start after the delivery due date');
  return freezeExecution({ ...execution, status: 'active', version: execution.version + 1, startedAt: at, startedBy: required(actorId, 'PRODUCTION_EXECUTION_STARTED_BY_REQUIRED', 'Starter'), updatedAt: at });
}

export function completeProductionMilestone(execution, { milestoneCode, actorId, notes, completedAt }) {
  invariant(execution?.status === 'active', 'PRODUCTION_EXECUTION_NOT_ACTIVE', 'Milestones can be completed only while production is active', { status: execution?.status });
  const index = milestoneIndex(execution, milestoneCode);
  const current = execution.milestones[index];
  invariant(current.status === 'pending', 'PRODUCTION_MILESTONE_NOT_PENDING', 'Only a pending milestone can be completed', { milestoneCode, status: current.status });
  invariant(index === nextOpenIndex(execution), 'PRODUCTION_MILESTONE_SEQUENCE_VIOLATION', 'Production milestones must be completed in sequence', { milestoneCode, expectedMilestoneCode: execution.milestones[nextOpenIndex(execution)]?.code });
  const at = timestamp(completedAt, 'PRODUCTION_MILESTONE_COMPLETED_AT_INVALID', 'Milestone completion time');
  invariant(Date.parse(at) >= Date.parse(execution.startedAt), 'PRODUCTION_MILESTONE_BEFORE_START', 'Milestone cannot be completed before production starts');
  const updated = replaceMilestone(execution, index, {
    ...current,
    status: 'completed',
    completedAt: at,
    completedBy: required(actorId, 'PRODUCTION_MILESTONE_COMPLETED_BY_REQUIRED', 'Milestone completer'),
    completionNotes: optional(notes, 2000, 'PRODUCTION_MILESTONE_NOTES_INVALID', 'Completion notes'),
    varianceMinutes: Math.trunc((Date.parse(at) - Date.parse(current.dueAt)) / 60000),
  });
  const ready = milestoneCode === 'ready-for-qc';
  return freezeExecution({ ...updated, status: ready ? 'ready-for-qc' : 'active', version: execution.version + 1, readyForQcAt: ready ? at : null, updatedAt: at });
}

export function blockProductionMilestone(execution, { milestoneCode, actorId, reason, blockedAt }) {
  invariant(execution?.status === 'active', 'PRODUCTION_EXECUTION_NOT_ACTIVE', 'Milestones can be blocked only while production is active');
  const index = milestoneIndex(execution, milestoneCode);
  const current = execution.milestones[index];
  invariant(index === nextOpenIndex(execution), 'PRODUCTION_MILESTONE_SEQUENCE_VIOLATION', 'Only the current production milestone can be blocked');
  invariant(current.status === 'pending', 'PRODUCTION_MILESTONE_NOT_PENDING', 'Only a pending milestone can be blocked', { milestoneCode, status: current.status });
  const at = timestamp(blockedAt, 'PRODUCTION_MILESTONE_BLOCKED_AT_INVALID', 'Milestone block time');
  const updated = replaceMilestone(execution, index, { ...current, status: 'blocked', blockedAt: at, blockedBy: required(actorId, 'PRODUCTION_MILESTONE_BLOCKED_BY_REQUIRED', 'Block reporter'), blockReason: text(reason, 5, 1000, 'PRODUCTION_MILESTONE_BLOCK_REASON_INVALID', 'Block reason') });
  return freezeExecution({ ...updated, version: execution.version + 1, updatedAt: at });
}

export function resolveProductionMilestoneBlock(execution, { milestoneCode, actorId, notes, resolvedAt }) {
  invariant(execution?.status === 'active', 'PRODUCTION_EXECUTION_NOT_ACTIVE', 'Milestone blocks can be resolved only while production is active');
  const index = milestoneIndex(execution, milestoneCode);
  const current = execution.milestones[index];
  invariant(current.status === 'blocked', 'PRODUCTION_MILESTONE_NOT_BLOCKED', 'Milestone is not blocked', { milestoneCode, status: current.status });
  const at = timestamp(resolvedAt, 'PRODUCTION_MILESTONE_RESOLVED_AT_INVALID', 'Milestone resolution time');
  invariant(Date.parse(at) >= Date.parse(current.blockedAt), 'PRODUCTION_MILESTONE_RESOLUTION_BEFORE_BLOCK', 'Milestone block cannot be resolved before it was reported');
  const updated = replaceMilestone(execution, index, { ...current, status: 'pending', resolvedAt: at, resolvedBy: required(actorId, 'PRODUCTION_MILESTONE_RESOLVED_BY_REQUIRED', 'Block resolver'), resolutionNotes: text(notes, 5, 2000, 'PRODUCTION_MILESTONE_RESOLUTION_NOTES_INVALID', 'Resolution notes') });
  return freezeExecution({ ...updated, version: execution.version + 1, updatedAt: at });
}

export function cancelProductionExecution(execution, { reason, cancelledAt }) {
  invariant(['planned','active'].includes(execution?.status), 'PRODUCTION_EXECUTION_NOT_CANCELLABLE', 'Ready-for-QC or cancelled production execution cannot be cancelled', { status: execution?.status });
  const at = timestamp(cancelledAt, 'PRODUCTION_EXECUTION_CANCELLED_AT_INVALID', 'Production cancellation time');
  return freezeExecution({ ...execution, status: 'cancelled', version: execution.version + 1, cancelledAt: at, cancellationReason: text(reason, 5, 1000, 'PRODUCTION_EXECUTION_CANCELLATION_REASON_INVALID', 'Cancellation reason'), updatedAt: at });
}

export function assertProductionExecutionVersion(execution, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'PRODUCTION_EXECUTION_EXPECTED_VERSION_INVALID', 'Expected production execution version is invalid');
  invariant(execution?.version === expectedVersion, 'PRODUCTION_EXECUTION_CONCURRENCY_CONFLICT', 'Production execution was changed by another operation', { executionCode: execution?.executionCode, expectedVersion, actualVersion: execution?.version });
}
function nextOpenIndex(execution) { return execution.milestones.findIndex((value) => value.status !== 'completed'); }
function milestoneIndex(execution, code) { const index = execution.milestones.findIndex((value) => value.code === code); invariant(index >= 0, 'PRODUCTION_MILESTONE_NOT_FOUND', 'Production milestone not found', { milestoneCode: code }); return index; }
function replaceMilestone(execution, index, value) { const milestones = execution.milestones.map((item, position) => position === index ? Object.freeze(value) : item); return { ...execution, milestones: Object.freeze(milestones) }; }
function freezeExecution(value) { invariant(PRODUCTION_EXECUTION_STATUSES.includes(value.status), 'PRODUCTION_EXECUTION_STATUS_INVALID', 'Production execution status is invalid'); return Object.freeze(value); }
function required(value, code, label) { return text(value, 1, 200, code, label); }
function text(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optional(value, max, code, label) { return value === null || value === undefined || value === '' ? null : text(value, 1, max, code, label); }
function timestamp(value, code, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
