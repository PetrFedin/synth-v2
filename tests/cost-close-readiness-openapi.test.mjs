import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';

test('OpenAPI requires immutable readiness before final cost close', () => {
  assert.ok(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/cost-close/readiness']);
  assert.ok(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/economics-position']);
  assert.ok(wholesaleV2ExtendedOpenApi.paths['/cost-close-readiness/{costCloseReadinessSnapshotId}']);
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/cost-close/readiness'].post.operationId, 'evaluateCostCloseReadiness');
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/orders/{orderId}/economics-position'].get.operationId, 'getOrderEconomicsPosition');
  assert.equal(wholesaleV2ExtendedOpenApi.paths['/cost-close-readiness/{costCloseReadinessSnapshotId}'].get.operationId, 'getCostCloseReadiness');

  const input = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseReadinessInput;
  assert.deepEqual(input.required, ['landedCostSnapshotId', 'marginActualizationSnapshotId', 'requirements']);
  assert.equal(input.properties.requirements.minItems, 4);
  assert.equal(input.properties.requirements.maxItems, 4);

  const requirement = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseReadinessRequirement;
  assert.deepEqual(requirement.properties.type.enum, ['factory', 'freight', 'duty', 'credits']);
  assert.deepEqual(requirement.properties.status.enum, ['pending', 'complete', 'waived']);

  const readiness = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseReadinessSnapshot;
  assert.deepEqual(readiness.properties.status.enum, ['OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE']);
  for (const field of ['orderCommitSnapshotId', 'landedCostSnapshotId', 'marginActualizationSnapshotId', 'requirements', 'blockingReasons', 'evaluatedAt', 'contentHash']) {
    assert.ok(readiness.required.includes(field), `CostCloseReadinessSnapshot must require ${field}`);
  }

  const closeInput = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseInput;
  assert.ok(closeInput.required.includes('costCloseReadinessSnapshotId'));
  assert.equal(closeInput.properties.costCloseReadinessSnapshotId.type, 'string');
  const close = wholesaleV2ExtendedOpenApi.components.schemas.CostCloseSnapshot;
  assert.ok(close.required.includes('costCloseReadinessSnapshotId'));
  assert.ok(close.required.includes('readinessContentHash'));
  assert.equal(close.properties.costCloseReadinessSnapshotId.type, 'string');
  assert.equal(close.properties.readinessContentHash.pattern, '^[a-f0-9]{64}$');

  const position = wholesaleV2ExtendedOpenApi.components.schemas.OrderEconomicsPosition;
  assert.deepEqual(position.properties.status.enum, ['OPEN', 'WAITING_FOR_FREIGHT', 'WAITING_FOR_DUTY', 'WAITING_FOR_CREDITS', 'READY_TO_CLOSE', 'STALE', 'CLOSED', 'ADJUSTED']);
  for (const field of [
    'orderId', 'orderCommitSnapshotId', 'status', 'blockingReasons',
    'effectiveLandedCostSnapshotId', 'effectiveMarginActualizationSnapshotId',
    'effectiveTotalLandedCost', 'effectiveContributionMarginAmount',
    'baseTotalLandedCost', 'baseContributionMarginAmount',
    'cumulativePostCloseCostDelta', 'cumulativePostCloseMarginDelta',
  ]) {
    assert.ok(position.required.includes(field), `OrderEconomicsPosition must require ${field}`);
  }
  assert.deepEqual(
    position.properties.blockingReasons.items.enum,
    ['factory', 'freight', 'duty', 'credits', 'ledger_changed', 'readiness_not_evaluated'],
  );
});
