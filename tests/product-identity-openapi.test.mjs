import assert from 'node:assert/strict';
import test from 'node:test';
import { wholesaleV2OpenApi } from '../src/http/openapi.mjs';
import { withProductIdentityOpenApi } from '../src/http/product-identity-openapi.mjs';

const spec = withProductIdentityOpenApi(wholesaleV2OpenApi);

test('Product Identity OpenAPI exposes the canonical Product Master and ordered Size Scale surface', () => {
  for (const path of [
    '/product/styles',
    '/product/styles/{styleId}',
    '/product/styles/{styleId}/versions',
    '/product/style-versions/{styleVersionId}/colorways',
    '/product/size-scales',
    '/product/size-scales/{sizeScaleId}',
    '/product/size-scales/{sizeScaleId}/versions',
    '/product/size-scale-versions/{sizeScaleVersionId}/values',
    '/product/skus',
    '/product/style-versions/{styleVersionId}/media',
    '/product/attributes',
    '/product/skus/{productSkuId}/catalog-link',
  ]) assert(spec.paths[path], `missing ${path}`);
  assert(spec.components.schemas.ProductStyleAggregate);
  assert(spec.components.schemas.ProductSizeScaleAggregate);
  assert(spec.components.schemas.ProductMdmRef);
});

test('every Product Identity mutation declares the idempotency header', () => {
  const operations = Object.values(spec.paths)
    .flatMap((pathItem) => Object.entries(pathItem))
    .filter(([method, operation]) => method !== 'get' && operation?.operationId?.toLowerCase().includes('product'))
    .map(([, operation]) => operation);
  assert(operations.length >= 10);
  for (const operation of operations) {
    assert(operation.parameters.some((parameter) => parameter.name === 'Idempotency-Key' && parameter.required === true), operation.operationId);
  }
});

test('buyer-facing commercial fields are not editable Product Identity inputs', () => {
  const serialized = JSON.stringify({
    style: spec.components.schemas.ProductStyleCreate,
    styleVersion: spec.components.schemas.ProductStyleVersionCreate,
    sku: spec.components.schemas.ProductSkuCreate,
  });
  for (const forbidden of ['wholesalePrice', 'rrp', 'minimumOrderQuantity', 'availableQuantity', 'deliveryWindow', 'buyerVisibility']) {
    assert(!serialized.includes(forbidden), `${forbidden} must remain outside technical Product Identity`);
  }
});
