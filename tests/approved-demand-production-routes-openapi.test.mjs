import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionRequirementRoutes } from '../src/http/production-requirement-routes.mjs';
import { createSourcingRoutes } from '../src/http/sourcing-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('production requirement HTTP route releases manufacturing demand from exact order and supply ids', async () => {
  const calls = [];
  const routes = createProductionRequirementRoutes({
    productionRequirements: {
      async createFromSupplyCommitment(...args) { calls.push(args); return { id: 'requirement-1' }; },
      async getForActor() { return null; },
      async getBySupplyCommitmentForActor() { return null; },
    },
  });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/orders/order-1/supply-commitments/supply-1/production-requirement'));
  assert.ok(route);
  await route.execute({ commandId: 'cmd-1', actorId: 'actor-1', params: ['order-1', 'supply-1'], body: {}, query: {} });
  assert.deepEqual(calls, [['cmd-1', 'actor-1', 'order-1', 'supply-1']]);
});

test('production requirement reads are actor-scoped at HTTP boundary', async () => {
  const calls = [];
  const routes = createProductionRequirementRoutes({
    productionRequirements: {
      async createFromSupplyCommitment() { return null; },
      async getForActor(...args) { calls.push(['id', ...args]); return { id: args[1] }; },
      async getBySupplyCommitmentForActor(...args) { calls.push(['supply', ...args]); return { id: 'requirement-1' }; },
    },
  });
  const byId = routes.find((candidate) => candidate.method === 'GET' && candidate.pattern.test('/v2/production-requirements/requirement-1'));
  const bySupply = routes.find((candidate) => candidate.method === 'GET' && candidate.pattern.test('/v2/supply-commitments/supply-1/production-requirement'));
  await byId.execute({ actorId: 'actor-1', params: ['requirement-1'], query: {} });
  await bySupply.execute({ actorId: 'actor-1', params: ['supply-1'], query: {} });
  assert.deepEqual(calls, [
    ['id', 'actor-1', 'requirement-1'],
    ['supply', 'actor-1', 'supply-1'],
  ]);
});

test('production RFQ HTTP route derives requirement id and order line from path and never accepts SKU or quantity body fields', async () => {
  const calls = [];
  const sourcing = {
    async createRfqFromProductionRequirement(...args) { calls.push(args); return { id: 'rfq-1' }; },
  };
  const routes = createSourcingRoutes({ sourcing });
  const route = routes.find((candidate) => candidate.method === 'POST' && candidate.pattern.test('/v2/production-requirements/requirement-1/lines/3/rfq'));
  assert.ok(route);
  const body = {
    rfqCode: 'RFQ-AW27-0003', responseDueAt: '2026-09-10T00:00:00.000Z', deliveryDueAt: '2026-12-15T00:00:00.000Z',
    incoterm: 'FCA', supplierCodes: ['FACTORY-A'], notes: 'Approved demand',
  };
  await route.execute({ commandId: 'cmd-rfq', actorId: 'actor-1', params: ['requirement-1', '3'], body, query: {} });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { ...body, productionRequirementSnapshotId: 'requirement-1', orderLineNo: 3 });
  assert.equal(Object.hasOwn(calls[0][2], 'sku'), false);
  assert.equal(Object.hasOwn(calls[0][2], 'targetQuantity'), false);

  await assert.rejects(
    Promise.resolve().then(() => route.execute({ commandId: 'cmd-forged', actorId: 'actor-1', params: ['requirement-1', '3'], body: { ...body, targetQuantity: 999 }, query: {} })),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN',
  );
});

test('authoritative OpenAPI 1.17 publishes wholesale-to-production path and marks v2 lineage on RFQ and Production Order without version drift', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  for (const path of [
    '/orders/{orderId}/supply-commitments/{supplyCommitmentSnapshotId}/production-requirement',
    '/production-requirements/{productionRequirementSnapshotId}',
    '/supply-commitments/{supplyCommitmentSnapshotId}/production-requirement',
    '/production-requirements/{productionRequirementSnapshotId}/lines/{orderLineNo}/rfq',
  ]) assert.ok(wholesaleV2ExtendedOpenApi.paths[path], path);

  const requestProperties = wholesaleV2ExtendedOpenApi.components.schemas.ApprovedProductionRfqCreate.properties;
  assert.equal(Object.hasOwn(requestProperties, 'sku'), false);
  assert.equal(Object.hasOwn(requestProperties, 'targetQuantity'), false);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.Rfq.properties.productionRequirementSnapshotId);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.Rfq.properties.productSkuId);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ProductionOrder.properties.productionRequirementSnapshotId);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ProductionOrder.properties.productSkuId);
});
