import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionSourcingService } from '../src/application/production-sourcing-service.mjs';

function fixture({ role = 'owner', existing = null } = {}) {
  const requirement = Object.freeze({
    id: 'requirement-1', status: 'required', contentHash: 'a'.repeat(64),
    orderId: 'order-1', orderCommitSnapshotId: 'commit-1', supplyCommitmentSnapshotId: 'supply-1',
    brandId: 'brand-1', shopId: 'shop-1', collectionId: 'collection-aw27', showroomId: 'showroom-aw27',
    commercialPublicationId: 'publication-1', buyerCatalogVersionId: 'buyer-catalog-1',
    lines: Object.freeze([Object.freeze({
      orderLineNo: 2, productSkuId: 'product-sku-blue-40', sku: 'DRESS-BLUE-40',
      styleId: 'style-1', styleVersionId: 'style-version-1', colorwayId: 'blue', sizeValueId: 'size-40', sizeCode: '40',
      orderedQuantity: 10, productionQuantity: 7,
    })]),
  });
  const productSku = Object.freeze({ id: 'product-sku-blue-40', skuCode: 'DRESS-BLUE-40', brandId: 'brand-1', styleVersionId: 'style-version-1', colorwayId: 'blue', sizeValueId: 'size-40' });
  const catalogSku = Object.freeze({ sku: 'DRESS-BLUE-40', brandId: 'brand-1', status: 'published', version: 4 });
  const bom = Object.freeze({ id: 'bom-1', sku: 'DRESS-BLUE-40', brandId: 'brand-1', productSkuId: 'product-sku-blue-40', status: 'published', version: 5, currency: 'EUR', totalCost: 44 });
  const supplier = Object.freeze({ supplierCode: 'FACTORY-A', brandId: 'brand-1', status: 'qualified' });
  const membership = Object.freeze({ id: 'm-1', organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role, status: 'active' });
  const state = { commands: new Map(), rfqs: [], events: [] };
  const tx = {
    async getCommand(id) { return state.commands.get(id); },
    async insertCommand(value) { state.commands.set(value.id, value); },
    async getProductionRequirement(id) { return id === requirement.id ? requirement : undefined; },
    async getMembership(orgId, userId) { return orgId === 'brand-1' && userId === 'actor-1' ? membership : undefined; },
    async getActiveRfqByProductionRequirementLine() { return existing ?? state.rfqs.find((rfq) => rfq.status !== 'cancelled'); },
    async getProductSku(id) { return id === productSku.id ? productSku : undefined; },
    async getCatalogSku(sku) { return sku === catalogSku.sku ? catalogSku : undefined; },
    async getBomByProductSku(id) { return id === productSku.id ? bom : undefined; },
    async getSuppliersByCodes(codes) { return codes.includes('FACTORY-A') ? [supplier] : []; },
    async insertRfq(value) { state.rfqs.push(value); },
    async appendOutbox(event) { state.events.push(event); },
  };
  const store = { async transaction(work) { return work(tx); } };
  let seq = 0;
  const service = createProductionSourcingService({
    store,
    clock: () => '2026-08-25T12:00:00.000Z',
    nextId: (prefix) => `${prefix}-${++seq}`,
  });
  return { service, state };
}

function input(overrides = {}) {
  return {
    rfqCode: 'RFQ-AW27-0002',
    productionRequirementSnapshotId: 'requirement-1',
    orderLineNo: 2,
    responseDueAt: '2026-09-10T00:00:00.000Z',
    deliveryDueAt: '2026-12-15T00:00:00.000Z',
    incoterm: 'FCA',
    supplierCodes: ['FACTORY-A'],
    notes: 'Approved collection demand',
    ...overrides,
  };
}

test('service creates RFQ with exact approved ProductSku quantity without accepting repeated SKU or quantity input', async () => {
  const { service, state } = fixture();
  const rfq = await service.createRfqFromProductionRequirement('cmd-1', 'actor-1', input());
  assert.equal(rfq.productSkuId, 'product-sku-blue-40');
  assert.equal(rfq.sku, 'DRESS-BLUE-40');
  assert.equal(rfq.targetQuantity, 7);
  assert.equal(rfq.colorwayId, 'blue');
  assert.equal(rfq.sizeCode, '40');
  assert.equal(state.rfqs.length, 1);
  assert.equal(state.events[0].type, 'sourcing.rfq-created-from-production-requirement');
  assert.equal(state.events[0].payload.targetQuantity, 7);
});

test('service rejects manual SKU or target quantity fields before loading sourcing context', async () => {
  const { service } = fixture();
  for (const forbidden of [{ sku: 'FORGED' }, { targetQuantity: 999 }]) {
    await assert.rejects(
      service.createRfqFromProductionRequirement('cmd-forbidden', 'actor-1', input(forbidden)),
      (error) => error.code === 'PRODUCTION_RFQ_FIELD_FORBIDDEN',
    );
  }
});

test('service prevents a second active RFQ from double-covering the same approved demand line', async () => {
  const { service } = fixture({ existing: { id: 'rfq-existing', rfqCode: 'RFQ-EXISTING', status: 'issued' } });
  await assert.rejects(
    service.createRfqFromProductionRequirement('cmd-duplicate', 'actor-1', input()),
    (error) => error.code === 'PRODUCTION_RFQ_ACTIVE_EXISTS',
  );
});

test('production sourcing requires brand sourcing capability', async () => {
  const { service } = fixture({ role: 'viewer' });
  await assert.rejects(
    service.createRfqFromProductionRequirement('cmd-denied', 'actor-1', input()),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});
