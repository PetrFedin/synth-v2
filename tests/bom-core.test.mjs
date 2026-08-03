import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/bom-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Math, String, Number, Set, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'bom-core.js' });
const core = context.SynthaBomCore;

const sku = { sku: 'STYLE-001', brandId: 'brand-1', status: 'published', name: 'Jacket' };
const bom = {
  id: 'bom-1', sku: 'STYLE-001', brandId: 'brand-1', currency: 'EUR', status: 'published',
  lines: [{ lineId: 'SHELL', quantity: 2, unitCostSnapshot: 10, lineCost: 22 }],
  materialCost: 22, laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0, totalCost: 30,
};

test('marks a complete published BOM as ready', () => {
  const result = core.assessBom(bom, [sku]);
  assert.equal(result.readiness, 100);
  assert.equal(result.publishReady, true);
  assert.equal(result.risks.length, 0);
});

test('detects missing SKU, broken costs and duplicate lines', () => {
  const result = core.assessBom({
    ...bom,
    status: 'draft',
    totalCost: 1,
    lines: [bom.lines[0], { ...bom.lines[0] }],
  }, []);
  const codes = result.risks.map((item) => item.code);
  assert.equal(codes.includes('SKU_NOT_IN_WORKSPACE'), true);
  assert.equal(codes.includes('DUPLICATE_LINE_ID'), true);
  assert.equal(codes.includes('TOTAL_BELOW_MATERIAL'), true);
  assert.equal(result.publishReady, false);
});

test('builds stable zero summary for empty register', () => {
  assert.deepEqual({ ...core.buildRegistry([], []).summary }, {
    total: 0, draft: 0, published: 0, publishReady: 0, critical: 0,
    averageReadiness: 0, averageTotalCost: 0,
  });
});
