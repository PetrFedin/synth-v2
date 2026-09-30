import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'measurement-core.js'), 'utf8');
const context = vm.createContext({ globalThis: {} });
vm.runInContext(source, context, { filename: 'measurement-core.js' });
const core = context.globalThis.SynthaMeasurementCore;
// `core` runs in a separate vm realm: its arrays/objects are structurally identical to native ones
// but fail assert.deepEqual's realm-aware checks, the same reason measurement-ui-core.test.mjs
// round-trips through JSON before comparing.
const plain = (value) => JSON.parse(JSON.stringify(value));

// docs/backlog-not-yet-integrated.md, раздел E: «импорт/экспорт табеля мер» — editor grid round-trips
// through a CSV file without ever reaching the server; кроме самого содержимого проверяется и то,
// что разбор не зависит от разделителя, каким Excel сохраняет файл (запятая/точка с запятой/таб).
function model() {
  const sizeM = { key: 'size-1', code: 'M', label: 'M' };
  const sizeL = { key: 'size-2', code: 'L', label: 'L' };
  return {
    sku: 'STYLE-001',
    sizes: [sizeM, sizeL],
    points: [
      { key: 'point-1', pointCode: 'CHEST', name: 'Half chest', description: 'Across the chest', toleranceMinus: 0.5, tolerancePlus: 0.5, grade: '+4', qcChecked: true, values: new Map([[sizeM.key, '51'], [sizeL.key, '55']]) },
      { key: 'point-2', pointCode: 'WAIST', name: 'Half waist', description: '', toleranceMinus: 1, tolerancePlus: 1, grade: '', qcChecked: false, values: new Map([[sizeM.key, '40'], [sizeL.key, '']]) },
    ],
  };
}
const columnLabels = ['POM', 'Name', 'Description', 'Tol-', 'Tol+', 'Grade', 'QC'];

test('the exported CSV carries a UTF-8 BOM, a header row and one row per point in size-column order', () => {
  const csv = core.chartModelToCsv(model(), columnLabels);
  assert.match(csv, /^﻿/);
  // .trim() would eat the leading BOM too -- it counts as Unicode whitespace -- so the trailing
  // line terminator is stripped explicitly instead.
  const lines = csv.replace(/\r\n$/, '').split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '﻿POM;Name;Description;Tol-;Tol+;Grade;QC;M;L');
  assert.equal(lines[1], 'CHEST;Half chest;Across the chest;0.5;0.5;+4;1;51;55');
  assert.equal(lines[2], 'WAIST;Half waist;;1;1;;;40;');
});

test('a re-imported export reproduces the same points, sizes and QC flag', () => {
  const original = model();
  const csv = core.chartModelToCsv(original, columnLabels);
  const parsed = core.parseMeasurementChartCsv(csv);
  assert.ok(parsed);
  let sequence = 0;
  const nextKey = (prefix) => `${prefix}-${++sequence}`;
  const reloaded = { sku: original.sku };
  core.applyMeasurementChartCsv(reloaded, parsed, nextKey);
  assert.deepEqual(plain(reloaded.sizes.map((size) => size.code)), ['M', 'L']);
  assert.equal(reloaded.points.length, 2);
  assert.equal(reloaded.points[0].pointCode, 'CHEST');
  assert.equal(reloaded.points[0].qcChecked, true);
  assert.equal(reloaded.points[1].qcChecked, false);
  const [sizeM, sizeL] = reloaded.sizes;
  assert.equal(reloaded.points[0].values.get(sizeM.key), '51');
  assert.equal(reloaded.points[0].values.get(sizeL.key), '55');
  assert.equal(reloaded.points[1].values.get(sizeL.key), '');
});

test('parsing sniffs comma and tab delimiters the same way, not just the semicolon the export writes', () => {
  const commaSource = 'POM,Name,Description,Tol-,Tol+,Grade,QC,M\nCHEST,Half chest,,0.5,0.5,,1,51\n';
  const tabSource = 'POM\tName\tDescription\tTol-\tTol+\tGrade\tQC\tM\nCHEST\tHalf chest\t\t0.5\t0.5\t\t1\t51\n';
  for (const source of [commaSource, tabSource]) {
    const parsed = core.parseMeasurementChartCsv(source);
    assert.ok(parsed, source);
    assert.deepEqual(plain(parsed.sizeCodes), ['M']);
    assert.equal(parsed.dataRows.length, 1);
  }
});

test('a quoted field carrying the delimiter and an escaped quote survives the round trip', () => {
  const source = 'POM;Name;Description;Tol-;Tol+;Grade;QC;M\nCHEST;Half chest;"Across; at ""bust"" line";0.5;0.5;;;51\n';
  const parsed = core.parseMeasurementChartCsv(source);
  assert.ok(parsed);
  assert.equal(parsed.dataRows[0][2], 'Across; at "bust" line');
});

test('a file with no size columns at all, or no data rows, is refused rather than silently emptying the chart', () => {
  assert.equal(core.parseMeasurementChartCsv('POM;Name;Description;Tol-;Tol+;Grade;QC\nCHEST;Half chest;;0.5;0.5;;\n'), null);
  assert.equal(core.parseMeasurementChartCsv('POM;Name;Description;Tol-;Tol+;Grade;QC;M\n'), null);
});
