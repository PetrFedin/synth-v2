import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionQualityService } from '../src/application/production-quality-service.mjs';

const execution = Object.freeze({
  id: 'execution-1', executionCode: 'EXEC-PO-001', version: 10, productionOrderNumber: 'PO-001',
  brandId: 'brand-1', supplierCode: 'FACTORY-01', sku: 'STYLE-001', quantity: 500,
  status: 'ready-for-qc', readyForQcAt: '2026-09-20T10:00:00.000Z',
  sourceSnapshot: Object.freeze({ techPackCode: 'TP-STYLE-001-R01', techPackVersion: 3 }),
  milestones: Object.freeze(['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc'].map((code, index) => Object.freeze({ code, sequence: index + 1, status: 'completed' }))),
});

function fixture() {
  const state = { membership: { organisationId: 'brand-1', organisationType: 'brand', userId: 'owner-1', role: 'owner', status: 'active' }, quality: null, commands: new Map(), events: [] };
  const store = { transaction: async (work) => work({
    getMembership: async (organisationId, userId) => state.membership?.organisationId === organisationId && state.membership?.userId === userId ? state.membership : undefined,
    getExecutionByCode: async (code) => code === execution.executionCode ? execution : undefined,
    getQualityCaseByCode: async (code) => state.quality?.qualityCaseCode === code ? state.quality : undefined,
    getQualityCaseByExecutionCode: async (code) => state.quality?.executionCode === code ? state.quality : undefined,
    insertQualityCase: async (value) => { state.quality = value; },
    saveQualityCase: async (value, expectedVersion) => { assert.equal(state.quality.version, expectedVersion); state.quality = value; },
    getCommand: async (id) => state.commands.get(id),
    insertCommand: async (value) => { state.commands.set(value.id, value); },
    appendOutbox: async (event) => { state.events.push(event); },
  }) };
  let tick = 0; let id = 0;
  const service = createProductionQualityService({ store, clock: () => new Date(Date.parse('2026-09-20T11:00:00.000Z') + tick++ * 3600000).toISOString(), nextId: (prefix) => `${prefix}-${++id}` });
  return { service, state };
}
const majorFailure = [{ defectCode: 'MAJOR-1', classification: 'major', quantity: 2, description: 'Open seam exceeds accepted major defect limit', evidenceReference: 'photo://major-1' }];

test('service closes ready execution through rework and passing reinspection with durable idempotency', async () => {
  const { service, state } = fixture();
  let quality = await service.createFromExecution('quality-create', 'owner-1', execution.executionCode);
  assert.equal(quality.status, 'planned');
  quality = await service.startInspection('quality-start-1', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version });
  quality = await service.recordInspection('quality-record-1', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version, inspectedQuantity: 32, defects: majorFailure });
  assert.equal(quality.status, 'rework-required');
  quality = await service.submitRework('quality-rework-1', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version, reference: 'RW-001', notes: 'All affected seams repaired and operators retrained' });
  quality = await service.startInspection('quality-start-2', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version });
  const passInput = { expectedVersion: quality.version, inspectedQuantity: 48, defects: [] };
  quality = await service.recordInspection('quality-record-2', 'owner-1', quality.qualityCaseCode, passInput);
  assert.equal(quality.status, 'passed');
  assert.ok(quality.shippingReleaseAt);
  const eventCount = state.events.length;
  const replay = await service.recordInspection('quality-record-2', 'owner-1', quality.qualityCaseCode, passInput);
  assert.equal(replay.version, quality.version);
  assert.equal(state.events.length, eventCount);
  assert.equal(state.commands.size, 6);
});

test('idempotent replay re-authorizes the actor and conflicting versions are rejected', async () => {
  const { service, state } = fixture();
  const quality = await service.createFromExecution('quality-create', 'owner-1', execution.executionCode);
  state.membership = { ...state.membership, role: 'sales' };
  await assert.rejects(() => service.createFromExecution('quality-create', 'owner-1', execution.executionCode), { code: 'CAPABILITY_DENIED' });
  state.membership = { ...state.membership, role: 'owner' };
  await assert.rejects(() => service.startInspection('quality-stale', 'owner-1', quality.qualityCaseCode, { expectedVersion: 99 }), { code: 'PRODUCTION_QUALITY_CONCURRENCY_CONFLICT' });
  await assert.rejects(() => service.createFromExecution('quality-create-conflict', 'owner-1', execution.executionCode), { code: 'PRODUCTION_QUALITY_FOR_EXECUTION_EXISTS' });
});

test('service never accepts caller-supplied decisions or derived defect fields', async () => {
  const { service } = fixture();
  let quality = await service.createFromExecution('quality-create', 'owner-1', execution.executionCode);
  quality = await service.startInspection('quality-start', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version });
  await assert.rejects(() => service.recordInspection('quality-forged', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version, inspectedQuantity: 32, defects: [], decision: 'passed' }), { code: 'PRODUCTION_QUALITY_FIELD_FORBIDDEN' });
  await assert.rejects(() => service.recordInspection('quality-forged-defect', 'owner-1', quality.qualityCaseCode, { expectedVersion: quality.version, inspectedQuantity: 32, defects: [{ ...majorFailure[0], accepted: true }] }), { code: 'PRODUCTION_QUALITY_DEFECT_FIELD_FORBIDDEN' });
});
