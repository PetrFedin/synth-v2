import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createActualCostLedgerEntry } from '../modules/order-economics/public.mjs';

export const PHYSICAL_ACTUAL_COST_TYPES = Object.freeze([
  'freight',
  'insurance',
  'duty',
  'brokerage',
  'warehouse',
  'quality',
  'rework',
  'packaging',
  'other',
]);

const RECEIPT_REQUIRED_COST_TYPES = new Set(['quality', 'rework']);

export function createPhysicalActualCostService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'FULFILLMENT_STORE_REQUIRED', 'Fulfillment store is required');

  return Object.freeze({
    recordPhysicalActualCost(commandId, actorId, shipmentNoticeId, input) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'PHYSICAL_ACTUAL_COST_INPUT_REQUIRED', 'Physical actual cost input is required');
      const fingerprint = `recordPhysicalActualCost:${actorId}:${shipmentNoticeId}:${canonicalJson(input)}`;

      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) {
          invariant(
            fingerprintsMatch(previous.fingerprint, fingerprint),
            'COMMAND_ID_CONFLICT',
            'commandId was already used by another mutation',
            { commandId },
          );
        }

        const shipment = requireEntity(
          await tx.getShipmentNotice(shipmentNoticeId),
          'SHIPMENT_NOTICE_NOT_FOUND',
          { shipmentNoticeId },
        );
        const membership = await tx.getMembership(shipment.brandId, actorId);
        assertCapability(membership, CAPABILITIES.COST_MANAGE);

        const order = requireEntity(await tx.getOrder(shipment.orderId), 'ORDER_NOT_FOUND', { orderId: shipment.orderId });
        invariant(
          order.orderCommitSnapshotId === shipment.orderCommitSnapshotId,
          'PHYSICAL_COST_ORDER_COMMIT_LINEAGE_MISMATCH',
          'Shipment belongs to a different order commit than the current execution order',
          { shipmentNoticeId, orderId: order.id },
        );
        const orderCommit = requireEntity(
          await tx.getOrderCommitSnapshot(shipment.orderCommitSnapshotId),
          'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
          { orderCommitSnapshotId: shipment.orderCommitSnapshotId },
        );
        const supplyCommitment = requireEntity(
          await tx.getSupplyCommitment(shipment.supplyCommitmentSnapshotId),
          'SUPPLY_COMMITMENT_NOT_FOUND',
          { supplyCommitmentSnapshotId: shipment.supplyCommitmentSnapshotId },
        );

        invariant(
          shipment.fulfillmentPlanSnapshotId &&
            shipment.orderId === orderCommit.orderId &&
            shipment.orderCommitSnapshotId === orderCommit.id &&
            supplyCommitment.id === shipment.supplyCommitmentSnapshotId &&
            supplyCommitment.orderId === orderCommit.orderId &&
            supplyCommitment.orderCommitSnapshotId === orderCommit.id,
          'PHYSICAL_COST_EXECUTION_LINEAGE_MISMATCH',
          'Physical actual cost requires exact order, supply, fulfillment and shipment lineage',
          { shipmentNoticeId },
        );

        const costClose = await tx.getCostCloseByOrderCommitSnapshotId(orderCommit.id);
        invariant(
          !costClose,
          'COST_CLOSE_REQUIRES_POST_CLOSE_ADJUSTMENT',
          'Cost is closed for this order commit; use a post-close adjustment path',
          { orderId: order.id, orderCommitSnapshotId: orderCommit.id, costCloseSnapshotId: costClose?.id },
        );

        invariant(
          PHYSICAL_ACTUAL_COST_TYPES.includes(input.costType),
          'PHYSICAL_ACTUAL_COST_TYPE_INVALID',
          'Cost type is not valid for physical fulfillment actual cost',
          { costType: input.costType, allowedCostTypes: PHYSICAL_ACTUAL_COST_TYPES },
        );

        const fxRateSnapshot = input.fxRateSnapshotId
          ? requireEntity(
            await tx.getFxRateSnapshot(input.fxRateSnapshotId),
            'FX_RATE_SNAPSHOT_NOT_FOUND',
            { fxRateSnapshotId: input.fxRateSnapshotId },
          )
          : null;

        let discrepancy = null;
        let receipt = null;
        if (input.receiptDiscrepancySnapshotId) {
          discrepancy = requireEntity(
            await tx.getReceiptDiscrepancy(input.receiptDiscrepancySnapshotId),
            'RECEIPT_DISCREPANCY_NOT_FOUND',
            { receiptDiscrepancySnapshotId: input.receiptDiscrepancySnapshotId },
          );
          invariant(
            discrepancy.shipmentNoticeSnapshotId === shipment.id &&
              discrepancy.fulfillmentPlanSnapshotId === shipment.fulfillmentPlanSnapshotId,
            'PHYSICAL_COST_DISCREPANCY_LINEAGE_MISMATCH',
            'Receipt discrepancy belongs to another shipment execution lineage',
            { receiptDiscrepancySnapshotId: discrepancy.id, shipmentNoticeId: shipment.id },
          );
        }

        const receiptId = input.receiptSnapshotId ?? discrepancy?.latestReceiptSnapshotId ?? null;
        if (receiptId) {
          receipt = requireEntity(await tx.getReceipt(receiptId), 'RECEIPT_NOT_FOUND', { receiptSnapshotId: receiptId });
          invariant(
            receipt.shipmentNoticeSnapshotId === shipment.id &&
              receipt.fulfillmentPlanSnapshotId === shipment.fulfillmentPlanSnapshotId &&
              receipt.orderCommitSnapshotId === shipment.orderCommitSnapshotId,
            'PHYSICAL_COST_RECEIPT_LINEAGE_MISMATCH',
            'Receipt belongs to another shipment execution lineage',
            { receiptSnapshotId: receipt.id, shipmentNoticeId: shipment.id },
          );
          if (discrepancy) {
            invariant(
              discrepancy.receiptSnapshotIds.includes(receipt.id),
              'PHYSICAL_COST_RECEIPT_DISCREPANCY_MISMATCH',
              'Receipt is not part of the selected discrepancy snapshot',
              { receiptSnapshotId: receipt.id, receiptDiscrepancySnapshotId: discrepancy.id },
            );
          }
        }

        invariant(
          !RECEIPT_REQUIRED_COST_TYPES.has(input.costType) || receipt,
          'PHYSICAL_ACTUAL_COST_RECEIPT_REQUIRED',
          'Quality and rework costs require immutable receipt evidence',
          { costType: input.costType, shipmentNoticeId: shipment.id },
        );
        if (input.sku != null) {
          invariant(
            shipment.lines.some((line) => line.sku === input.sku),
            'PHYSICAL_ACTUAL_COST_SKU_NOT_SHIPPED',
            'SKU-scoped physical cost must reference a SKU present in the immutable shipment notice',
            { sku: input.sku, shipmentNoticeId: shipment.id },
          );
        }

        if (previous) return previous.result;

        const baseEntry = createActualCostLedgerEntry({
          id: nextId('actual-cost'),
          order,
          orderCommit,
          supplyCommitment,
          costType: input.costType,
          amount: input.amount,
          currency: input.currency,
          fxRateSnapshot,
          sku: input.sku ?? null,
          sourceRef: input.sourceRef,
          occurredAt: input.occurredAt,
          recordedAt: clock(),
        });
        const entry = Object.freeze({
          ...baseEntry,
          physicalLineageVersion: 2,
          fulfillmentPlanSnapshotId: shipment.fulfillmentPlanSnapshotId,
          shipmentNoticeSnapshotId: shipment.id,
          receiptSnapshotId: receipt?.id ?? null,
          receiptDiscrepancySnapshotId: discrepancy?.id ?? null,
        });

        await tx.insertPhysicalActualCostEntry(entry);
        await tx.appendOutbox(domainEvent({
          id: nextId('event'),
          type: 'actual-cost.recorded',
          aggregateId: entry.id,
          occurredAt: clock(),
          payload: {
            orderId: entry.orderId,
            orderCommitSnapshotId: entry.orderCommitSnapshotId,
            supplyCommitmentSnapshotId: entry.supplyCommitmentSnapshotId,
            physicalLineageVersion: entry.physicalLineageVersion,
            fulfillmentPlanSnapshotId: entry.fulfillmentPlanSnapshotId,
            shipmentNoticeSnapshotId: entry.shipmentNoticeSnapshotId,
            receiptSnapshotId: entry.receiptSnapshotId,
            receiptDiscrepancySnapshotId: entry.receiptDiscrepancySnapshotId,
            costType: entry.costType,
            sourceAmount: entry.sourceAmount,
            sourceCurrency: entry.sourceCurrency,
            fxRateSnapshotId: entry.fxRateSnapshotId,
            amount: entry.amount,
            currency: entry.currency,
            sku: entry.sku,
            sourceRef: entry.sourceRef,
          },
          metadata: { commandId, actorId },
        }));
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: entry, completedAt: clock() }));
        return entry;
      });
    },
  });
}

function requireEntity(entity, code, details) {
  invariant(entity, code, 'Entity not found', details);
  return entity;
}
function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}
