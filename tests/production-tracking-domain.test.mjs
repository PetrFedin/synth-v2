import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelProductionRun,
  completeProductionMilestone,
  completeProductionRun,
  createProductionRun,
  raiseProductionException,
  resolveProductionException,
  startProductionRun,
} from '../src/modules/production-tracking/public.mjs';

const base = '2026-09-01T08:00:00.000Z';
const productionOrder = Object.freeze({
  id: 'po-id-1', productionOrderNumber: 'PO-2026-001', version: 3, status: 'confirmed', brandId: 'brand-1', supplierCode: 'FACTORY-1', sku: 'STYLE-001', quantity: 100,
  productionStartAt: '2026-09-02T08:00:00.000Z', deliveryDueAt: '2026-09-30T08:00:00.000Z',
  confirmation: Object.freeze({ supplierCode: 'FACTORY-1' }),
  techPackSnapshot: Object.freeze({ techPackCode: 'TP-STYLE-001-R01', revision: 1, version: 4, acknowledgementReference: 'ACK-TP-1' }),
});
const plan = Object.freeze([
  { code: 'materials_ready', plannedAt: '2026-09-03T08:00:00.000Z' },
  { code: 'cutting', plannedAt: '2026-09-07T08:00:00.000Z' },
  { code: 'sewing', plannedAt: '2026-09-14T08:00:00.000Z' },
  { code: 'finishing', plannedAt: '2026-09-21T08:00:00.000Z' },
  { code: 'packing', plannedAt: '2026-09-26T08:00:00.000Z' },
]);

function create() {
  return createProductionRun({ id: 'run-id-1', productionRunCode: 'RUN-PO-2026-001', productionOrder, milestones: plan, createdAt: base });
}
function complete(run, code, good, rejected, at) {
  return completeProductionMilestone(run, { milestoneCode: code, goodQuantity: good, rejectedQuantity: rejected, notes: null, actorId: 'manager-1', completedAt: at });
}

test('Production Run starts only from a supplier-confirmed PO with a complete ordered plan', () => {
  const run = create();
  assert.equal(run.status, 'planned');
  assert.equal(run.productionOrderVersion, 3);
  assert.equal(run.milestones.length, 5);
  assert.equal(run.sourceSnapshot.techPackAcknowledgementReference, 'ACK-TP-1');
  assert.throws(() => createProductionRun({ id: 'x', productionRunCode: 'RUN-X', productionOrder: { ...productionOrder, status: 'issued' }, milestones: plan, createdAt: base }), { code: 'PRODUCTION_RUN_PO_NOT_CONFIRMED' });
  assert.throws(() => createProductionRun({ id: 'x', productionRunCode: 'RUN-X', productionOrder, milestones: [...plan].reverse(), createdAt: base }), { code: 'PRODUCTION_RUN_PLAN_SEQUENCE_INVALID' });
});

test('Production Run enforces milestone order and quantity reconciliation', () => {
  let run = startProductionRun(create(), { actorId: 'manager-1', startedAt: '2026-09-02T08:00:00.000Z' });
  assert.throws(() => complete(run, 'cutting', 100, 0, '2026-09-05T08:00:00.000Z'), { code: 'PRODUCTION_RUN_MILESTONE_OUT_OF_SEQUENCE' });
  assert.throws(() => complete(run, 'materials_ready', 98, 1, '2026-09-03T08:00:00.000Z'), { code: 'PRODUCTION_RUN_QUANTITY_NOT_RECONCILED' });
  run = complete(run, 'materials_ready', 100, 0, '2026-09-03T08:00:00.000Z');
  run = complete(run, 'cutting', 98, 2, '2026-09-07T08:00:00.000Z');
  assert.throws(() => complete(run, 'sewing', 98, 2, '2026-09-14T08:00:00.000Z'), { code: 'PRODUCTION_RUN_QUANTITY_NOT_RECONCILED' });
  run = complete(run, 'sewing', 97, 1, '2026-09-14T08:00:00.000Z');
  assert.equal(run.milestones[2].goodQuantity, 97);
});

test('critical exceptions block milestones until resolution and retain immutable history', () => {
  let run = startProductionRun(create(), { actorId: 'manager-1', startedAt: '2026-09-02T08:00:00.000Z' });
  run = raiseProductionException(run, { code: 'MATERIAL-DELAY', severity: 'critical', reason: 'Approved fabric roll was not released by the mill', expectedResolutionAt: '2026-09-04T08:00:00.000Z', actorId: 'manager-1', raisedAt: '2026-09-02T12:00:00.000Z' });
  assert.equal(run.riskStatus, 'delayed');
  assert.throws(() => complete(run, 'materials_ready', 100, 0, '2026-09-03T08:00:00.000Z'), { code: 'PRODUCTION_RUN_CRITICAL_EXCEPTION_OPEN' });
  run = resolveProductionException(run, { resolutionNotes: 'Mill released and factory received the approved fabric roll', actorId: 'manager-2', resolvedAt: '2026-09-03T10:00:00.000Z' });
  assert.equal(run.activeException, null);
  assert.equal(run.exceptionHistory.length, 1);
  run = complete(run, 'materials_ready', 100, 0, '2026-09-03T12:00:00.000Z');
  assert.equal(run.milestones[0].actualAt, '2026-09-03T12:00:00.000Z');
});

test('completion requires every milestone and a documented shortage', () => {
  let run = startProductionRun(create(), { actorId: 'manager-1', startedAt: '2026-09-02T08:00:00.000Z' });
  run = complete(run, 'materials_ready', 100, 0, '2026-09-03T08:00:00.000Z');
  run = complete(run, 'cutting', 99, 1, '2026-09-07T08:00:00.000Z');
  run = complete(run, 'sewing', 98, 1, '2026-09-14T08:00:00.000Z');
  run = complete(run, 'finishing', 98, 0, '2026-09-21T08:00:00.000Z');
  assert.throws(() => completeProductionRun(run, { actorId: 'manager-1', completedAt: '2026-09-27T08:00:00.000Z', shortageReason: null }), { code: 'PRODUCTION_RUN_MILESTONES_INCOMPLETE' });
  run = complete(run, 'packing', 97, 1, '2026-09-26T08:00:00.000Z');
  assert.throws(() => completeProductionRun(run, { actorId: 'manager-1', completedAt: '2026-09-27T08:00:00.000Z', shortageReason: null }), { code: 'PRODUCTION_RUN_SHORTAGE_REASON_REQUIRED' });
  run = completeProductionRun(run, { actorId: 'manager-1', completedAt: '2026-09-27T08:00:00.000Z', shortageReason: 'Three units were rejected during cutting, sewing and packing inspections' });
  assert.equal(run.status, 'completed');
  assert.equal(run.finalGoodQuantity, 97);
  assert.equal(run.riskStatus, 'delayed');
});

test('a cancelled run cannot continue', () => {
  const run = cancelProductionRun(create(), { reason: 'Factory capacity was withdrawn before production start', actorId: 'manager-1', cancelledAt: '2026-09-01T12:00:00.000Z' });
  assert.equal(run.status, 'cancelled');
  assert.throws(() => startProductionRun(run, { actorId: 'manager-1', startedAt: '2026-09-02T08:00:00.000Z' }), { code: 'PRODUCTION_RUN_NOT_PLANNED' });
});
