import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createBom } from '../src/modules/bom/public.mjs';

const root = process.cwd();
const catalogSku = { sku: 'SKU-1', brandId: 'brand-1' };
const materials = [
  { code: 'FAB-A', brandId: 'brand-1', version: 1, status: 'published', type: 'fabric', unit: 'm', name: 'Shell', currency: 'EUR', unitCost: 10 },
  { code: 'FAB-B', brandId: 'brand-1', version: 1, status: 'published', type: 'fabric', unit: 'm', name: 'Lining', currency: 'EUR', unitCost: 4 },
  { code: 'TRM-A', brandId: 'brand-1', version: 1, status: 'published', type: 'trim', unit: 'pc', name: 'Zip', currency: 'EUR', unitCost: 2 },
];
function line(overrides = {}) {
  return { lineId: 'L1', component: 'Shell fabric', materialCode: 'FAB-A', quantity: 2, wastePercent: 0, exchangeRate: 1, ...overrides };
}
function build(lines) {
  return createBom({ id: 'bom-1', catalogSku, materials, createdAt: '2026-09-21T09:00:00.000Z',
    input: { sku: 'SKU-1', currency: 'EUR', lines, laborCost: 0, overheadCost: 0, logisticsCost: 0, otherCost: 0 } });
}
function codeOf(fn) {
  try { fn(); } catch (error) { return error.code; }
  return 'NO_ERROR';
}

test('A line says where it goes and whether it is the principal material', () => {
  const bom = build([line({ placement: 'Рукава, планка, воротник', isMain: true })]);
  assert.equal(bom.lines[0].placement, 'Рукава, планка, воротник');
  assert.equal(bom.lines[0].isMain, true);
});

test('Both are optional, and an absent one is absent rather than empty', () => {
  const bom = build([line()]);
  assert.equal(bom.lines[0].placement, null, 'no placement is null, not an empty string the database would reject');
  assert.equal(bom.lines[0].isMain, false);
  assert.equal(build([line({ placement: '' })]).lines[0].placement, null);
});

test('A bill may name one principal material of each kind, and no more', () => {
  // Two principal fabrics is not a strong opinion, it is an unanswered question — and the answer
  // is what the care label prints.
  const twoFabrics = [line({ lineId: 'L1', isMain: true }), line({ lineId: 'L2', materialCode: 'FAB-B', component: 'Lining', isMain: true })];
  assert.equal(codeOf(() => build(twoFabrics)), 'BOM_MULTIPLE_MAIN_LINES');
  // One of each kind is exactly right: a principal fabric and a principal trim do not compete.
  const oneEach = build([line({ lineId: 'L1', isMain: true }), line({ lineId: 'L2', materialCode: 'TRM-A', component: 'Zip', isMain: true })]);
  assert.deepEqual(oneEach.lines.map((entry) => entry.isMain), [true, true]);
  // None is allowed: a bill still being written has not decided yet.
  assert.deepEqual(build([line(), line({ lineId: 'L2', materialCode: 'FAB-B', component: 'Lining' })]).lines.map((entry) => entry.isMain), [false, false]);
});

test('A placement that is not text, and a main flag that is not a flag, are refused', () => {
  assert.equal(codeOf(() => build([line({ placement: 'x' })])), 'BOM_LINE_PLACEMENT_INVALID');
  assert.equal(codeOf(() => build([line({ placement: 'x'.repeat(401) })])), 'BOM_LINE_PLACEMENT_INVALID');
  assert.equal(codeOf(() => build([line({ isMain: 'yes' })])), 'BOM_LINE_MAIN_INVALID');
});

test('The database holds the same rule, and the document prints both columns', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/103_bom_line_placement_and_main.sql'), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX bom_lines_single_main_per_type_idx[\s\S]*WHERE is_main/,
    'the one-principal-per-kind rule must live where it cannot be bypassed');
  assert.match(sql, /placement IS NOT DISTINCT FROM NULLIF\(payload ->> 'placement', ''\)/);
  assert.match(sql, /is_main = COALESCE\(\(payload ->> 'isMain'\)::boolean, false\)/);

  const view = await readFile(path.join(root, 'db/migrations/104_tech_pack_document_placement.sql'), 'utf8');
  assert.match(view, /'placement', line\.placement, 'isMain', line\.is_main/);

  const ui = await readFile(path.join(root, 'public/modules/tech-packs.js'), 'utf8');
  assert.ok(ui.includes("text('Где применён', 'Placement')"), 'the printed document must carry the placement column');
  assert.ok(ui.includes('line.isMain'), 'the printed document must say which material is the principal');

  const bomUi = await readFile(path.join(root, 'public/modules/bom.js'), 'utf8');
  for (const token of ['lineGroups', 'bom-line-group-count', 'mainToggle', 'materialTypeOf', 'bom-line-placement']) {
    assert.ok(bomUi.includes(token), token);
  }
});
