import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleRoutes } from '../src/http/all-routes.mjs';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';

test('production PostgreSQL runtime exposes economics and fulfillment verticals end to end', () => {
  const pool = {
    connect: async () => { throw new Error('not used in composition test'); },
    query: async () => { throw new Error('not used in composition test'); },
  };
  const runtime = createPostgresWholesaleRuntime({ pool, nextId: (prefix) => `${prefix}-test` });
  const routes = createWholesaleRoutes(runtime);

  assert.equal(typeof runtime.orderEconomics.getOrderMarginBridgeForActor, 'function');
  assert.equal(typeof runtime.costAllocation.createPolicyVersion, 'function');
  assert.equal(typeof runtime.costAllocation.allocateLandedCost, 'function');
  assert.equal(typeof runtime.fulfillment.createFulfillmentPlan, 'function');
  assert.equal(typeof runtime.fulfillment.createShipmentNotice, 'function');
  assert.equal(typeof runtime.fulfillment.recordReceipt, 'function');
  assert.ok(routes.some((route) => route.method === 'GET' && route.pattern.test('/v2/orders/ORDER-1/margin-bridge')));
  assert.ok(routes.some((route) => route.method === 'POST' && route.pattern.test('/v2/orders/ORDER-1/cost-allocation-runs')));
  assert.ok(routes.some((route) => route.method === 'POST' && route.pattern.test('/v2/orders/ORDER-1/fulfillment-plans')));
  assert.ok(routes.some((route) => route.method === 'POST' && route.pattern.test('/v2/shipment-notices/ASN-1/receipts')));
  assert.ok(wholesaleV2CompleteOpenApi.paths['/orders/{orderId}/margin-bridge']);
  assert.ok(wholesaleV2CompleteOpenApi.paths['/orders/{orderId}/cost-allocation-runs']);
  assert.ok(wholesaleV2CompleteOpenApi.paths['/orders/{orderId}/fulfillment-plans']);
  assert.ok(wholesaleV2CompleteOpenApi.paths['/shipment-notices/{shipmentNoticeId}/receipts']);
  assert.ok(wholesaleV2CompleteOpenApi.components.schemas.CostAllocationRunSnapshot);
  assert.ok(wholesaleV2CompleteOpenApi.components.schemas.FulfillmentPlanSnapshot);
  assert.ok(wholesaleV2CompleteOpenApi.components.schemas.ReceiptDiscrepancySnapshot);
});
