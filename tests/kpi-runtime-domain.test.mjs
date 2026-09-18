import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createKpiDefinitionReleaseEvent,
  createKpiDefinitionVersion,
  createKpiSourceMappingVerificationEvent,
  createKpiSourceMappingVersion,
} from '../src/modules/kpi-registry/public.mjs';
import {
  assertKpiObservationBundlePublishable,
  createKpiCalculationRun,
  createKpiObservation,
  createKpiQualityResult,
  createKpiReconciliationResult,
  createKpiRunDefinitionBinding,
  createKpiRunMappingBinding,
  createKpiRunRestatement,
  createKpiRunStatusEvent,
} from '../src/modules/kpi-runtime/public.mjs';

const HASH = 'a'.repeat(64);

function definition(overrides = {}) {
  return createKpiDefinitionVersion({
    id: 'def-1', scopeType: 'system', kpiCode: 'SYNTH-LOG-001', formulaVersion: '17.0', role: 'CANONICAL',
    canonicalNameRu: 'Доля принятого товара', canonicalNameEn: 'Receipt Acceptance Rate', domainCode: 'LOG',
    businessDefinition: 'Share of received units accepted after disposition.',
    businessFormula: 'AcceptedQuantity / ReceivedQuantity', calculationPrimitive: 'TRUE_SUBSET_SHARE', canonicalUom: 'ratio',
    directionality: 'higher_is_better', goalFunction: 'MAXIMIZE',
    grainContract: { grain: ['ReceiptSnapshotID', 'ShipmentLineID'] },
    populationContract: { denominator: 'received units', numeratorSubset: true },
    temporalContract: { class: 'PERIOD_EXPOSURE', eventTime: 'receivedAt' },
    aggregationContract: { rule: 'ratio_of_sums' },
    dimensionalContract: { numeratorUom: 'unit', denominatorUom: 'unit', outputUom: 'ratio' },
    zeroNullErrorPolicy: { zeroExposure: 'NOT_APPLICABLE', nonZeroNumeratorWithZeroExposure: 'INVALID' },
    controlContract: { identity: 'accepted + damaged + rejected = received' },
    publicationContract: { storageScale: 'decimal', display: 'percent' },
    effectiveFrom: '2026-08-11T00:00:00.000Z', createdAt: '2026-08-11T00:00:00.000Z', createdBy: 'governance-1',
    ...overrides,
  });
}

function readyRelease(def) {
  return createKpiDefinitionReleaseEvent({
    id: 'release-ready', definition: def, releaseStatus: 'PRODUCTION_READY',
    evidence: {
      verifiedMappingIds: ['map-accepted', 'map-received'], calculationTestsPassed: true,
      populationTestsPassed: true, reconciliationStatus: 'PASS', ownerUatPassed: true, dataStewardUatPassed: true,
    },
    createdAt: '2026-08-12T01:00:00.000Z', createdBy: 'governance-1',
  });
}

function run(overrides = {}) {
  return createKpiCalculationRun({
    id: 'run-1', organisationId: 'org-1', runMode: 'NORMAL', commandId: 'cmd-1', requestedBy: 'user-1',
    periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-09-01T00:00:00.000Z',
    reportingTimezone: 'Europe/Moscow', engineVersion: 'kpi-engine-v18',
    sourceManifest: { watermark: '2026-09-02T00:00:00Z', contracts: ['NATIVE-RECEIPT'] },
    inputManifestHash: HASH, requestedAt: '2026-09-02T01:00:00.000Z',
    ...overrides,
  });
}

function activation(def) {
  return Object.freeze({
    id: 'activation-1', kpiDefinitionId: def.id, mappingSetVersion: 1,
    createdAt: '2026-08-12T03:00:00.000Z',
  });
}

function binding(def = definition(), currentRun = run()) {
  return createKpiRunDefinitionBinding({
    id: 'binding-1', run: currentRun, definition: def, releaseEvent: readyRelease(def), activationEvent: activation(def),
    mappingSetVersion: 1, selectionReason: 'current production-ready definition and active verified mapping set',
    createdAt: '2026-09-02T01:01:00.000Z', createdBy: 'engine-1',
  });
}

test('calculation run requires reproducible period or point-in-time basis', () => {
  assert.equal(run().asOfTimestamp, null);
  const snapshot = run({ id: 'run-snapshot', commandId: 'cmd-snapshot', periodStart: null, periodEnd: null, asOfTimestamp: '2026-08-31T23:59:59Z' });
  assert.equal(snapshot.periodStart, null);
  assert.equal(snapshot.asOfTimestamp, '2026-08-31T23:59:59.000Z');
  assert.throws(() => run({ id: 'bad', commandId: 'bad', periodStart: null, periodEnd: null, asOfTimestamp: null }), (error) => error?.code === 'KPI_RUN_TIME_SHAPE_INVALID');
  assert.throws(() => run({ id: 'empty-source', commandId: 'empty-source', sourceManifest: {} }), (error) => error?.code === 'KPI_RUN_SOURCE_MANIFEST_INVALID');
});

test('run lifecycle is append-only and terminal events need evidence', () => {
  const currentRun = run();
  const requested = createKpiRunStatusEvent({ id: 's1', run: currentRun, runStatus: 'REQUESTED', evidence: {}, createdAt: currentRun.requestedAt, createdBy: 'engine' });
  const running = createKpiRunStatusEvent({ id: 's2', run: currentRun, previousEvent: requested, runStatus: 'RUNNING', evidence: {}, createdAt: '2026-09-02T01:01:00Z', createdBy: 'engine' });
  const succeeded = createKpiRunStatusEvent({ id: 's3', run: currentRun, previousEvent: running, runStatus: 'SUCCEEDED', evidence: { outputManifestHash: 'b'.repeat(64) }, createdAt: '2026-09-02T01:02:00Z', createdBy: 'engine' });
  assert.equal(succeeded.runStatus, 'SUCCEEDED');
  assert.throws(() => createKpiRunStatusEvent({ id: 's4', run: currentRun, previousEvent: succeeded, runStatus: 'RUNNING', evidence: {}, createdAt: '2026-09-02T01:03:00Z', createdBy: 'engine' }), (error) => error?.code === 'KPI_RUN_STATUS_TERMINAL');
});

test('run binds exact ready definition and governance events that existed by request time', () => {
  const def = definition();
  const currentRun = run();
  const bound = binding(def, currentRun);
  assert.equal(bound.mappingSetVersion, 1);

  const futureActivation = { ...activation(def), id: 'future-activation', createdAt: '2026-09-03T00:00:00Z' };
  assert.throws(() => createKpiRunDefinitionBinding({
    id: 'future-binding', run: currentRun, definition: def, releaseEvent: readyRelease(def), activationEvent: futureActivation,
    mappingSetVersion: 1, selectionReason: 'invalid future event', createdAt: '2026-09-03T01:00:00Z', createdBy: 'engine',
  }), (error) => error?.code === 'KPI_RUN_ACTIVATION_FROM_FUTURE');
});

test('run mapping binding pins exact mapping and verified event', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const mapping = createKpiSourceMappingVersion({
    id: 'map-accepted', definition: def, mappingSetVersion: 1, variableName: 'AcceptedQuantity',
    sourceContractId: 'NATIVE-RECEIPT', sourceSystem: 'SYNTH-V2', sourceEntity: 'receipt_snapshots',
    sourcePath: 'lines[].acceptedQuantity', datatype: 'integer', primaryOrEventKey: 'receiptSnapshotId + lineId',
    eventTimestampPath: 'receivedAt', joinContract: {}, filterContract: {}, createdAt: '2026-08-12T01:00:00Z', createdBy: 'engineer',
  });
  const verification = createKpiSourceMappingVerificationEvent({
    id: 'verify-accepted', mapping, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward', verificationMethod: 'repository source contract + fixture' },
    createdAt: '2026-08-12T02:00:00Z', createdBy: 'steward',
  });
  const mapped = createKpiRunMappingBinding({
    id: 'rmb-1', run: currentRun, definitionBinding: defBinding, mapping, verificationEvent: verification,
    createdAt: '2026-09-02T01:01:30Z', createdBy: 'engine',
  });
  assert.equal(mapped.verificationEventId, verification.id);
});

test('observation uses exact decimal strings and distinct data states', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const common = {
    run: currentRun, definition: def, definitionBinding: defBinding,
    periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z',
    grain: { factoryId: 'factory-1' }, canonicalUom: 'ratio',
    sourceLineage: { sourceContracts: ['NATIVE-RECEIPT'], mappingSetVersion: 1 }, calculatedAt: '2026-09-02T01:02:00Z',
  };
  const value = createKpiObservation({ id: 'obs-value', ...common, dataState: 'VALUE', valueNumeric: '0.964', numeratorNumeric: '482', denominatorNumeric: '500' });
  assert.equal(value.valueNumeric, '0.964');
  assert.match(value.grainHash, /^[a-f0-9]{64}$/);

  const zero = createKpiObservation({ id: 'obs-zero', ...common, dataState: 'ZERO', valueNumeric: '0.000', numeratorNumeric: '0', denominatorNumeric: '100' });
  assert.equal(zero.valueNumeric, '0');

  const na = createKpiObservation({ id: 'obs-na', ...common, dataState: 'NOT_APPLICABLE', valueNumeric: null, numeratorNumeric: '0', denominatorNumeric: '0' });
  assert.equal(na.valueNumeric, null);

  assert.throws(() => createKpiObservation({ id: 'obs-float', ...common, dataState: 'VALUE', valueNumeric: 0.964 }), (error) => error?.code === 'KPI_VALUE_STATE_NUMERIC_INVALID');
  assert.throws(() => createKpiObservation({ id: 'obs-invalid-number', ...common, dataState: 'INVALID', valueNumeric: '0.5' }), (error) => error?.code === 'KPI_NONVALUE_STATE_NUMERIC_FORBIDDEN');
  assert.throws(() => createKpiObservation({ id: 'obs-uom', ...common, dataState: 'VALUE', valueNumeric: '0.9', canonicalUom: 'percent' }), (error) => error?.code === 'KPI_OBSERVATION_UOM_MISMATCH');
});

test('reconciliation computes exact decimal absolute difference', () => {
  const currentRun = run();
  const defBinding = binding(definition(), currentRun);
  const result = createKpiReconciliationResult({
    id: 'recon-1', run: currentRun, definitionBinding: defBinding,
    reconciliationRuleId: 'money-control', reconciliationRuleVersion: '1.0',
    observedNumeric: '9007199254740993.01', expectedNumeric: '9007199254740992.99', relativeDifference: '0.000000000002',
    toleranceContract: { absoluteTolerance: '0' }, resultStatus: 'FAIL', evidence: {}, evaluatedAt: '2026-09-02T01:03:00Z',
  });
  assert.equal(result.absoluteDifference, '0.02');
});

test('restatement is a new immutable run on the same reporting window', () => {
  const oldRun = run({ id: 'old', commandId: 'old' });
  const newRun = run({ id: 'new', commandId: 'new', runMode: 'RESTATEMENT', requestedAt: '2026-09-05T00:00:00Z' });
  const restatement = createKpiRunRestatement({
    id: 'rest-1', newRun, supersededRun: oldRun, reasonCode: 'LATE_SOURCE_FACT',
    reason: 'Final freight invoice arrived after the original period close.', approvedBy: 'finance-owner', createdAt: '2026-09-05T00:01:00Z',
  });
  assert.equal(restatement.supersededRunId, oldRun.id);
  assert.throws(() => createKpiRunRestatement({
    id: 'rest-bad', newRun: run({ id: 'bad-new', commandId: 'bad-new', runMode: 'RESTATEMENT', periodEnd: '2026-10-01T00:00:00Z', requestedAt: '2026-10-02T00:00:00Z' }),
    supersededRun: oldRun, reasonCode: 'LATE_SOURCE_FACT', reason: 'Wrong window.', approvedBy: 'owner', createdAt: '2026-10-02T00:01:00Z',
  }), (error) => error?.code === 'KPI_RESTATEMENT_WINDOW_MISMATCH');
});

test('publication gate blocks missing/invalid values, blocking DQ and failed reconciliation', () => {
  const currentRun = run();
  const defBinding = binding(definition(), currentRun);
  const succeeded = { runStatus: 'SUCCEEDED' };
  const valid = { id: 'obs', dataState: 'VALUE' };
  assert.equal(assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [valid] }), true);
  assert.throws(() => assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [{ id: 'bad', dataState: 'MISSING' }] }), (error) => error?.code === 'KPI_PUBLICATION_DATA_STATE_BLOCKED');

  const dq = createKpiQualityResult({
    id: 'dq-1', run: currentRun, definitionBinding: defBinding, ruleId: 'uom', ruleVersion: '1.0', ruleFamily: 'UOM_DIMENSION',
    severity: 'BLOCKING', resultStatus: 'FAIL', observedPayload: {}, expectedContract: {}, evidence: {}, evaluatedAt: '2026-09-02T01:03:00Z',
  });
  assert.throws(() => assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [valid], qualityResults: [dq] }), (error) => error?.code === 'KPI_PUBLICATION_QUALITY_BLOCKED');
});
