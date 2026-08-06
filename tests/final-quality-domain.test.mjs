import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertQualityInspectionVersion,
  completeQualityInspectionRun,
  createQualityInspection,
  reviewQualityInspection,
  startQualityInspection,
  startQualityReinspection,
} from '../src/modules/final-quality/public.mjs';

const execution = Object.freeze({
  id: 'execution-1',
  executionCode: 'EXEC-PO-QUALITY-1',
  productionOrderNumber: 'PO-QUALITY-1',
  productionOrderVersion: 3,
  brandId: 'brand-1',
  supplierCode: 'FACTORY-1',
  sku: 'SKU-QUALITY-1',
  quantity: 500,
  version: 10,
  status: 'ready-for-qc',
  readyForQcAt: '2026-08-20T10:00:00.000Z',
  sourceSnapshot: Object.freeze({ techPackCode: 'TP-QUALITY-1-R01', techPackVersion: 3 }),
  milestones: Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({ code: `M${index + 1}`, status: 'completed' }))),
});

function create() {
  return createQualityInspection({ id: 'quality-1', execution, createdAt: '2026-08-20T10:01:00.000Z' });
}
function start(inspection, overrides = {}) {
  return startQualityInspection(inspection, {
    actorId: 'quality-inspector', inspectorName: 'Quality Inspector', sampleSize: 32,
    allowedMajorDefects: 2, allowedMinorDefects: 4, startedAt: '2026-08-20T10:02:00.000Z', ...overrides,
  });
}
function passingCompletion(inspection, overrides = {}) {
  return completeQualityInspectionRun(inspection, {
    actorId: 'quality-inspector', inspectedQuantity: 32, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'WORKMANSHIP', name: 'Workmanship', result: 'pass', severity: null, notes: 'Accepted' }],
    evidenceReferences: ['evidence://quality/run-1'], notes: 'Sample accepted', completedAt: '2026-08-20T10:30:00.000Z', ...overrides,
  });
}

test('Final Quality releases only a fully inspected passing run', () => {
  let inspection = create();
  assert.equal(inspection.status, 'planned');
  assert.equal(inspection.sourceSnapshot.executionVersion, 10);
  inspection = start(inspection);
  assert.equal(inspection.status, 'in-progress');
  assert.equal(inspection.currentRun, 1);
  inspection = passingCompletion(inspection);
  assert.equal(inspection.status, 'review-pending');
  assert.equal(inspection.runs[0].recommendation, 'pass');
  inspection = reviewQualityInspection(inspection, {
    actorId: 'quality-approver', decision: 'release', releaseCode: 'SHIP-REL-1',
    notes: 'Final inspection accepted for shipment', reviewedAt: '2026-08-20T10:31:00.000Z',
  });
  assert.equal(inspection.status, 'released');
  assert.equal(inspection.version, 4);
  assert.equal(inspection.shipmentRelease.quantity, 500);
  assert.equal(inspection.shipmentRelease.inspectionVersion, 4);
  assertQualityInspectionVersion(inspection, 4);
});

test('Final Quality requires complete approved sample and prevents lenient review', () => {
  let inspection = start(create());
  assert.throws(() => passingCompletion(inspection, { inspectedQuantity: 31 }), { code: 'QUALITY_SAMPLE_NOT_COMPLETED' });
  inspection = passingCompletion(inspection, {
    defects: [{ defectCode: 'CRIT-1', severity: 'critical', category: 'Safety', description: 'Sharp metal exposed', quantity: 1, evidenceReferences: ['evidence://critical'] }],
  });
  assert.equal(inspection.runs[0].recommendation, 'reject');
  assert.throws(() => reviewQualityInspection(inspection, {
    actorId: 'quality-approver', decision: 'release', releaseCode: 'ILLEGAL', notes: 'Cannot override critical defect', reviewedAt: '2026-08-20T10:31:00.000Z',
  }), { code: 'QUALITY_DECISION_TOO_LENIENT' });
  const rejected = reviewQualityInspection(inspection, {
    actorId: 'quality-approver', decision: 'reject', notes: 'Critical safety defect rejects the lot', reviewedAt: '2026-08-20T10:31:00.000Z',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.shipmentRelease, null);
});

test('Final Quality preserves failed run and closes rework through a new run', () => {
  let inspection = start(create());
  inspection = passingCompletion(inspection, {
    measurementFailures: [{ pointCode: 'CHEST', sizeCode: 'M', measuredValue: 54, lowerLimit: 51.5, upperLimit: 52.5 }],
  });
  assert.equal(inspection.runs[0].recommendation, 'pass');
  inspection = reviewQualityInspection(inspection, {
    actorId: 'quality-approver', decision: 'rework', notes: 'Measurement correction required before release', reviewedAt: '2026-08-20T10:31:00.000Z',
  });
  assert.equal(inspection.status, 'rework-required');
  inspection = startQualityReinspection(inspection, {
    actorId: 'quality-inspector', inspectorName: 'Quality Inspector', sampleSize: 50,
    allowedMajorDefects: 0, allowedMinorDefects: 2, reworkReference: 'RWK-QUALITY-1',
    resolutionNotes: 'Affected units reworked and dimensions verified', startedAt: '2026-08-21T09:00:00.000Z',
  });
  assert.equal(inspection.currentRun, 2);
  assert.equal(inspection.runs[0].disposition, 'rework');
  inspection = completeQualityInspectionRun(inspection, {
    actorId: 'quality-inspector', inspectedQuantity: 50, defects: [], measurementFailures: [],
    checkpoints: [{ checkpointCode: 'MEASUREMENTS', name: 'Critical measurements', result: 'pass', severity: null, notes: 'Accepted after rework' }],
    evidenceReferences: ['evidence://quality/run-2'], notes: 'Reinspection accepted', completedAt: '2026-08-21T10:00:00.000Z',
  });
  inspection = reviewQualityInspection(inspection, {
    actorId: 'quality-approver', decision: 'release', releaseCode: 'SHIP-REL-2',
    notes: 'Reworked lot accepted for shipment', reviewedAt: '2026-08-21T10:01:00.000Z',
  });
  assert.equal(inspection.status, 'released');
  assert.equal(inspection.currentRun, 2);
  assert.equal(inspection.runs.length, 2);
  assert.equal(inspection.shipmentRelease.runNumber, 2);
});
