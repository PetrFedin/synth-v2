import test from 'node:test';
import assert from 'node:assert/strict';
import { createRfqFromProductionRequirement } from '../src/modules/sourcing/production-requirement-rfq.mjs';

const requirement = Object.freeze({
  id: 'requirement-1',
  status: 'required',
  contentHash: 'a'.repeat(64),
  orderId: 'order-1',
  orderCommitSnapshotId: 'commit-1',
  supplyCommitmentSnapshotId: 'supply-1',
  brandId: 'brand-1',
  shopId: 'shop-1',
  collectionId: 'collection-aw27',
  showroomId: 'showroom-aw27',
  commercialPublicationId: 'publication-1',
  buyerCatalogVersionId: 'buyer-catalog-1',
});
const line = Object.freeze({
  orderLineNo: 3,
  productSkuId: 'product-sku-blue-40',
  sku: 'DRESS-BLUE-40',
  styleId: 'style-1',
  styleVersionId: 'style-version-1',
  colorwayId: 'blue',
  sizeValueId: 'size-40',
  sizeCode: '40',
  orderedQuantity: 12,
  productionQuantity: 7,
});
const productSku = Object.freeze({
  id: line.productSkuId,
  skuCode: line.sku,
  brandId: 'brand-1',
  styleVersionId: line.styleVersionId,
  colorwayId: line.colorwayId,
  sizeValueId: line.sizeValueId,
});
const catalogSku = Object.freeze({ sku: line.sku, brandId: 'brand-1', status: 'published', version: 4 });
const bom = Object.freeze({ id: 'bom-1', sku: line.sku, brandId: 'brand-1', productSkuId: line.productSkuId, status: 'published', version: 6, currency: 'EUR', totalCost: 42.5 });
const suppliers = Object.freeze([
  Object.freeze({ supplierCode: 'FACTORY-A', brandId: 'brand-1', status: 'qualified' }),
]);

function input(overrides = {}) {
  return {
    rfqCode: 'RFQ-AW27-0003',
    productionRequirementSnapshotId: requirement.id,
    orderLineNo: line.orderLineNo,
    responseDueAt: '2026-09-10T00:00:00.000Z',
    deliveryDueAt: '2026-12-15T00:00:00.000Z',
    incoterm: 'FCA',
    supplierCodes: ['FACTORY-A'],
    notes: 'Approved AW27 demand',
    ...overrides,
  };
}

test('RFQ SKU and target quantity are derived exclusively from immutable approved production demand', () => {
  const rfq = createRfqFromProductionRequirement({
    id: 'rfq-1',
    productionRequirement: requirement,
    requirementLine: line,
    productSku,
    catalogSku,
    bom,
    suppliers,
    input: input(),
    createdAt: '2026-08-25T12:00:00.000Z',
  });

  assert.equal(rfq.sku, 'DRESS-BLUE-40');
  assert.equal(rfq.targetQuantity, 7);
  assert.equal(rfq.productSkuId, 'product-sku-blue-40');
  assert.equal(rfq.productionRequirementSnapshotId, 'requirement-1');
  assert.equal(rfq.productionRequirementOrderLineNo, 3);
  assert.equal(rfq.colorwayId, 'blue');
  assert.equal(rfq.sizeValueId, 'size-40');
  assert.equal(rfq.sizeCode, '40');
  assert.equal(rfq.lineageVersion, 2);
});

test('production-backed RFQ rejects client attempts to submit SKU or quantity', () => {
  for (const forbidden of [
    { sku: 'FORGED-SKU' },
    { targetQuantity: 999 },
  ]) {
    assert.throws(
      () => createRfqFromProductionRequirement({
        id: 'rfq-1', productionRequirement: requirement, requirementLine: line, productSku, catalogSku, bom, suppliers,
        input: input(forbidden), createdAt: '2026-08-25T12:00:00.000Z',
      }),
      (error) => error.code === 'PRODUCTION_RFQ_FIELD_FORBIDDEN',
    );
  }
});

test('production-backed RFQ fails closed when BOM is not pinned to exact ProductSku', () => {
  assert.throws(
    () => createRfqFromProductionRequirement({
      id: 'rfq-1', productionRequirement: requirement, requirementLine: line, productSku, catalogSku,
      bom: { ...bom, productSkuId: 'other-product-sku' }, suppliers, input: input(), createdAt: '2026-08-25T12:00:00.000Z',
    }),
    (error) => error.code === 'PRODUCTION_RFQ_BOM_PRODUCT_SKU_REQUIRED',
  );
});

test('production-backed RFQ fails closed on ProductSku color or size mismatch', () => {
  assert.throws(
    () => createRfqFromProductionRequirement({
      id: 'rfq-1', productionRequirement: requirement, requirementLine: line,
      productSku: { ...productSku, colorwayId: 'forged-color' }, catalogSku, bom, suppliers,
      input: input(), createdAt: '2026-08-25T12:00:00.000Z',
    }),
    (error) => error.code === 'PRODUCTION_RFQ_COLORWAY_MISMATCH',
  );
});
