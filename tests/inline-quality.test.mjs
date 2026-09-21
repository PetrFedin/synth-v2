import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  assertMilestoneClearOfOpenChecks,
  createDefectType,
  defectPareto,
  dispositionInlineCheck,
  recordInlineCheck,
  retireDefectType,
  summarizeInlineChecks,
} from '../src/modules/inline-quality/public.mjs';
import { PRODUCTION_MILESTONE_CODES } from '../src/modules/production-execution/public.mjs';
import { QUALITY_DEFECT_SEVERITIES } from '../src/modules/final-quality/public.mjs';

const root = process.cwd();
const AT = '2026-09-21T09:00:00.000Z';

function type(code, severity, originStage = 'cutting-complete') {
  return createDefectType({ id: `defect-type_${code}`, brandId: 'brand-1', code, severity, originStage, nameRu: `Дефект ${code}`, nameEn: `Defect ${code}`, createdAt: AT, actorId: 'quality' });
}
const catalogue = [type('SEAM-OPEN', 'major'), type('STITCH-LOOSE', 'minor'), type('FABRIC-HOLE', 'critical', 'materials-ready')];

const execution = Object.freeze({
  id: 'execution-1', executionCode: 'EXEC-1', brandId: 'brand-1', supplierCode: 'FACTORY-1', sku: 'SKU-1',
  quantity: 400, status: 'active', startedAt: '2026-09-01T08:00:00.000Z',
  milestones: Object.freeze(PRODUCTION_MILESTONE_CODES.map((code, index) => Object.freeze({
    code, sequence: index + 1, status: index === 0 ? 'completed' : 'pending',
  }))),
});

function check(overrides = {}) {
  return recordInlineCheck({
    id: 'inline-check-1', execution, catalogue, recordedAt: AT, actorId: 'quality',
    input: { milestoneCode: 'cutting-complete', checkNumber: 1, checkedQuantity: 40, inspectorName: 'Павел Дорохов', defects: [{ defectCode: 'SEAM-OPEN', quantity: 3 }], ...overrides },
  });
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('The stage list and the severity list are the project\'s own, not copies of them', async () => {
  // Two answers to "what stage is this lot at" drift apart within a season. The SQL cannot import
  // the module, so this test is what holds the two lists together.
  const sql = await readFile(path.join(root, 'db/migrations/110_inline_quality_control.sql'), 'utf8');
  const quoted = PRODUCTION_MILESTONE_CODES.map((code) => `'${code}'`).join(',');
  assert.ok(sql.includes(quoted), 'the migration\'s stage list must be exactly the production milestones, in order');
  for (const severity of QUALITY_DEFECT_SEVERITIES) assert.ok(sql.includes(`'${severity}'`), `severity ${severity} must be admitted by the schema`);
  assert.equal(new Set(sql.match(/IN \('materials-ready'/g) ?? []).size, 1, 'the stage list is written the same way wherever it appears');
});

test('Severity belongs to the catalogue, so one fault counts the same way every time', () => {
  // The caller's severity is not consulted at all: passing a different one changes nothing, which is
  // the only way counts across checks can mean anything.
  const recorded = check({ defects: [{ defectCode: 'SEAM-OPEN', severity: 'minor', quantity: 3 }] });
  assert.equal(recorded.defects[0].severity, 'major');
  assert.equal(recorded.defects[0].defectTypeId, 'defect-type_SEAM-OPEN');
  assert.equal(codeOf(() => check({ defects: [{ defectCode: 'NO-SUCH-CODE', quantity: 1 }] })), 'INLINE_QC_DEFECT_TYPE_NOT_FOUND');
  // Two lines of one type is an addition error, not two findings.
  assert.equal(codeOf(() => check({ defects: [{ defectCode: 'SEAM-OPEN', quantity: 1 }, { defectCode: 'SEAM-OPEN', quantity: 2 }] })), 'INLINE_QC_DEFECT_DUPLICATED');
  // A retired type stays readable in history and is refused for new records.
  const retired = [retireDefectType(catalogue[0], { actorId: 'quality', at: AT }), catalogue[1], catalogue[2]];
  assert.equal(codeOf(() => recordInlineCheck({ id: 'c', execution, catalogue: retired, recordedAt: AT, actorId: 'quality', input: { milestoneCode: 'cutting-complete', checkNumber: 1, checkedQuantity: 40, inspectorName: 'Павел Дорохов', defects: [{ defectCode: 'SEAM-OPEN', quantity: 1 }] } })), 'INLINE_QC_DEFECT_TYPE_RETIRED');
});

test('A check cannot say more than it saw', () => {
  assert.equal(codeOf(() => check({ checkedQuantity: 401 })), 'INLINE_QC_CHECKED_EXCEEDS_LOT');
  assert.equal(codeOf(() => check({ checkedQuantity: 2, defects: [{ defectCode: 'SEAM-OPEN', quantity: 3 }] })), 'INLINE_QC_DEFECTIVE_EXCEEDS_CHECKED');
  // A stage that is signed off has had its verdict; adding defects to it afterwards would mean it
  // was completed with known, undecided defects.
  assert.equal(codeOf(() => check({ milestoneCode: 'materials-ready' })), 'INLINE_QC_MILESTONE_ALREADY_COMPLETED');
  assert.equal(codeOf(() => check({ milestoneCode: 'not-a-stage' })), 'INLINE_QC_MILESTONE_INVALID');
});

test('Defects found close the stage only once somebody has decided about them', () => {
  const found = check();
  assert.equal(found.status, 'open');
  assert.equal(found.defectiveQuantity, 3);
  assert.equal(found.defectRate, 0.075);
  assert.equal(codeOf(() => assertMilestoneClearOfOpenChecks([found], 'cutting-complete')), 'PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK');
  // Another stage is not blocked by this one's findings.
  assertMilestoneClearOfOpenChecks([found], 'assembly-complete');

  // Reworking or scrapping explains itself; shipping known defects onward does not.
  assert.equal(codeOf(() => dispositionInlineCheck(found, { disposition: 'accepted', notes: 'ok', at: AT, actorId: 'owner' })), 'INLINE_QC_ACCEPTANCE_REASON_REQUIRED');
  const reworked = dispositionInlineCheck(found, { disposition: 'rework', at: AT, actorId: 'owner' });
  assert.equal(reworked.status, 'closed');
  assertMilestoneClearOfOpenChecks([reworked], 'cutting-complete');
  assert.equal(codeOf(() => dispositionInlineCheck(reworked, { disposition: 'scrap', at: AT, actorId: 'owner' })), 'INLINE_QC_NOT_OPEN');

  // A clean check needs no decision at all and blocks nothing.
  const clean = check({ defects: [] });
  assert.equal(clean.status, 'closed');
  assert.equal(clean.defectRate, 0);
  assertMilestoneClearOfOpenChecks([clean], 'cutting-complete');
});

test('The record says where the work goes wrong, not merely that it did', () => {
  const checks = [
    check({ defects: [{ defectCode: 'SEAM-OPEN', quantity: 3 }, { defectCode: 'STITCH-LOOSE', quantity: 8 }] }),
    check({ milestoneCode: 'assembly-complete', checkedQuantity: 60, defects: [{ defectCode: 'FABRIC-HOLE', quantity: 1 }, { defectCode: 'SEAM-OPEN', quantity: 5 }] }),
  ];
  const summary = summarizeInlineChecks(checks);
  assert.deepEqual([summary.checks, summary.open, summary.checkedQuantity, summary.defectiveQuantity], [2, 2, 100, 17]);
  // One critical defect is not three minor ones, so the counts stay separate.
  assert.deepEqual({ ...summary.severityCounts }, { critical: 1, major: 8, minor: 8 });

  const pareto = defectPareto(checks, catalogue);
  assert.deepEqual(pareto.map((row) => [row.defectCode, row.quantity, row.originStage]), [
    ['SEAM-OPEN', 8, 'cutting-complete'],
    ['STITCH-LOOSE', 8, 'cutting-complete'],
    ['FABRIC-HOLE', 1, 'materials-ready'],
  ], 'equal quantities rank by severity, and each fault carries the stage it originates at');
});
