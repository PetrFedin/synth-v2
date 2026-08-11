import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';


test('top-level PostgreSQL runtime imports with Product Identity wiring intact', () => {
  assert.equal(typeof createPostgresWholesaleRuntime, 'function');
});

test('extended OpenAPI includes Product Identity routes after the full extension chain', () => {
  assert(wholesaleV2ExtendedOpenApi.paths['/product/styles']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/styles/{styleId}']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/size-scales/{sizeScaleId}']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/skus']);
});
