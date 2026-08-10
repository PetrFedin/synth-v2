import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryRoutes } from '../src/http/inventory-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const calls = [];
const inventory = {
  postReceipt: (...args) => { calls.push(['post', ...args]); return { receiptSnapshotId: args[2], movementIds: ['move-1'] }; },
  getWarehousePositionsForActor: (...args) => { calls.push(['read', ...args]); return { shopId: args[1], warehouseLocationId: args[2], sku: args[3]?.sku ?? null, positions: [], asOf: '2026-08-10T00:00:00.000Z' }; },
};

function findRoute(routes, method, path) { return routes.find((route) => route.method === method && route.pattern.test(path)); }

test('inventory routes expose receipt posting and derived warehouse position read', async () => {
  const routes = createInventoryRoutes({ inventory });
  const post = findRoute(routes, 'POST', '/v2/receipts/receipt-1/inventory-postings');
  assert.ok(post?.mutation);
  await post.execute({ commandId: 'cmd-1', actorId: 'buyer-1', params: ['receipt-1'], query: {}, body: {} });
  assert.deepEqual(calls.at(-1), ['post', 'cmd-1', 'buyer-1', 'receipt-1']);

  const read = findRoute(routes, 'GET', '/v2/shops/shop-1/warehouse-locations/dc-1/positions');
  assert.ok(read && !read.mutation);
  await read.execute({ actorId: 'buyer-1', params: ['shop-1', 'dc-1'], query: { sku: 'SKU-1' } });
  assert.deepEqual(calls.at(-1), ['read', 'buyer-1', 'shop-1', 'dc-1', { sku: 'SKU-1' }]);
});

test('inventory routes reject request-shape drift', () => {
  const routes = createInventoryRoutes({ inventory });
  const post = findRoute(routes, 'POST', '/v2/receipts/receipt-1/inventory-postings');
  assert.throws(() => post.execute({ commandId: 'cmd-1', actorId: 'buyer-1', params: ['receipt-1'], query: {}, body: { quantity: 999 } }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');
  const read = findRoute(routes, 'GET', '/v2/shops/shop-1/warehouse-locations/dc-1/positions');
  assert.throws(() => read.execute({ actorId: 'buyer-1', params: ['shop-1', 'dc-1'], query: { unsafe: '1' } }), (error) => error.code === 'HTTP_QUERY_FIELD_UNKNOWN');
});

test('authoritative OpenAPI exposes inventory ledger without API version drift', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  assert.ok(wholesaleV2ExtendedOpenApi.paths['/receipts/{receiptId}/inventory-postings']);
  assert.ok(wholesaleV2ExtendedOpenApi.paths['/shops/{shopId}/warehouse-locations/{warehouseLocationId}/positions']);
  const movement = wholesaleV2ExtendedOpenApi.components.schemas.InventoryMovementLedgerEntry;
  for (const field of [
    'orderCommitSnapshotId', 'supplyCommitmentSnapshotId', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId',
    'receiptSnapshotId', 'warehouseLocationId', 'receiptLineId', 'onHandDelta', 'availableDelta', 'quarantineDelta', 'contentHash',
  ]) assert.ok(movement.required.includes(field), `inventory movement must pin ${field}`);
  const position = wholesaleV2ExtendedOpenApi.components.schemas.WarehouseInventoryPosition;
  for (const field of ['onHandQuantity', 'availableQuantity', 'quarantineQuantity', 'movementCount']) assert.ok(position.required.includes(field));
});
