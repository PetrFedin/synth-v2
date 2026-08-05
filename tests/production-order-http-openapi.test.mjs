import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionOrderRoutes } from '../src/http/production-order-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function route(routes, method, path) {
  const value = routes.find((candidate) => candidate.method === method && candidate.pattern.test(path));
  assert.ok(value, `${method} ${path}`);
  return value;
}

test('Production Order routes expose reads and strict lifecycle commands', async () => {
  const calls = [];
  const service = {
    pageForActor: async (...args) => (calls.push(['page', ...args]), { items: [], nextCursor: null }),
    getForActor: async (...args) => (calls.push(['get', ...args]), { productionOrderNumber: args[1] }),
    createFromAllocation: async (...args) => (calls.push(['create', ...args]), { productionOrderNumber: 'PO-1' }),
    issue: async (...args) => (calls.push(['issue', ...args]), { productionOrderNumber: args[2], status: 'issued' }),
    confirm: async (...args) => (calls.push(['confirm', ...args]), { productionOrderNumber: args[2], status: 'confirmed' }),
    cancel: async (...args) => (calls.push(['cancel', ...args]), { productionOrderNumber: args[2], status: 'cancelled' }),
  };
  const routes = createProductionOrderRoutes({ productionOrders: service });
  assert.equal(routes.length, 6);
  await route(routes, 'GET', '/v2/production-orders').execute({ actorId: 'owner-1', query: { limit: '50' } });
  await route(routes, 'POST', '/v2/production-orders/from-allocation/RFQ-1').execute({ commandId: 'c1', actorId: 'owner-1', params: ['RFQ-1'], query: {}, body: {} });
  await route(routes, 'POST', '/v2/production-orders/PO-1/issue').execute({ commandId: 'c2', actorId: 'owner-1', params: ['PO-1'], query: {}, body: { expectedVersion: 1 } });
  await route(routes, 'POST', '/v2/production-orders/PO-1/confirm').execute({ commandId: 'c3', actorId: 'owner-1', params: ['PO-1'], query: {}, body: { expectedVersion: 2, supplierCode: 'FACTORY-1', confirmationReference: 'ACK-1', confirmedBy: 'Mei Lin', notes: null } });
  assert.deepEqual(calls.map((call) => call[0]), ['page','create','issue','confirm']);
  assert.throws(
    () => route(routes, 'POST', '/v2/production-orders/from-allocation/RFQ-1').execute({ commandId: 'bad', actorId: 'owner-1', params: ['RFQ-1'], query: {}, body: { productionOrderNumber: 'FORGED' } }),
    { code: 'HTTP_BODY_FIELD_UNKNOWN' },
  );
});

test('OpenAPI 1.16 documents immutable Production Orders without dangling schema references', () => {
  const specification = wholesaleV2ExtendedOpenApi;
  assert.equal(specification.info.version, '1.16.0');
  for (const path of [
    '/production-orders',
    '/production-orders/{productionOrderNumber}',
    '/production-orders/from-allocation/{rfqCode}',
    '/production-orders/{productionOrderNumber}/issue',
    '/production-orders/{productionOrderNumber}/confirm',
    '/production-orders/{productionOrderNumber}/cancel',
  ]) assert.ok(specification.paths[path], path);
  for (const schema of ['ProductionOrderEmptyInput','ProductionOrder','ProductionOrderPage','ProductionOrderSupplierSnapshot','ProductionOrderCommercialSnapshot','ProductionOrderTechPackSnapshot','ProductionOrderConfirmation']) assert.ok(specification.components.schemas[schema], schema);
  assert.equal(specification.components.schemas.ProductionOrderEmptyInput.additionalProperties, false);
  assert.equal(specification.components.schemas.ProductionOrder.properties.techPackSnapshot.$ref, '#/components/schemas/ProductionOrderTechPackSnapshot');
  assert.equal(specification.paths['/production-orders/from-allocation/{rfqCode}'].post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/ProductionOrderEmptyInput');
  assert.equal(Object.isFrozen(specification), true);
});
