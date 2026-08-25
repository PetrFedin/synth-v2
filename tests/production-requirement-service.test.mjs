import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionRequirementService } from '../src/application/production-requirement-service.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function fixture({ role = 'owner' } = {}) {
  const line = Object.freeze({
    lineNo: 1,
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
    quantity: 10,
    unitPrice: 125.5,
    catalogVersion: 7,
  });
  const order = Object.freeze({
    id: 'order-1',
    status: 'attached',
    version: 5,
    orderCommitSnapshotId: 'commit-1',
    brandId: 'brand-1',
    shopId: 'shop-1',
  });
  const orderCommit = Object.freeze({
    id: 'commit-1', status: 'committed', contentHash: HASH_A,
    orderId: 'order-1', orderVersion: 5, brandId: 'brand-1', shopId: 'shop-1',
    collectionId: 'collection-aw27', showroomId: 'showroom-aw27', commercialPublicationId: 'publication-1',
    buyerCatalogVersionId: 'buyer-catalog-1', commercialProjectionId: 'projection-1', commercialProjectionVersionNo: 3,
    readinessSnapshotId: 'readiness-1', lines: Object.freeze([line]),
  });
  const supplyCommitment = Object.freeze({
    id: 'supply-1', status: 'committed', contentHash: HASH_B,
    orderId: 'order-1', orderVersion: 5, orderCommitSnapshotId: 'commit-1',
    brandId: 'brand-1', shopId: 'shop-1', commercialPublicationId: 'publication-1', buyerCatalogVersionId: 'buyer-catalog-1',
    allocations: Object.freeze([
      Object.freeze({ orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 4, sourceType: 'inventory', sourceRef: 'STOCK-1', expectedAvailabilityAt: null }),
      Object.freeze({ orderLineNo: 1, productSkuId: line.productSkuId, sku: line.sku, quantity: 6, sourceType: 'production', sourceRef: 'MAKE-1', expectedAvailabilityAt: '2027-01-15T00:00:00.000Z' }),
    ]),
  });
  const state = {
    commands: new Map(),
    requirements: new Map(),
    events: [],
  };
  const membership = Object.freeze({ id: 'membership-1', organisationId: 'brand-1', organisationType: 'brand', userId: 'actor-1', role, status: 'active' });
  const tx = {
    async getMembership(organisationId, userId) { return organisationId === 'brand-1' && userId === 'actor-1' ? membership : undefined; },
    async getOrder(id) { return id === order.id ? order : undefined; },
    async getOrderCommitSnapshot(id) { return id === orderCommit.id ? orderCommit : undefined; },
    async getSupplyCommitment(id) { return id === supplyCommitment.id ? supplyCommitment : undefined; },
    async getProductionRequirementBySupplyCommitment(id) { return [...state.requirements.values()].find((value) => value.supplyCommitmentSnapshotId === id); },
    async insertProductionRequirement(value) { state.requirements.set(value.id, value); },
    async getCommand(id) { return state.commands.get(id); },
    async insertCommand(value) { state.commands.set(value.id, value); },
    async appendOutbox(event) { state.events.push(event); },
  };
  const store = {
    async transaction(work) { return work(tx); },
    async getProductionRequirement(id) { return state.requirements.get(id); },
    async getProductionRequirementBySupplyCommitment(id) { return [...state.requirements.values()].find((value) => value.supplyCommitmentSnapshotId === id); },
  };
  let sequence = 0;
  const service = createProductionRequirementService({
    store,
    clock: () => '2026-08-25T12:00:00.000Z',
    nextId: (prefix) => `${prefix}-${++sequence}`,
  });
  return { service, state, order, orderCommit, supplyCommitment };
}

test('service derives ProductSku and quantity server-side from committed supply instead of client input', async () => {
  const { service, state } = fixture();
  const requirement = await service.createFromSupplyCommitment('cmd-1', 'actor-1', 'order-1', 'supply-1');

  assert.equal(requirement.lines.length, 1);
  assert.equal(requirement.lines[0].productSkuId, 'product-sku-red-38');
  assert.equal(requirement.lines[0].productionQuantity, 6);
  assert.equal(requirement.lines[0].orderedQuantity, 10);
  assert.equal(requirement.totalProductionQuantity, 6);
  assert.equal(state.requirements.size, 1);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, 'production-requirement.created');
  assert.equal(state.events[0].payload.totalProductionQuantity, 6);
  assert.deepEqual(state.events[0].payload.productSkuIds, ['product-sku-red-38']);
  assert.equal(Object.hasOwn(state.events[0].payload, 'unitPrice'), false);
});

test('same command is idempotent while a second command cannot create another requirement for the same immutable supply', async () => {
  const { service, state } = fixture();
  const first = await service.createFromSupplyCommitment('cmd-1', 'actor-1', 'order-1', 'supply-1');
  const retry = await service.createFromSupplyCommitment('cmd-1', 'actor-1', 'order-1', 'supply-1');
  assert.equal(retry.id, first.id);
  assert.equal(state.requirements.size, 1);
  assert.equal(state.events.length, 1);

  await assert.rejects(
    service.createFromSupplyCommitment('cmd-2', 'actor-1', 'order-1', 'supply-1'),
    (error) => error.code === 'PRODUCTION_REQUIREMENT_FOR_SUPPLY_EXISTS',
  );
});

test('production demand release requires brand production allocation capability', async () => {
  const { service } = fixture({ role: 'viewer' });
  await assert.rejects(
    service.createFromSupplyCommitment('cmd-denied', 'actor-1', 'order-1', 'supply-1'),
    (error) => error.code === 'CAPABILITY_DENIED',
  );
});
