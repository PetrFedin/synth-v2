import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionQualityCase,
  recordQualityInspection,
  sampleSizeFor,
  startQualityInspection,
  submitQualityRework,
} from '../src/modules/production-quality/public.mjs';

const execution = Object.freeze({
  id: 'execution-1', executionCode: 'EXEC-PO-001', version: 10, productionOrderNumber: 'PO-001',
  brandId: 'brand-1', supplierCode: 'FACTORY-01', sku: 'STYLE-001', quantity: 500,
  status: 'ready-for-qc', readyForQcAt: '2026-09-20T10:00:00.000Z',
  sourceSnapshot: Object.freeze({ techPackCode: 'TP-STYLE-001-R01', techPackVersion: 3 }),
  milestones: Object.freeze(['materials-ready','cutting-complete','assembly-complete','finishing-complete','packing-complete','ready-for-qc'].map((code, index) => Object.freeze({ code, sequence: index + 1, status: 'completed' }))),
});
function createCase() { return createProductionQualityCase({ id: 'quality-1', execution, createdAt: '2026-09-20T11:00:00.000Z' }); }
function start(value, at = '2026-09-20T12:00:00.000Z') { return startQualityInspection(value, { actorId: 'quality-owner', startedAt: at }); }
function record(value, defects, at = '2026-09-20T13:00:00.000Z') { return recordQualityInspection(value, { actorId: 'quality-owner', inspectedQuantity: value.rounds.at(-1).sampleSize, defects, completedAt: at }); }

const defect = (defectCode, classification, quantity) => ({ defectCode, classification, quantity, description: `${classification} defect found during inspection`, evidenceReference: `photo://${defectCode}` });

test('ready-for-QC execution creates a governed sample and pass releases shipment', () => {
  let quality = createCase();
  assert.equal(quality.status, 'planned');
  assert.equal(quality.rounds[0].sampleSize, 32);
  assert.deepEqual(quality.rounds[0].limits, { critical: 0, major: 1, minor: 2 });
  quality = start(quality);
  quality = record(quality, [defect('MINOR-1', 'minor', 2)]);
  assert.equal(quality.status, 'passed');
  assert.equal(quality.shippingReleaseAt, '2026-09-20T13:00:00.000Z');
  assert.equal(quality.rounds[0].decision, 'passed');
  assert.equal(Object.isFrozen(quality), true);
  assert.equal(Object.isFrozen(quality.rounds), true);
});

test('major or minor tolerance breach requires rework and a larger reinspection sample', () => {
  let quality = record(start(createCase()), [defect('MAJOR-1', 'major', 2)]);
  assert.equal(quality.status, 'rework-required');
  quality = submitQualityRework(quality, { actorId: 'quality-owner', reference: 'RW-001', notes: 'Seam operation corrected and affected units reworked', submittedAt: '2026-09-20T14:00:00.000Z' });
  assert.equal(quality.status, 'planned');
  assert.equal(quality.rounds.length, 2);
  assert.equal(quality.rounds[0].rework.reference, 'RW-001');
  assert.equal(quality.rounds[1].sampleSize, 48);
});

test('critical defects reject immediately and third failed inspection becomes terminal reject', () => {
  const critical = record(start(createCase()), [defect('CRITICAL-1', 'critical', 1)]);
  assert.equal(critical.status, 'rejected');
  assert.equal(critical.shippingReleaseAt, null);

  let quality = record(start(createCase()), [defect('MAJOR-R1', 'major', 2)]);
  quality = submitQualityRework(quality, { actorId: 'quality-owner', reference: 'RW-R1', notes: 'First corrective action completed on the production lot', submittedAt: '2026-09-20T14:00:00.000Z' });
  quality = record(start(quality, '2026-09-20T15:00:00.000Z'), [defect('MAJOR-R2', 'major', 3)], '2026-09-20T16:00:00.000Z');
  quality = submitQualityRework(quality, { actorId: 'quality-owner', reference: 'RW-R2', notes: 'Second corrective action completed with line retraining', submittedAt: '2026-09-20T17:00:00.000Z' });
  quality = record(start(quality, '2026-09-20T18:00:00.000Z'), [defect('MAJOR-R3', 'major', 4)], '2026-09-20T19:00:00.000Z');
  assert.equal(quality.rounds.length, 3);
  assert.equal(quality.status, 'rejected');
  assert.throws(() => submitQualityRework(quality, { actorId: 'quality-owner', reference: 'RW-R3', notes: 'Must not create an unlimited fourth round', submittedAt: '2026-09-20T20:00:00.000Z' }), { code: 'PRODUCTION_QUALITY_REWORK_NOT_REQUIRED' });
});

test('quality control rejects incomplete source gates, partial samples and unsupported defect fields', () => {
  assert.throws(() => createProductionQualityCase({ id: 'quality-bad', execution: { ...execution, status: 'active' }, createdAt: '2026-09-20T11:00:00.000Z' }), { code: 'PRODUCTION_QUALITY_EXECUTION_NOT_READY' });
  const quality = start(createCase());
  assert.throws(() => recordQualityInspection(quality, { actorId: 'quality-owner', inspectedQuantity: 31, defects: [], completedAt: '2026-09-20T13:00:00.000Z' }), { code: 'PRODUCTION_QUALITY_SAMPLE_INCOMPLETE' });
  assert.throws(() => recordQualityInspection(quality, { actorId: 'quality-owner', inspectedQuantity: 32, defects: [{ ...defect('BAD', 'minor', 1), decision: 'passed' }], completedAt: '2026-09-20T13:00:00.000Z' }), { code: 'PRODUCTION_QUALITY_DEFECT_FIELD_FORBIDDEN' });
  assert.equal(sampleSizeFor(20), 8);
  assert.equal(sampleSizeFor(100), 20);
  assert.equal(sampleSizeFor(1000), 50);
  assert.equal(sampleSizeFor(5000), 80);
});
