import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionOrderFromApprovedAllocation } from '../src/modules/production-orders/approved-demand-lineage.mjs';
import { issueProductionOrder } from '../src/modules/production-orders/public.mjs';

const supplier = Object.freeze({
  id: 'supplier-1', supplierCode: 'FACTORY-01', brandId: 'brand-1', legalName: 'Factory One S.p.A.',
  countryCode: 'IT', email: 'orders@factory.example', status: 'qualified', version: 4,
  auditExpiresAt: '2027-01-01T00:00:00.000Z',
});

function allocatedRfq(overrides = {}) {
  return Object.freeze({
    id: 'rfq-1', rfqCode: 'RFQ-AW27-0003', brandId: 'brand-1', sku: 'DRESS-BLUE-40', skuVersion: 3, bomVersion: 4,
    bomCurrency: 'EUR', incoterm: 'FCA', targetQuantity: 7, selectedSupplierCode: supplier.supplierCode,
    status: 'allocated', version: 8,
    award: Object.freeze({ supplierCode: supplier.supplierCode, currency: 'EUR', incoterm: 'FCA', unitPriceMinor: 14_500, fixedCostMinor: 30_000, totalCostMinor: 131_500, quoteRevision: 1 }),
    allocation: Object.freeze({
      purchaseOrderNumber: 'PO-AW27-0003', supplierCode: supplier.supplierCode, quantity: 7,
      productionStartAt: '2026-09-20T00:00:00.000Z', deliveryDueAt: '2026-12-15T00:00:00.000Z', notes: 'Approved buyer demand',
      techPackCode: 'TP-DRESS-BLUE-40-R01', techPackRevision: 1, techPackVersion: 3, techPackIssuedVersion: 2,
      techPackAcknowledgedAt: '2026-09-18T11:00:00.000Z', techPackAcknowledgementReference: 'ACK-9081',
    }),
    lineageVersion: 2,
    productionRequirementSnapshotId: 'requirement-1',
    productionRequirementContentHash: 'a'.repeat(64),
    productionRequirementOrderLineNo: 3,
    orderId: 'wholesale-order-1',
    orderCommitSnapshotId: 'commit-1',
    supplyCommitmentSnapshotId: 'supply-1',
    productSkuId: 'product-sku-blue-40',
    styleId: 'style-dress-1',
    styleVersionId: 'style-version-dress-1',
    colorwayId: 'colorway-blue',
    sizeValueId: 'size-40',
    sizeCode: '40',
    collectionId: 'collection-aw27',
    showroomId: 'showroom-aw27',
    commercialPublicationId: 'publication-1',
    buyerCatalogVersionId: 'buyer-catalog-1',
    ...overrides,
  });
}

function create(rfq = allocatedRfq()) {
  return createProductionOrderFromApprovedAllocation({
    id: 'production-order-1', rfq, supplier, createdAt: '2026-09-19T00:00:00.000Z',
  });
}

test('factory Production Order inherits exact approved wholesale ProductSku color size and quantity lineage', () => {
  const order = create();
  assert.equal(order.lineageVersion, 2);
  assert.equal(order.productionRequirementSnapshotId, 'requirement-1');
  assert.equal(order.productionRequirementOrderLineNo, 3);
  assert.equal(order.orderId, 'wholesale-order-1');
  assert.equal(order.orderCommitSnapshotId, 'commit-1');
  assert.equal(order.supplyCommitmentSnapshotId, 'supply-1');
  assert.equal(order.productSkuId, 'product-sku-blue-40');
  assert.equal(order.styleVersionId, 'style-version-dress-1');
  assert.equal(order.colorwayId, 'colorway-blue');
  assert.equal(order.sizeValueId, 'size-40');
  assert.equal(order.sizeCode, '40');
  assert.equal(order.quantity, 7);
  assert.equal(order.collectionId, 'collection-aw27');
  assert.equal(order.showroomId, 'showroom-aw27');
  assert.equal(order.commercialPublicationId, 'publication-1');
  assert.equal(order.buyerCatalogVersionId, 'buyer-catalog-1');
});

test('factory economics remain supplier-side and buyer wholesale price is not copied into Production Order', () => {
  const order = create();
  assert.deepEqual(order.commercialSnapshot, {
    currency: 'EUR', incoterm: 'FCA', unitPriceMinor: 14_500, fixedCostMinor: 30_000, totalCostMinor: 131_500, quoteRevision: 1,
  });
  assert.equal(Object.hasOwn(order, 'unitPrice'), false);
  assert.equal(Object.hasOwn(order, 'totalAmount'), false);
  assert.equal(Object.hasOwn(order, 'buyerUnitPrice'), false);
});

test('Production Order lifecycle preserves approved-demand lineage after issue', () => {
  const draft = create();
  const issued = issueProductionOrder(draft, { actorId: 'owner-1', issuedAt: '2026-09-19T10:00:00.000Z' });
  for (const field of [
    'productionRequirementSnapshotId', 'productionRequirementContentHash', 'productionRequirementOrderLineNo',
    'orderId', 'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'productSkuId',
    'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode',
    'collectionId', 'showroomId', 'commercialPublicationId', 'buyerCatalogVersionId',
  ]) assert.equal(issued[field], draft[field], field);
});

test('v2 Production Order fails closed if approved ProductSku lineage is incomplete or allocation quantity diverges', () => {
  assert.throws(
    () => create(allocatedRfq({ productSkuId: null })),
    (error) => error.code === 'PRODUCTION_ORDER_PRODUCT_SKU_REQUIRED',
  );
  assert.throws(
    () => create(allocatedRfq({ allocation: { ...allocatedRfq().allocation, quantity: 6 } })),
    (error) => ['PRODUCTION_ORDER_ALLOCATION_QUANTITY_MISMATCH', 'PRODUCTION_ORDER_APPROVED_QUANTITY_MISMATCH'].includes(error.code),
  );
});

test('legacy allocated RFQ remains compatible and is not falsely promoted to approved-demand v2', () => {
  const legacy = allocatedRfq({ lineageVersion: 1 });
  const order = create(legacy);
  assert.equal(Object.hasOwn(order, 'lineageVersion'), false);
  assert.equal(Object.hasOwn(order, 'productionRequirementSnapshotId'), false);
  assert.equal(Object.hasOwn(order, 'orderId'), false);
  assert.equal(order.sku, 'DRESS-BLUE-40');
  assert.equal(order.quantity, 7);
});
