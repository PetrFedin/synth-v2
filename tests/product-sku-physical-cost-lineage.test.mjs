import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSamePhysicalCostLine,
  resolvePhysicalCostLine,
} from '../src/modules/order-economics/product-sku-physical-cost.mjs';

function shipment(lines) {
  return Object.freeze({
    id: 'shipment-1',
    lines: Object.freeze(lines.map((line) => Object.freeze({ ...line }))),
  });
}

test('SKU-only physical cost is rejected when textual SKU maps to multiple immutable ProductSku order lines', () => {
  const value = shipment([
    { lineId: 'line-1', orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU', quantity: 1 },
    { lineId: 'line-2', orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU', quantity: 1 },
  ]);

  assert.throws(
    () => resolvePhysicalCostLine(value, { sku: 'DUP-SKU' }),
    (error) => error.code === 'PHYSICAL_ACTUAL_COST_ORDER_LINE_AMBIGUOUS',
  );
});

test('immutable orderLineNo resolves exact ProductSku physical cost lineage', () => {
  const value = shipment([
    { lineId: 'line-1', orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU', quantity: 1 },
    { lineId: 'line-2', orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU', quantity: 1 },
  ]);

  assert.deepEqual(resolvePhysicalCostLine(value, { orderLineNo: 1 }), {
    orderLineNo: 1,
    productSkuId: 'product-sku-red-38',
    sku: 'DUP-SKU',
  });
});

test('client ProductSku cannot override immutable shipment order-line lineage', () => {
  const value = shipment([
    { lineId: 'line-1', orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'SKU-1', quantity: 1 },
  ]);

  assert.throws(
    () => resolvePhysicalCostLine(value, { orderLineNo: 1, productSkuId: 'forged-product-sku', sku: 'SKU-1' }),
    (error) => error.code === 'PHYSICAL_ACTUAL_COST_PRODUCT_SKU_MISMATCH',
  );
});

test('multiple shipment lines for one immutable ProductSku identity do not create false ambiguity', () => {
  const value = shipment([
    { lineId: 'line-1-a', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1', quantity: 1 },
    { lineId: 'line-1-b', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1', quantity: 2 },
  ]);

  assert.deepEqual(resolvePhysicalCostLine(value, { sku: 'SKU-1' }), {
    orderLineNo: 1,
    productSkuId: 'product-sku-1',
    sku: 'SKU-1',
  });
});

test('aggregate physical cost remains valid without ProductSku identity', () => {
  const value = shipment([
    { lineId: 'line-1', orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1', quantity: 1 },
  ]);

  assert.equal(resolvePhysicalCostLine(value, {}), null);
});

test('physical cost correction cannot move between ProductSku lines or aggregate and SKU-specific lineage', () => {
  const first = Object.freeze({ orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1' });
  const second = Object.freeze({ orderLineNo: 2, productSkuId: 'product-sku-2', sku: 'SKU-2' });

  assert.throws(
    () => assertSamePhysicalCostLine(first, second),
    (error) => error.code === 'PHYSICAL_ACTUAL_COST_CORRECTION_LINEAGE_MISMATCH',
  );
  assert.throws(
    () => assertSamePhysicalCostLine(null, first),
    (error) => error.code === 'PHYSICAL_ACTUAL_COST_CORRECTION_LINEAGE_MISMATCH',
  );
  assert.doesNotThrow(() => assertSamePhysicalCostLine(first, { ...first }));
  assert.doesNotThrow(() => assertSamePhysicalCostLine(null, null));
});
