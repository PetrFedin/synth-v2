import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertKpiDefinitionReadyForProduction,
  createKpiDefinitionDependency,
  createKpiDefinitionReleaseEvent,
  createKpiDefinitionVersion,
  createKpiSourceMappingVerificationEvent,
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

function baseMapping(definition, overrides = {}) {
  return createKpiSourceMappingVersion({
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
    createdAt: '2026-08-11T00:30:00.000Z',
    createdBy: 'user-1',
    ...overrides,
  });
}

test('creates immutable semantic definition without embedding mutable release state', () => {
  const first = baseDefinition();
  const second = baseDefinition();
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.organisationId, null);
  assert.equal(Object.hasOwn(first, 'releaseStatus'), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.grainContract), true);
});

test('organisation scope requires organisation id', () => {
  assert.throws(
    () => baseDefinition({ scopeType: 'organisation', organisationId: null }),
    (error) => error?.code === 'KPI_ORGANISATION_ID_REQUIRED',
  );
  const definition = baseDefinition({ id: 'kpi-def-org', scopeType: 'organisation', organisationId: 'org-1' });
  assert.equal(definition.organisationId, 'org-1');
});

test('release lifecycle is append-only and independent from semantic definition', () => {
  const definition = baseDefinition();
  const draft = createKpiDefinitionReleaseEvent({
    id: 'release-1', definition, releaseStatus: 'DRAFT', evidence: { reason: 'initial definition' },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'user-1',
  });
  const defined = createKpiDefinitionReleaseEvent({
    id: 'release-2', definition, previousEvent: draft, releaseStatus: 'DEFINED', evidence: { semanticReview: 'complete' },
    createdAt: '2026-08-11T02:00:00.000Z', createdBy: 'user-1',
  });
  assert.equal(defined.previousReleaseEventId, draft.id);
  assert.equal(definition.contentHash, baseDefinition().contentHash);
  assert.throws(
    () => createKpiDefinitionReleaseEvent({
      id: 'release-backward', definition, previousEvent: defined, releaseStatus: 'DRAFT', evidence: {},
      createdAt: '2026-08-11T03:00:00.000Z', createdBy: 'user-1',
    }),
    (error) => error?.code === 'KPI_RELEASE_TRANSITION_INVALID',
  );
});

test('blocked umbrella and alias use dedicated non-publishing release events', () => {
  const blocked = baseDefinition({ id: 'kpi-blocked', kpiCode: 'SYNTH-LOG-099', role: 'BLOCKED_UMBRELLA' });
  assert.equal(createKpiDefinitionReleaseEvent({
    id: 'release-blocked', definition: blocked, releaseStatus: 'BLOCKED_UMBRELLA', evidence: { splitRequired: true },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'user-1',
  }).releaseStatus, 'BLOCKED_UMBRELLA');

  const alias = baseDefinition({ id: 'kpi-alias', kpiCode: 'SYNTH-LOG-098', role: 'ALIAS' });
  assert.equal(createKpiDefinitionReleaseEvent({
    id: 'release-alias', definition: alias, releaseStatus: 'ALIAS_NONPUBLISH', evidence: { canonicalResolutionRequired: true },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'user-1',
  }).releaseStatus, 'ALIAS_NONPUBLISH');

  assert.throws(
    () => createKpiDefinitionReleaseEvent({
      id: 'release-alias-invalid', definition: alias, releaseStatus: 'DRAFT', evidence: {},
      createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'user-1',
    }),
    (error) => error?.code === 'KPI_ALIAS_RELEASE_STATUS_INVALID',
  );
});

test('PRODUCTION_READY release event requires explicit evidence bundle', () => {
  const definition = baseDefinition();
  const pending = createKpiDefinitionReleaseEvent({
    id: 'release-pending', definition, releaseStatus: 'UAT_PENDING', evidence: { technicalValidationComplete: true },
    createdAt: '2026-08-11T02:00:00.000Z', createdBy: 'user-1',
  });
  assert.throws(
    () => createKpiDefinitionReleaseEvent({
      id: 'release-ready-invalid', definition, previousEvent: pending, releaseStatus: 'PRODUCTION_READY',
      evidence: { calculationTestsPassed: true }, createdAt: '2026-08-11T03:00:00.000Z', createdBy: 'user-1',
    }),
    (error) => error?.code === 'KPI_READY_VERIFIED_MAPPINGS_REQUIRED',
  );
  const ready = createKpiDefinitionReleaseEvent({
    id: 'release-ready', definition, previousEvent: pending, releaseStatus: 'PRODUCTION_READY',
    evidence: {
      verifiedMappingIds: ['map-1', 'map-2'], calculationTestsPassed: true, populationTestsPassed: true,
      reconciliationStatus: 'PASS', ownerUatPassed: true, dataStewardUatPassed: true,
    },
    createdAt: '2026-08-11T03:00:00.000Z', createdBy: 'user-1',
  });
  assert.equal(ready.releaseStatus, 'PRODUCTION_READY');
});

test('physical mapping version is immutable and verification is a separate event stream', () => {
  const definition = baseDefinition();
  const mapping = baseMapping(definition);
  assert.equal(Object.hasOwn(mapping, 'mappingStatus'), false);

  const mapped = createKpiSourceMappingVerificationEvent({
    id: 'mapping-verification-1', mapping, verificationStatus: 'MAPPED_UNVERIFIED', evidence: { mappedBy: 'engineer-1' },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'engineer-1',
  });
  const verified = createKpiSourceMappingVerificationEvent({
    id: 'mapping-verification-2', mapping, previousEvent: mapped, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward-1', verificationMethod: 'repository contract and test fixture' },
    createdAt: '2026-08-11T02:00:00.000Z', createdBy: 'steward-1',
  });
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.equal(verified.kpiSourceMappingId, mapping.id);
  assert.equal(mapping.contentHash, baseMapping(definition).contentHash);
});

test('verified mapping event requires evidence and lifecycle cannot move backward', () => {
  const mapping = baseMapping(baseDefinition());
  assert.throws(
    () => createKpiSourceMappingVerificationEvent({
      id: 'mapping-verified-invalid', mapping, verificationStatus: 'VERIFIED', evidence: {},
      createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'steward-1',
    }),
    (error) => error?.code === 'KPI_MAPPING_VERIFIED_BY_REQUIRED',
  );
  const verified = createKpiSourceMappingVerificationEvent({
    id: 'mapping-verified-bootstrap', mapping, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward-1', verificationMethod: 'bootstrap repository verification' },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'steward-1',
  });
  assert.throws(
    () => createKpiSourceMappingVerificationEvent({
      id: 'mapping-backward', mapping, previousEvent: verified, verificationStatus: 'MAPPED_UNVERIFIED', evidence: {},
      createdAt: '2026-08-11T02:00:00.000Z', createdBy: 'steward-1',
    }),
    (error) => error?.code === 'KPI_MAPPING_VERIFICATION_TRANSITION_INVALID',
  );
});

test('alias and blocked umbrella cannot own executable source mappings', () => {
  const alias = baseDefinition({ id: 'alias-1', kpiCode: 'SYNTH-LOG-097', role: 'ALIAS' });
  assert.throws(() => baseMapping(alias, { id: 'map-alias' }), (error) => error?.code === 'KPI_MAPPING_NONCALCULABLE_DEFINITION');
});

test('alias and split dependencies enforce semantic role direction', () => {
  const canonical = baseDefinition();
  const alias = baseDefinition({ id: 'alias-2', kpiCode: 'SYNTH-LOG-096', role: 'ALIAS' });
  const aliasEdge = createKpiDefinitionDependency({
    id: 'dep-alias', sourceDefinition: alias, targetDefinition: canonical, relationType: 'ALIAS_OF',
    relationContract: { reason: 'legacy label' }, createdAt: '2026-08-11T00:00:00.000Z', createdBy: 'user-1',
  });
  assert.equal(aliasEdge.relationType, 'ALIAS_OF');

  const blocked = baseDefinition({ id: 'blocked-2', kpiCode: 'SYNTH-LOG-095', role: 'BLOCKED_UMBRELLA' });
  const child = baseDefinition({ id: 'child-1', kpiCode: 'SYNTH-LOG-095A', role: 'SPLIT_CHILD' });
  const splitEdge = createKpiDefinitionDependency({
    id: 'dep-split', sourceDefinition: child, targetDefinition: blocked, relationType: 'SPLIT_FROM',
    relationContract: { splitBasis: 'unit denominator' }, createdAt: '2026-08-11T00:00:00.000Z', createdBy: 'user-1',
  });
  assert.equal(splitEdge.targetDefinitionId, blocked.id);
});

test('production readiness requires one coherent verified mapping set plus tests, reconciliation and both UAT gates', () => {
  const definition = baseDefinition();
  const accepted = baseMapping(definition, { id: 'map-accepted', variableName: 'AcceptedQuantity', sourcePath: 'lines[].acceptedQuantity' });
  const received = baseMapping(definition, { id: 'map-received', variableName: 'ReceivedQuantity', sourcePath: 'lines[].receivedQuantity' });
  const acceptedVerification = createKpiSourceMappingVerificationEvent({
    id: 'verify-accepted', mapping: accepted, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward-1', verificationMethod: 'repository contract' },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'steward-1',
  });
  const receivedVerification = createKpiSourceMappingVerificationEvent({
    id: 'verify-received', mapping: received, verificationStatus: 'VERIFIED',
    evidence: { verifiedBy: 'steward-1', verificationMethod: 'repository contract' },
    createdAt: '2026-08-11T01:00:00.000Z', createdBy: 'steward-1',
  });

  assert.throws(
    () => assertKpiDefinitionReadyForProduction({
      definition, mappings: [accepted, received], mappingVerificationEvents: [acceptedVerification, receivedVerification],
      calculationTestsPassed: true, populationTestsPassed: true, reconciliationPassed: true,
      ownerUatPassed: false, dataStewardUatPassed: true,
    }),
    (error) => error?.code === 'KPI_OWNER_UAT_INCOMPLETE',
  );

  assert.equal(assertKpiDefinitionReadyForProduction({
    definition, mappings: [accepted, received], mappingVerificationEvents: [acceptedVerification, receivedVerification],
    calculationTestsPassed: true, populationTestsPassed: true, reconciliationPassed: true,
    ownerUatPassed: true, dataStewardUatPassed: true,
  }), true);
});
