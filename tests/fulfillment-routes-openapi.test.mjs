import test from 'node:test';
import assert from 'node:assert/strict';
import { createFulfillmentRoutes } from '../src/http/fulfillment-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const calls = [];
const fulfillment = {
  createFulfillmentPlan: (...args) => { calls.push(['plan', ...args]); return { id: 'plan-1' }; },
  createShipmentNotice: (...args) => { calls.push(['shipment', ...args]); return { id: 'shipment-1' }; },
  recordReceipt: (...args) => { calls.push(['receipt', ...args]); return { receipt: { id: 'receipt-1' }, discrepancy: { id: 'disc-1' } }; },
  recordPhysicalActualCost: (...args) => { calls.push(['physical-cost', ...args]); return { id: 'cost-1' }; },
  correctPhysicalActualCost: (...args) => { calls.push(['physical-cost-correction', ...args]); return { correctionId: 'correction-1' }; },
  getFulfillmentPlanForActor: (...args) => { calls.push(['get-plan', ...args]); return { id: args[1] }; },
  getShipmentNoticeForActor: (...args) => { calls.push(['get-shipment', ...args]); return { id: args[1] }; },
  getReceiptForActor: (...args) => { calls.push(['get-receipt', ...args]); return { id: args[1] }; },
  getReceiptDiscrepancyForActor: (...args) => { calls.push(['get-disc', ...args]); return { id: args[1] }; },
};

function findRoute(routes, method, path) {
  return routes.find((route) => route.method === method && route.pattern.test(path));
}

test('fulfillment runtime routes cover plan, ASN, receipt, physical cost and discrepancy reads', async () => {
  const routes = createFulfillmentRoutes({ fulfillment });
  const planRoute = findRoute(routes, 'POST', '/v2/orders/ORDER-1/fulfillment-plans');
  assert.ok(planRoute?.mutation);
  const planBody = {
    supplyCommitmentSnapshotId: 'SUPPLY-1',
    shipFrom: { locationId: 'origin', name: 'Origin', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory 1' },
    shipTo: { locationId: 'dc', name: 'DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC 1' },
    plannedShipAt: '2026-08-11T00:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
  };
  await planRoute.execute({ actorId: 'actor-1', commandId: 'cmd-1', params: planRoute.pattern.exec('/v2/orders/ORDER-1/fulfillment-plans').slice(1), body: planBody, query: {} });
  assert.deepEqual(calls.at(-1).slice(0, 4), ['plan', 'cmd-1', 'actor-1', 'ORDER-1']);

  assert.ok(findRoute(routes, 'POST', '/v2/fulfillment-plans/PLAN-1/shipment-notices')?.mutation);
  assert.ok(findRoute(routes, 'POST', '/v2/shipment-notices/ASN-1/receipts')?.mutation);

  const physicalCostRoute = findRoute(routes, 'POST', '/v2/shipment-notices/ASN-1/actual-costs');
  assert.ok(physicalCostRoute?.mutation);
  await physicalCostRoute.execute({
    actorId: 'finance-1', commandId: 'cmd-cost', params: ['ASN-1'], query: {},
    body: { costType: 'freight', amount: 30, currency: 'EUR', sku: 'SKU-1', sourceRef: 'DHL-100', occurredAt: '2026-08-13T14:00:00.000Z' },
  });
  assert.deepEqual(calls.at(-1).slice(0, 4), ['physical-cost', 'cmd-cost', 'finance-1', 'ASN-1']);

  const correctionRoute = findRoute(routes, 'POST', '/v2/shipment-notices/ASN-1/actual-costs/COST-1/corrections');
  assert.ok(correctionRoute?.mutation);
  await correctionRoute.execute({
    actorId: 'finance-1', commandId: 'cmd-correct', params: ['ASN-1', 'COST-1'], query: {},
    body: { reason: 'Credit note', costType: 'freight', amount: 25, currency: 'EUR', sku: 'SKU-1', sourceRef: 'DHL-CREDIT-100', occurredAt: '2026-08-14T09:00:00.000Z' },
  });
  assert.deepEqual(calls.at(-1).slice(0, 5), ['physical-cost-correction', 'cmd-correct', 'finance-1', 'ASN-1', 'COST-1']);

  for (const [method, path] of [
    ['GET', '/v2/fulfillment-plans/PLAN-1'],
    ['GET', '/v2/shipment-notices/ASN-1'],
    ['GET', '/v2/receipts/GRN-1'],
    ['GET', '/v2/receipt-discrepancies/DISC-1'],
  ]) assert.ok(findRoute(routes, method, path), `missing route ${method} ${path}`);
});

test('authoritative OpenAPI exposes immutable fulfillment and physical-cost contracts without version drift', () => {
  assert.equal(wholesaleV2ExtendedOpenApi.info.version, '1.17.0');
  for (const path of [
    '/orders/{orderId}/fulfillment-plans',
    '/fulfillment-plans/{fulfillmentPlanId}',
    '/fulfillment-plans/{fulfillmentPlanId}/shipment-notices',
    '/shipment-notices/{shipmentNoticeId}',
    '/shipment-notices/{shipmentNoticeId}/receipts',
    '/shipment-notices/{shipmentNoticeId}/actual-costs',
    '/shipment-notices/{shipmentNoticeId}/actual-costs/{actualCostEntryId}/corrections',
    '/receipts/{receiptId}',
    '/receipt-discrepancies/{discrepancyId}',
  ]) assert.ok(wholesaleV2ExtendedOpenApi.paths[path], `missing fulfillment OpenAPI path ${path}`);

  for (const schemaName of ['FulfillmentPlanSnapshot', 'ShipmentNoticeSnapshot', 'ReceiptSnapshot', 'ReceiptDiscrepancySnapshot']) {
    const schema = wholesaleV2ExtendedOpenApi.components.schemas[schemaName];
    assert.ok(schema.required.includes('orderCommitSnapshotId'), `${schemaName} must pin orderCommitSnapshotId`);
    assert.ok(schema.required.includes('supplyCommitmentSnapshotId'), `${schemaName} must pin supplyCommitmentSnapshotId`);
    assert.ok(schema.required.includes('contentHash'), `${schemaName} must be content-addressed`);
  }
  const physicalEntry = wholesaleV2ExtendedOpenApi.components.schemas.PhysicalActualCostLedgerEntry;
  for (const field of ['physicalLineageVersion', 'fulfillmentPlanSnapshotId', 'shipmentNoticeSnapshotId', 'receiptSnapshotId', 'receiptDiscrepancySnapshotId']) {
    assert.ok(physicalEntry.required.includes(field), `physical cost must require ${field}`);
  }
  assert.equal(wholesaleV2ExtendedOpenApi.components.schemas.PhysicalActualCostCorrectionInput.additionalProperties, false);
  assert.ok(!Object.hasOwn(wholesaleV2ExtendedOpenApi.components.schemas.PhysicalActualCostCorrectionInput.properties, 'receiptSnapshotId'), 'correction cannot rewrite receipt evidence');
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ShipmentNoticeSnapshot.required.includes('fulfillmentPlanSnapshotId'));
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ReceiptSnapshot.required.includes('shipmentNoticeSnapshotId'));
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ReceiptDiscrepancySnapshot.required.includes('latestReceiptSnapshotId'));
});

test('fulfillment route contracts reject unknown nested fields, duplicate lines and correction evidence rewrites', () => {
  const routes = createFulfillmentRoutes({ fulfillment });
  const planRoute = findRoute(routes, 'POST', '/v2/orders/ORDER-1/fulfillment-plans');
  assert.throws(() => planRoute.execute({
    actorId: 'actor-1', commandId: 'cmd-1', params: ['ORDER-1'], query: {},
    body: {
      supplyCommitmentSnapshotId: 'SUPPLY-1',
      shipFrom: { locationId: 'origin', name: 'Origin', countryCode: 'TR', city: 'Istanbul', addressLine1: 'Factory 1', unsafe: true },
      shipTo: { locationId: 'dc', name: 'DC', countryCode: 'DE', city: 'Berlin', addressLine1: 'DC 1' },
      plannedShipAt: '2026-08-11T00:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
    },
  }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');

  const shipmentRoute = findRoute(routes, 'POST', '/v2/fulfillment-plans/PLAN-1/shipment-notices');
  assert.throws(() => shipmentRoute.execute({
    actorId: 'actor-1', commandId: 'cmd-2', params: ['PLAN-1'], query: {},
    body: {
      shipmentNumber: 'ASN-1', carrier: 'DHL', serviceLevel: 'road',
      lines: [{ lineId: 'line-0001', quantity: 1 }, { lineId: 'line-0001', quantity: 1 }],
      shippedAt: '2026-08-11T00:00:00.000Z', expectedDeliveryAt: '2026-08-13T00:00:00.000Z',
    },
  }), (error) => error.code === 'HTTP_BODY_FIELD_INVALID');

  const correctionRoute = findRoute(routes, 'POST', '/v2/shipment-notices/ASN-1/actual-costs/COST-1/corrections');
  assert.throws(() => correctionRoute.execute({
    actorId: 'finance-1', commandId: 'cmd-correct', params: ['ASN-1', 'COST-1'], query: {},
    body: {
      reason: 'Cannot rewrite evidence', costType: 'freight', amount: 25, currency: 'EUR', sourceRef: 'DHL-CREDIT', occurredAt: '2026-08-14T09:00:00.000Z',
      receiptSnapshotId: 'receipt-other',
    },
  }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');
});
