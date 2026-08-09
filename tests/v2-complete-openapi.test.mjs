import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2CompleteOpenApi } from '../src/http/v2-complete-openapi.mjs';

test('complete OpenAPI includes commercial, cost close, economics position and margin bridge surfaces', () => {
  for (const path of [
    '/commercial-publications',
    '/orders/{orderId}/cost-close/readiness',
    '/orders/{orderId}/cost-close',
    '/orders/{orderId}/economics-position',
    '/orders/{orderId}/margin-bridge',
  ]) {
    assert.ok(wholesaleV2CompleteOpenApi.paths[path], `missing complete OpenAPI path ${path}`);
  }
  assert.ok(wholesaleV2CompleteOpenApi.components.schemas.OrderEconomicsPosition);
  assert.ok(wholesaleV2CompleteOpenApi.components.schemas.OrderMarginBridge);
});
