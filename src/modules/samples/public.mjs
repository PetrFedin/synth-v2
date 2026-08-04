import { invariant } from '../../core/errors.mjs';

export const SAMPLE_TYPES = Object.freeze(['proto', 'fit', 'size-set', 'pre-production', 'sales', 'photo']);
export const SAMPLE_STATUSES = Object.freeze(['draft', 'requested', 'in-production', 'received', 'approved', 'rejected', 'cancelled']);
export const SAMPLE_DECISIONS = Object.freeze(['approved', 'rejected']);
export const SAMPLE_CONDITIONS = Object.freeze(['accepted', 'damaged', 'incomplete']);

const SAMPLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const SUPPLIER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const SIZE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,15}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CREATE_FIELDS = Object.freeze(new Set(['sampleCode', 'sku', 'sampleType', 'round', 'supplierCode', 'supplierName', 'dueAt', 'quantity', 'sizeCodes', 'colourway', 'notes']));
const EDIT_FIELDS = Object.freeze(new Set(['supplierCode', 'supplierName', 'dueAt', 'quantity', 'sizeCodes', 'colourway', 'notes']));
const RECEIPT_FIELDS = Object.freeze(new Set(['receivedQuantity', 'condition', 'trackingReference', 'notes']));
const DECISION_FIELDS = Object.freeze(new Set(['decision', 'notes']));
const NEXT_ROUND_FIELDS = Object.freeze(new Set(['sampleCode', 'dueAt', 'notes']));

export function createSample({ id, catalogSku, input, createdAt, sourceSampleCode = null }) {
  invariant(typeof id === 'string' && IDENTIFIER_PATTERN.test(id), 'SAMPLE_ID_INVALID', 'Sample id is invalid');
  assertObject(input, 'SAMPLE_INPUT_INVALID', 'Sample input is invalid');
  assertAllowedFields(input, CREATE_FIELDS, 'SAMPLE_FIELD_FORBIDDEN', 'Sample input contains unsupported fields');
  const normalized = normalizeDraftInput({ catalogSku, input });
  const created = timestamp(createdAt, 'SAMPLE_CREATED_AT_INVALID', 'Sample creation timestamp');
  return freezeSample({
    id,
    ...normalized,
    sourceSampleCode: sourceSampleCode === null ? null : sampleCode(sourceSampleCode),
    status: 'draft',
    version: 1,
    requestedAt: null,
    productionStartedAt: null,
    receivedAt: null,
    decisionAt: null,
    cancelledAt: null,
    receipt: null,
    decision: null,
    cancellationReason: null,
    createdAt: created,
    updatedAt: created,
  });
}

export function updateDraftSample(sample, { catalogSku, input, updatedAt }) {
  invariant(sample?.status === 'draft', 'SAMPLE_NOT_DRAFT', 'Only a draft sample can be edited');
  assertObject(input, 'SAMPLE_INPUT_INVALID', 'Sample input is invalid');
  assertAllowedFields(input, EDIT_FIELDS, 'SAMPLE_FIELD_FORBIDDEN', 'Sample update contains unsupported fields');
  const normalized = normalizeDraftInput({ catalogSku, input: { sampleCode: sample.sampleCode, sku: sample.sku, sampleType: sample.sampleType, round: sample.round, ...input } });
  invariant(normalized.brandId === sample.brandId, 'SAMPLE_BRAND_MISMATCH', 'Sample brand cannot be changed');
  const next = { ...sample, ...normalized };
  if (editableProjection(next) === editableProjection(sample)) return sample;
  const at = timestamp(updatedAt, 'SAMPLE_UPDATED_AT_INVALID', 'Sample update timestamp');
  assertNotBefore(sample.updatedAt, at, 'Sample update cannot move time backwards');
  return freezeSample({ ...next, version: sample.version + 1, updatedAt: at });
}

export function requestSample(sample, { catalogSku, requestedAt }) {
  invariant(sample?.status === 'draft', 'SAMPLE_NOT_DRAFT', 'Only a draft sample can be requested');
  invariant(catalogSku?.sku === sample.sku && catalogSku.brandId === sample.brandId, 'SAMPLE_SKU_MISMATCH', 'Sample SKU context is invalid');
  invariant(catalogSku.status === 'published', 'SAMPLE_SKU_NOT_PUBLISHED', 'SKU must be published before requesting a sample', { sku: sample.sku });
  invariant(Number.isInteger(catalogSku.version) && catalogSku.version === sample.skuVersion, 'SAMPLE_SKU_SNAPSHOT_STALE', 'Sample SKU snapshot is stale', { sku: sample.sku, expectedVersion: sample.skuVersion, actualVersion: catalogSku.version });
  invariant(sample.supplierCode && sample.supplierName, 'SAMPLE_SUPPLIER_REQUIRED', 'Supplier code and name are required before requesting a sample');
  invariant(sample.dueAt, 'SAMPLE_DUE_AT_REQUIRED', 'Sample due date is required before requesting a sample');
  const at = timestamp(requestedAt, 'SAMPLE_REQUESTED_AT_INVALID', 'Sample request timestamp');
  invariant(Date.parse(sample.dueAt) > Date.parse(at), 'SAMPLE_DUE_AT_NOT_FUTURE', 'Sample due date must be in the future when requested', { dueAt: sample.dueAt, requestedAt: at });
  return transition(sample, { status: 'requested', requestedAt: at, updatedAt: at });
}

export function startSampleProduction(sample, { startedAt }) {
  invariant(sample?.status === 'requested', 'SAMPLE_NOT_REQUESTED', 'Only a requested sample can enter production');
  const at = timestamp(startedAt, 'SAMPLE_PRODUCTION_STARTED_AT_INVALID', 'Sample production start timestamp');
  invariant(Date.parse(at) >= Date.parse(sample.requestedAt), 'SAMPLE_TIME_ORDER_INVALID', 'Sample production cannot start before request');
  return transition(sample, { status: 'in-production', productionStartedAt: at, updatedAt: at });
}

export function receiveSample(sample, { input, receivedAt }) {
  invariant(['requested', 'in-production'].includes(sample?.status), 'SAMPLE_NOT_RECEIVABLE', 'Only a requested or in-production sample can be received');
  assertObject(input, 'SAMPLE_RECEIPT_INVALID', 'Sample receipt is invalid');
  assertAllowedFields(input, RECEIPT_FIELDS, 'SAMPLE_RECEIPT_FIELD_FORBIDDEN', 'Sample receipt contains unsupported fields');
  const receivedQuantity = positiveInteger(input.receivedQuantity, 100, 'SAMPLE_RECEIVED_QUANTITY_INVALID', 'Received quantity');
  invariant(receivedQuantity === sample.quantity, 'SAMPLE_RECEIPT_INCOMPLETE', 'All requested sample units must be received before review', { expectedQuantity: sample.quantity, receivedQuantity });
  invariant(SAMPLE_CONDITIONS.includes(input.condition), 'SAMPLE_CONDITION_INVALID', 'Sample condition is invalid', { allowed: SAMPLE_CONDITIONS });
  const at = timestamp(receivedAt, 'SAMPLE_RECEIVED_AT_INVALID', 'Sample receipt timestamp');
  invariant(Date.parse(at) >= Date.parse(sample.requestedAt), 'SAMPLE_TIME_ORDER_INVALID', 'Sample cannot be received before request');
  return transition(sample, {
    status: 'received', receivedAt: at, updatedAt: at,
    receipt: Object.freeze({
      receivedQuantity,
      condition: input.condition,
      trackingReference: optionalText(input.trackingReference, 120, 'SAMPLE_TRACKING_REFERENCE_INVALID', 'Tracking reference'),
      notes: optionalText(input.notes, 1000, 'SAMPLE_RECEIPT_NOTES_INVALID', 'Receipt notes'),
    }),
  });
}

export function decideSample(sample, { input, actorId, decidedAt }) {
  invariant(sample?.status === 'received', 'SAMPLE_NOT_RECEIVED', 'Only a received sample can be approved or rejected');
  assertObject(input, 'SAMPLE_DECISION_INVALID', 'Sample decision is invalid');
  assertAllowedFields(input, DECISION_FIELDS, 'SAMPLE_DECISION_FIELD_FORBIDDEN', 'Sample decision contains unsupported fields');
  invariant(SAMPLE_DECISIONS.includes(input.decision), 'SAMPLE_DECISION_INVALID', 'Sample decision is invalid', { allowed: SAMPLE_DECISIONS });
  invariant(input.decision !== 'approved' || sample.receipt?.condition !== 'incomplete', 'SAMPLE_INCOMPLETE_CANNOT_BE_APPROVED', 'An incomplete sample receipt cannot be approved');
  const notes = optionalText(input.notes, 2000, 'SAMPLE_DECISION_NOTES_INVALID', 'Decision notes');
  invariant(input.decision !== 'rejected' || notes, 'SAMPLE_REJECTION_NOTES_REQUIRED', 'Rejected samples require decision notes');
  invariant(typeof actorId === 'string' && IDENTIFIER_PATTERN.test(actorId), 'SAMPLE_DECISION_ACTOR_INVALID', 'Sample decision actor is invalid');
  const at = timestamp(decidedAt, 'SAMPLE_DECIDED_AT_INVALID', 'Sample decision timestamp');
  invariant(Date.parse(at) >= Date.parse(sample.receivedAt), 'SAMPLE_TIME_ORDER_INVALID', 'Sample cannot be decided before receipt');
  return transition(sample, { status: input.decision, decisionAt: at, updatedAt: at, decision: Object.freeze({ outcome: input.decision, notes, actorId }) });
}

export function cancelSample(sample, { reason, cancelledAt }) {
  invariant(['draft', 'requested', 'in-production'].includes(sample?.status), 'SAMPLE_NOT_CANCELLABLE', 'Only a draft, requested or in-production sample can be cancelled');
  const cancellationReason = requiredText(reason, 5, 500, 'SAMPLE_CANCELLATION_REASON_INVALID', 'Cancellation reason');
  const at = timestamp(cancelledAt, 'SAMPLE_CANCELLED_AT_INVALID', 'Sample cancellation timestamp');
  invariant(Date.parse(at) >= Date.parse(sample.createdAt), 'SAMPLE_TIME_ORDER_INVALID', 'Sample cannot be cancelled before creation');
  return transition(sample, { status: 'cancelled', cancelledAt: at, updatedAt: at, cancellationReason });
}

export function createNextSampleRound({ id, rejectedSample, catalogSku, input, createdAt }) {
  invariant(rejectedSample?.status === 'rejected', 'SAMPLE_NOT_REJECTED', 'Only a rejected sample can start the next round');
  invariant(rejectedSample.round < 100, 'SAMPLE_ROUND_LIMIT_REACHED', 'Sample round limit has been reached');
  assertObject(input, 'SAMPLE_NEXT_ROUND_INVALID', 'Next sample round input is invalid');
  assertAllowedFields(input, NEXT_ROUND_FIELDS, 'SAMPLE_NEXT_ROUND_FIELD_FORBIDDEN', 'Next sample round contains unsupported fields');
  const created = timestamp(createdAt, 'SAMPLE_CREATED_AT_INVALID', 'Next sample round creation timestamp');
  assertNotBefore(rejectedSample.updatedAt, created, 'Next sample round cannot be created before the rejected round decision');
  const draft = createSample({
    id, catalogSku, sourceSampleCode: rejectedSample.sampleCode, createdAt: created,
    input: {
      sampleCode: input.sampleCode,
      sku: rejectedSample.sku,
      sampleType: rejectedSample.sampleType,
      round: rejectedSample.round + 1,
      supplierCode: rejectedSample.supplierCode,
      supplierName: rejectedSample.supplierName,
      dueAt: input.dueAt,
      quantity: rejectedSample.quantity,
      sizeCodes: rejectedSample.sizeCodes,
      colourway: rejectedSample.colourway,
      notes: Object.hasOwn(input, 'notes') ? input.notes : rejectedSample.notes,
    },
  });
  invariant(draft.brandId === rejectedSample.brandId, 'SAMPLE_BRAND_MISMATCH', 'Next sample round brand cannot change');
  return draft;
}

function normalizeDraftInput({ catalogSku, input }) {
  const sku = code(input.sku, SKU_PATTERN, 'SAMPLE_SKU_INVALID', 'Sample SKU');
  invariant(catalogSku?.sku === sku, 'SAMPLE_SKU_NOT_FOUND', 'Catalog SKU not found', { sku });
  invariant(typeof catalogSku.brandId === 'string' && IDENTIFIER_PATTERN.test(catalogSku.brandId), 'SAMPLE_BRAND_INVALID', 'Sample brand is invalid');
  invariant(Number.isInteger(catalogSku.version) && catalogSku.version >= 1, 'SAMPLE_SKU_VERSION_INVALID', 'Catalog SKU version is invalid');
  invariant(SAMPLE_TYPES.includes(input.sampleType), 'SAMPLE_TYPE_INVALID', 'Sample type is invalid', { allowed: SAMPLE_TYPES });
  return Object.freeze({
    sampleCode: sampleCode(input.sampleCode),
    sku,
    brandId: catalogSku.brandId,
    skuVersion: catalogSku.version,
    sampleType: input.sampleType,
    round: positiveInteger(input.round, 100, 'SAMPLE_ROUND_INVALID', 'Sample round'),
    supplierCode: optionalCode(input.supplierCode, SUPPLIER_CODE_PATTERN, 'SAMPLE_SUPPLIER_CODE_INVALID', 'Supplier code'),
    supplierName: optionalText(input.supplierName, 160, 'SAMPLE_SUPPLIER_NAME_INVALID', 'Supplier name'),
    dueAt: optionalTimestamp(input.dueAt, 'SAMPLE_DUE_AT_INVALID', 'Sample due date'),
    quantity: positiveInteger(input.quantity, 100, 'SAMPLE_QUANTITY_INVALID', 'Sample quantity'),
    sizeCodes: normalizedSizeCodes(input.sizeCodes),
    colourway: optionalText(input.colourway, 120, 'SAMPLE_COLOURWAY_INVALID', 'Sample colourway'),
    notes: optionalText(input.notes, 2000, 'SAMPLE_NOTES_INVALID', 'Sample notes'),
  });
}

function normalizedSizeCodes(value) {
  invariant(Array.isArray(value) && value.length >= 1 && value.length <= 50, 'SAMPLE_SIZE_CODES_INVALID', 'Sample must target 1 to 50 sizes');
  const result = [];
  const seen = new Set();
  for (const raw of value) {
    const normalized = code(raw, SIZE_CODE_PATTERN, 'SAMPLE_SIZE_CODE_INVALID', 'Sample size code');
    invariant(!seen.has(normalized), 'SAMPLE_SIZE_CODE_DUPLICATE', 'Sample size codes must be unique', { sizeCode: normalized });
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

function transition(sample, changes) {
  assertNotBefore(sample.updatedAt, changes.updatedAt, 'Sample lifecycle cannot move time backwards');
  return freezeSample({ ...sample, ...changes, version: sample.version + 1 });
}
function assertNotBefore(previous, current, message) {
  invariant(Number.isFinite(Date.parse(previous)) && Number.isFinite(Date.parse(current)) && Date.parse(current) >= Date.parse(previous), 'SAMPLE_TIME_ORDER_INVALID', message, { previous, current });
}
function editableProjection(value) { return JSON.stringify({ skuVersion: value.skuVersion, supplierCode: value.supplierCode, supplierName: value.supplierName, dueAt: value.dueAt, quantity: value.quantity, sizeCodes: value.sizeCodes, colourway: value.colourway, notes: value.notes }); }
function sampleCode(value) { return code(value, SAMPLE_CODE_PATTERN, 'SAMPLE_CODE_INVALID', 'Sample code'); }
function code(value, pattern, errorCode, label) { invariant(typeof value === 'string' && pattern.test(value), errorCode, `${label} is invalid`); return value; }
function optionalCode(value, pattern, errorCode, label) { if (value === undefined || value === null || value === '') return null; return code(value, pattern, errorCode, label); }
function positiveInteger(value, maximum, errorCode, label) { invariant(Number.isSafeInteger(value) && value >= 1 && value <= maximum, errorCode, `${label} must be an integer from 1 to ${maximum}`); return value; }
function requiredText(value, minimum, maximum, errorCode, label) {
  invariant(typeof value === 'string', errorCode, `${label} is required`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= minimum && normalized.length <= maximum, errorCode, `${label} must contain ${minimum}-${maximum} characters`);
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), errorCode, `${label} contains control characters`);
  return normalized;
}
function optionalText(value, maximum, errorCode, label) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, maximum, errorCode, label); }
function timestamp(value, errorCode, label) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), errorCode, `${label} is invalid`); return new Date(value).toISOString(); }
function optionalTimestamp(value, errorCode, label) { if (value === undefined || value === null || value === '') return null; return timestamp(value, errorCode, label); }
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(value, allowed, code, message) { const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(forbidden.length === 0, code, message, { fields: forbidden }); }
function freezeSample(value) { return Object.freeze({ ...value, sizeCodes: Object.freeze([...(value.sizeCodes || [])]), receipt: value.receipt ? Object.freeze({ ...value.receipt }) : null, decision: value.decision ? Object.freeze({ ...value.decision }) : null }); }
