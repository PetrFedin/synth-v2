import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierEconomicPerformanceRoutes } from '../src/http/supplier-economic-performance-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('supplier performance route is read-only and delegates exact supplier identity', async () => {
  const calls = [];
  const [route] = createSupplierEconomicPerformanceRoutes({ supplierPerformance: {
    getSupplierEconomicPerformanceForActor(actorId, supplierCode) {
      calls.push([actorId, supplierCode]);
      return { supplier: { supplierCode } };
    },
  } });
  assert.equal(route.method, 'GET');
  assert.equal(route.mutation, false);
  assert.ok(route.pattern.test('/v2/suppliers/SUP-01/economic-performance'));
  const result = await route.execute({ actorId: 'finance-1', params: ['SUP-01'], query: {} });
  assert.deepEqual(calls, [['finance-1', 'SUP-01']]);
  assert.deepEqual(result, { supplier: { supplierCode: 'SUP-01' } });
});

test('supplier performance route rejects unsupported query parameters', () => {
  const [route] = createSupplierEconomicPerformanceRoutes({ supplierPerformance: { getSupplierEconomicPerformanceForActor() {} } });
  assert.throws(() => route.execute({ actorId: 'finance-1', params: ['SUP-01'], query: { currency: 'EUR' } }), (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN');
});

test('authoritative OpenAPI exposes supplier economic performance without mutation contract', () => {
  const operation = wholesaleV2ExtendedOpenApi.paths['/suppliers/{supplierCode}/economic-performance']?.get;
  assert.equal(operation?.operationId, 'getSupplierEconomicPerformance');
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplierEconomicPerformance);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplierFailureEconomics);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplierPerformanceAttribution);
  assert.equal(wholesaleV2ExtendedOpenApi.components.schemas.SupplierPerformanceAttribution.properties.mutableScoreUsed.enum[0], false);
});
