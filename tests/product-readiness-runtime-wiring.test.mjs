import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostgresWholesaleRuntime } from '../src/runtime/postgres-runtime.mjs';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('top-level PostgreSQL runtime imports with Product Readiness composition intact', () => {
  assert.equal(typeof createPostgresWholesaleRuntime, 'function');
});

test('extended OpenAPI includes readiness and commercial projection after the full extension chain', () => {
  assert(wholesaleV2ExtendedOpenApi.paths['/product/style-versions/{styleVersionId}/readiness']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/readiness/{readinessSnapshotId}']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/readiness/{readinessSnapshotId}/commercial-projection']);
  assert(wholesaleV2ExtendedOpenApi.paths['/product/commercial-projections/{projectionId}']);
  assert(wholesaleV2ExtendedOpenApi.components.schemas.ProductReadinessSnapshot);
  assert(wholesaleV2ExtendedOpenApi.components.schemas.CommercialProductProjectionVersion);
});
