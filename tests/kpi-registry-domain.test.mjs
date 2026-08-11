import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertKpiDefinitionReadyForProduction,
  createKpiDefinitionDependency,
  createKpiDefinitionVersion,
  createKpiSourceMappingVersion,
} from '../src/modules/kpi-registry/public.mjs';

function baseDefinition(overrides = {}) {
  return createKpiDefinitionVersion({
    id: 'kpi-def-1',
    scopeType: 'system',
    kpiCode: 'SYNTH-LOG-001',
    formulaVersion: '17.0',
    role: 'CANONICAL',
    canonicalNameRu: 'Доля принятого товара',
    canonicalNameEn: 'Receipt Acceptance Rate',
    domainCode: 'LOG',
    releaseStatus: 'VALIDATION_PENDING',
    businessDefinition: 'Share of physically received units accepted after disposition.',
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
    createdBy: 'user-1',
    ...overrides,
  });
}

test('creates immutable system KPI definition with stable content hash', () => {
  const first = baseDefinition();
  const second = baseDefinition();
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.organisationId, null);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.grainContract), true);
});

test('organisation scope requires organisation id', () => {
  assert.throws(
    () => baseDefinition({ scopeType: 'organisation', organisationId: null }),
    (error) => error?.code === 'KPI_ORGANISATION_ID_REQUIRED',
  );
  const definition = baseDefinition({
    id: 'kpi-def-org',
    scopeType: 'organisation',
    organisationId: 'org-1',
  });
  assert.equal(definition.organisationId, 'org-1');
});

test('blocked umbrella and alias definitions are structurally non-publishable', () => {
  assert.throws(
    () => baseDefinition({ role: 'BLOCKED_UMBRELLA', releaseStatus: 'VALIDATION_PENDING' }),
    (error) => error?.code === 'KPI_BLOCKED_RELEASE_STATUS_INVALID',
  );
  const blocked = baseDefinition({
    id: 'kpi-blocked',
    kpiCode: 'SYNTH-LOG-099',
    role: 'BLOCKED_UMBRELLA',
    releaseStatus: 'BLOCKED_UMBRELLA',
  });
  assert.equal(blocked.releaseStatus, 'BLOCKED_UMBRELLA');

  const alias = baseDefinition({
    id: 'kpi-alias',
    kpiCode: 'SYNTH-LOG-098',
    role: 'ALIAS',
    releaseStatus: 'ALIAS_NONPUBLISH',
  });
  assert.equal(alias.releaseStatus, 'ALIAS_NONPUBLISH');
});

test('verified mapping requires verification evidence and binds to calculable definition', () => {
  const definition = baseDefinition();
  assert.throws(
    () => createKpiSourceMappingVersion({
      id: 'map-1',
      definition,
      mappingSetVersion: 1,
      variableName: 'AcceptedQuantity',
      sourceContractId: 'NATIVE-RECEIPT',
      sourceSystem: 'SYNTH-V2',
      sourceEntity: 'receipt_snapshots',
      sourcePath: 'lines[].acceptedQuantity',
      datatype: 'integer',
      joinContract: { key: 'receiptSnapshotId + lineId' },
      filterContract: {},
      mappingStatus: 'VERIFIED',
      createdAt: '2026-08-11T00:00:00.000Z',
      createdBy: 'user-1',
    }),
    (error) => error?.code === 'KPI_MAPPING_VERIFIED_AT_REQUIRED',
  );

  const mapping = createKpiSourceMappingVersion({
    id: 'map-1',
    definition,
    mappingSetVersion: 1,
    variableName: 'AcceptedQuantity',
    sourceContractId: 'NATIVE-RECEIPT',
    sourceSystem: 'SYNTH-V2',
    sourceEntity: 'receipt_snapshots',
    sourcePath: 'lines[].acceptedQuantity',
    datatype: 'integer',
    primaryOrEventKey: 'receiptSnapshotId + lineId',
    eventTimestampPath: 'receivedAt',
    joinContract: { cardinality: 'one receipt line per receiptSnapshotId + lineId' },
    filterContract: {},
    mappingStatus: 'VERIFIED',
    verifiedAt: '2026-08-11T01:00:00.000Z',
    verifiedBy: 'steward-1',
    createdAt: '2026-08-11T00:30:00.000Z',
    createdBy: 'user-1',
  });
  assert.equal(mapping.mappingStatus, 'VERIFIED');
  assert.equal(mapping.kpiDefinitionId, definition.id);
  assert.match(mapping.contentHash, /^[a-f0-9]{64}$/);
});

test('alias and blocked umbrella cannot own executable source mappings', () => {
  const alias = baseDefinition({
    id: 'alias-1',
    kpiCode: 'SYNTH-LOG-097',
    role: 'ALIAS',
    releaseStatus: 'ALIAS_NONPUBLISH',
  });
  assert.throws(
    () => createKpiSourceMappingVersion({
      id: 'map-alias',
      definition: alias,
      mappingSetVersion: 1,
      variableName: 'X',
      sourceContractId: 'NATIVE-X',
      sourceSystem: 'SYNTH-V2',
      sourceEntity: 'x',
      sourcePath: 'x',
      datatype: 'number',
      mappingStatus: 'PENDING',
      createdAt: '2026-08-11T00:00:00.000Z',
      createdBy: 'user-1',
    }),
    (error) => error?.code === 'KPI_MAPPING_NONCALCULABLE_DEFINITION',
  );
});

test('alias and split dependencies enforce semantic role direction', () => {
  const canonical = baseDefinition();
  const alias = baseDefinition({
    id: 'alias-2',
    kpiCode: 'SYNTH-LOG-096',
    role: 'ALIAS',
    releaseStatus: 'ALIAS_NONPUBLISH',
  });
  const aliasEdge = createKpiDefinitionDependency({
    id: 'dep-alias',
    sourceDefinition: alias,
    targetDefinition: canonical,
    relationType: 'ALIAS_OF',
    relationContract: { reason: 'legacy label' },
    createdAt: '2026-08-11T00:00:00.000Z',
    createdBy: 'user-1',
  });
  assert.equal(aliasEdge.relationType, 'ALIAS_OF');

  const blocked = baseDefinition({
    id: 'blocked-2',
    kpiCode: 'SYNTH-LOG-095',
    role: 'BLOCKED_UMBRELLA',
    releaseStatus: 'BLOCKED_UMBRELLA',
  });
  const child = baseDefinition({
    id: 'child-1',
    kpiCode: 'SYNTH-LOG-095A',
    role: 'SPLIT_CHILD',
  });
  const splitEdge = createKpiDefinitionDependency({
    id: 'dep-split',
    sourceDefinition: child,
    targetDefinition: blocked,
    relationType: 'SPLIT_FROM',
    relationContract: { splitBasis: 'unit denominator' },
    createdAt: '2026-08-11T00:00:00.000Z',
    createdBy: 'user-1',
  });
  assert.equal(splitEdge.targetDefinitionId, blocked.id);
});

test('production readiness requires verified mappings, tests, reconciliation and both UAT gates', () => {
  const definition = baseDefinition();
  const mapping = createKpiSourceMappingVersion({
    id: 'map-ready',
    definition,
    mappingSetVersion: 1,
    variableName: 'AcceptedQuantity',
    sourceContractId: 'NATIVE-RECEIPT',
    sourceSystem: 'SYNTH-V2',
    sourceEntity: 'receipt_snapshots',
    sourcePath: 'lines[].acceptedQuantity',
    datatype: 'integer',
    joinContract: {},
    filterContract: {},
    mappingStatus: 'VERIFIED',
    verifiedAt: '2026-08-11T01:00:00.000Z',
    verifiedBy: 'steward-1',
    createdAt: '2026-08-11T00:30:00.000Z',
    createdBy: 'user-1',
  });

  assert.throws(
    () => assertKpiDefinitionReadyForProduction({
      definition,
      mappings: [mapping],
      calculationTestsPassed: true,
      populationTestsPassed: true,
      reconciliationPassed: true,
      ownerUatPassed: false,
      dataStewardUatPassed: true,
    }),
    (error) => error?.code === 'KPI_OWNER_UAT_INCOMPLETE',
  );

  assert.equal(assertKpiDefinitionReadyForProduction({
    definition,
    mappings: [mapping],
    calculationTestsPassed: true,
    populationTestsPassed: true,
    reconciliationPassed: true,
    ownerUatPassed: true,
    dataStewardUatPassed: true,
  }), true);
});
