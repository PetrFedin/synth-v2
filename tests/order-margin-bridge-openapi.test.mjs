import test from 'node:test';
import assert from 'node:assert/strict';
import { wholesaleV2ExtendedOpenApi } from '../src/http/v2-openapi.mjs';
import { withOrderMarginBridgeOpenApi } from '../src/http/order-margin-bridge-openapi.mjs';

test('margin bridge OpenAPI exposes explainable immutable financial chain', () => {
  const specification = withOrderMarginBridgeOpenApi(wholesaleV2ExtendedOpenApi);
  const operation = specification.paths['/orders/{orderId}/margin-bridge'].get;
  assert.equal(operation.operationId, 'getOrderMarginBridge');
  assert.equal(operation.parameters[0].name, 'orderId');

  const bridge = specification.components.schemas.OrderMarginBridge;
  assert.deepEqual(bridge.properties.status.enum, ['CLOSED', 'ADJUSTED']);
  for (const field of ['orderId', 'orderCommitSnapshotId', 'costCloseSnapshotId', 'base', 'steps', 'effective', 'cumulativePostCloseCostDelta', 'cumulativePostCloseMarginDelta']) {
    assert.ok(bridge.required.includes(field), `OrderMarginBridge must require ${field}`);
  }

  const step = specification.components.schemas.OrderMarginBridgeStep;
  for (const field of [
    'adjustmentId', 'previousAdjustmentId', 'actualCostEntryId', 'costType', 'sourceRef',
    'sourceAmount', 'sourceCurrency', 'fxRateSnapshotId', 'fxRate', 'convertedAmount', 'currency',
    'costDeltaAmount', 'marginDeltaAmount', 'reason', 'priorLandedCostSnapshotId', 'landedCostSnapshotId',
    'priorMarginActualizationSnapshotId', 'marginActualizationSnapshotId',
    'cumulativeCostDeltaAmount', 'cumulativeMarginDeltaAmount', 'recordedAt',
  ]) {
    assert.ok(step.required.includes(field), `OrderMarginBridgeStep must require ${field}`);
  }
  assert.equal(step.properties.fxRateSnapshotId.oneOf[1].type, 'null');
  assert.equal(step.properties.reason.maxLength, 1000);
});
