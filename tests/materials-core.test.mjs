import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/materials-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Math, String, Number, RegExp, Set, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'materials-core.js' });
const core = context.SynthaMaterialsCore;

const complete = Object.freeze({
  code: 'FAB-001', name: 'Italian wool', type: 'fabric', unit: 'm', supplierName: 'Mill One',
  composition: '100% wool', currency: 'EUR', unitCost: 18.25, minimumOrderQuantity: 50,
  availableQuantity: 120, reservedQuantity: 20, availableToUse: 100, status: 'published',
});

test('marks a complete published material as sourcing-ready', () => {
  const result = core.assessMaterial(complete);
  assert.equal(result.readiness, 100);
  assert.equal(result.sourcingReady, true);
  assert.equal(result.risks.length, 0);
});

test('detects supplier, commercial and inventory blockers', () => {
  const result = core.assessMaterial({ ...complete, supplierName: null, unitCost: null, availableQuantity: 10, reservedQuantity: 12, availableToUse: -2 });
  assert.equal(result.blocking, true);
  assert.equal(result.sourcingReady, false);
  assert.deepEqual(Array.from(result.risks, (item) => item.code).slice(0, 2), ['INVENTORY_INCONSISTENT', 'MISSING_SUPPLIER']);
});

test('flags published stock below MOQ and zero availability', () => {
  const low = core.assessMaterial({ ...complete, minimumOrderQuantity: 50, availableQuantity: 20, reservedQuantity: 20, availableToUse: 0 });
  assert.equal(low.risks.some((item) => item.code === 'AVAILABLE_BELOW_MOQ'), true);
  assert.equal(low.risks.some((item) => item.code === 'NO_AVAILABLE_STOCK'), true);
});

test('requires composition only for fabric', () => {
  assert.equal(core.assessMaterial({ ...complete, composition: null }).risks.some((item) => item.code === 'MISSING_COMPOSITION'), true);
  assert.equal(core.assessMaterial({ ...complete, type: 'trim', composition: null }).risks.some((item) => item.code === 'MISSING_COMPOSITION'), false);
});

test('returns deterministic empty and populated summaries', () => {
  assert.deepEqual({ ...core.buildRegistry([]).summary }, { total: 0, published: 0, draft: 0, sourcingReady: 0, critical: 0, lowStock: 0, averageReadiness: 0 });
  const result = core.buildRegistry([complete, { ...complete, code: 'FAB-002', status: 'draft' }]);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.published, 1);
  assert.equal(result.summary.draft, 1);
});
