import assert from 'node:assert/strict';
import test from 'node:test';
import { createBom, publishBom, updateDraftBom } from '../src/modules/bom/public.mjs';

const catalogSku = Object.freeze({ sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 });
const materials = Object.freeze([
  Object.freeze({ code: 'FAB-001', brandId: 'brand-1', name: 'Wool shell', type: 'fabric', unit: 'm', currency: 'EUR', unitCost: 10, version: 2, status: 'published' }),
  Object.freeze({ code: 'ZIP-001', brandId: 'brand-1', name: 'Metal zip', type: 'trim', unit: 'pc', currency: 'USD', unitCost: 1, version: 1, status: 'published' }),
]);
function input(overrides = {}) {
  return {
    sku: 'STYLE-001', currency: 'EUR',
    lines: [
      { lineId: 'SHELL', component: 'Shell fabric', materialCode: 'FAB-001', quantity: 2, wastePercent: 10, exchangeRate: 1 },
      { lineId: 'ZIP', component: 'Front zip', materialCode: 'ZIP-001', quantity: 3, wastePercent: 0, exchangeRate: 0.9 },
    ],
    laborCost: 5, overheadCost: 2, logisticsCost: 1, otherCost: 0.3, notes: 'Base costing', ...overrides,
  };
}

test('calculates exact authoritative material and total costs', () => {
  const bom = createBom({ id: 'bom-1', catalogSku, materials, input: input(), createdAt: '2026-08-03T12:00:00.000Z' });
  assert.equal(bom.lines[0].grossQuantity, 2.2);
  assert.equal(bom.lines[0].lineCost, 22);
  assert.equal(bom.lines[1].lineCost, 2.7);
  assert.equal(bom.materialCost, 24.7);
  assert.equal(bom.totalCost, 33);
  assert.equal(bom.lines[0].unitCostSnapshot, 10);
  assert.equal(bom.lines[0].materialVersion, 2);
  assert.equal(Object.isFrozen(bom.lines), true);
});

test('enforces FX, unique lines and rejects snapshot injection', () => {
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: input({ lines: [{ lineId: 'ZIP', component: 'Zip', materialCode: 'ZIP-001', quantity: 1, wastePercent: 0 }] }), createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_EXCHANGE_RATE_REQUIRED' });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: input({ lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0, exchangeRate: 1.1 }] }), createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_EXCHANGE_RATE_INVALID' });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: input({ lines: [
    { lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0 },
    { lineId: 'SHELL', component: 'Pocket', materialCode: 'FAB-001', quantity: 0.2, wastePercent: 0 },
  ] }), createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_LINE_ID_DUPLICATE' });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: input({ lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0, unitCost: 0.01 }] }), createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_LINE_FIELD_FORBIDDEN' });
});

test('updates drafts idempotently and publishes only current snapshots', () => {
  const bom = createBom({ id: 'bom-1', catalogSku, materials, input: input(), createdAt: '2026-08-03T12:00:00.000Z' });
  assert.equal(updateDraftBom(bom, { catalogSku, materials, input: input(), updatedAt: '2026-08-03T13:00:00.000Z' }), bom);
  const updated = updateDraftBom(bom, { catalogSku, materials, input: input({ laborCost: 6 }), updatedAt: '2026-08-03T13:00:00.000Z' });
  assert.equal(updated.version, 2);
  assert.equal(updated.totalCost, 34);
  const publishedSku = { ...catalogSku, status: 'published', version: 2 };
  assert.throws(() => publishBom(updated, { catalogSku: publishedSku, materials: [{ ...materials[0], version: 3 }, materials[1]], publishedAt: '2026-08-03T14:00:00.000Z' }), { code: 'BOM_MATERIAL_SNAPSHOT_STALE' });
  const published = publishBom(updated, { catalogSku: publishedSku, materials, publishedAt: '2026-08-03T14:00:00.000Z' });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 3);
});

test('corrupt persisted material produces controlled domain error', () => {
  assert.throws(() => createBom({
    id: 'bom-1', catalogSku, materials: [{ ...materials[0], unitCost: null }],
    input: input({ lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0 }] }),
    createdAt: '2026-08-03T12:00:00.000Z',
  }), { code: 'BOM_MATERIAL_UNIT_COST_INVALID' });
});
