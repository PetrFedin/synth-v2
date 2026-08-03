import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/modules/styles-core.js', import.meta.url), 'utf8');
const context = vm.createContext({ console, Object, Array, Set, Math, String, Number, RegExp, globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'styles-core.js' });
const core = context.SynthaStylesCore;

function workspace(overrides = {}) {
  return { catalogSkus: [], collections: [], showrooms: [], selections: [], orders: [], ...overrides };
}

const completeSku = Object.freeze({
  sku: 'STYLE-001-BLK-M', collectionId: 'col1', brandId: 'brand1', name: 'Tailored Jacket',
  wholesalePrice: 120, currency: 'EUR', minimumOrderQuantity: 2, availableQuantity: 20,
  reservedQuantity: 4, availableToSell: 16, status: 'published', version: 2,
});

test('marks a complete published and enabled style as sale-ready', () => {
  const result = core.assessStyle(workspace({
    catalogSkus: [completeSku],
    collections: [{ id: 'col1', brandId: 'brand1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'show1', collectionId: 'col1', status: 'open' }],
    selections: [{ id: 'sel1', showroomId: 'show1', lines: [{ sku: completeSku.sku, quantity: 4 }] }],
    orders: [{ id: 'ord1', selectionId: 'sel1', status: 'ready' }],
  }), completeSku);
  assert.equal(result.readiness, 100);
  assert.equal(result.saleReady, true);
  assert.equal(result.usage.orderedUnits, 4);
  assert.equal(result.risks.some((item) => item.severity === 'critical'), false);
});

test('detects collection, brand, currency and inventory contradictions', () => {
  const broken = { ...completeSku, brandId: 'wrong', currency: 'USD', availableQuantity: 3, reservedQuantity: 4, availableToSell: -1 };
  const result = core.assessStyle(workspace({
    collections: [{ id: 'col1', brandId: 'brand1', currency: 'EUR', status: 'published' }],
  }), broken);
  assert.deepEqual(Array.from(result.risks, (item) => item.code).slice(0, 2), ['BRAND_MISMATCH', 'INVENTORY_INCONSISTENT']);
  assert.equal(result.blocking, true);
  assert.equal(result.saleReady, false);
});

test('treats missing numeric master data as absent rather than zero', () => {
  const missing = { ...completeSku, wholesalePrice: null, minimumOrderQuantity: '', availableQuantity: undefined, availableToSell: undefined };
  const result = core.assessStyle(workspace({
    collections: [{ id: 'col1', brandId: 'brand1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'show1', collectionId: 'col1', status: 'open' }],
  }), missing);
  assert.equal(result.risks.some((item) => item.code === 'INVALID_WHOLESALE_PRICE'), true);
  assert.equal(result.risks.some((item) => item.code === 'INVALID_MOQ'), true);
  assert.equal(result.risks.some((item) => item.code === 'INVENTORY_INCONSISTENT'), true);
});

test('flags published style whose ATS is below MOQ', () => {
  const low = { ...completeSku, minimumOrderQuantity: 5, availableQuantity: 10, reservedQuantity: 8, availableToSell: 2 };
  const result = core.assessStyle(workspace({
    collections: [{ id: 'col1', brandId: 'brand1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'show1', collectionId: 'col1', status: 'open' }],
  }), low);
  assert.equal(result.risks.some((item) => item.code === 'ATS_BELOW_MOQ'), true);
  assert.equal(result.saleReady, false);
});

test('attributes usage only through exact SKU lines and live orders', () => {
  const result = core.assessStyle(workspace({
    collections: [{ id: 'col1', brandId: 'brand1', currency: 'EUR', status: 'published' }],
    showrooms: [{ id: 'show1', collectionId: 'col1', status: 'open' }],
    selections: [
      { id: 'sel1', showroomId: 'show1', lines: [{ sku: completeSku.sku, quantity: 3 }, { sku: 'OTHER', quantity: 99 }] },
      { id: 'sel2', showroomId: 'show1', lines: [{ sku: 'OTHER', quantity: 10 }] },
    ],
    orders: [
      { id: 'ord1', selectionId: 'sel1', status: 'ready' },
      { id: 'ord2', selectionId: 'sel1', status: 'cancelled' },
      { id: 'ord3', selectionId: 'sel2', status: 'ready' },
    ],
  }), completeSku);
  assert.equal(result.usage.selections.length, 1);
  assert.equal(result.usage.orders.length, 1);
  assert.equal(result.usage.selectedUnits, 3);
  assert.equal(result.usage.orderedUnits, 3);
});

test('returns stable zero registry summary for empty workspace', () => {
  const result = core.buildRegistry({});
  assert.deepEqual({ ...result.summary }, {
    total: 0, published: 0, draft: 0, saleReady: 0, critical: 0,
    averageReadiness: 0, commerciallyUsed: 0, lowAts: 0,
  });
});
