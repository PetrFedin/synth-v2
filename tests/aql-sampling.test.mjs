import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { agreedSamplingPlan, resolveSamplingPlan } from '../src/modules/final-quality/sampling.mjs';

const root = process.cwd();
const plans = [
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotFrom: 51, lotTo: 90, sampleSize: 13, acceptAt: 1, rejectAt: 2 },
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotFrom: 91, lotTo: 150, sampleSize: 20, acceptAt: 1, rejectAt: 2 },
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotFrom: 151, lotTo: 280, sampleSize: 32, acceptAt: 2, rejectAt: 3 },
  { standardCode: 'DEMO-2859', inspectionLevel: 'I', aql: 2.5, lotFrom: 51, lotTo: 280, sampleSize: 8, acceptAt: 0, rejectAt: 1 },
  // The looser limit shares the sample of the tighter one: how many pieces are inspected follows
  // from the lot and the level, and only the acceptance number moves with the AQL.
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 4, lotFrom: 51, lotTo: 90, sampleSize: 13, acceptAt: 1, rejectAt: 2 },
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 4, lotFrom: 91, lotTo: 150, sampleSize: 20, acceptAt: 2, rejectAt: 3 },
  { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 4, lotFrom: 151, lotTo: 280, sampleSize: 32, acceptAt: 3, rejectAt: 4 },
];
const ask = (overrides = {}) => resolveSamplingPlan({ plans, standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotSize: 120, ...overrides });
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('A lot resolves to the one plan whose range covers it', () => {
  assert.deepEqual([ask().sampleSize, ask().acceptAt, ask().rejectAt], [20, 1, 2]);
  assert.equal(ask({ lotSize: 51 }).sampleSize, 13, 'the lower bound belongs to its range');
  assert.equal(ask({ lotSize: 90 }).sampleSize, 13, 'and so does the upper bound');
  assert.equal(ask({ lotSize: 91 }).sampleSize, 20, 'the next piece crosses into the next range');
  assert.equal(ask().source, 'standard');
  assert.equal(ask().standardCode, 'DEMO-2859');
});

test('The level and the AQL each select a different plan for the same lot', () => {
  // The same lot judged at a looser level or a looser limit is a different criterion, and the two
  // must not be reachable from one another by accident.
  assert.equal(ask({ inspectionLevel: 'I' }).sampleSize, 8);
  assert.equal(ask({ aql: 4 }).acceptAt, 2);
  assert.equal(ask({ aql: 2.5 }).acceptAt, 1);
});

test('A lot no row covers is refused rather than judged by the nearest row', () => {
  // "Nearest" is a guess, and a guess about how many defective garments may ship is not a thing to
  // make quietly.
  assert.equal(codeOf(() => ask({ lotSize: 50 })), 'QUALITY_SAMPLING_PLAN_NOT_FOUND');
  assert.equal(codeOf(() => ask({ lotSize: 400 })), 'QUALITY_SAMPLING_PLAN_NOT_FOUND');
  assert.equal(codeOf(() => ask({ standardCode: 'GOST-R-ISO-2859-1' })), 'QUALITY_SAMPLING_PLAN_SET_MISSING');
  assert.equal(codeOf(() => ask({ aql: 1 })), 'QUALITY_SAMPLING_PLAN_SET_MISSING');
});

test('A plan set that contradicts itself is refused rather than read in row order', () => {
  const overlapping = [...plans, { standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotFrom: 100, lotTo: 200, sampleSize: 50, acceptAt: 3, rejectAt: 4 }];
  assert.equal(codeOf(() => resolveSamplingPlan({ plans: overlapping, standardCode: 'DEMO-2859', inspectionLevel: 'II', aql: 2.5, lotSize: 120 })), 'QUALITY_SAMPLING_PLAN_AMBIGUOUS');
  const undecidable = [{ standardCode: 'XX', inspectionLevel: 'II', aql: 2.5, lotFrom: 1, lotTo: 999, sampleSize: 10, acceptAt: 1, rejectAt: 5 }];
  assert.equal(codeOf(() => resolveSamplingPlan({ plans: undecidable, standardCode: 'XX', inspectionLevel: 'II', aql: 2.5, lotSize: 100 })), 'QUALITY_SAMPLING_PLAN_UNDECIDABLE');
  const oversized = [{ standardCode: 'XX', inspectionLevel: 'II', aql: 2.5, lotFrom: 1, lotTo: 999, sampleSize: 200, acceptAt: 1, rejectAt: 2 }];
  assert.equal(codeOf(() => resolveSamplingPlan({ plans: oversized, standardCode: 'XX', inspectionLevel: 'II', aql: 2.5, lotSize: 100 })), 'QUALITY_SAMPLE_EXCEEDS_LOT');
});

test('A plan agreed with one factory is allowed, and is recorded as agreed', () => {
  const agreed = agreedSamplingPlan({ lotSize: 120, sampleSize: 25, acceptAt: 2, note: 'Согласовано с фабрикой на сезон' });
  assert.equal(agreed.source, 'agreed');
  assert.equal(agreed.rejectAt, 3, 'single sampling leaves no gap, whoever wrote the plan');
  assert.equal(agreed.standardCode, null, 'a bespoke plan does not borrow the name of a standard');
  assert.equal(codeOf(() => agreedSamplingPlan({ lotSize: 120, sampleSize: 200, acceptAt: 2 })), 'QUALITY_SAMPLE_EXCEEDS_LOT');
  // Accepting at as many defects as pieces inspected is not inspecting.
  assert.equal(codeOf(() => agreedSamplingPlan({ lotSize: 120, sampleSize: 10, acceptAt: 10 })), 'QUALITY_ACCEPT_EXCEEDS_SAMPLE');
});

test('The database holds the rules that make a plan set usable', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/109_aql_sampling_plans.sql'), 'utf8');
  assert.match(sql, /reject_at = accept_at \+ 1/, 'single sampling leaves no undecided gap');
  assert.match(sql, /sample_size <= lot_from/, 'you cannot inspect more pieces than the smallest lot holds');
  assert.match(sql, /AQL_PLAN_RANGE_OVERLAPS/, 'one lot size may resolve to only one plan');
  assert.match(sql, /assert_aql_plan_ranges_disjoint/);
  // No standard is recited from memory into a module that decides whether goods ship.
  assert.ok(!/GOST|ISO 2859 plan rows|INSERT INTO aql_sampling_plans/.test(sql.replace(/--.*$/gm, '')),
    'the migration seeds no coefficients of a published standard');
});

test('A run is judged by two limits read off one sample', async () => {
  const { samplingPlanForRun } = await import('../src/modules/final-quality/sampling.mjs');
  // Major at 2.5 and minor at 4.0 is ordinary practice; both come from one table, one level and one
  // sample, so the two thresholds cannot drift apart.
  const pair = samplingPlanForRun({ plans, lotSize: 200, standardCode: 'DEMO-2859', inspectionLevel: 'II', aqlMajor: 2.5, aqlMinor: 4 });
  assert.equal(pair.sampleSize, 32);
  assert.equal(pair.allowedMajorDefects, 2);
  assert.equal(pair.allowedMinorDefects, 3, 'the looser limit tolerates more, from the same sample');
  assert.equal(pair.criticalTolerance, 0, 'a critical defect is never tolerated');
  assert.equal(pair.source, 'standard');

  // One run draws one sample. Rows that disagree about its size are a broken set, not a choice.
  const mismatched = [
    { standardCode: 'YY', inspectionLevel: 'II', aql: 2.5, lotFrom: 1, lotTo: 999, sampleSize: 20, acceptAt: 1, rejectAt: 2 },
    { standardCode: 'YY', inspectionLevel: 'II', aql: 4, lotFrom: 1, lotTo: 999, sampleSize: 32, acceptAt: 3, rejectAt: 4 },
  ];
  assert.equal(codeOf(() => samplingPlanForRun({ plans: mismatched, lotSize: 200, standardCode: 'YY', inspectionLevel: 'II', aqlMajor: 2.5, aqlMinor: 4 })), 'QUALITY_SAMPLING_PLAN_SAMPLE_MISMATCH');

  // A table that tolerates major defects more readily than minor ones is upside down.
  const inverted = [
    { standardCode: 'ZZ', inspectionLevel: 'II', aql: 2.5, lotFrom: 1, lotTo: 999, sampleSize: 20, acceptAt: 5, rejectAt: 6 },
    { standardCode: 'ZZ', inspectionLevel: 'II', aql: 4, lotFrom: 1, lotTo: 999, sampleSize: 20, acceptAt: 1, rejectAt: 2 },
  ];
  assert.equal(codeOf(() => samplingPlanForRun({ plans: inverted, lotSize: 200, standardCode: 'ZZ', inspectionLevel: 'II', aqlMajor: 2.5, aqlMinor: 4 })), 'QUALITY_SAMPLING_PLAN_LIMITS_INVERTED');
});
