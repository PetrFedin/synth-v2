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
    id: 'def-1',
    scopeType: 'system',
    kpiCode: 'SYNTH-LOG-001',
    formulaVersion: '17.0',
    role: 'CANONICAL',
    canonicalNameRu: 'Доля принятого товара',
    canonicalNameEn: 'Receipt Acceptance Rate',
    domainCode: 'LOG',
    businessDefinition: 'Share of received units accepted after disposition.',
    businessFormula: 'AcceptedQuantity / ReceivedQuantity',
    calculationPrimitive: 'TRUE_SUBSET_SHARE',
    canonicalUom: 'ratio',
    directionality: 'higher_is_better',
    goalFunction: 'MAXIMIZE',
    grainContract: { grain: ['ReceiptSnapshotID', 'ShipmentLineID'] },
    populationContract: { denominator: 'received units', numeratorSubset: true },
    temporalContract: { class: 'PERIOD_EXPOSURE', eventTime: 'receivedAt' },
    aggregationContract: { rule: 'ratio_of_sums' },
    dimensionalContract: { numeratorUom: 'unit', denominatorUom: 'unit', outputUom: 'ratio' },
    zeroNullErrorPolicy: { zeroExposure: 'NOT_APPLICABLE', nonZeroNumeratorWithZeroExposure: 'INVALID' },
    controlContract: { identity: 'accepted + damaged + rejected = received' },
    publicationContract: { storageScale: 'decimal', display: 'percent' },
    effectiveFrom: '2026-08-11T00:00:00.000Z',
    createdAt: '2026-08-11T00:00:00.000Z',
    createdBy: 'governance-1',
    ...overrides,
  });
}

function readyRelease(def) {
  return createKpiDefinitionReleaseEvent({
    id: 'release-ready',
    definition: def,
    releaseStatus: 'PRODUCTION_READY',
    evidence: {
      verifiedMappingIds: ['map-accepted', 'map-received'],
      calculationTestsPassed: true,
      populationTestsPassed: true,
      reconciliationStatus: 'PASS',
      ownerUatPassed: true,
      dataStewardUatPassed: true,
    },
    createdAt: '2026-08-11T01:00:00.000Z',
    createdBy: 'governance-1',
  });
}

function run(overrides = {}) {
  return createKpiCalculationRun({
    id: 'run-1',
    organisationId: 'org-1',
    runMode: 'NORMAL',
    commandId: 'cmd-1',
    requestedBy: 'user-1',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    reportingTimezone: 'Europe/Moscow',
    engineVersion: 'kpi-engine-v18',
    sourceManifest: { watermark: '2026-09-02T00:00:00Z' },
    inputManifestHash: HASH,
    requestedAt: '2026-09-02T01:00:00.000Z',
    ...overrides,
  });
}

function binding(def = definition(), currentRun = run()) {
  const release = readyRelease(def);
  const activation = Object.freeze({ id: 'activation-1', kpiDefinitionId: def.id, mappingSetVersion: 1 });
  return createKpiRunDefinitionBinding({
    id: 'binding-1',
    run: currentRun,
    definition: def,
    releaseEvent: release,
    activationEvent: activation,
    mappingSetVersion: 1,
    selectionReason: 'current production-ready definition and active verified mapping set',
    createdAt: '2026-09-02T01:01:00.000Z',
    createdBy: 'engine-1',
  });
}

test('calculation run supports period and point-in-time execution shapes but not empty time basis', () => {
  const periodRun = run();
  assert.equal(periodRun.periodStart, '2026-08-01T00:00:00.000Z');
  assert.equal(periodRun.asOfTimestamp, null);

  const snapshotRun = run({
    id: 'run-snapshot',
    commandId: 'cmd-snapshot',
    periodStart: null,
    periodEnd: null,
    asOfTimestamp: '2026-08-31T23:59:59.000Z',
  });
  assert.equal(snapshotRun.periodStart, null);
  assert.equal(snapshotRun.asOfTimestamp, '2026-08-31T23:59:59.000Z');

  assert.throws(
    () => run({ id: 'run-invalid', commandId: 'cmd-invalid', periodStart: null, periodEnd: null, asOfTimestamp: null }),
    (error) => error?.code === 'KPI_RUN_TIME_SHAPE_INVALID',
  );
});

test('run status is append-only with explicit terminal evidence', () => {
  const currentRun = run();
  const requested = createKpiRunStatusEvent({
    id: 'status-1', run: currentRun, runStatus: 'REQUESTED', evidence: {},
    createdAt: '2026-09-02T01:00:00.000Z', createdBy: 'engine-1',
  });
  const running = createKpiRunStatusEvent({
    id: 'status-2', run: currentRun, previousEvent: requested, runStatus: 'RUNNING', evidence: {},
    createdAt: '2026-09-02T01:01:00.000Z', createdBy: 'engine-1',
  });
  const succeeded = createKpiRunStatusEvent({
    id: 'status-3', run: currentRun, previousEvent: running, runStatus: 'SUCCEEDED',
    evidence: { outputManifestHash: 'b'.repeat(64) },
    createdAt: '2026-09-02T01:02:00.000Z', createdBy: 'engine-1',
  });
  assert.equal(succeeded.runStatus, 'SUCCEEDED');
  assert.throws(
    () => createKpiRunStatusEvent({
      id: 'status-4', run: currentRun, previousEvent: succeeded, runStatus: 'RUNNING', evidence: {},
      createdAt: '2026-09-02T01:03:00.000Z', createdBy: 'engine-1',
    }),
    (error) => error?.code === 'KPI_RUN_STATUS_TERMINAL',
  );
});

test('run definition binding pins exact ready release and mapping-set activation', () => {
  const def = definition();
  const currentRun = run();
  const bound = binding(def, currentRun);
  assert.equal(bound.kpiDefinitionId, def.id);
  assert.equal(bound.mappingSetVersion, 1);

  const orgDef = definition({ id: 'def-org', scopeType: 'organisation', organisationId: 'org-other' });
  assert.throws(
    () => binding(orgDef, currentRun),
    (error) => error?.code === 'KPI_RUN_DEFINITION_ORGANISATION_MISMATCH',
  );
});

test('run mapping binding pins exact mapping and VERIFIED event', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const mapping = createKpiSourceMappingVersion({
    id: 'map-accepted', definition: def, mappingSetVersion: 1, variableName: 'AcceptedQuantity',
    sourceContractId: 'NATIVE-RECEIPT', sourceSystem: 'SYNTH-V2', sourceEntity: 'receipt_snapshots',
    sourcePath: 'lines[].acceptedQuantity', datatype: 'integer', primaryOrEventKey: 'receiptSnapshotId + lineId',
    eventTimestampPath: 'receivedAt', joinContract: {}, filterContract: {},
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'engineer-1',
  });
  const verification = createKpiSourceMappingVerificationEvent({
    id: 'verify-accepted', mapping, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward-1', verificationMethod: 'repository source contract + fixture' },
    createdAt: '2026-08-11T02:00:00.000Z', createdBy: 'steward-1',
  });
  const mappingBinding = createKpiRunMappingBinding({
    id: 'run-map-1', definitionBinding: defBinding, mapping, verificationEvent: verification,
    createdAt: '2026-09-02T01:01:30.000Z', createdBy: 'engine-1',
  });
  assert.equal(mappingBinding.verificationEventId, verification.id);
});

test('observation keeps ZERO distinct from NOT_APPLICABLE/MISSING/INVALID and enforces canonical UOM', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const common = {
    run: currentRun, definition: def, definitionBinding: defBinding,
    periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-09-01T00:00:00.000Z',
    grain: { factoryId: 'factory-1' }, canonicalUom: 'ratio', sourceLineage: { runSource: 'NATIVE-RECEIPT' },
    calculatedAt: '2026-09-02T01:02:00.000Z',
  };

  const zero = createKpiObservation({ id: 'obs-zero', ...common, dataState: 'ZERO', valueNumeric: 0, numeratorNumeric: 0, denominatorNumeric: 100 });
  assert.equal(zero.valueNumeric, 0);
  assert.match(zero.grainHash, /^[a-f0-9]{64}$/);

  const na = createKpiObservation({ id: 'obs-na', ...common, dataState: 'NOT_APPLICABLE', valueNumeric: null, numeratorNumeric: 0, denominatorNumeric: 0 });
  assert.equal(na.valueNumeric, null);

  assert.throws(
    () => createKpiObservation({ id: 'obs-invalid-shape', ...common, dataState: 'INVALID', valueNumeric: 0.5 }),
    (error) => error?.code === 'KPI_NONVALUE_STATE_NUMERIC_FORBIDDEN',
  );
  assert.throws(
    () => createKpiObservation({ id: 'obs-uom', ...common, dataState: 'VALUE', valueNumeric: 0.9, canonicalUom: 'percent' }),
    (error) => error?.code === 'KPI_OBSERVATION_UOM_MISMATCH',
  );
});

test('reconciliation computes absolute difference instead of accepting arbitrary supplied value', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const result = createKpiReconciliationResult({
    id: 'recon-1', run: currentRun, definitionBinding: defBinding,
    reconciliationRuleId: 'receipt-identity', reconciliationRuleVersion: '1.0',
    observedNumeric: 500, expectedNumeric: 499, relativeDifference: 1 / 499,
    toleranceContract: { absoluteTolerance: 0 }, resultStatus: 'FAIL', evidence: {},
    evaluatedAt: '2026-09-02T01:03:00.000Z',
  });
  assert.equal(result.absoluteDifference, 1);
});

test('restatement links a new RESTATEMENT run to an immutable prior run', () => {
  const oldRun = run({ id: 'run-old', commandId: 'cmd-old' });
  const newRun = run({ id: 'run-new', commandId: 'cmd-new', runMode: 'RESTATEMENT' });
  const restatement = createKpiRunRestatement({
    id: 'restatement-1', newRun, supersededRun: oldRun, reasonCode: 'LATE_SOURCE_FACT',
    reason: 'Final freight invoice arrived after the original period close.', approvedBy: 'finance-owner-1',
    createdAt: '2026-09-05T00:00:00.000Z',
  });
  assert.equal(restatement.supersededRunId, oldRun.id);
});

test('publication gate blocks invalid/missing observations, blocking DQ and failed reconciliation', () => {
  const def = definition();
  const currentRun = run();
  const defBinding = binding(def, currentRun);
  const succeeded = Object.freeze({ runStatus: 'SUCCEEDED' });
  const validObs = Object.freeze({ id: 'obs-1', dataState: 'VALUE' });

  assert.equal(assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [validObs] }), true);

  assert.throws(
    () => assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [{ id: 'obs-bad', dataState: 'INVALID' }] }),
    (error) => error?.code === 'KPI_PUBLICATION_DATA_STATE_BLOCKED',
  );

  const blockingQuality = createKpiQualityResult({
    id: 'dq-1', run: currentRun, definitionBinding: defBinding, ruleId: 'uom-check', ruleVersion: '1.0',
    ruleFamily: 'UOM_DIMENSION', severity: 'BLOCKING', resultStatus: 'FAIL', observedPayload: {}, expectedContract: {}, evidence: {},
    evaluatedAt: '2026-09-02T01:03:00.000Z',
  });
  assert.throws(
    () => assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [validObs], qualityResults: [blockingQuality] }),
    (error) => error?.code === 'KPI_PUBLICATION_QUALITY_BLOCKED',
  );

  const failedRecon = createKpiReconciliationResult({
    id: 'recon-fail', run: currentRun, definitionBinding: defBinding,
    reconciliationRuleId: 'control-total', reconciliationRuleVersion: '1.0', observedNumeric: 10, expectedNumeric: 11,
    toleranceContract: { absoluteTolerance: 0 }, resultStatus: 'FAIL', evidence: {}, evaluatedAt: '2026-09-02T01:04:00.000Z',
  });
  assert.throws(
    () => assertKpiObservationBundlePublishable({ runStatusEvent: succeeded, observations: [validObs], reconciliationResults: [failedRecon] }),
    (error) => error?.code === 'KPI_PUBLICATION_RECONCILIATION_BLOCKED',
  );
});
