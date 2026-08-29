import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createOrderEconomicsRoutes } from '../src/http/order-economics-routes.mjs';
import { createFulfillmentRoutes } from '../src/http/fulfillment-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

function findRoute(routes, method, path) {
  const match = routes.find((candidate) => candidate.method === method && candidate.pattern.test(path));
  assert.ok(match, `route ${method} ${path} must exist`);
  return match;
}

function aggregateCost(overrides = {}) {
  return {
    supplyCommitmentSnapshotId: 'supply-1',
    costType: 'factory',
    amount: 125,
    currency: 'EUR',
    sourceRef: 'invoice-1',
    occurredAt: '2026-08-29T00:00:00.000Z',
    ...overrides,
  };
}

function physicalCost(overrides = {}) {
  return {
    costType: 'freight',
    amount: 25,
    currency: 'EUR',
    sourceRef: 'freight-invoice-1',
    occurredAt: '2026-08-29T00:00:00.000Z',
    ...overrides,
  };
}

test('generic actual-cost write is aggregate-only at HTTP boundary', () => {
  let received = null;
  const routes = createOrderEconomicsRoutes({
    orderEconomics: {
      recordActualCost(_commandId, _actorId, _orderId, body) { received = body; return body; },
    },
  });
  const route = findRoute(routes, 'POST', '/v2/orders/order-1/actual-costs');

  assert.throws(
    () => route.execute({ commandId: 'cmd-1', actorId: 'user-1', params: ['order-1'], query: {}, body: aggregateCost({ sku: 'SKU-1' }) }),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.unknownFields?.includes('sku'),
  );

  const body = aggregateCost();
  assert.deepEqual(route.execute({ commandId: 'cmd-2', actorId: 'user-1', params: ['order-1'], query: {}, body }), body);
  assert.equal(received, body);
});

test('generic post-close adjustment cannot introduce SKU scope while legacy correction may preserve it', () => {
  let corrected = null;
  const routes = createOrderEconomicsRoutes({
    orderEconomics: {
      recordPostCloseAdjustment() { return 'unexpected'; },
      correctActualCost(_commandId, _actorId, _orderId, _entryId, body) { corrected = body; return body; },
    },
  });

  const adjustment = findRoute(routes, 'POST', '/v2/orders/order-1/cost-close/adjustments');
  assert.throws(
    () => adjustment.execute({
      commandId: 'cmd-adjust', actorId: 'user-1', params: ['order-1'], query: {},
      body: { reason: 'late invoice', ...aggregateCost({ sku: 'SKU-1' }) },
    }),
    (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN' && error.details?.unknownFields?.includes('sku'),
  );

  const correction = findRoute(routes, 'POST', '/v2/orders/order-1/actual-costs/cost-1/corrections');
  const correctionBody = { reason: 'legacy correction', ...aggregateCost({ sku: 'LEGACY-SKU' }) };
  assert.deepEqual(correction.execute({
    commandId: 'cmd-correct', actorId: 'user-1', params: ['order-1', 'cost-1'], query: {}, body: correctionBody,
  }), correctionBody);
  assert.equal(corrected, correctionBody);
});

test('physical SKU-specific actual cost requires exact orderLineNo + productSkuId at HTTP boundary', () => {
  let received = null;
  const routes = createFulfillmentRoutes({
    fulfillment: {
      recordPhysicalActualCost(_commandId, _actorId, _shipmentId, body) { received = body; return body; },
    },
  });
  const route = findRoute(routes, 'POST', '/v2/shipment-notices/shipment-1/actual-costs');

  for (const body of [
    physicalCost({ sku: 'SKU-1' }),
    physicalCost({ orderLineNo: 1 }),
    physicalCost({ productSkuId: 'product-sku-1' }),
  ]) {
    assert.throws(
      () => route.execute({ commandId: 'cmd-bad', actorId: 'user-1', params: ['shipment-1'], query: {}, body }),
      (error) => error.code === 'HTTP_BODY_FIELD_INVALID',
    );
  }

  const aggregate = physicalCost();
  assert.deepEqual(route.execute({ commandId: 'cmd-aggregate', actorId: 'user-1', params: ['shipment-1'], query: {}, body: aggregate }), aggregate);

  const exact = physicalCost({ orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1' });
  assert.deepEqual(route.execute({ commandId: 'cmd-exact', actorId: 'user-1', params: ['shipment-1'], query: {}, body: exact }), exact);
  assert.equal(received, exact);
});

test('authoritative OpenAPI 1.18 exposes aggregate generic cost and exact physical ProductSku identity', () => {
  const schemas = wholesaleV2ExtendedOpenApi.components.schemas;
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.18.0');

  assert.equal(schemas.ActualCostInput.properties.sku, undefined);
  assert.ok(schemas.ActualCostCorrectionInput.properties.sku);
  assert.equal(schemas.PostCloseAdjustmentInput.properties.sku, undefined);

  assert.ok(schemas.PhysicalActualCostInput.properties.orderLineNo);
  assert.ok(schemas.PhysicalActualCostInput.properties.productSkuId);
  assert.ok(schemas.PhysicalActualCostInput.properties.sku);
  assert.ok(Array.isArray(schemas.PhysicalActualCostInput.anyOf));
  assert.ok(schemas.PhysicalActualCostLedgerEntry.required.includes('orderLineNo'));
  assert.ok(schemas.PhysicalActualCostLedgerEntry.required.includes('productSkuId'));
});

test('migration 073 is forward-only and installs canonical ActualCost write guard', async () => {
  const migrationPath = fileURLToPath(new URL('../db/migrations/073_actual_cost_exact_physical_lineage.sql', import.meta.url));
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /guard_actual_cost_canonical_write/);
  assert.match(sql, /ACTUAL_COST_LEGACY_SKU_NEW_WRITE_FORBIDDEN/);
  assert.match(sql, /ACTUAL_COST_EXACT_PRODUCT_SKU_IDENTITY_REQUIRED/);
  assert.match(sql, /ACTUAL_COST_LEGACY_CORRECTION_LINEAGE_MISMATCH/);
  assert.doesNotMatch(sql, /UPDATE\s+actual_cost_ledger_entries\b/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+actual_cost_ledger_entries\b/i);
});
