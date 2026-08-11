import { createHash } from 'node:crypto';

import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import {
  absoluteKpiDecimalDifference,
  canonicalKpiDecimal,
  isZeroKpiDecimal,
  optionalKpiDecimal,
} from './decimal.mjs';

export const KPI_RUN_MODES = Object.freeze(['NORMAL', 'RESTATEMENT', 'RECONSTRUCTION']);
export const KPI_RUN_STATUSES = Object.freeze(['REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED']);
export const KPI_DATA_STATES = Object.freeze(['VALUE', 'ZERO', 'NOT_APPLICABLE', 'MISSING', 'INVALID']);
export const KPI_QUALITY_STATUSES = Object.freeze(['PASS', 'FAIL', 'NOT_APPLICABLE', 'MISSING_EVIDENCE']);
export const KPI_QUALITY_SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'BLOCKING']);
export const KPI_QUALITY_RULE_FAMILIES = Object.freeze([
  'SCHEMA', 'REQUIRED_INPUT', 'DUPLICATE_EVENT', 'REFERENTIAL_INTEGRITY', 'JOIN_CARDINALITY',
  'UOM_DIMENSION', 'CURRENCY_FX', 'EVENT_CHRONOLOGY', 'POPULATION', 'NUMERATOR_SUBSET',
  'MATHEMATICAL_RANGE', 'MEASUREMENT_VALIDITY', 'RECONCILIATION', 'PUBLICATION_GATE', 'ANTI_GAMING',
]);
export const KPI_RESTATEMENT_REASON_CODES = Object.freeze([
  'LATE_SOURCE_FACT', 'SOURCE_CORRECTION', 'REVERSAL', 'MAPPING_CORRECTION', 'FORMULA_CORRECTION',
  'FX_REFERENCE_CORRECTION', 'DUPLICATE_REMEDIATION', 'GOVERNANCE_CORRECTION',
]);

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CONTROL_SCOPES = new Set(['OBSERVATION', 'BINDING']);

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
  requestedAt,
} = {}) {
  invariant(KPI_RUN_MODES.includes(runMode), 'KPI_RUN_MODE_INVALID', 'KPI run mode is invalid', { runMode });
  const time = normalizeTimeShape({ periodStart, periodEnd, asOfTimestamp }, 'KPI_RUN_TIME_SHAPE_INVALID');
  const manifest = normalizeSourceManifest(sourceManifest);
  const basis = Object.freeze({
    id: requiredId(id, 'KPI_RUN_ID_INVALID'),
    organisationId: requiredId(organisationId, 'KPI_RUN_ORGANISATION_ID_INVALID'),
    runMode,
    commandId: optionalId(commandId, 'KPI_RUN_COMMAND_ID_INVALID'),
    requestedBy: requiredText(requestedBy, 1, 160, 'KPI_RUN_REQUESTED_BY_INVALID'),
    ...time,
    reportingTimezone: requiredText(reportingTimezone, 1, 120, 'KPI_RUN_TIMEZONE_INVALID'),
    engineVersion: requiredText(engineVersion, 1, 160, 'KPI_RUN_ENGINE_VERSION_INVALID'),
    sourceManifest: manifest,
    sourceManifestHash: sha256(canonicalJson(manifest)),
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
  invariant(Date.parse(at) >= Date.parse(run.requestedAt), 'KPI_RUN_STATUS_BEFORE_REQUEST', 'KPI run status event cannot precede run request');
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
  invariant(['CANONICAL', 'SPLIT_CHILD'].includes(definition.role), 'KPI_RUN_DEFINITION_NONCALCULABLE', 'Run binding requires a calculable KPI definition');
  if (definition.scopeType === 'organisation') {
    invariant(definition.organisationId === run.organisationId, 'KPI_RUN_DEFINITION_ORGANISATION_MISMATCH', 'Organisation-scoped KPI definition does not belong to run organisation');
  }
  invariant(releaseEvent?.kpiDefinitionId === definition.id && releaseEvent.releaseStatus === 'PRODUCTION_READY', 'KPI_RUN_RELEASE_NOT_READY', 'Run binding requires PRODUCTION_READY release event for the same definition');
  invariant(activationEvent?.kpiDefinitionId === definition.id, 'KPI_RUN_ACTIVATION_DEFINITION_MISMATCH', 'Run activation event belongs to another definition');
  invariant(Number.isSafeInteger(mappingSetVersion) && mappingSetVersion > 0, 'KPI_RUN_MAPPING_SET_VERSION_INVALID', 'Run mapping set version must be a positive integer');
  invariant(activationEvent.mappingSetVersion === mappingSetVersion, 'KPI_RUN_ACTIVATION_MAPPING_SET_MISMATCH', 'Run mapping set must match activation event');
  assertMappingSetActivationCertified(activationEvent);
  assertGovernanceEventNotFromFuture(releaseEvent, run, 'KPI_RUN_RELEASE_FROM_FUTURE');
  assertGovernanceEventNotFromFuture(activationEvent, run, 'KPI_RUN_ACTIVATION_FROM_FUTURE');
  const at = timestamp(createdAt, 'KPI_RUN_BINDING_CREATED_AT_INVALID');
  invariant(Date.parse(at) >= Date.parse(run.requestedAt), 'KPI_RUN_BINDING_BEFORE_REQUEST', 'Run definition binding cannot precede run request');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RUN_DEFINITION_BINDING_ID_INVALID'),
    runId: run.id,
    kpiDefinitionId: definition.id,
    releaseEventId: releaseEvent.id,
    activationEventId: activationEvent.id,
    mappingSetVersion,
    selectionReason: requiredText(selectionReason, 3, 1000, 'KPI_RUN_SELECTION_REASON_INVALID'),
    createdAt: at,
    createdBy: requiredText(createdBy, 1, 160, 'KPI_RUN_BINDING_CREATED_BY_INVALID'),
  }));
}

export function createKpiRunMappingBinding({
  id,
  run,
  definitionBinding,
  mapping,
  verificationEvent,
  createdAt,
  createdBy,
} = {}) {
  invariant(run?.id && definitionBinding?.id && mapping?.id, 'KPI_RUN_MAPPING_REQUIRED', 'Run mapping binding requires run, definition binding and mapping');
  invariant(definitionBinding.runId === run.id, 'KPI_RUN_MAPPING_BINDING_RUN_MISMATCH', 'Definition binding belongs to another run');
  invariant(mapping.kpiDefinitionId === definitionBinding.kpiDefinitionId, 'KPI_RUN_MAPPING_DEFINITION_MISMATCH', 'Run mapping belongs to another definition');
  invariant(mapping.mappingSetVersion === definitionBinding.mappingSetVersion, 'KPI_RUN_MAPPING_SET_MISMATCH', 'Run mapping belongs to another mapping-set version');
  invariant(verificationEvent?.kpiSourceMappingId === mapping.id && verificationEvent.verificationStatus === 'VERIFIED', 'KPI_RUN_MAPPING_NOT_VERIFIED', 'Run mapping binding requires VERIFIED event for selected mapping');
  assertGovernanceEventNotFromFuture(verificationEvent, run, 'KPI_RUN_MAPPING_VERIFICATION_FROM_FUTURE');
  const at = timestamp(createdAt, 'KPI_RUN_MAPPING_CREATED_AT_INVALID');
  invariant(Date.parse(at) >= Date.parse(run.requestedAt), 'KPI_RUN_MAPPING_BEFORE_REQUEST', 'Run mapping binding cannot precede run request');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RUN_MAPPING_BINDING_ID_INVALID'),
    runDefinitionBindingId: definitionBinding.id,
    variableName: requiredText(mapping.variableName, 1, 160, 'KPI_RUN_MAPPING_VARIABLE_INVALID'),
    kpiSourceMappingId: mapping.id,
    verificationEventId: verificationEvent.id,
    createdAt: at,
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
  const canonicalValue = observationValue(dataState, valueNumeric);
  const time = normalizeTimeShape({ periodStart, periodEnd, asOfTimestamp }, 'KPI_OBSERVATION_TIME_SHAPE_INVALID');
  assertObservationInsideRun(run, time);
  const frozenGrain = frozenObject(grain, 'KPI_OBSERVATION_GRAIN_INVALID');
  const frozenComponents = frozenObject(componentPayload, 'KPI_OBSERVATION_COMPONENT_PAYLOAD_INVALID');
  if (['NOT_APPLICABLE', 'MISSING', 'INVALID'].includes(dataState)) {
    invariant(typeof frozenComponents.stateReason === 'string' && frozenComponents.stateReason.trim().length >= 3, 'KPI_OBSERVATION_STATE_REASON_REQUIRED', `${dataState} observation requires componentPayload.stateReason`);
  }
  const grainHash = sha256(canonicalJson(frozenGrain));
  const outputUom = requiredText(canonicalUom, 1, 120, 'KPI_OBSERVATION_UOM_INVALID');
  invariant(outputUom === definition.canonicalUom, 'KPI_OBSERVATION_UOM_MISMATCH', 'Observation canonical UOM does not match definition', { expected: definition.canonicalUom, actual: outputUom });
  const calculated = timestamp(calculatedAt, 'KPI_OBSERVATION_CALCULATED_AT_INVALID');
  invariant(Date.parse(calculated) >= Date.parse(run.requestedAt), 'KPI_OBSERVATION_BEFORE_RUN_REQUEST', 'Observation cannot be calculated before run request');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_OBSERVATION_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    organisationId: run.organisationId,
    ...time,
    grain: frozenGrain,
    grainHash,
    dataState,
    valueNumeric: canonicalValue,
    canonicalUom: outputUom,
    numeratorNumeric: optionalKpiDecimal(numeratorNumeric, 'KPI_OBSERVATION_NUMERATOR_INVALID'),
    denominatorNumeric: optionalKpiDecimal(denominatorNumeric, 'KPI_OBSERVATION_DENOMINATOR_INVALID'),
    normalizerK: optionalKpiDecimal(normalizerK, 'KPI_OBSERVATION_NORMALIZER_INVALID'),
    componentPayload: frozenComponents,
    sourceLineage: requiredNonEmptyObject(sourceLineage, 'KPI_OBSERVATION_SOURCE_LINEAGE_INVALID'),
    calculatedAt: calculated,
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
  invariant(KPI_QUALITY_RULE_FAMILIES.includes(ruleFamily), 'KPI_QUALITY_RULE_FAMILY_INVALID', 'KPI quality rule family is invalid', { ruleFamily });
  invariant(KPI_QUALITY_SEVERITIES.includes(severity), 'KPI_QUALITY_SEVERITY_INVALID', 'KPI quality severity is invalid', { severity });
  invariant(KPI_QUALITY_STATUSES.includes(resultStatus), 'KPI_QUALITY_STATUS_INVALID', 'KPI quality status is invalid', { resultStatus });
  const frozenEvidence = frozenObject(evidence, 'KPI_QUALITY_EVIDENCE_INVALID');
  if (resultStatus === 'NOT_APPLICABLE') {
    invariant(typeof frozenEvidence.applicabilityReason === 'string' && frozenEvidence.applicabilityReason.trim().length >= 3, 'KPI_QUALITY_NA_REASON_REQUIRED', 'NOT_APPLICABLE quality result requires applicabilityReason evidence');
  }
  const evaluated = timestamp(evaluatedAt, 'KPI_QUALITY_EVALUATED_AT_INVALID');
  invariant(Date.parse(evaluated) >= Date.parse(run.requestedAt), 'KPI_QUALITY_BEFORE_RUN_REQUEST', 'KPI quality result cannot precede run request');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_QUALITY_RESULT_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    observationId: observation?.id ?? null,
    ruleId: requiredText(ruleId, 1, 160, 'KPI_QUALITY_RULE_ID_INVALID'),
    ruleVersion: requiredText(ruleVersion, 1, 80, 'KPI_QUALITY_RULE_VERSION_INVALID'),
    ruleFamily,
    severity,
    resultStatus,
    observedPayload: frozenObject(observedPayload, 'KPI_QUALITY_OBSERVED_INVALID'),
    expectedContract: frozenObject(expectedContract, 'KPI_QUALITY_EXPECTED_INVALID'),
    evidence: frozenEvidence,
    evaluatedAt: evaluated,
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
  const observed = optionalKpiDecimal(observedNumeric, 'KPI_RECONCILIATION_OBSERVED_INVALID');
  const expected = optionalKpiDecimal(expectedNumeric, 'KPI_RECONCILIATION_EXPECTED_INVALID');
  if (['PASS', 'FAIL'].includes(resultStatus)) {
    invariant(observed !== null && expected !== null, 'KPI_RECONCILIATION_NUMERIC_REQUIRED', 'PASS/FAIL reconciliation requires observed and expected values');
  }
  const frozenEvidence = frozenObject(evidence, 'KPI_RECONCILIATION_EVIDENCE_INVALID');
  if (resultStatus === 'NOT_APPLICABLE') {
    invariant(typeof frozenEvidence.applicabilityReason === 'string' && frozenEvidence.applicabilityReason.trim().length >= 3, 'KPI_RECONCILIATION_NA_REASON_REQUIRED', 'NOT_APPLICABLE reconciliation requires applicabilityReason evidence');
  }
  const evaluated = timestamp(evaluatedAt, 'KPI_RECONCILIATION_EVALUATED_AT_INVALID');
  invariant(Date.parse(evaluated) >= Date.parse(run.requestedAt), 'KPI_RECONCILIATION_BEFORE_RUN_REQUEST', 'KPI reconciliation result cannot precede run request');
  return withHash(Object.freeze({
    id: requiredId(id, 'KPI_RECONCILIATION_RESULT_ID_INVALID'),
    runId: run.id,
    runDefinitionBindingId: definitionBinding.id,
    observationId: observation?.id ?? null,
    reconciliationRuleId: requiredText(reconciliationRuleId, 1, 160, 'KPI_RECONCILIATION_RULE_ID_INVALID'),
    reconciliationRuleVersion: requiredText(reconciliationRuleVersion, 1, 80, 'KPI_RECONCILIATION_RULE_VERSION_INVALID'),
    observedNumeric: observed,
    expectedNumeric: expected,
    absoluteDifference: observed === null || expected === null ? null : absoluteKpiDecimalDifference(observed, expected),
    relativeDifference: optionalKpiDecimal(relativeDifference, 'KPI_RECONCILIATION_RELATIVE_INVALID'),
    toleranceContract: frozenObject(toleranceContract, 'KPI_RECONCILIATION_TOLERANCE_INVALID'),
    resultStatus,
    evidence: frozenEvidence,
    evaluatedAt: evaluated,
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
  invariant(newRun.periodStart === supersededRun.periodStart && newRun.periodEnd === supersededRun.periodEnd && newRun.asOfTimestamp === supersededRun.asOfTimestamp, 'KPI_RESTATEMENT_WINDOW_MISMATCH', 'Restatement must preserve reporting window/as-of');
  invariant(Date.parse(newRun.requestedAt) > Date.parse(supersededRun.requestedAt), 'KPI_RESTATEMENT_TIME_ORDER_INVALID', 'Restatement run must be requested after the superseded run');
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
  controlContract = {},
} = {}) {
  invariant(runStatusEvent?.runStatus === 'SUCCEEDED', 'KPI_PUBLICATION_RUN_NOT_SUCCEEDED', 'Only succeeded KPI runs can be published');
  invariant(Array.isArray(observations) && observations.length > 0, 'KPI_PUBLICATION_OBSERVATIONS_REQUIRED', 'Publication requires observations');
  invariant(observations.every((observation) => ['VALUE', 'ZERO', 'NOT_APPLICABLE'].includes(observation?.dataState)), 'KPI_PUBLICATION_DATA_STATE_BLOCKED', 'MISSING/INVALID observations cannot be normally published');

  const blockingQuality = qualityResults.filter((result) => ['ERROR', 'BLOCKING'].includes(result?.severity) && ['FAIL', 'MISSING_EVIDENCE'].includes(result?.resultStatus));
  invariant(blockingQuality.length === 0, 'KPI_PUBLICATION_QUALITY_BLOCKED', 'Blocking/error quality results prevent publication', { resultIds: blockingQuality.map((item) => item.id) });
  const failedReconciliation = reconciliationResults.filter((result) => ['FAIL', 'MISSING_EVIDENCE'].includes(result?.resultStatus));
  invariant(failedReconciliation.length === 0, 'KPI_PUBLICATION_RECONCILIATION_BLOCKED', 'Failed/missing reconciliation prevents publication', { resultIds: failedReconciliation.map((item) => item.id) });

  const requiredQualityRules = normalizeRequiredRules(controlContract.requiredQualityRules, 'KPI_REQUIRED_QUALITY_RULE_INVALID');
  const requiredReconciliationRules = normalizeRequiredRules(controlContract.requiredReconciliationRules, 'KPI_REQUIRED_RECONCILIATION_RULE_INVALID');
  assertRequiredControlsSatisfied({ rules: requiredQualityRules, observations, results: qualityResults, family: 'QUALITY' });
  assertRequiredControlsSatisfied({ rules: requiredReconciliationRules, observations, results: reconciliationResults, family: 'RECONCILIATION' });
  return true;
}

export function assertMappingSetActivationCertified(activationEvent) {
  invariant(activationEvent?.evidence && typeof activationEvent.evidence === 'object', 'KPI_MAPPING_SET_CERTIFICATION_REQUIRED', 'Mapping-set activation requires certification evidence');
  const evidence = activationEvent.evidence;
  invariant(evidence.calculationRegressionPassed === true, 'KPI_MAPPING_SET_CALCULATION_REGRESSION_REQUIRED', 'Mapping-set activation requires calculation regression');
  invariant(evidence.populationRegressionPassed === true, 'KPI_MAPPING_SET_POPULATION_REGRESSION_REQUIRED', 'Mapping-set activation requires population regression');
  invariant(['PASS', 'NOT_APPLICABLE'].includes(evidence.reconciliationStatus), 'KPI_MAPPING_SET_RECONCILIATION_REQUIRED', 'Mapping-set activation requires reconciliation PASS or legitimate N/A');
  invariant(evidence.dataStewardUatPassed === true, 'KPI_MAPPING_SET_STEWARD_UAT_REQUIRED', 'Mapping-set activation requires data steward UAT');
  invariant(['PASS', 'NOT_REQUIRED'].includes(evidence.ownerUatStatus), 'KPI_MAPPING_SET_OWNER_UAT_REQUIRED', 'Mapping-set activation requires owner UAT PASS or governed NOT_REQUIRED');
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

function observationValue(dataState, value) {
  if (dataState === 'VALUE') {
    const canonical = canonicalKpiDecimal(value, 'KPI_VALUE_STATE_NUMERIC_INVALID');
    invariant(!isZeroKpiDecimal(canonical), 'KPI_VALUE_STATE_NUMERIC_INVALID', 'VALUE state requires non-zero decimal value');
    return canonical;
  }
  if (dataState === 'ZERO') {
    const canonical = canonicalKpiDecimal(value, 'KPI_ZERO_STATE_NUMERIC_INVALID');
    invariant(isZeroKpiDecimal(canonical), 'KPI_ZERO_STATE_NUMERIC_INVALID', 'ZERO state requires decimal zero');
    return '0';
  }
  invariant(value === null || value === undefined, 'KPI_NONVALUE_STATE_NUMERIC_FORBIDDEN', `${dataState} state must not carry canonical numeric value`);
  return null;
}

function normalizeSourceManifest(value) {
  const manifest = requiredNonEmptyObject(value, 'KPI_RUN_SOURCE_MANIFEST_INVALID');
  invariant(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'KPI_RUN_SOURCE_MANIFEST_SOURCES_REQUIRED', 'KPI run source manifest requires a non-empty sources array');
  const seen = new Set();
  for (const source of manifest.sources) {
    invariant(source && typeof source === 'object' && !Array.isArray(source), 'KPI_RUN_SOURCE_MANIFEST_SOURCE_INVALID', 'Source manifest entry must be an object');
    const contractId = requiredText(source.sourceContractId, 1, 160, 'KPI_RUN_SOURCE_CONTRACT_ID_INVALID');
    const sourceKey = requiredText(source.sourceKey, 1, 240, 'KPI_RUN_SOURCE_KEY_INVALID');
    invariant(!seen.has(`${contractId}\u0000${sourceKey}`), 'KPI_RUN_SOURCE_MANIFEST_DUPLICATE', 'Source manifest contains duplicate source contract/key', { contractId, sourceKey });
    seen.add(`${contractId}\u0000${sourceKey}`);
    const hasStablePoint = ['snapshotId', 'watermark', 'contentHash'].some((key) => typeof source[key] === 'string' && source[key].trim().length > 0);
    invariant(hasStablePoint, 'KPI_RUN_SOURCE_MANIFEST_STABLE_POINT_REQUIRED', 'Source manifest entry requires snapshotId, watermark or contentHash', { contractId, sourceKey });
    if (source.contentHash !== undefined) invariant(HASH_PATTERN.test(source.contentHash), 'KPI_RUN_SOURCE_CONTENT_HASH_INVALID', 'Source contentHash must be SHA-256');
  }
  return manifest;
}

function normalizeRequiredRules(value, code) {
  if (value === null || value === undefined) return Object.freeze([]);
  invariant(Array.isArray(value), code, 'Required control rules must be an array');
  const seen = new Set();
  const normalized = value.map((rule) => {
    invariant(rule && typeof rule === 'object' && !Array.isArray(rule), code, 'Required control rule must be an object');
    const normalizedRule = Object.freeze({
      id: requiredText(rule.id, 1, 160, code),
      version: requiredText(rule.version, 1, 80, code),
      scope: requiredText(rule.scope, 1, 20, code),
      allowNotApplicable: rule.allowNotApplicable,
    });
    invariant(CONTROL_SCOPES.has(normalizedRule.scope), code, 'Required control scope must be OBSERVATION or BINDING');
    invariant(typeof normalizedRule.allowNotApplicable === 'boolean', code, 'Required control allowNotApplicable must be boolean');
    const key = `${normalizedRule.id}\u0000${normalizedRule.version}\u0000${normalizedRule.scope}`;
    invariant(!seen.has(key), code, 'Required control rule id/version/scope must be unique');
    seen.add(key);
    return normalizedRule;
  });
  return Object.freeze(normalized);
}

function assertRequiredControlsSatisfied({ rules, observations, results, family }) {
  for (const rule of rules) {
    const targets = rule.scope === 'OBSERVATION' ? observations.map((observation) => observation.id) : [null];
    for (const observationId of targets) {
      const matching = results.find((result) => {
        const id = family === 'QUALITY' ? result?.ruleId : result?.reconciliationRuleId;
        const version = family === 'QUALITY' ? result?.ruleVersion : result?.reconciliationRuleVersion;
        return id === rule.id && version === rule.version && (result?.observationId ?? null) === observationId;
      });
      const satisfied = matching?.resultStatus === 'PASS'
        || (matching?.resultStatus === 'NOT_APPLICABLE' && rule.allowNotApplicable === true);
      invariant(satisfied, family === 'QUALITY' ? 'KPI_REQUIRED_QUALITY_CONTROL_UNSATISFIED' : 'KPI_REQUIRED_RECONCILIATION_UNSATISFIED', `Required ${family.toLowerCase()} control is not satisfied`, { ruleId: rule.id, ruleVersion: rule.version, scope: rule.scope, observationId });
    }
  }
}

function normalizeTimeShape({ periodStart, periodEnd, asOfTimestamp }, code) {
  if (periodStart === null || periodStart === undefined) {
    invariant(periodEnd === null || periodEnd === undefined, code, 'periodStart and periodEnd must be supplied together');
    return Object.freeze({ periodStart: null, periodEnd: null, asOfTimestamp: timestamp(asOfTimestamp, code) });
  }
  const start = timestamp(periodStart, code);
  const end = timestamp(periodEnd, code);
  invariant(Date.parse(end) > Date.parse(start), code, 'periodEnd must be after periodStart');
  return Object.freeze({ periodStart: start, periodEnd: end, asOfTimestamp: asOfTimestamp === null || asOfTimestamp === undefined ? null : timestamp(asOfTimestamp, code) });
}

function assertObservationInsideRun(run, observationTime) {
  if (run.periodStart === null) {
    invariant(observationTime.periodStart === null && observationTime.periodEnd === null && observationTime.asOfTimestamp === run.asOfTimestamp, 'KPI_OBSERVATION_RUN_TIME_MISMATCH', 'Snapshot observation must use the run as-of timestamp exactly');
    return;
  }
  invariant(observationTime.periodStart !== null && observationTime.periodEnd !== null, 'KPI_OBSERVATION_RUN_TIME_MISMATCH', 'Period run requires period observation');
  invariant(Date.parse(observationTime.periodStart) >= Date.parse(run.periodStart) && Date.parse(observationTime.periodEnd) <= Date.parse(run.periodEnd), 'KPI_OBSERVATION_RUN_TIME_MISMATCH', 'Observation period must stay inside run reporting period');
  if (run.asOfTimestamp !== null) invariant(observationTime.asOfTimestamp !== null && Date.parse(observationTime.asOfTimestamp) <= Date.parse(run.asOfTimestamp), 'KPI_OBSERVATION_RUN_ASOF_MISMATCH', 'Observation as-of cannot exceed run as-of');
}

function assertGovernanceEventNotFromFuture(event, run, code) {
  invariant(typeof event?.createdAt === 'string' && Number.isFinite(Date.parse(event.createdAt)), code, 'Governance event timestamp is required');
  invariant(Date.parse(event.createdAt) <= Date.parse(run.requestedAt), code, 'Run cannot bind governance evidence created after run request');
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

function requiredNonEmptyObject(value, code) {
  const frozen = frozenObject(value, code);
  invariant(Object.keys(frozen).length > 0, code, 'Value must be a non-empty JSON object');
  return frozen;
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
