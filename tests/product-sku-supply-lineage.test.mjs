import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSkuSupplyCommitmentSnapshot } from '../src/modules/order-economics/product-sku-supply.mjs';

const createdAt = '2026-08-24T18:00:00.000Z';

function executionBasis(lines) {
  const orderCommit = Object.freeze({
    id: 'commit-1',
    orderId: 'order-1',
    orderVersion: 7,
    brandId: 'brand-1',
    shopId: 'shop-1',
    commercialPublicationId: 'publication-1',
    priceListVersionId: 'price-list-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    currency: 'EUR',
    lines: Object.freeze(lines.map((line) => Object.freeze({ ...line }))),
  });
  const order = Object.freeze({
    id: 'order-1',
    status: 'attached',
    orderCommitSnapshotId: orderCommit.id,
  });
  return { order, orderCommit };
}

function allocation(overrides = {}) {
  return {
    quantity: 1,
    sourceType: 'production',
    sourceRef: 'po-1',
    expectedAvailabilityAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('supply commitment binds duplicate textual SKU lines independently by immutable orderLineNo', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'DUP-SKU', productSkuId: 'product-sku-red-38', quantity: 2 },
    { lineNo: 2, sku: 'DUP-SKU', productSkuId: 'product-sku-blue-38', quantity: 3 },
  ]);

  const snapshot = createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [
      allocation({ orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU', quantity: 2, sourceRef: 'po-red' }),
      allocation({ orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU', quantity: 3, sourceRef: 'po-blue' }),
    ],
    createdAt,
  });

  assert.deepEqual(snapshot.allocations.map(({ orderLineNo, productSkuId, sku, quantity }) => ({ orderLineNo, productSkuId, sku, quantity })), [
    { orderLineNo: 1, productSkuId: 'product-sku-red-38', sku: 'DUP-SKU', quantity: 2 },
    { orderLineNo: 2, productSkuId: 'product-sku-blue-38', sku: 'DUP-SKU', quantity: 3 },
  ]);
});

test('legacy SKU-only supply allocation is rejected when textual SKU is ambiguous', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'DUP-SKU', productSkuId: 'product-sku-1', quantity: 2 },
    { lineNo: 2, sku: 'DUP-SKU', productSkuId: 'product-sku-2', quantity: 2 },
  ]);

  assert.throws(() => createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [allocation({ sku: 'DUP-SKU' })],
    createdAt,
  }), (error) => error.code === 'SUPPLY_COMMITMENT_ORDER_LINE_AMBIGUOUS');
});

test('legacy unique SKU-only allocation is canonicalized to immutable ProductSku lineage', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'UNIQUE-SKU', productSkuId: 'product-sku-1', quantity: 2 },
  ]);

  const snapshot = createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [allocation({ sku: 'UNIQUE-SKU' })],
    createdAt,
  });

  assert.equal(snapshot.allocations[0].orderLineNo, 1);
  assert.equal(snapshot.allocations[0].productSkuId, 'product-sku-1');
  assert.equal(snapshot.allocations[0].sku, 'UNIQUE-SKU');
});

test('client ProductSku cannot override immutable order-line lineage', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'SKU-1', productSkuId: 'canonical-product-sku', quantity: 2 },
  ]);

  assert.throws(() => createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [allocation({ orderLineNo: 1, productSkuId: 'forged-product-sku', sku: 'SKU-1' })],
    createdAt,
  }), (error) => error.code === 'SUPPLY_COMMITMENT_PRODUCT_SKU_MISMATCH');
});

test('client textual SKU cannot override immutable order-line lineage', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'SKU-1', productSkuId: 'product-sku-1', quantity: 2 },
  ]);

  assert.throws(() => createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [allocation({ orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'FORGED-SKU' })],
    createdAt,
  }), (error) => error.code === 'SUPPLY_COMMITMENT_SKU_MISMATCH');
});

test('supply quantity limit is enforced per immutable order line rather than per textual SKU', () => {
  const { order, orderCommit } = executionBasis([
    { lineNo: 1, sku: 'DUP-SKU', productSkuId: 'product-sku-1', quantity: 2 },
    { lineNo: 2, sku: 'DUP-SKU', productSkuId: 'product-sku-2', quantity: 5 },
  ]);

  assert.throws(() => createProductSkuSupplyCommitmentSnapshot({
    id: 'supply-1',
    order,
    orderCommit,
    allocations: [
      allocation({ orderLineNo: 1, quantity: 2 }),
      allocation({ orderLineNo: 1, quantity: 1, sourceRef: 'po-2' }),
    ],
    createdAt,
  }), (error) => error.code === 'SUPPLY_COMMITMENT_EXCEEDS_ORDER');
});
