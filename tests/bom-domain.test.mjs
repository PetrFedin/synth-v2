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
    sku: 'STYLE-001',
    currency: 'EUR',
    lines: [
      { lineId: 'SHELL', component: 'Shell fabric', materialCode: 'FAB-001', quantity: 2, wastePercent: 10, exchangeRate: 1 },
      { lineId: 'ZIP', component: 'Front zip', materialCode: 'ZIP-001', quantity: 3, wastePercent: 0, exchangeRate: 0.9 },
    ],
    laborCost: 5,
    overheadCost: 2,
    logisticsCost: 1,
    otherCost: 0.3,
    notes: 'Base costing',
    ...overrides,
  };
}

test('calculates reproducible material and total cost from authoritative snapshots', () => {
  const bom = createBom({ id: 'bom-1', catalogSku, materials, input: input(), createdAt: '2026-08-03T12:00:00.000Z' });
  assert.equal(bom.status, 'draft');
  assert.equal(bom.version, 1);
  assert.equal(bom.lines[0].grossQuantity, 2.2);
  assert.equal(bom.lines[0].lineCost, 22);
  assert.equal(bom.lines[1].lineCost, 2.7);
  assert.equal(bom.materialCost, 24.7);
  assert.equal(bom.totalCost, 33);
  assert.equal(bom.lines[0].unitCostSnapshot, 10);
  assert.equal(bom.lines[0].materialVersion, 2);
  assert.equal(Object.isFrozen(bom.lines), true);
});

test('requires explicit FX for cross-currency material and rate 1 for same currency', () => {
  const missingFx = input({ lines: [{ lineId: 'ZIP', component: 'Front zip', materialCode: 'ZIP-001', quantity: 1, wastePercent: 0 }] });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: missingFx, createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_EXCHANGE_RATE_REQUIRED' });
  const invalidSameCurrencyRate = input({ lines: [{ lineId: 'SHELL', component: 'Shell fabric', materialCode: 'FAB-001', quantity: 1, wastePercent: 0, exchangeRate: 1.1 }] });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: invalidSameCurrencyRate, createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_EXCHANGE_RATE_INVALID' });
});

test('rejects duplicate line ids and client-supplied material pricing fields', () => {
  const duplicate = input({ lines: [
    { lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0 },
    { lineId: 'SHELL', component: 'Pocket', materialCode: 'FAB-001', quantity: 0.2, wastePercent: 0 },
  ] });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: duplicate, createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_LINE_ID_DUPLICATE' });
  const injected = input({ lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0, unitCost: 0.01 }] });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials, input: injected, createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_LINE_FIELD_FORBIDDEN' });
});

test('converts corrupt material data into controlled domain errors', () => {
  const corrupted = [{ ...materials[0], unitCost: null }];
  const singleLine = input({ lines: [{ lineId: 'SHELL', component: 'Shell', materialCode: 'FAB-001', quantity: 1, wastePercent: 0 }] });
  assert.throws(() => createBom({ id: 'bom-1', catalogSku, materials: corrupted, input: singleLine, createdAt: '2026-08-03T12:00:00.000Z' }), { code: 'BOM_MATERIAL_UNIT_COST_INVALID' });
});

test('updates drafts idempotently and increments version exactly once on change', () => {
  const bom = createBom({ id: 'bom-1', catalogSku, materials, input: input(), createdAt: '2026-08-03T12:00:00.000Z' });
  const replay = updateDraftBom(bom, { catalogSku, materials, input: input(), updatedAt: '2026-08-03T13:00:00.000Z' });
  assert.equal(replay, bom);
  const updated = updateDraftBom(bom, { catalogSku, materials, input: input({ laborCost: 6 }), updatedAt: '2026-08-03T13:00:00.000Z' });
  assert.equal(updated.version, 2);
  assert.equal(updated.laborCost, 6);
  assert.equal(updated.totalCost, 34);
});

test('publishes only with published SKU and current published material snapshots', () => {
  const bom = createBom({ id: 'bom-1', catalogSku, materials, input: input(), createdAt: '2026-08-03T12:00:00.000Z' });
  assert.throws(() => publishBom(bom, { catalogSku, materials, publishedAt: '2026-08-03T13:00:00.000Z' }), { code: 'BOM_SKU_NOT_PUBLISHED' });
  const publishedSku = { ...catalogSku, status: 'published', version: 2 };
  assert.throws(() => publishBom(bom, { catalogSku: publishedSku, materials: [{ ...materials[0], version: 3 }, materials[1]], publishedAt: '2026-08-03T13:00:00.000Z' }), { code: 'BOM_MATERIAL_SNAPSHOT_STALE' });
  const published = publishBom(bom, { catalogSku: publishedSku, materials, publishedAt: '2026-08-03T13:00:00.000Z' });
  assert.equal(published.status, 'published');
  assert.equal(published.version, 2);
});
