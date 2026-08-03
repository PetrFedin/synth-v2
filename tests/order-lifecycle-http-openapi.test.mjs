import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHttpError } from '../src/http/api.mjs';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';

test('order version validation and concurrency have stable HTTP statuses', () => {
  assert.equal(normalizeHttpError({ code: 'ORDER_EXPECTED_VERSION_INVALID', message: 'invalid', details: {} }).status, 400);
  assert.equal(normalizeHttpError({ code: 'ORDER_CONCURRENCY_CONFLICT', message: 'stale', details: {} }).status, 409);
});

test('OpenAPI versions every order lifecycle mutation', () => {
  assert.equal(wholesaleV2OpenApi.info.version, '1.7.0');
  const schemas = wholesaleV2OpenApi.components.schemas;
  assert.deepEqual(schemas.OrderTermsUpdate.required, ['expectedVersion', 'terms']);
  assert.deepEqual(schemas.OrderVersionExpectation.required, ['expectedVersion']);
  assert.ok(schemas.OrderAccept.required.includes('expectedVersion'));
  assert.ok(schemas.OrderCancel.required.includes('expectedVersion'));
  assert.equal(wholesaleV2OpenApi.paths['/orders/{orderId}/terms'].patch.requestBody.content['application/json'].schema.$ref, '#/components/schemas/OrderTermsUpdate');
  assert.equal(wholesaleV2OpenApi.paths['/orders/{orderId}/attach'].post.requestBody.content['application/json'].schema.$ref, '#/components/schemas/OrderVersionExpectation');
});
