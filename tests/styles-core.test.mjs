import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/styles-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Math, String, Number, RegExp, Set, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'styles-core.js' });
const core = context.SynthaStylesCore;

const completeSku = Object.freeze({ sku: 'STYLE-001-BLK-M', collectionId: 'collection-1', brandId: 'brand-1', name: 'Tailored Jacket', wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 20, reservedQuantity: 4, availableToSell: 16, status: 'published', version: 2 });
function workspace(overrides = {}) { return { catalogSkus: [], collections: [], showrooms: [], selections: [], orders: [], ...overrides }; }

test('marks a complete published and enabled SKU as sale-ready', () => {
  const result = core.assessStyle(workspace({
    collections: [{ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'showroom-1', collectionId: 'collection-1', status: 'open' }],
    selections: [{ id: 'selection-1', showroomId: 'showroom-1', lines: [{ sku: completeSku.sku, quantity: 4 }] }],
    orders: [{ id: 'order-1', selectionId: 'selection-1', status: 'ready' }],
  }), completeSku);
  assert.equal(result.readiness, 100);
  assert.equal(result.saleReady, true);
  assert.equal(result.usage.orderedUnits, 4);
});

test('detects collection context and inventory contradictions', () => {
  const broken = { ...completeSku, brandId: 'wrong', currency: 'USD', availableQuantity: 3, reservedQuantity: 4, availableToSell: -1 };
  const result = core.assessStyle(workspace({ collections: [{ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' }] }), broken);
  assert.equal(result.risks.some((item) => item.code === 'BRAND_MISMATCH'), true);
  assert.equal(result.risks.some((item) => item.code === 'INVENTORY_INCONSISTENT'), true);
  assert.equal(result.saleReady, false);
});

test('flags published ATS below MOQ', () => {
  const low = { ...completeSku, minimumOrderQuantity: 5, availableQuantity: 10, reservedQuantity: 8, availableToSell: 2 };
  const result = core.assessStyle(workspace({
    collections: [{ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'showroom-1', collectionId: 'collection-1', status: 'open' }],
  }), low);
  assert.equal(result.risks.some((item) => item.code === 'ATS_BELOW_MOQ'), true);
});

test('attributes usage only through exact live SKU lines', () => {
  const result = core.assessStyle(workspace({
    collections: [{ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'showroom-1', collectionId: 'collection-1', status: 'open' }],
    selections: [
      { id: 'selection-1', showroomId: 'showroom-1', lines: [{ sku: completeSku.sku, quantity: 3 }, { sku: 'OTHER', quantity: 99 }] },
      { id: 'selection-2', showroomId: 'showroom-1', lines: [{ sku: 'OTHER', quantity: 10 }] },
    ],
    orders: [
      { id: 'order-1', selectionId: 'selection-1', status: 'ready' },
      { id: 'order-2', selectionId: 'selection-1', status: 'cancelled' },
      { id: 'order-3', selectionId: 'selection-2', status: 'ready' },
    ],
  }), completeSku);
  assert.equal(result.usage.selections.length, 1);
  assert.equal(result.usage.orders.length, 1);
  assert.equal(result.usage.orderedUnits, 3);
});

test('treats absent numeric fields as missing instead of zero', () => {
  const result = core.assessStyle(workspace({ collections: [{ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' }] }), { ...completeSku, wholesalePrice: null, availableQuantity: null, availableToSell: null });
  assert.equal(result.risks.some((item) => item.code === 'INVALID_WHOLESALE_PRICE'), true);
  assert.equal(result.risks.some((item) => item.code === 'INVENTORY_INCONSISTENT'), true);
});
