import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createFulfillmentPlanSnapshot,
  createReceiptDiscrepancySnapshot,
  createReceiptSnapshot,
  createShipmentNoticeSnapshot,
} from '../modules/fulfillment/public.mjs';

export function createFulfillmentService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'FULFILLMENT_STORE_REQUIRED', 'Fulfillment store is required');

  function execute(commandId, fingerprint, actorId, authorize, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await authorize(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

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

  async function authorizeTradeRead(tx, actorId, value) {
    const brandMembership = await tx.getMembership(value.brandId, actorId);
    if (brandMembership?.status === 'active') {
      assertCapability(brandMembership, CAPABILITIES.LOGISTICS_READ);
      return;
    }
    const shopMembership = await tx.getMembership(value.shopId, actorId);
    assertCapability(shopMembership, CAPABILITIES.LOGISTICS_READ);
  }

  return Object.freeze({
    createFulfillmentPlan(commandId, actorId, orderId, input) {
      return execute(
        commandId,
        `createFulfillmentPlan:${actorId}:${orderId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          const membership = await tx.getMembership(order.brandId, actorId);
          assertCapability(membership, CAPABILITIES.FULFILLMENT_MANAGE);
          invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Fulfillment requires an immutable order commit snapshot', { orderId });
          const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
          const supplyCommitment = requireEntity(await tx.getSupplyCommitment(input.supplyCommitmentSnapshotId), 'SUPPLY_COMMITMENT_NOT_FOUND', { supplyCommitmentSnapshotId: input.supplyCommitmentSnapshotId });
          const reservations = await tx.listReservations(orderId);
          return Object.freeze({ order, orderCommit, supplyCommitment, reservations });
        },
        async (tx, { order, orderCommit, supplyCommitment, reservations }) => {
          const plan = createFulfillmentPlanSnapshot({
            id: nextId('fulfillment-plan'),
            order,
            orderCommit,
            supplyCommitment,
            reservations,
            shipFrom: input.shipFrom,
            shipTo: input.shipTo,
            plannedShipAt: input.plannedShipAt,
            expectedDeliveryAt: input.expectedDeliveryAt,
            createdAt: clock(),
          });
          await tx.insertFulfillmentPlan(plan);
          await append(tx, 'fulfillment.plan.created.v1', plan.id, {
            orderId: plan.orderId,
            orderCommitSnapshotId: plan.orderCommitSnapshotId,
            supplyCommitmentSnapshotId: plan.supplyCommitmentSnapshotId,
            lineCount: plan.lines.length,
            plannedShipAt: plan.plannedShipAt,
            expectedDeliveryAt: plan.expectedDeliveryAt,
            contentHash: plan.contentHash,
          }, commandId, actorId);
          return plan;
        },
      );
    },

    createShipmentNotice(commandId, actorId, fulfillmentPlanId, input) {
      return execute(
        commandId,
        `createShipmentNotice:${actorId}:${fulfillmentPlanId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const plan = requireEntity(await tx.getFulfillmentPlan(fulfillmentPlanId), 'FULFILLMENT_PLAN_NOT_FOUND', { fulfillmentPlanId });
          const membership = await tx.getMembership(plan.brandId, actorId);
          assertCapability(membership, CAPABILITIES.FULFILLMENT_MANAGE);
          const priorShipments = await tx.listShipmentNotices(fulfillmentPlanId);
          return Object.freeze({ plan, priorShipments });
        },
        async (tx, { plan, priorShipments }) => {
          const shipment = createShipmentNoticeSnapshot({
            id: nextId('shipment-notice'),
            fulfillmentPlan: plan,
            priorShipments,
            shipmentNumber: input.shipmentNumber,
            carrier: input.carrier,
            serviceLevel: input.serviceLevel,
            trackingNumber: input.trackingNumber ?? null,
            lines: input.lines,
            shippedAt: input.shippedAt,
            expectedDeliveryAt: input.expectedDeliveryAt,
            createdAt: clock(),
          });
          await tx.insertShipmentNotice(shipment);
          await append(tx, 'fulfillment.shipment-notice.created.v1', shipment.id, {
            orderId: shipment.orderId,
            orderCommitSnapshotId: shipment.orderCommitSnapshotId,
            fulfillmentPlanSnapshotId: shipment.fulfillmentPlanSnapshotId,
            shipmentNumber: shipment.shipmentNumber,
            lineCount: shipment.lines.length,
            contentHash: shipment.contentHash,
          }, commandId, actorId);
          return shipment;
        },
      );
    },

    recordReceipt(commandId, actorId, shipmentNoticeId, input) {
      return execute(
        commandId,
        `recordReceipt:${actorId}:${shipmentNoticeId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const shipment = requireEntity(await tx.getShipmentNotice(shipmentNoticeId), 'SHIPMENT_NOTICE_NOT_FOUND', { shipmentNoticeId });
          const membership = await tx.getMembership(shipment.shopId, actorId);
          assertCapability(membership, CAPABILITIES.RECEIPT_MANAGE);
          invariant(membership.organisationId === shipment.shopId, 'RECEIPT_SHOP_MEMBERSHIP_REQUIRED', 'Only the receiving retailer organisation can record a receipt', { shopId: shipment.shopId, actorId });
          const priorReceipts = await tx.listReceipts(shipmentNoticeId);
          return Object.freeze({ shipment, priorReceipts });
        },
        async (tx, { shipment, priorReceipts }) => {
          const receipt = createReceiptSnapshot({
            id: nextId('receipt'),
            shipment,
            priorReceipts,
            receiptReference: input.receiptReference,
            receivedBy: input.receivedBy,
            receiptComplete: input.receiptComplete,
            lines: input.lines,
            receivedAt: input.receivedAt,
            createdAt: clock(),
          });
          await tx.insertReceipt(receipt);
          const discrepancy = createReceiptDiscrepancySnapshot({
            id: nextId('receipt-discrepancy'),
            shipment,
            receipts: [...priorReceipts, receipt],
            createdAt: clock(),
          });
          await tx.insertReceiptDiscrepancy(discrepancy);
          await append(tx, 'fulfillment.receipt.recorded.v1', receipt.id, {
            orderId: receipt.orderId,
            orderCommitSnapshotId: receipt.orderCommitSnapshotId,
            shipmentNoticeSnapshotId: receipt.shipmentNoticeSnapshotId,
            receiptComplete: receipt.receiptComplete,
            contentHash: receipt.contentHash,
          }, commandId, actorId);
          await append(tx, 'fulfillment.receipt-discrepancy.actualized.v1', discrepancy.id, {
            orderId: discrepancy.orderId,
            shipmentNoticeSnapshotId: discrepancy.shipmentNoticeSnapshotId,
            latestReceiptSnapshotId: discrepancy.latestReceiptSnapshotId,
            status: discrepancy.status,
            issueCount: discrepancy.issueCount,
            contentHash: discrepancy.contentHash,
          }, commandId, actorId);
          return Object.freeze({ receipt, discrepancy });
        },
      );
    },

    getFulfillmentPlanForActor(actorId, fulfillmentPlanId) {
      return store.transaction(async (tx) => {
        const plan = requireEntity(await tx.getFulfillmentPlan(fulfillmentPlanId), 'FULFILLMENT_PLAN_NOT_FOUND', { fulfillmentPlanId });
        await authorizeTradeRead(tx, actorId, plan);
        return plan;
      });
    },

    getShipmentNoticeForActor(actorId, shipmentNoticeId) {
      return store.transaction(async (tx) => {
        const shipment = requireEntity(await tx.getShipmentNotice(shipmentNoticeId), 'SHIPMENT_NOTICE_NOT_FOUND', { shipmentNoticeId });
        await authorizeTradeRead(tx, actorId, shipment);
        return shipment;
      });
    },

    getReceiptForActor(actorId, receiptId) {
      return store.transaction(async (tx) => {
        const receipt = requireEntity(await tx.getReceipt(receiptId), 'RECEIPT_NOT_FOUND', { receiptId });
        await authorizeTradeRead(tx, actorId, receipt);
        return receipt;
      });
    },

    getReceiptDiscrepancyForActor(actorId, discrepancyId) {
      return store.transaction(async (tx) => {
        const discrepancy = requireEntity(await tx.getReceiptDiscrepancy(discrepancyId), 'RECEIPT_DISCREPANCY_NOT_FOUND', { discrepancyId });
        await authorizeTradeRead(tx, actorId, discrepancy);
        return discrepancy;
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
