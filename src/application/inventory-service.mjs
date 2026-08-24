import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createReceiptInventoryMovements } from '../modules/inventory/public.mjs';

export function createInventoryService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'INVENTORY_STORE_REQUIRED', 'Inventory store is required');

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId,
      occurredAt: clock(),
      payload,
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    postReceipt(commandId, actorId, receiptSnapshotId) {
      invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      const fingerprint = `postReceiptInventory:${actorId}:${receiptSnapshotId}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });

        const receipt = requireEntity(await tx.lockReceipt(receiptSnapshotId), 'RECEIPT_NOT_FOUND', { receiptSnapshotId });
        const membership = await tx.getMembership(receipt.shopId, actorId);
        assertCapability(membership, CAPABILITIES.INVENTORY_MANAGE);
        invariant(membership.organisationId === receipt.shopId, 'INVENTORY_SHOP_MEMBERSHIP_REQUIRED', 'Only the receiving retailer organisation can post its receipt to inventory', { receiptSnapshotId, shopId: receipt.shopId, actorId });
        if (previous) return previous.result;

        const existing = await tx.listMovementsForReceipt(receipt.id);
        invariant(existing.length === 0, 'INVENTORY_RECEIPT_ALREADY_POSTED', 'Receipt has already been posted to the inventory ledger', { receiptSnapshotId: receipt.id, movementIds: existing.map((entry) => entry.id) });

        const shipment = requireEntity(await tx.getShipmentNotice(receipt.shipmentNoticeSnapshotId), 'SHIPMENT_NOTICE_NOT_FOUND', { shipmentNoticeSnapshotId: receipt.shipmentNoticeSnapshotId });
        const plan = requireEntity(await tx.getFulfillmentPlan(receipt.fulfillmentPlanSnapshotId), 'FULFILLMENT_PLAN_NOT_FOUND', { fulfillmentPlanSnapshotId: receipt.fulfillmentPlanSnapshotId });
        const postedAt = clock();
        const movements = createReceiptInventoryMovements({
          idForLine: () => nextId('inventory-movement'),
          receipt,
          shipment,
          fulfillmentPlan: plan,
          postedAt,
        });

        for (const movement of movements) {
          await tx.insertMovement(movement);
          await append(tx, 'inventory.movement-posted.v1', movement.id, {
            movementType: movement.movementType,
            lineageVersion: movement.lineageVersion,
            shopId: movement.shopId,
            warehouseLocationId: movement.warehouseLocationId,
            orderLineNo: movement.orderLineNo,
            productSkuId: movement.productSkuId,
            sku: movement.sku,
            receiptSnapshotId: movement.receiptSnapshotId,
            shipmentNoticeSnapshotId: movement.shipmentNoticeSnapshotId,
            fulfillmentPlanSnapshotId: movement.fulfillmentPlanSnapshotId,
            orderCommitSnapshotId: movement.orderCommitSnapshotId,
            onHandDelta: movement.onHandDelta,
            availableDelta: movement.availableDelta,
            quarantineDelta: movement.quarantineDelta,
            contentHash: movement.contentHash,
          }, commandId, actorId);
        }

        const result = Object.freeze({
          receiptSnapshotId: receipt.id,
          shopId: receipt.shopId,
          warehouseLocationId: plan.shipTo.locationId,
          movementIds: Object.freeze(movements.map((movement) => movement.id)),
          movements,
          postedAt,
        });
        await append(tx, 'inventory.receipt-posted.v1', receipt.id, {
          receiptSnapshotId: receipt.id,
          shopId: receipt.shopId,
          warehouseLocationId: result.warehouseLocationId,
          movementIds: result.movementIds,
          movementCount: movements.length,
          productSkuIds: Object.freeze([...new Set(movements.map((movement) => movement.productSkuId).filter(Boolean))].sort()),
          onHandDelta: movements.reduce((sum, movement) => sum + movement.onHandDelta, 0),
          availableDelta: movements.reduce((sum, movement) => sum + movement.availableDelta, 0),
          quarantineDelta: movements.reduce((sum, movement) => sum + movement.quarantineDelta, 0),
        }, commandId, actorId);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
        return result;
      });
    },

    getWarehousePositionsForActor(actorId, shopId, warehouseLocationId, { sku = null, productSkuId = null } = {}) {
      return store.transaction(async (tx) => {
        const membership = await tx.getMembership(shopId, actorId);
        assertCapability(membership, CAPABILITIES.INVENTORY_READ);
        invariant(membership.organisationId === shopId, 'INVENTORY_SHOP_MEMBERSHIP_REQUIRED', 'Warehouse inventory is readable only by members of the owning retailer organisation', { shopId, actorId });
        const positions = await tx.getWarehousePositions(shopId, warehouseLocationId, sku, productSkuId);
        return Object.freeze({
          shopId,
          warehouseLocationId,
          sku,
          productSkuId,
          positions: Object.freeze(positions),
          asOf: clock(),
        });
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
