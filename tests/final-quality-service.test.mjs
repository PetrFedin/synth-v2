import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinalQualityService } from '../src/application/final-quality-service.mjs';

const readyExecution = Object.freeze({
  id: 'execution-1', executionCode: 'EXEC-PO-QUALITY-1', productionOrderNumber: 'PO-QUALITY-1',
  productionOrderVersion: 3, brandId: 'brand-1', supplierCode: 'FACTORY-1', sku: 'SKU-1', quantity: 100,
  version: 10, status: 'ready-for-qc', readyForQcAt: '2026-08-20T10:00:00.000Z',
  sourceSnapshot: Object.freeze({ techPackCode: 'TP-QUALITY-1-R01', techPackVersion: 3 }),
  milestones: Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({ code: `M${index + 1}`, status: 'completed' }))),
});

function fixture() {
  const state = { inspection: null, commands: new Map(), outbox: [], releases: [] };
  const memberships = new Map([
    ['brand-1:owner', { organisationId: 'brand-1', organisationType: 'brand', userId: 'owner', role: 'owner', status: 'active' }],
    ['brand-1:admin', { organisationId: 'brand-1', organisationType: 'brand', userId: 'admin', role: 'admin', status: 'active' }],
    ['brand-1:sales', { organisationId: 'brand-1', organisationType: 'brand', userId: 'sales', role: 'sales', status: 'active' }],
    ['brand-1:finance', { organisationId: 'brand-1', organisationType: 'brand', userId: 'finance', role: 'finance', status: 'active' }],
  ]);
  const tx = {
    getMembership: async (organisationId, userId) => memberships.get(`${organisationId}:${userId}`),
    getExecutionByCode: async (code) => code === readyExecution.executionCode ? readyExecution : null,
    getInspectionByCode: async (code) => state.inspection?.inspectionCode === code ? state.inspection : null,
    getInspectionByExecutionCode: async (code) => state.inspection?.executionCode === code ? state.inspection : null,
    insertInspection: async (value) => { state.inspection = value; },
    saveInspection: async (value, expectedVersion) => { assert.equal(value.version, expectedVersion + 1); state.inspection = value; },
    insertShipmentRelease: async (value) => { state.releases.push(value); },
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { state.commands.set(value.id, value); },
    appendOutbox: async (event) => { state.outbox.push(event); },
  };
  let tick = 0; let id = 0;
  const clock = () => new Date(Date.parse('2026-08-20T10:01:00.000Z') + tick++ * 60_000).toISOString();
  const nextId = (prefix) => `${prefix}_${++id}`;
  return { state, service: createFinalQualityService({ store: { transaction: (work) => work(tx) }, clock, nextId }) };
}

async function completePassingRun(service, actorId = 'sales') {
  let inspection = await service.createFromExecution(`quality-create-${actorId}`, actorId, readyExecution.executionCode);
  inspection = await service.start(`quality-start-${actorId}`, actorId, inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20,
    allowedMajorDefects: 1, allowedMinorDefects: 2,
  });
  return service.completeRun(`quality-complete-${actorId}`, actorId, inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Accepted' }],
    evidenceReferences: ['evidence://quality/pass'], notes: 'Inspection sample accepted',
  });
}

test('Final Quality separates execution from approval and creates release atomically', async () => {
  const { state, service } = fixture();
  let inspection = await service.createFromExecution('quality-create', 'sales', readyExecution.executionCode);
  assert.equal(inspection.status, 'planned');
  const replay = await service.createFromExecution('quality-create', 'sales', readyExecution.executionCode);
  assert.deepEqual(replay, inspection);
  assert.equal(state.outbox.length, 1);

  inspection = await service.start('quality-start', 'sales', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectorName: 'Factory Quality Inspector', sampleSize: 20,
    allowedMajorDefects: 1, allowedMinorDefects: 2,
  });
  inspection = await service.completeRun('quality-complete', 'sales', inspection.inspectionCode, {
    expectedVersion: inspection.version, inspectedQuantity: 20, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Accepted' }],
    evidenceReferences: ['evidence://quality/pass'], notes: 'Inspection sample accepted',
  });
  await assert.rejects(() => service.review('quality-review-denied', 'sales', inspection.inspectionCode, {
    expectedVersion: inspection.version, decision: 'release', releaseCode: 'SHIP-REL-QUALITY-1', notes: 'Release requested by non-approver',
  }), { code: 'CAPABILITY_DENIED' });
  assert.equal(state.releases.length, 0);

  inspection = await service.review('quality-review-release', 'owner', inspection.inspectionCode, {
    expectedVersion: inspection.version, decision: 'release', releaseCode: 'SHIP-REL-QUALITY-1', notes: 'Final Quality approved shipment release',
  });
  assert.equal(inspection.status, 'released');
  assert.equal(state.releases.length, 1);
  assert.equal(state.releases[0].releaseCode, 'SHIP-REL-QUALITY-1');
  assert.equal(state.outbox.at(-1).type, 'final-quality.shipment-released');
  assert.equal(state.commands.size, 4);
});

test('Final Quality forbids an approver from reviewing a run they inspected or completed', async () => {
  const { state, service } = fixture();
  const inspection = await completePassingRun(service, 'owner');

  await assert.rejects(() => service.review('quality-self-review', 'owner', inspection.inspectionCode, {
    expectedVersion: inspection.version,
    decision: 'release',
    releaseCode: 'SHIP-REL-SELF-1',
    notes: 'This self approval must never be accepted',
  }), { code: 'QUALITY_SELF_APPROVAL_FORBIDDEN' });
  assert.equal(state.inspection.status, 'review-pending');
  assert.equal(state.releases.length, 0);

  const released = await service.review('quality-independent-review', 'admin', inspection.inspectionCode, {
    expectedVersion: inspection.version,
    decision: 'release',
    releaseCode: 'SHIP-REL-INDEPENDENT-1',
    notes: 'Independent quality approver accepted the lot',
  });
  assert.equal(released.status, 'released');
  assert.equal(released.shipmentRelease.releasedBy, 'admin');
});

test('Finance can read but cannot mutate Final Quality', async () => {
  const { service } = fixture();
  await assert.rejects(() => service.createFromExecution('finance-create', 'finance', readyExecution.executionCode), { code: 'CAPABILITY_DENIED' });
});