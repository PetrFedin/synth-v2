import assert from 'node:assert/strict';
import test from 'node:test';

await import('../public/modules/linesheet-matrix-core.js');
const matrix = globalThis.SynthaLinesheetMatrix;

const matrices = Object.freeze([Object.freeze({
  rows: Object.freeze([Object.freeze({
    cells: Object.freeze({
      'size:m': Object.freeze({ sku: 'SKU-M', minimumOrderQuantity: 2, availableToSell: 8 }),
      'size:l': Object.freeze({ sku: 'SKU-L', minimumOrderQuantity: 1, availableToSell: null }),
    }),
  })]),
})]);

test('buyer matrix builds one atomic exact-SKU replacement request', () => {
  assert.deepEqual(matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-L': 3, 'SKU-M': 4, 'SKU-BLANK': '' }), {
    method: 'PUT',
    path: '/v2/selections/selection%3A1/matrix',
    body: {
      selectionId: 'selection:1',
      lines: [
        { sku: 'SKU-L', quantity: 3 },
        { sku: 'SKU-M', quantity: 4 },
      ],
    },
  });
});

test('buyer matrix requires blank to remove a SKU and rejects zero or fractional quantities', () => {
  assert.throws(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-M': 0 }), error => error?.code === 'BUYER_MATRIX_QUANTITY_INVALID');
  assert.throws(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-M': '2.5' }), error => error?.code === 'BUYER_MATRIX_QUANTITY_INVALID');
  assert.deepEqual(matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-M': '' }).body.lines, []);
});

test('buyer matrix client validation mirrors frozen MOQ and explicit available-to-sell bounds', () => {
  assert.throws(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-M': 1 }), error => error?.code === 'BUYER_MATRIX_MOQ_NOT_MET');
  assert.throws(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-M': 9 }), error => error?.code === 'BUYER_MATRIX_AVAILABILITY_EXCEEDED');
  assert.doesNotThrow(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-L': 5000 }));
});

test('buyer matrix refuses quantities for SKUs outside rendered immutable buyer catalog', () => {
  assert.throws(() => matrix.selectionMatrixRequest('selection:1', matrices, { 'SKU-UNKNOWN': 2 }), error => error?.code === 'BUYER_MATRIX_SKU_UNKNOWN');
});

test('buyer matrix builds the exact selection creation route with pinned Retail Door identity only', () => {
  assert.deepEqual(matrix.createSelectionRequest('cycle:1', 'showroom:1', 'door:moscow:1'), {
    method: 'POST',
    path: '/v2/selections',
    body: { cycleId: 'cycle:1', showroomId: 'showroom:1', retailDoorId: 'door:moscow:1' },
  });
});
