import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductionRequirementSnapshot,
  productionRequirementLine,
} from '../src/modules/order-economics/production-requirement.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function canonicalLine({
  lineNo = 1,
  productSkuId = 'product-sku-red-38',
  sku = 'DRESS-RED-38',
  colorwayId = 'colorway-red',
  sizeValueId = 'size-38',
  sizeCode = '38',
  sizeSortOrder = 10,
  quantity = 10,
} = {}) {
  return Object.freeze({
    lineNo,
    productSkuId,
    sku,
    gtin: null,
    styleId: 'style-dress-1',
    styleVersionId: 'style-version-dress-1',
    colorwayId,
    sizeValueId,
    sizeCode,
    sizeLabelRu: sizeCode,
    sizeLabelEn: sizeCode,
    sizeSortOrder,
    quantity,
    unitPrice: 125.5,
    catalogVersion: 7,
  });
}

function context({ lines = [canonicalLine()], allocations = null } = {}) {
  const orderCommit = Object.freeze({
    id: 'commit-1',
    status: 'committed',
    contentHash: HASH_A,
    orderId: 'order-1',
    orderVersion: 5,
    brandId: 'brand-1',
    shopId: 'shop-1',
    collectionId: 'collection-aw27',
    showroomId: 'showroom-aw27',
    commercialPublicationId: 'publication-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    commercialProjectionId: 'projection-1',
    commercialProjectionVersionNo: 3,
    readinessSnapshotId: 'readiness-1',
    lines: Object.freeze(lines),
  });
  const supplyAllocations = allocations ?? lines.map((line) => Object.freeze({
    orderLineNo: line.lineNo,
    productSkuId: line.productSkuId,
    sku: line.sku,
    quantity: line.quantity,
    sourceType: 'production',
    sourceRef: `MAKE-${line.lineNo}`,
    expectedAvailabilityAt: '2027-01-15T00:00:00.000Z',
  }));
  const supplyCommitment = Object.freeze({
    id: 'supply-1',
    status: 'committed',
    contentHash: HASH_B,
    orderId: 'order-1',
    orderVersion: 5,
    orderCommitSnapshotId: 'commit-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    commercialPublicationId: 'publication-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    allocations: Object.freeze(supplyAllocations),
  });
  const order = Object.freeze({
    id: 'order-1',
    status: 'attached',
    orderCommitSnapshotId: 'commit-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
    totalAmount: 1255,
  });
  return { order, orderCommit, supplyCommitment };
}

function build(value = {}) {
  return createProductionRequirementSnapshot({
    id: 'production-requirement-1',
    ...context(value),
    createdAt: '2026-08-25T12:00:00.000Z',
  });
}

test('approved production requirement copies exact ProductSku color and size identity without wholesale prices', () => {
  const requirement = build();
  assert.equal(requirement.totalProductionQuantity, 10);
  assert.equal(requirement.lines.length, 1);
  assert.deepEqual(requirement.lines[0], {
    orderLineNo: 1,
    productSkuId: 'product-sku-red-38',
    sku: 'DRESS-RED-38',
    gtin: null,
    styleId: 'style-dress-1',
    styleVersionId: 'style-version-dress-1',
    colorwayId: 'colorway-red',
    sizeValueId: 'size-38',
    sizeCode: '38',
    sizeLabelRu: '38',
    sizeLabelEn: '38',
    sizeSortOrder: 10,
    orderedQuantity: 10,
    productionQuantity: 10,
    allocations: [{ quantity: 10, sourceRef: 'MAKE-1', expectedAvailabilityAt: '2027-01-15T00:00:00.000Z' }],
  });
  assert.equal(Object.hasOwn(requirement, 'totalAmount'), false);
  assert.equal(Object.hasOwn(requirement.lines[0], 'unitPrice'), false);
});

test('mixed inventory and production supply derives only manufacturing demand', () => {
  const line = canonicalLine({ quantity: 10 });
  const requirement = build({
    lines: [line],
    allocations: [
      { orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 4, sourceType: 'inventory', sourceRef: 'STOCK-1', expectedAvailabilityAt: null },
      { orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 6, sourceType: 'production', sourceRef: 'MAKE-1', expectedAvailabilityAt: '2027-01-15T00:00:00.000Z' },
    ],
  });
  assert.equal(requirement.totalProductionQuantity, 6);
  assert.equal(requirement.lines[0].orderedQuantity, 10);
  assert.equal(requirement.lines[0].productionQuantity, 6);
  assert.deepEqual(requirement.lines[0].allocations.map((allocation) => allocation.sourceRef), ['MAKE-1']);
});

test('multiple production allocations for one immutable order line sum without losing source lineage', () => {
  const line = canonicalLine({ quantity: 12 });
  const requirement = build({
    lines: [line],
    allocations: [
      { orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 5, sourceType: 'production', sourceRef: 'FACTORY-B', expectedAvailabilityAt: '2027-01-20T00:00:00.000Z' },
      { orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 7, sourceType: 'production', sourceRef: 'FACTORY-A', expectedAvailabilityAt: '2027-01-15T00:00:00.000Z' },
    ],
  });
  assert.equal(requirement.lines[0].productionQuantity, 12);
  assert.deepEqual(requirement.lines[0].allocations.map((allocation) => allocation.sourceRef), ['FACTORY-A', 'FACTORY-B']);
});

test('production requirement keeps separate color and size ProductSku lines in deterministic order', () => {
  const red38 = canonicalLine({ lineNo: 1, productSkuId: 'psku-red-38', sku: 'DRESS-RED-38', colorwayId: 'red', sizeValueId: '38', sizeCode: '38', sizeSortOrder: 10, quantity: 3 });
  const blue40 = canonicalLine({ lineNo: 2, productSkuId: 'psku-blue-40', sku: 'DRESS-BLUE-40', colorwayId: 'blue', sizeValueId: '40', sizeCode: '40', sizeSortOrder: 20, quantity: 4 });
  const requirement = build({ lines: [red38, blue40] });
  assert.equal(requirement.totalProductionQuantity, 7);
  assert.deepEqual(requirement.lines.map((line) => [line.orderLineNo, line.productSkuId, line.colorwayId, line.sizeCode, line.productionQuantity]), [
    [1, 'psku-red-38', 'red', '38', 3],
    [2, 'psku-blue-40', 'blue', '40', 4],
  ]);
  assert.equal(productionRequirementLine(requirement, 2).productSkuId, 'psku-blue-40');
});

test('forged ProductSku in supply allocation is rejected against immutable committed order line', () => {
  const line = canonicalLine();
  assert.throws(
    () => build({
      lines: [line],
      allocations: [{ orderLineNo: 1, productSkuId: 'forged-product-sku', sku: line.sku, quantity: 10, sourceType: 'production', sourceRef: 'MAKE-1', expectedAvailabilityAt: null }],
    }),
    (error) => error.code === 'PRODUCTION_REQUIREMENT_PRODUCT_SKU_MISMATCH',
  );
});

test('legacy SKU-only committed line cannot be released as canonical production demand', () => {
  const legacy = Object.freeze({ lineNo: 1, sku: 'LEGACY-38', quantity: 5, unitPrice: 50, catalogVersion: 1 });
  assert.throws(
    () => build({
      lines: [legacy],
      allocations: [{ orderLineNo: 1, productSkuId: null, sku: 'LEGACY-38', quantity: 5, sourceType: 'production', sourceRef: 'MAKE-LEGACY', expectedAvailabilityAt: null }],
    }),
    (error) => error.code === 'PRODUCTION_REQUIREMENT_PRODUCT_SKU_REQUIRED',
  );
});

test('production requirement is not created when committed supply has no manufacturing allocation', () => {
  const line = canonicalLine();
  assert.throws(
    () => build({
      lines: [line],
      allocations: [{ orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 10, sourceType: 'inventory', sourceRef: 'STOCK-1', expectedAvailabilityAt: null }],
    }),
    (error) => error.code === 'PRODUCTION_REQUIREMENT_ALLOCATIONS_REQUIRED',
  );
});
