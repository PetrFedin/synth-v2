import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourcingRoutes } from '../src/http/sourcing-routes.mjs';
import { matchWholesaleRoute } from '../src/http/routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function serviceSpy() {
  const calls = [];
  const capture = (name) => (...args) => { calls.push([name, ...args]); return { name, args }; };
  return {
    calls,
    service: {
      supplierPageForActor: capture('supplierPageForActor'), supplierGetForActor: capture('supplierGetForActor'),
      createSupplier: capture('createSupplier'), updateSupplier: capture('updateSupplier'), qualifySupplier: capture('qualifySupplier'),
      suspendSupplier: capture('suspendSupplier'), archiveSupplier: capture('archiveSupplier'), rfqPageForActor: capture('rfqPageForActor'),
      rfqGetForActor: capture('rfqGetForActor'), createRfq: capture('createRfq'), updateRfq: capture('updateRfq'),
      issueRfq: capture('issueRfq'), upsertQuote: capture('upsertQuote'), awardRfq: capture('awardRfq'),
      allocateRfq: capture('allocateRfq'), cancelRfq: capture('cancelRfq'),
    },
  };
}

function routeFor(routes, method, path) {
  const route = matchWholesaleRoute(routes, method, path);
  assert.ok(route, `${method} ${path} route missing`);
  return route;
}

test('sourcing routes expose the full supplier and RFQ mutation lifecycle', async () => {
  const spy = serviceSpy();
  const routes = createSourcingRoutes({ sourcing: spy.service });
  const expectations = [
    ['POST', '/v2/suppliers'], ['PATCH', '/v2/suppliers/FACTORY-A'], ['POST', '/v2/suppliers/FACTORY-A/qualify'],
    ['POST', '/v2/suppliers/FACTORY-A/suspend'], ['POST', '/v2/suppliers/FACTORY-A/archive'], ['GET', '/v2/suppliers'],
    ['GET', '/v2/suppliers/FACTORY-A'], ['POST', '/v2/rfqs'], ['PATCH', '/v2/rfqs/RFQ-001'],
    ['POST', '/v2/rfqs/RFQ-001/issue'], ['POST', '/v2/rfqs/RFQ-001/quotes'], ['POST', '/v2/rfqs/RFQ-001/award'],
    ['POST', '/v2/rfqs/RFQ-001/allocate'], ['POST', '/v2/rfqs/RFQ-001/cancel'], ['GET', '/v2/rfqs'], ['GET', '/v2/rfqs/RFQ-001'],
  ];
  for (const [method, path] of expectations) assert.ok(routeFor(routes, method, path));

  const route = routeFor(routes, 'POST', '/v2/rfqs/RFQ-001/award');
  await route.execute({ commandId: 'cmd-1', actorId: 'actor-1', params: route.params, query: {}, body: { expectedVersion: 4, supplierCode: 'FACTORY-A' } });
  assert.deepEqual(spy.calls.at(-1), ['awardRfq', 'cmd-1', 'actor-1', 'RFQ-001', { expectedVersion: 4, supplierCode: 'FACTORY-A' }]);
});

test('sourcing routes reject unsupported query fields and non-string supplier arrays', () => {
  const routes = createSourcingRoutes({ sourcing: serviceSpy().service });
  const listRoute = routeFor(routes, 'GET', '/v2/rfqs');
  assert.throws(() => listRoute.execute({ actorId: 'actor-1', params: [], query: { secret: 'true' }, body: {} }), { code: 'HTTP_QUERY_FIELD_UNKNOWN' });
  const createRoute = routeFor(routes, 'POST', '/v2/rfqs');
  assert.throws(() => createRoute.execute({ commandId: 'cmd-2', actorId: 'actor-1', params: [], query: {}, body: { rfqCode: 'RFQ-001', sku: 'SKU-001', targetQuantity: 100, responseDueAt: '2026-09-01T00:00:00.000Z', deliveryDueAt: '2026-10-01T00:00:00.000Z', incoterm: 'FOB', supplierCodes: [{ code: 'FACTORY-A' }], notes: null } }), { code: 'HTTP_BODY_FIELD_INVALID' });
});

test('OpenAPI 1.14 publishes strict supplier, quotation, award and guarded production allocation contracts', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.14.0');
  for (const path of ['/suppliers', '/suppliers/{supplierCode}/qualify', '/suppliers/{supplierCode}/suspend', '/rfqs', '/rfqs/{rfqCode}/quotes', '/rfqs/{rfqCode}/award', '/rfqs/{rfqCode}/allocate', '/rfqs/{rfqCode}/cancel']) assert.ok(wholesaleV2ExtendedOpenApi.paths[path], `missing OpenAPI path ${path}`);
  const quote = wholesaleV2ExtendedOpenApi.components.schemas.RfqQuoteInput;
  assert.equal(quote.additionalProperties, false);
  assert.ok(quote.required.includes('unitPriceMinor'));
  assert.ok(quote.required.includes('validUntil'));
  const allocation = wholesaleV2ExtendedOpenApi.components.schemas.RfqAllocationInput;
  assert.ok(allocation.required.includes('purchaseOrderNumber'));
  assert.ok(allocation.required.includes('productionStartAt'));
  assert.equal(allocation.properties.techPackCode, undefined);
  const resultAllocation = wholesaleV2ExtendedOpenApi.components.schemas.RfqAllocation;
  assert.ok(resultAllocation.required.includes('techPackCode'));
  assert.ok(resultAllocation.required.includes('techPackAcknowledgementReference'));
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/rfqs/{rfqCode}/award'].post.parameters.some((parameter) => parameter.name === 'Idempotency-Key'), true);
});
