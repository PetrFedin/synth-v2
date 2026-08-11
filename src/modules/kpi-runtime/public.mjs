import { createHash } from 'node:crypto';

import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const KPI_RUN_MODES = Object.freeze(['NORMAL', 'RESTATEMENT', 'RECONSTRUCTION']);
export const KPI_RUN_STATUSES = Object.freeze(['REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED']);
export const KPI_DATA_STATES = Object.freeze(['VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID']);
export const KPI_QUALITY_STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT_APPLICABLE', 'MISSING_EVIDENCE']);
export const KPI_QUALITY_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'BLOCKING']);
export const KPI_RESTATEMENT_REASON_CODES = Object.freeze([
  'LATE_SOURCE_FACT',
  'SOURCE_CORRECTION',
  'REVERSAL',
  'MAPPING_CORRECTION',
  'FORMULA_CORRECTION',
  'FX_REFERENCE_CORRECTION',
  'DUPLICATE_REMEDIATION',
  'GOVERNANCE_CORRECTION',
]);

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createKpiCalculationRun({
  id,
  organisationId,
  runMode = 'NORMAL',
  commandId = null,
  requestedBy,
  periodStart = null,
  periodEnd = null,
  asOfTimestamp = null,
  reportingTimezone,
  engineVersion,
  sourceManifest,
  inputManifestHash,
  requestedAt,
} = {}) {
  invariant(KPI_RUN_MODES.includes(runMode), 'KPI_RUN_MODE_INVALID', 'KPI run mode is invalid', { runMode });
  invariant(typeof inputManifestHash === 'string' && HASH_PATTERN.test(inputManifestHash), 'KPI_INPUT_MANIFEST_HASH_INVALID', 'KPI run input manifest hash must be SHA-256');
  const time = normalizeObservationTime({ periodStart, periodEnd, asOfTimestamp }, 'KPI_RUN_TIME_SHAPE_INVALID');
  const basis = Object.freeze({
    id: requiredId(id, 'KPI_RUN_ID_INVALID'),
    organisationId: requiredId(organisationId, 'KPI_RUN_ORGANISATION_ID_INVALID'),
    runMode,
    commandId: optionalId(commandId, 'KPI_RUN_COMMAND_ID_INVALID'),
    requestedBy: requiredText(requestedBy, 1, 160, 'KPI_RUN_REQUESTED_BY_INVALID'),
    ...time,
    reportingTimezone: requiredText(reportingTimezone, 1, 120, 'KPI_RUN_TIMEZONE_INVALID'),
    engineVersion: requiredText(engineVersion, 1, 160, 'KPI_RUN_ENGINE_VERSION_INVALID'),
    sourceManifest: frozenObject(sourceManifest, 'KPI_RUN_SOURCE_MANIFEST_INVALID'),
    inputManifestHash,
    requestedAt: timestamp(requestedAt, 'KPI_RUN_REQUESTED_AT_INVALID'),
  });
  return withHash(basis);
}

export function createKpiRunStatusEvent({
  id,
  run,
  previousEvent = null,
  runStatus,
  evidence = {},
  createdAt,
  createdBy,
} = {}) {
  invariant(run?.id && KPI_RUN_MODES.includes(run.runMode), 'KPI_RUN_REQUIRED', 'KPI status event requires a governed run');
  invariant(KPI_RUN_STATUSES.includes(runStatus), 'KPI_RUN_STATUS_INVALID', 'KPI run status is invalid', { runStatus });
  const at = timestamp(createdAt, 'KPI_RUN_STATUS_CREATED_AT_INVALID');
  assertRunStatusTransition({ run, previousEvent, runStatus, createdAt: at });
  const frozenEvidence = frozenObject(evidence, 'KPI_RUN_STATUS_EVIDENCE_INVALID');
  if (runStatus === 'SUCCEEDED') {
    invariant(typeof frozenEvidence.outputManifestHash === 'string' && HASH_PATTERN.test(frozenEvidence.outputManifestHash), 'KPI_RUN_OUTPUT_MANIFEST_HASH_REQUIRED', 'Succeeded KPI run requires outputManifestHash evidence');
  }
  if (['FAILED', 'REJECTED', 'CANCELLED'].includes(runStatus)) {
    invariant(typeof frozenEvidence.reason === 'string' && frozenEvidence.reason.trim().length >= 3, 'KPI_RUN_TERMINAL_REASON_REQUIRED', `${runStatus} KPI run requires reason evidence`);
  }
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RUN_STATUS_EVENT_ID_INVALID'),
    runId: run.id,
    previousStatusEventId: previousEvent?.id ?? null,
    runStatus,
    evidence: frozenEvidence,
    createdAt: at,
    createdBy: requiredText(createdBy, 1, 160, 'KPI_RUN_STATUS_CREATED_BY_INVALID'),
  }));
}

export function createKpiRunDefinitionBinding({
  id,
  run,
  definition,
  releaseEvent,
  activationEvent,
  mappingSetVersion,
  selectionReason,
  createdAt,
  createdBy,
} = {}) {
  invariant(run?.id && definition?.id, 'KPI_RUN_DEFINITION_REQUIRED', 'Run definition binding requires run and definition');
  if (definition.scopeType === 'organisation') {
    invariant(definition.organisationId === run.organisationId, 'KPI_RUN_DEFINITION_ORGANISATION_MISMATCH', 'Organisation-scoped KPI definition does not belong to run organisation');
  }
  invariant(releaseEvent?.kpiDefinitionId === definition.id && releaseEvent.releaseStatus === 'PRODUCTION_READY', 'KPI_RUN_RELEASE_NOT_READY', 'Run binding requires PRODUCTION_READY release event for the same definition');
  invariant(activationEvent?.kpiDefinitionId === definition.id, 'KPI_RUN_ACTIVATION_DEFINITION_MISMATCH', 'Run activation event belongs to another definition');
  invariant(Number.isSafeInteger(mappingSetVersion) && mappingSetVersion > 0, 'KPI_RUN_MAPPING_SET_VERSION_INVALID', 'Run mapping set version must be a positive integer');
  invariant(activationEvent.mappingSetVersion === mappingSetVersion, 'KPI_RUN_ACTIVATION_MAPPING_SET_MISMATCH', 'Run mapping set must match activation event');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RUN_DEFINITION_BINDING_ID_INVALID'),
    runId: run.id,
    kpiDefinitionId: definition.id,
    releaseEventId: releaseEvent.id,
    activationEventId: activationEvent.id,
    mappingSetVersion,
    selectionReason: requiredText(selectionReason, 3, 1000, 'KPI_RUN_SELECTION_REASON_INVALID'),
    createdAt: timestamp(createdAt, 'KPI_RUN_BINDING_CREATED_AT_INVALID'),
    createdBy: requiredText(createdBy, 1, 160, 'KPI_RUN_BINDING_CREATED_BY_INVALID'),
  }));
}

export function createKpiRunMappingBinding({
  id,
  definitionBinding,
  mapping,
  verificationEvent,
  createdAt,
  createdBy,
} = {}) {
  invariant(definitionBinding?.id && mapping?.id, 'KPI_RUN_MAPPING_REQUIRED', 'Run mapping binding requires definition binding and mapping');
  invariant(mapping.kpiDefinitionId === definitionBinding.kpiDefinitionId, 'KPI_RUN_MAPPING_DEFINITION_MISMATCH', 'Run mapping belongs to another definition');
  invariant(mapping.mappingSetVersion === definitionBinding.mappingSetVersion, 'KPI_RUN_MAPPING_SET_MISMATCH', 'Run mapping belongs to another mapping-set version');
  invariant(verificationEvent?.kpiSourceMappingId === mapping.id && verificationEvent.verificationStatus === 'VERIFIED', 'KPI_RUN_MAPPING_NOT_VERIFIED', 'Run mapping binding requires VERIFIED event for selected mapping');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RUN_MAPPING_BINDING_ID_INVALID'),
    runDefinitionBindingId: definitionBinding.id,
    variableName: requiredText(mapping.variableName, 1, 160, 'KPI_RUN_MAPPING_VARIABLE_INVALID'),
    kpiSourceMappingId: mapping.id,
    verificationEventId: verificationEvent.id,
    createdAt: timestamp(createdAt, 'KPI_RUN_MAPPING_CREATED_AT_INVALID'),
    createdBy: requiredText(createdBy, 1, 160, 'KPI_RUN_MAPPING_CREATED_BY_INVALID'),
  }));
}

export function createKpiObservation({
  id,
  run,
  definition,
  definitionBinding,
  periodStart = null,
  periodEnd = null,
  asOfTimestamp = null,
  grain = {},
  dataState,
  valueNumeric = null,
  canonicalUom,
  numeratorNumeric = null,
  denominatorNumeric = null,
  normalizerK = null,
  componentPayload = {},
  sourceLineage,
  calculatedAt,
} = {}) {
  invariant(run?.id && definition?.id && definitionBinding?.id, 'KPI_OBSERVATION_LINEAGE_REQUIRED', 'Observation requires run, definition and definition binding');
  invariant(definitionBinding.runId === run.id && definitionBinding.kpiDefinitionId === definition.id, 'KPI_OBSERVATION_BINDING_MISMATCH', 'Observation definition binding does not match run/definition');
  invariant(KPI_DATA_STATES.includes(dataState), 'KPI_DATA_STATE_INVALID', 'KPI observation data state is invalid', { dataState });
  assertObservationValueShape(dataState, valueNumeric);
  const time = normalizeObservationTime({ periodStart, periodEnd, asOfTimestamp }, 'KPI_OBSERVATION_TIME_SHAPE_INVALID');
  const frozenGrain = frozenObject(grain, 'KPI_OBSERVATION_GRAIN_INVALID');
  const grainHash = sha256(canonicalJson(frozenGrain));
  const outputUom = requiredText(canonicalUom, 1, 120, 'KPI_OBSERVATION_UOM_INVALID');
  invariant(outputUom === definition.canonicalUom, 'KPI_OBSERVATION_UOM_MISMATCH', 'Observation canonical UOM does not match definition', { expected: definition.canonicalUom, actual: outputUom });
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_OBSERVATION_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    organisationId: run.organisationId,
    ...time,
    grain: frozenGrain,
    grainHash,
    dataState,
    valueNumeric: numericOrNull(valueNumeric, 'KPI_OBSERVATION_VALUE_INVALID'),
    canonicalUom: outputUom,
    numeratorNumeric: numericOrNull(numeratorNumeric, 'KPI_OBSERVATION_NUMERATOR_INVALID'),
    denominatorNumeric: numericOrNull(denominatorNumeric, 'KPI_OBSERVATION_DENOMINATOR_INVALID'),
    normalizerK: numericOrNull(normalizerK, 'KPI_OBSERVATION_NORMALIZER_INVALID'),
    componentPayload: frozenObject(componentPayload, 'KPI_OBSERVATION_COMPONENT_PAYLOAD_INVALID'),
    sourceLineage: frozenObject(sourceLineage, 'KPI_OBSERVATION_SOURCE_LINEAGE_INVALID'),
    calculatedAt: timestamp(calculatedAt, 'KPI_OBSERVATION_CALCULATED_AT_INVALID'),
  }));
}

export function createKpiQualityResult({
  id,
  run,
  definitionBinding,
  observation = null,
  ruleId,
  ruleVersion,
  ruleFamily,
  severity,
  resultStatus,
  observedPayload = {},
  expectedContract = {},
  evidence = {},
  evaluatedAt,
} = {}) {
  invariant(run?.id && definitionBinding?.id, 'KPI_QUALITY_LINEAGE_REQUIRED', 'Quality result requires run and definition binding');
  invariant(definitionBinding.runId === run.id, 'KPI_QUALITY_BINDING_RUN_MISMATCH', 'Quality result binding belongs to another run');
  if (observation) invariant(observation.runId === run.id && observation.runDefinitionBindingId === definitionBinding.id, 'KPI_QUALITY_OBSERVATION_MISMATCH', 'Quality result observation belongs to another run/binding');
  invariant(KPI_QUALITY_SEVERITIES.includes(severity), 'KPI_QUALITY_SEVERITY_INVALID', 'KPI quality severity is invalid', { severity });
  invariant(KPI_QUALITY_STATUSES.includes(resultStatus), 'KPI_QUALITY_STATUS_INVALID', 'KPI quality status is invalid', { resultStatus });
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_QUALITY_RESULT_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    observationId: observation?.id ?? null,
    ruleId: requiredText(ruleId, 1, 160, 'KPI_QUALITY_RULE_ID_INVALID'),
    ruleVersion: requiredText(ruleVersion, 1, 80, 'KPI_QUALITY_RULE_VERSION_INVALID'),
    ruleFamily: requiredText(ruleFamily, 2, 80, 'KPI_QUALITY_RULE_FAMILY_INVALID'),
    severity,
    resultStatus,
    observedPayload: frozenObject(observedPayload, 'KPI_QUALITY_OBSERVED_INVALID'),
    expectedContract: frozenObject(expectedContract, 'KPI_QUALITY_EXPECTED_INVALID'),
    evidence: frozenObject(evidence, 'KPI_QUALITY_EVIDENCE_INVALID'),
    evaluatedAt: timestamp(evaluatedAt, 'KPI_QUALITY_EVALUATED_AT_INVALID'),
  }));
}

export function createKpiReconciliationResult({
  id,
  run,
  definitionBinding,
  observation = null,
  reconciliationRuleId,
  reconciliationRuleVersion,
  observedNumeric = null,
  expectedNumeric = null,
  relativeDifference = null,
  toleranceContract = {},
  resultStatus,
  evidence = {},
  evaluatedAt,
} = {}) {
  invariant(run?.id && definitionBinding?.id, 'KPI_RECONCILIATION_LINEAGE_REQUIRED', 'Reconciliation result requires run and definition binding');
  invariant(definitionBinding.runId === run.id, 'KPI_RECONCILIATION_BINDING_RUN_MISMATCH', 'Reconciliation binding belongs to another run');
  if (observation) invariant(observation.runId === run.id && observation.runDefinitionBindingId === definitionBinding.id, 'KPI_RECONCILIATION_OBSERVATION_MISMATCH', 'Reconciliation observation belongs to another run/binding');
  invariant(KPI_QUALITY_STATUSES.includes(resultStatus), 'KPI_RECONCILIATION_STATUS_INVALID', 'KPI reconciliation status is invalid', { resultStatus });
  const observed = numericOrNull(observedNumeric, 'KPI_RECONCILIATION_OBSERVED_INVALID');
  const expected = numericOrNull(expectedNumeric, 'KPI_RECONCILIATION_EXPECTED_INVALID');
  if (['PASS', 'FAIL'].includes(resultStatus)) {
    invariant(observed !== null && expected !== null, 'KPI_RECONCILIATION_NUMERIC_REQUIRED', 'PASS/FAIL reconciliation requires observed and expected values');
  }
  const absoluteDifference = observed === null || expected === null ? null : Math.abs(observed - expected);
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RECONCILIATION_RESULT_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    observationId: observation?.id ?? null,
    reconciliationRuleId: requiredText(reconciliationRuleId, 1, 160, 'KPI_RECONCILIATION_RULE_ID_INVALID'),
    reconciliationRuleVersion: requiredText(reconciliationRuleVersion, 1, 80, 'KPI_RECONCILIATION_RULE_VERSION_INVALID'),
    observedNumeric: observed,
    expectedNumeric: expected,
    absoluteDifference,
    relativeDifference: numericOrNull(relativeDifference, 'KPI_RECONCILIATION_RELATIVE_INVALID'),
    toleranceContract: frozenObject(toleranceContract, 'KPI_RECONCILIATION_TOLERANCE_INVALID'),
    resultStatus,
    evidence: frozenObject(evidence, 'KPI_RECONCILIATION_EVIDENCE_INVALID'),
    evaluatedAt: timestamp(evaluatedAt, 'KPI_RECONCILIATION_EVALUATED_AT_INVALID'),
  }));
}

export function createKpiRunRestatement({
  id,
  newRun,
  supersededRun,
  reasonCode,
  reason,
  approvedBy,
  createdAt,
} = {}) {
  invariant(newRun?.id && supersededRun?.id, 'KPI_RESTATEMENT_RUNS_REQUIRED', 'Restatement requires new and superseded runs');
  invariant(newRun.id !== supersededRun.id, 'KPI_RESTATEMENT_SELF_REFERENCE', 'KPI run cannot restate itself');
  invariant(newRun.organisationId === supersededRun.organisationId, 'KPI_RESTATEMENT_ORGANISATION_MISMATCH', 'Restatement runs must belong to the same organisation');
  invariant(newRun.runMode === 'RESTATEMENT', 'KPI_RESTATEMENT_RUN_MODE_INVALID', 'New restatement run must use RESTATEMENT mode');
  invariant(KPI_RESTATEMENT_REASON_CODES.includes(reasonCode), 'KPI_RESTATEMENT_REASON_CODE_INVALID', 'KPI restatement reason code is invalid', { reasonCode });
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RESTATEMENT_ID_INVALID'),
    newRunId: newRun.id,
    supersededRunId: supersededRun.id,
    reasonCode,
    reason: requiredText(reason, 5, 4000, 'KPI_RESTATEMENT_REASON_INVALID'),
    approvedBy: requiredText(approvedBy, 1, 160, 'KPI_RESTATEMENT_APPROVER_INVALID'),
    createdAt: timestamp(createdAt, 'KPI_RESTATEMENT_CREATED_AT_INVALID'),
  }));
}

export function assertKpiObservationBundlePublishable({
  runStatusEvent,
  observations,
  qualityResults = [],
  reconciliationResults = [],
} = {}) {
  invariant(runStatusEvent?.runStatus === 'SUCCEEDED', 'KPI_PUBLICATION_RUN_NOT_SUCCEEDED', 'Only succeeded KPI runs can be published');
  invariant(Array.isArray(observations) && observations.length > 0, 'KPI_PUBLICATION_OBSERVATIONS_REQUIRED', 'Publication requires observations');
  invariant(observations.every((observation) => ['VALUE', 'ZERO', 'NOT_APPLICABLE'].includes(observation?.dataState)), 'KPI_PUBLICATION_DATA_STATE_BLOCKED', 'MISSING/INVALID observations cannot be normally published');
  const blockingQuality = qualityResults.filter((result) => ['ERROR', 'BLOCKING'].includes(result?.severity) && ['FAIL', 'MISSING_EVIDENCE'].includes(result?.resultStatus));
  invariant(blockingQuality.length === 0, 'KPI_PUBLICATION_QUALITY_BLOCKED', 'Blocking/error quality results prevent publication', { resultIds: blockingQuality.map((item) => item.id) });
  const failedReconciliation = reconciliationResults.filter((result) => ['FAIL', 'MISSING_EVIDENCE'].includes(result?.resultStatus));
  invariant(failedReconciliation.length === 0, 'KPI_PUBLICATION_RECONCILIATION_BLOCKED', 'Failed/missing reconciliation prevents publication', { resultIds: failedReconciliation.map((item) => item.id) });
  return true;
}

function assertRunStatusTransition({ run, previousEvent, runStatus, createdAt }) {
  if (!previousEvent) {
    invariant(runStatus === 'REQUESTED', 'KPI_RUN_INITIAL_STATUS_INVALID', 'Initial KPI run status must be REQUESTED');
    return;
  }
  invariant(previousEvent.runId === run.id, 'KPI_RUN_STATUS_PREVIOUS_RUN_MISMATCH', 'Previous status event belongs to another run');
  invariant(Date.parse(createdAt) >= Date.parse(previousEvent.createdAt), 'KPI_RUN_STATUS_TIME_ORDER_INVALID', 'KPI run status history cannot move time backwards');
  invariant(!['SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED'].includes(previousEvent.runStatus), 'KPI_RUN_STATUS_TERMINAL', 'Terminal KPI run status cannot advance');
  const allowed = previousEvent.runStatus === 'REQUESTED'
    ? ['RUNNING', 'REJECTED', 'CANCELLED']
    : previousEvent.runStatus === 'RUNNING'
      ? ['SUCCEEDED', 'FAILED', 'CANCELLED']
      : [];
  invariant(allowed.includes(runStatus), 'KPI_RUN_STATUS_TRANSITION_INVALID', 'KPI run status transition is invalid', { previousStatus: previousEvent.runStatus, runStatus });
}

function assertObservationValueShape(dataState, valueNumeric) {
  if (dataState === 'VALUE') {
    invariant(Number.isFinite(valueNumeric) && valueNumeric !== 0, 'KPI_VALUE_STATE_NUMERIC_INVALID', 'VALUE state requires non-zero finite numeric value');
    return;
  }
  if (dataState === 'ZERO') {
    invariant(Object.is(valueNumeric, 0) || valueNumeric === 0, 'KPI_ZERO_STATE_NUMERIC_INVALID', 'ZERO state requires numeric zero');
    return;
  }
  invariant(valueNumeric === null || valueNumeric === undefined, 'KPI_NONVALUE_STATE_NUMERIC_FORBIDDEN', `${dataState} state must not carry canonical numeric value`);
}

function normalizeObservationTime({ periodStart, periodEnd, asOfTimestamp }, code) {
  if (periodStart === null || periodStart === undefined) {
    invariant(periodEnd === null || periodEnd === undefined, code, 'periodStart and periodEnd must be supplied together');
    return Object.freeze({ periodStart: null, periodEnd: null, asOfTimestamp: timestamp(asOfTimestamp, code) });
  }
  const start = timestamp(periodStart, code);
  const end = timestamp(periodEnd, code);
  invariant(Date.parse(end) > Date.parse(start), code, 'periodEnd must be after periodStart');
  return Object.freeze({
    periodStart: start,
    periodEnd: end,
    asOfTimestamp: asOfTimestamp === null || asOfTimestamp === undefined ? null : timestamp(asOfTimestamp, code),
  });
}

function withHash(basis) {
  return Object.freeze({ ...basis, contentHash: sha256(canonicalJson(basis)) });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function frozenObject(value, code) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Value must be a JSON object');
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requiredId(value, code) {
  invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Identifier is invalid');
  return value;
}

function optionalId(value, code) {
  if (value === null || value === undefined || value === '') return null;
  return requiredId(value, code);
}

function requiredText(value, min, max, code) {
  invariant(typeof value === 'string', code, 'Text is required');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= min && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized), code, 'Text is invalid');
  return normalized;
}

function timestamp(value, code) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), code, 'Timestamp is invalid');
  return new Date(value).toISOString();
}

function numericOrNull(value, code) {
  if (value === null || value === undefined) return null;
  invariant(Number.isFinite(value), code, 'Numeric value must be finite');
  return value;
}
