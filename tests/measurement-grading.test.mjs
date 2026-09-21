import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createMeasurementChart } from '../src/modules/measurements/public.mjs';

const root = process.cwd();
const catalogSku = { sku: 'SKU-1', brandId: 'brand-1', status: 'published', version: 3 };
const sizes = [{ code: '44', label: '44' }, { code: '46', label: '46' }, { code: '48', label: '48' }, { code: '50', label: '50' }];

function chart(points, baseSizeCode = '46') {
  return createMeasurementChart({
    id: 'chart-1', catalogSku, createdAt: '2026-09-21T09:00:00.000Z',
    input: { sku: 'SKU-1', unit: 'cm', baseSizeCode, sizes, points },
  });
}
function point(overrides = {}) {
  return { pointCode: 'CHEST', name: 'Обхват груди', toleranceMinus: 1, tolerancePlus: 1, measurements: [{ sizeCode: '46', value: 100 }], ...overrides };
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('A grade rule fills the range from the base size outward', () => {
  // Межразмерная разница of 4 cm on every interval, base 46. The rule walks forward to 48 and 50
  // and backward to 44 — a pattern is graded from the size that was drafted, in both directions.
  const built = chart([point({ gradeSteps: [4, 4, 4] })]);
  assert.deepEqual(built.points[0].measurements.map((entry) => [entry.sizeCode, entry.value]),
    [['44', 96], ['46', 100], ['48', 104], ['50', 108]]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.source), ['derived', 'derived', 'derived', 'derived']);
  assert.deepEqual(built.points[0].gradeSteps, [4, 4, 4]);
});

test('The step differs per interval, because a real range does not grade evenly', () => {
  // 44→46 at 4 cm and 48→50 at 6 is ordinary in a Russian size range. One increment per point
  // cannot say it; a step per interval says it exactly.
  const built = chart([point({ gradeSteps: [4, 4, 6] })]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.value), [96, 100, 104, 110]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.deltaFromPrevious), [null, 4, 4, 6]);
});

test('A step may be zero or negative', () => {
  // A cuff opening that does not change across the range, and a point that closes as the size grows.
  assert.deepEqual(chart([point({ gradeSteps: [0, 0, 0] })]).points[0].measurements.map((e) => e.value), [100, 100, 100, 100]);
  assert.deepEqual(chart([point({ gradeSteps: [-1, -1, -1] })]).points[0].measurements.map((e) => e.value), [101, 100, 99, 98]);
});

test('A typed value that differs from the rule is kept, and marked an exception', () => {
  // A person who types a number into a graded chart meant that number. The factory has to be able
  // to see which cells depart from the rule — an override nobody can distinguish is a rule nobody
  // can trust.
  const built = chart([point({ gradeSteps: [4, 4, 4], measurements: [{ sizeCode: '46', value: 100 }, { sizeCode: '50', value: 110 }] })]);
  const bySize = Object.fromEntries(built.points[0].measurements.map((entry) => [entry.sizeCode, entry]));
  assert.equal(bySize['50'].value, 110);
  assert.equal(bySize['50'].source, 'override');
  assert.equal(bySize['48'].value, 104, 'the rest of the range still follows the rule');
  assert.equal(bySize['48'].source, 'derived');
  // A typed value that agrees with the rule is not an exception to it.
  const agreeing = chart([point({ gradeSteps: [4, 4, 4], measurements: [{ sizeCode: '46', value: 100 }, { sizeCode: '48', value: 104 }] })]);
  assert.equal(agreeing.points[0].measurements.find((entry) => entry.sizeCode === '48').source, 'derived');
  // The base size is where the rule starts, so it is never an exception to it.
  assert.equal(built.points[0].measurements.find((entry) => entry.sizeCode === '46').source, 'derived');
});

test('A rule is refused when it cannot mean anything', () => {
  assert.equal(codeOf(() => chart([point({ gradeSteps: [4, 4] })])), 'MEASUREMENT_GRADE_LENGTH_INVALID',
    'a rule holds one step per interval, not per size');
  assert.equal(codeOf(() => chart([point({ gradeSteps: [4, 4, 4, 4] })])), 'MEASUREMENT_GRADE_LENGTH_INVALID');
  assert.equal(codeOf(() => chart([point({ gradeSteps: 4 })])), 'MEASUREMENT_GRADE_INVALID');
  assert.equal(codeOf(() => chart([point({ gradeSteps: ['4', '4', '4'] })])), 'MEASUREMENT_GRADE_STEP_INVALID');
  // Grading needs a value at the base size to grade from.
  assert.equal(codeOf(() => chart([point({ gradeSteps: [4, 4, 4], measurements: [{ sizeCode: '44', value: 96 }] })])), 'MEASUREMENT_BASE_VALUE_REQUIRED');
});

test('Without a rule the chart behaves exactly as it did', () => {
  const built = chart([point({ measurements: sizes.map((size, index) => ({ sizeCode: size.code, value: 96 + index * 4 })) })]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.value), [96, 100, 104, 108]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.source), ['derived', 'derived', 'derived', 'derived']);
  assert.equal(built.points[0].gradeSteps, null);
});

test('The rule and the source are carried by the schema and the transport', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/105_measurement_grade_rule.sql'), 'utf8');
  assert.match(sql, /jsonb_array_length\(grade_steps\) BETWEEN 1 AND 63/);
  assert.match(sql, /jsonb_path_exists\(grade_steps, '\$\[\*\] \? \(@\.type\(\) != "number"\)'\)/,
    'a CHECK may not contain a subquery, so the element test is a JSON path predicate');
  assert.match(sql, /source IN \('derived', 'override'\)/);
  const fix = await readFile(path.join(root, 'db/migrations/106_measurement_grade_projection_null.sql'), 'utf8');
  assert.match(fix, /NULLIF\(payload -> 'gradeSteps', 'null'::jsonb\)/,
    'a JSON null and an SQL NULL both mean "no rule"');
  const routes = await readFile(path.join(root, 'src/http/routes.mjs'), 'utf8');
  assert.ok(routes.includes("'measurements', 'gradeSteps'"), 'the free chart accepts a rule');
  assert.ok(routes.includes("'tolerancePlus', 'measurements', 'gradeSteps']"), 'the governed chart accepts one too');
});

// Ревизия опубликованной таблицы — это её собственные точки, отправленные обратно. Проверяется
// именно то, что делает экран: взять построенную таблицу, собрать из неё вход и построить заново.
function reviseFrom(built, { carryGrade = true } = {}) {
  return chart(built.points.map((builtPoint) => ({
    pointCode: builtPoint.pointCode,
    name: builtPoint.name,
    description: builtPoint.description,
    toleranceMinus: builtPoint.toleranceMinus,
    tolerancePlus: builtPoint.tolerancePlus,
    ...(carryGrade ? { gradeSteps: builtPoint.gradeSteps } : {}),
    measurements: builtPoint.measurements.map((entry) => ({ sizeCode: entry.sizeCode, value: entry.value })),
  })));
}

test('A revision that carries the rule reproduces the chart exactly, exceptions included', () => {
  // 50 набрано вручную поверх правила: 110 вместо выведенных 108. После ревизии правило на месте,
  // значения те же, и исключение осталось исключением, а не стало новой нормой.
  const built = chart([point({ gradeSteps: [4, 4, 4], measurements: [{ sizeCode: '46', value: 100 }, { sizeCode: '50', value: 110 }] })]);
  assert.deepEqual(built.points[0].measurements.map((entry) => entry.source), ['derived', 'derived', 'derived', 'override']);

  const revised = reviseFrom(built);
  assert.deepEqual(revised.points[0].gradeSteps, [4, 4, 4]);
  assert.deepEqual(revised.points[0].measurements.map((entry) => entry.value), built.points[0].measurements.map((entry) => entry.value));
  assert.deepEqual(revised.points[0].measurements.map((entry) => entry.source), ['derived', 'derived', 'derived', 'override']);
});

test('A revision that drops the rule keeps the numbers and loses what they were derived from', () => {
  // Это и был дефект экрана ревизии: посылка не несла `gradeSteps`, домен читал отсутствие поля как
  // «правила нет», и градуированная таблица молча становилась набранной вручную. Числа при этом
  // совпадают, поэтому глазом потеря не видна — её видно только по исчезнувшему правилу.
  const built = chart([point({ gradeSteps: [4, 4, 4] })]);
  const stripped = reviseFrom(built, { carryGrade: false });
  assert.equal(stripped.points[0].gradeSteps, null);
  assert.deepEqual(stripped.points[0].measurements.map((entry) => entry.value), [96, 100, 104, 108]);
});
