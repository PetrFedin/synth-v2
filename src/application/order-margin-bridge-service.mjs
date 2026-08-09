import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

export function createOrderMarginBridgeService({ reader } = {}) {
  invariant(reader && typeof reader.transaction === 'function', 'MARGIN_BRIDGE_READER_REQUIRED', 'Order margin bridge reader is required');

  return Object.freeze({
    getOrderMarginBridgeForActor(actorId, orderId) {
      return reader.transaction(async (tx) => {
        const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        const membership = await tx.getMembership(order.brandId, actorId);
        assertCapability(membership, CAPABILITIES.MARGIN_READ);
        invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Margin bridge requires an immutable order commit snapshot', { orderId });

        const orderCommit = requireEntity(
          await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId),
          'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
          { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId },
        );
        invariant(orderCommit.orderId === order.id && orderCommit.status === 'committed', 'ORDER_COMMIT_SNAPSHOT_INVALID_FOR_EXECUTION', 'Margin bridge requires the committed snapshot for this order', { orderId, orderCommitSnapshotId: orderCommit.id });

        const close = requireEntity(
          await tx.getCostCloseByOrderCommitSnapshotId(orderCommit.id),
          'COST_CLOSE_REQUIRED_FOR_MARGIN_BRIDGE',
          { orderId, orderCommitSnapshotId: orderCommit.id },
        );
        invariant(close.orderId === order.id && close.orderCommitSnapshotId === orderCommit.id, 'MARGIN_BRIDGE_CLOSE_LINEAGE_MISMATCH', 'Cost close belongs to another order commit', { costCloseSnapshotId: close.id });

        const steps = await tx.listMarginBridgeSteps(close.id);
        validateBridgeSteps(close, orderCommit, steps);
        return buildBridge(order, orderCommit, close, steps);
      });
    },
  });
}

function buildBridge(order, orderCommit, close, steps) {
  const base = Object.freeze({
    landedCostSnapshotId: close.landedCostSnapshotId,
    marginActualizationSnapshotId: close.marginActualizationSnapshotId,
    totalLandedCost: close.totalLandedCost,
    contributionMarginAmount: close.contributionMarginAmount,
    contributionMarginPercent: close.contributionMarginPercent,
  });
  const normalizedSteps = Object.freeze(steps.map((step) => Object.freeze({ ...step })));
  const last = normalizedSteps.at(-1);
  const effective = Object.freeze(last ? {
    landedCostSnapshotId: last.landedCostSnapshotId,
    marginActualizationSnapshotId: last.marginActualizationSnapshotId,
    totalLandedCost: last.landedCost,
    contributionMarginAmount: last.contributionMarginAmount,
    contributionMarginPercent: last.contributionMarginPercent,
  } : { ...base });

  return Object.freeze({
    orderId: order.id,
    orderCommitSnapshotId: orderCommit.id,
    costCloseReadinessSnapshotId: close.costCloseReadinessSnapshotId ?? null,
    costCloseSnapshotId: close.id,
    currency: close.currency,
    status: last ? 'ADJUSTED' : 'CLOSED',
    base,
    steps: normalizedSteps,
    effective,
    cumulativePostCloseCostDelta: last?.cumulativeCostDeltaAmount ?? 0,
    cumulativePostCloseMarginDelta: last?.cumulativeMarginDeltaAmount ?? 0,
  });
}

function validateBridgeSteps(close, orderCommit, steps) {
  invariant(Array.isArray(steps), 'MARGIN_BRIDGE_STEPS_INVALID', 'Margin bridge steps must be an array');
  let previousAdjustmentId = null;
  let priorLandedCostSnapshotId = close.landedCostSnapshotId;
  let priorMarginActualizationSnapshotId = close.marginActualizationSnapshotId;
  let expectedLandedCost = close.totalLandedCost;
  let expectedMarginAmount = close.contributionMarginAmount;
  let cumulativeCostDelta = 0;
  let cumulativeMarginDelta = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepNumber = index + 1;
    invariant(step.stepNumber === stepNumber, 'MARGIN_BRIDGE_STEP_SEQUENCE_INVALID', 'Margin bridge step sequence is not contiguous', { expectedStepNumber: stepNumber, actualStepNumber: step.stepNumber });
    invariant(step.costCloseSnapshotId === close.id && step.orderCommitSnapshotId === orderCommit.id && step.orderId === orderCommit.orderId, 'MARGIN_BRIDGE_STEP_LINEAGE_MISMATCH', 'Margin bridge step belongs to another economic chain', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.previousAdjustmentId === previousAdjustmentId, 'MARGIN_BRIDGE_ADJUSTMENT_CHAIN_INVALID', 'Margin bridge previous-adjustment link is broken', { stepNumber, adjustmentId: step.adjustmentId, expectedPreviousAdjustmentId: previousAdjustmentId, actualPreviousAdjustmentId: step.previousAdjustmentId });
    invariant(step.priorLandedCostSnapshotId === priorLandedCostSnapshotId, 'MARGIN_BRIDGE_LANDED_CHAIN_INVALID', 'Margin bridge prior landed-cost link is broken', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.priorMarginActualizationSnapshotId === priorMarginActualizationSnapshotId, 'MARGIN_BRIDGE_MARGIN_CHAIN_INVALID', 'Margin bridge prior margin link is broken', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.currency === close.currency, 'MARGIN_BRIDGE_CURRENCY_MISMATCH', 'Margin bridge step currency differs from cost close currency', { stepNumber, adjustmentId: step.adjustmentId, currency: step.currency, closeCurrency: close.currency });
    invariant(step.costDeltaAmount === step.convertedAmount, 'MARGIN_BRIDGE_COST_DELTA_MISMATCH', 'Margin bridge cost delta must equal the recorded converted actual cost', { stepNumber, adjustmentId: step.adjustmentId, costDeltaAmount: step.costDeltaAmount, convertedAmount: step.convertedAmount });
    invariant(step.marginDeltaAmount === -step.costDeltaAmount, 'MARGIN_BRIDGE_MARGIN_DELTA_MISMATCH', 'Margin bridge margin delta must offset the cost delta', { stepNumber, adjustmentId: step.adjustmentId });

    expectedLandedCost = roundMoney(expectedLandedCost + step.costDeltaAmount);
    expectedMarginAmount = roundMoney(expectedMarginAmount + step.marginDeltaAmount);
    cumulativeCostDelta = roundMoney(cumulativeCostDelta + step.costDeltaAmount);
    cumulativeMarginDelta = roundMoney(cumulativeMarginDelta + step.marginDeltaAmount);

    invariant(step.priorLandedCost === roundMoney(expectedLandedCost - step.costDeltaAmount), 'MARGIN_BRIDGE_PRIOR_LANDED_AMOUNT_MISMATCH', 'Margin bridge prior landed cost does not match previous economics', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.landedCost === expectedLandedCost, 'MARGIN_BRIDGE_LANDED_AMOUNT_MISMATCH', 'Margin bridge landed cost does not match cumulative adjustment', { stepNumber, adjustmentId: step.adjustmentId, expectedLandedCost, actualLandedCost: step.landedCost });
    invariant(step.priorContributionMarginAmount === roundMoney(expectedMarginAmount - step.marginDeltaAmount), 'MARGIN_BRIDGE_PRIOR_MARGIN_AMOUNT_MISMATCH', 'Margin bridge prior margin does not match previous economics', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.contributionMarginAmount === expectedMarginAmount, 'MARGIN_BRIDGE_MARGIN_AMOUNT_MISMATCH', 'Margin bridge margin does not match cumulative adjustment', { stepNumber, adjustmentId: step.adjustmentId, expectedMarginAmount, actualMarginAmount: step.contributionMarginAmount });
    invariant(step.cumulativeCostDeltaAmount === cumulativeCostDelta, 'MARGIN_BRIDGE_CUMULATIVE_COST_DELTA_MISMATCH', 'Margin bridge cumulative cost delta is inconsistent', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.cumulativeMarginDeltaAmount === cumulativeMarginDelta, 'MARGIN_BRIDGE_CUMULATIVE_MARGIN_DELTA_MISMATCH', 'Margin bridge cumulative margin delta is inconsistent', { stepNumber, adjustmentId: step.adjustmentId });
    invariant(step.baseLandedCost === close.totalLandedCost && step.baseContributionMarginAmount === close.contributionMarginAmount, 'MARGIN_BRIDGE_BASE_CHANGED', 'Margin bridge step rewrites immutable cost-close economics', { stepNumber, adjustmentId: step.adjustmentId });

    previousAdjustmentId = step.adjustmentId;
    priorLandedCostSnapshotId = step.landedCostSnapshotId;
    priorMarginActualizationSnapshotId = step.marginActualizationSnapshotId;
  }
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}
function roundMoney(value) {
  return Math.round(value * 10_000) / 10_000;
}
