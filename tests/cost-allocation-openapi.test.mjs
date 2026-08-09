import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2EconomicsOpenApi } from '../src/http/v2-economics-openapi.mjs';

test('economics OpenAPI exposes cost allocation policy and immutable SKU allocation run', () => {
  for (const path of [
    '/brands/{brandId}/cost-allocation-policies',
    '/orders/{orderId}/cost-allocation-runs',
    '/cost-allocation-policies/{policyVersionId}',
    '/cost-allocation-runs/{allocationRunId}',
    '/orders/{orderId}/margin-bridge',
    '/orders/{orderId}/economics-position',
  ]) {
    assert.ok(wholesaleV2EconomicsOpenApi.paths[path], `missing economics OpenAPI path ${path}`);
  }

  const policy = wholesaleV2EconomicsOpenApi.components.schemas.CostAllocationPolicyVersion;
  assert.deepEqual(policy.properties.defaultBasis.enum, ['direct', 'unit', 'net_value', 'custom']);
  assert.deepEqual(policy.properties.status.enum, ['approved']);

  const run = wholesaleV2EconomicsOpenApi.components.schemas.CostAllocationRunSnapshot;
  for (const field of ['orderCommitSnapshotId', 'landedCostSnapshotId', 'policyVersionId', 'costEntryIds', 'allocations', 'skuEconomics', 'allocatedTotal', 'contentHash']) {
    assert.ok(run.required.includes(field), `CostAllocationRunSnapshot must require ${field}`);
  }
  const sku = wholesaleV2EconomicsOpenApi.components.schemas.SkuEconomics;
  assert.ok(sku.required.includes('allocatedLandedCost'));
  assert.ok(sku.required.includes('contributionMarginAmount'));
  assert.ok(sku.required.includes('contributionMarginPercent'));
});
