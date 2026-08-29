import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupplierRecoveryRoutes } from '../src/http/supplier-recovery-routes.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

const validBody = Object.freeze({
  supplierCode: 'SUP-01', amount: 10, currency: 'EUR', fxRateSnapshotId: null,
  orderLineNo: 1, productSkuId: 'product-sku-1', sku: 'SKU-1',
  sourceRef: 'CREDIT-NOTE-1', occurredAt: '2026-08-11T10:00:00.000Z', reason: 'Accepted supplier credit',
});

test('supplier recovery routes expose strict mutation and read paths', async () => {
  const calls = [];
  const routes = createSupplierRecoveryRoutes({ supplierRecovery: {
    recordRecovery(commandId, actorId, resolutionId, body) { calls.push(['record', commandId, actorId, resolutionId, body]); return { ok: true }; },
    getRecoveryForActor(actorId, recoveryId) { calls.push(['read', actorId, recoveryId]); return { id: recoveryId }; },
  } });
  assert.equal(routes.length, 2);
  const mutation = routes.find((route) => route.method === 'POST');
  const read = routes.find((route) => route.method === 'GET');
  assert.ok(mutation.pattern.test('/v2/receipt-claim-resolutions/resolution-1/supplier-recoveries'));
  assert.ok(read.pattern.test('/v2/supplier-recoveries/recovery-1'));
  assert.deepEqual(await mutation.execute({ commandId: 'cmd-1', actorId: 'finance-1', params: ['resolution-1'], query: {}, body: validBody }), { ok: true });
  assert.deepEqual(await read.execute({ actorId: 'finance-1', params: ['recovery-1'], query: {} }), { id: 'recovery-1' });
  assert.equal(calls[0][3], 'resolution-1');
  assert.equal(calls[1][2], 'recovery-1');
});

test('supplier recovery route rejects invalid amount, currency, incomplete physical identity and unknown fields', () => {
  const [mutation] = createSupplierRecoveryRoutes({ supplierRecovery: { recordRecovery() {}, getRecoveryForActor() {} } });
  assert.throws(() => mutation.execute({ commandId: 'cmd-1', actorId: 'finance-1', params: ['resolution-1'], query: {}, body: { ...validBody, amount: 0 } }), (error) => error.code === 'HTTP_BODY_FIELD_INVALID');
  assert.throws(() => mutation.execute({ commandId: 'cmd-2', actorId: 'finance-1', params: ['resolution-1'], query: {}, body: { ...validBody, currency: 'eur' } }), (error) => error.code === 'HTTP_BODY_FIELD_INVALID');
  assert.throws(() => mutation.execute({ commandId: 'cmd-3', actorId: 'finance-1', params: ['resolution-1'], query: {}, body: { ...validBody, productSkuId: undefined } }), (error) => error.code === 'HTTP_BODY_FIELD_INVALID');
  assert.throws(() => mutation.execute({ commandId: 'cmd-4', actorId: 'finance-1', params: ['resolution-1'], query: {}, body: { ...validBody, surprise: true } }), (error) => error.code === 'HTTP_BODY_FIELD_UNKNOWN');
  assert.doesNotThrow(() => mutation.execute({
    commandId: 'cmd-aggregate', actorId: 'finance-1', params: ['resolution-1'], query: {},
    body: { supplierCode:'SUP-01',amount:10,currency:'EUR',fxRateSnapshotId:null,sourceRef:'CREDIT-NOTE-AGG',occurredAt:'2026-08-11T10:00:00.000Z',reason:'Aggregate accepted supplier credit' },
  }));
});

test('authoritative OpenAPI contains exact supplier recovery ProductSku contract after claims and economics composition', () => {
  const post = wholesaleV2ExtendedOpenApi.paths['/receipt-claim-resolutions/{resolutionSnapshotId}/supplier-recoveries']?.post;
  const get = wholesaleV2ExtendedOpenApi.paths['/supplier-recoveries/{recoveryId}']?.get;
  assert.equal(post?.operationId, 'recordSupplierRecovery');
  assert.equal(get?.operationId, 'getSupplierRecovery');
  const input = wholesaleV2ExtendedOpenApi.components.schemas.SupplierRecoveryInput;
  assert.ok(input);
  assert.ok(input.properties.orderLineNo);
  assert.ok(input.properties.productSkuId);
  assert.ok(input.properties.sku);
  assert.ok(Array.isArray(input.anyOf));
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.SupplierRecoverySnapshot);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.ActualCostLedgerEntry);
  assert.ok(wholesaleV2ExtendedOpenApi.components.schemas.PostCloseAdjustment);
});
