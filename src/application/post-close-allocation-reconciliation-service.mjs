import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createPostCloseAllocationReconciliation } from '../modules/order-economics/post-close-allocation-reconciliation.mjs';

export function createPostCloseAllocationReconciliationService({
  economicsStore,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(economicsStore && typeof economicsStore.transaction === 'function', 'ORDER_ECONOMICS_STORE_REQUIRED', 'Order economics store is required');

  return Object.freeze({
    reconcilePostCloseAllocation(commandId, actorId, orderId, postCloseAdjustmentId, costAllocationRunSnapshotId) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      invariant(postCloseAdjustmentId, 'POST_CLOSE_ADJUSTMENT_ID_REQUIRED', 'Post-close adjustment id is required');
      invariant(costAllocationRunSnapshotId, 'COST_ALLOCATION_RUN_ID_REQUIRED', 'Exact cost allocation run id is required');
      const fingerprint = `reconcilePostCloseAllocation:${actorId}:${orderId}:${postCloseAdjustmentId}:${costAllocationRunSnapshotId}`;
      return economicsStore.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });

        const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        assertCapability(await tx.getMembership(order.brandId, actorId), CAPABILITIES.COST_MANAGE);
        invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Post-close allocation reconciliation requires an immutable order commit snapshot', { orderId });
        const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
        if (previous) return previous.result;

        const costClose = requireEntity(
          await tx.lockCostCloseByOrderCommitSnapshotId(orderCommit.id),
          'COST_CLOSE_REQUIRED_FOR_ADJUSTMENT',
          { orderId, orderCommitSnapshotId: orderCommit.id },
        );
        const postCloseAdjustment = requireEntity(await tx.getPostCloseAdjustment(postCloseAdjustmentId), 'POST_CLOSE_ADJUSTMENT_NOT_FOUND', { postCloseAdjustmentId });
        const latestAdjustment = requireEntity(await tx.getLatestPostCloseAdjustment(costClose.id), 'POST_CLOSE_ADJUSTMENT_NOT_FOUND', { costCloseSnapshotId: costClose.id });
        invariant(latestAdjustment.id === postCloseAdjustment.id, 'POST_CLOSE_ALLOCATION_RECONCILIATION_NOT_LATEST', 'Only the latest post-close adjustment can become the effective reconciled economics position', {
          requestedPostCloseAdjustmentId: postCloseAdjustment.id,
          latestPostCloseAdjustmentId: latestAdjustment.id,
        });
        const existing = await tx.getPostCloseAllocationReconciliationByAdjustmentId(postCloseAdjustment.id);
        invariant(!existing, 'POST_CLOSE_ALLOCATION_ALREADY_RECONCILED', 'Post-close adjustment already has an immutable allocation reconciliation', {
          postCloseAdjustmentId: postCloseAdjustment.id,
          reconciliationSnapshotId: existing?.id,
        });

        const landedCost = requireEntity(await tx.getLandedCostSnapshot(postCloseAdjustment.landedCostSnapshotId), 'LANDED_COST_SNAPSHOT_NOT_FOUND', { landedCostSnapshotId: postCloseAdjustment.landedCostSnapshotId });
        const pendingMarginActualization = requireEntity(await tx.getMarginActualizationSnapshot(postCloseAdjustment.marginActualizationSnapshotId), 'MARGIN_ACTUALIZATION_NOT_FOUND', { marginActualizationSnapshotId: postCloseAdjustment.marginActualizationSnapshotId });
        const costAllocation = requireEntity(await tx.getCostAllocationRunSnapshot(costAllocationRunSnapshotId), 'COST_ALLOCATION_RUN_NOT_FOUND', { costAllocationRunSnapshotId });
        const reconciledAt = clock();
        const result = createPostCloseAllocationReconciliation({
          reconciliationId: nextId('post-close-allocation-reconciliation'),
          marginActualizationId: nextId('margin-actualization'),
          order,
          orderCommit,
          costClose,
          postCloseAdjustment,
          pendingMarginActualization,
          landedCost,
          costAllocation,
          reconciledAt,
        });

        await tx.insertMarginActualizationSnapshot(result.marginActualization);
        await tx.insertPostCloseAllocationReconciliation(result.reconciliation);
        await tx.appendOutbox(domainEvent({
          id: nextId('event'),
          type: 'margin.actualized',
          aggregateId: result.marginActualization.id,
          occurredAt: reconciledAt,
          payload: Object.freeze({
            orderId,
            orderCommitSnapshotId: result.marginActualization.orderCommitSnapshotId,
            landedCostSnapshotId: result.marginActualization.landedCostSnapshotId,
            allocationStatus: result.marginActualization.allocationStatus,
            costAllocationRunSnapshotId: result.marginActualization.costAllocationRunSnapshotId,
            costAllocationRunContentHash: result.marginActualization.costAllocationRunContentHash,
            costAllocationPolicyVersionId: result.marginActualization.costAllocationPolicyVersionId,
            costAllocationLineageMode: result.marginActualization.costAllocationLineageMode,
            netRevenue: result.marginActualization.netRevenue,
            landedCost: result.marginActualization.landedCost,
            contributionMarginAmount: result.marginActualization.contributionMarginAmount,
            contributionMarginPercent: result.marginActualization.contributionMarginPercent,
            postCloseAdjustmentId: postCloseAdjustment.id,
            postCloseAllocationReconciliationSnapshotId: result.reconciliation.id,
            contentHash: result.marginActualization.contentHash,
          }),
          metadata: { commandId, actorId },
        }));
        await tx.appendOutbox(domainEvent({
          id: nextId('event'),
          type: 'cost-close.allocation-reconciled',
          aggregateId: result.reconciliation.id,
          occurredAt: reconciledAt,
          payload: Object.freeze({
            orderId,
            orderCommitSnapshotId: result.reconciliation.orderCommitSnapshotId,
            costCloseSnapshotId: result.reconciliation.costCloseSnapshotId,
            postCloseAdjustmentId: result.reconciliation.postCloseAdjustmentId,
            pendingMarginActualizationSnapshotId: result.reconciliation.pendingMarginActualizationSnapshotId,
            landedCostSnapshotId: result.reconciliation.landedCostSnapshotId,
            costAllocationRunSnapshotId: result.reconciliation.costAllocationRunSnapshotId,
            costAllocationRunContentHash: result.reconciliation.costAllocationRunContentHash,
            costAllocationPolicyVersionId: result.reconciliation.costAllocationPolicyVersionId,
            marginActualizationSnapshotId: result.reconciliation.marginActualizationSnapshotId,
            previousAllocationStatus: result.reconciliation.previousAllocationStatus,
            resultingAllocationStatus: result.reconciliation.resultingAllocationStatus,
            contentHash: result.reconciliation.contentHash,
          }),
          metadata: { commandId, actorId },
        }));
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
        return result;
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
