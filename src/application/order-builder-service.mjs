import { domainEvent } from '../core/events.mjs';
import { DomainError, invariant } from '../core/errors.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { createOrderDraft, acceptOrderTerms, attachReadyOrder, cancelAttachedOrder } from '../modules/orders/public.mjs';
import { advanceCommercialCycle, attachOrder, cancelCommercialCycleOrder } from '../modules/commercial-cycle/public.mjs';

const INVENTORY_ERROR_CODES = new Set([
  'CATALOG_SKU_NOT_FOUND',
  'CATALOG_SKU_NOT_PUBLISHED',
  'CATALOG_MOQ_NOT_MET',
  'CATALOG_AVAILABILITY_EXCEEDED',
  'CATALOG_RESERVATION_NOT_FOUND',
  'CATALOG_RELEASE_EXCEEDS_RESERVED',
]);

export function createOrderBuilderService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  assertWholesaleStore(store);

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(previous.fingerprint === fingerprint, 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createOrderDraft(commandId, actorId, { selectionId, terms }) {
      return execute(commandId, `createOrderDraft:${actorId}:${selectionId}:${JSON.stringify(terms)}`, actorId, async (tx) => {
        const selection = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
        const cycle = requireEntity(await tx.getCycle(selection.cycleId), 'CYCLE_NOT_FOUND', { cycleId: selection.cycleId });
        const collection = requireEntity(await tx.getCollection(selection.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: selection.collectionId });
        invariant(cycle.stage === 'order-builder', 'ORDER_BUILDER_STAGE_REQUIRED', 'Cycle must be at order-builder stage', { stage: cycle.stage });
        invariant(!await tx.getOrderByCycle(cycle.id), 'ORDER_FOR_CYCLE_EXISTS', 'Cycle already has an order draft', { cycleId: cycle.id });
        await assertOrganisationActor(tx, selection.shopId, actorId, CAPABILITIES.ORDER_WRITE);
        const order = createOrderDraft({ id: nextId('order'), selection, currency: collection.currency, terms, createdAt: clock() });
        await tx.insertOrder(order);
        await append(tx, 'order.draft-created', order.id, { selectionId, totalAmount: order.totalAmount, currency: order.currency }, commandId, actorId);
        return order;
      });
    },

    acceptTerms(commandId, actorId, { orderId, organisationId }) {
      return execute(commandId, `acceptOrderTerms:${actorId}:${orderId}:${organisationId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        invariant(organisationId === current.brandId || organisationId === current.shopId, 'ORDER_PARTY_INVALID', 'Organisation is not an order party', { organisationId });
        await assertOrganisationActor(tx, organisationId, actorId, CAPABILITIES.ORDER_CONFIRM);
        const updated = acceptOrderTerms(current, organisationId, clock());
        await tx.saveOrder(updated, current.version);
        await append(tx, 'order.terms-accepted', orderId, { organisationId, status: updated.status }, commandId, actorId);
        return updated;
      });
    },

    attachOrderToCycle(commandId, actorId, orderId) {
      return execute(commandId, `attachOrderToCycle:${actorId}:${orderId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
        authorizeOrderMutation(await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId, cycle);
        invariant(cycle.stage === 'order-builder', 'ORDER_BUILDER_STAGE_REQUIRED', 'Cycle must be at order-builder stage', { stage: cycle.stage });
        const readyOrder = attachReadyOrder(current, clock());
        const orderStage = advanceCommercialCycle(cycle, 'order', clock());
        await tx.saveCycle(orderStage, cycle.version);
        const cycleWithOrder = attachOrder(orderStage, readyOrder, clock());
        await tx.saveCycle(cycleWithOrder, orderStage.version);
        await tx.saveOrder(readyOrder, current.version);
        await append(tx, 'order.attached', orderId, { cycleId: cycle.id, totalAmount: readyOrder.totalAmount }, commandId, actorId);
        await append(tx, 'commercial-cycle.advanced', cycle.id, { from: cycle.stage, to: orderStage.stage, version: orderStage.version }, commandId, actorId);
        return Object.freeze({ order: readyOrder, cycle: cycleWithOrder });
      }).catch(translateInventoryError);
    },

    cancelOrder(commandId, actorId, { orderId, reason }) {
      return execute(commandId, `cancelOrder:${actorId}:${orderId}:${reason}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
        const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
        authorizeOrderMutation(await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId, cycle);
        const cancelled = cancelAttachedOrder(current, reason, clock());
        const cancelledCycle = cancelCommercialCycleOrder(cycle, cancelled, clock());
        await tx.saveCycle(cancelledCycle, cycle.version);
        await tx.saveOrder(cancelled, current.version);
        await append(tx, 'order.cancelled', orderId, {
          cycleId: cycle.id,
          reason: cancelled.cancellationReason,
          releasedLines: cancelled.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        }, commandId, actorId);
        return Object.freeze({ order: cancelled, cycle: cancelledCycle });
      }).catch(translateInventoryError);
    },
  });
}

async function assertOrganisationActor(tx, organisationId, actorId, capability) {
  const membership = await tx.getMembership(organisationId, actorId);
  assertCapability(membership, capability);
}
function authorizeOrderMutation(memberships, actorId, cycle) {
  return assertTradeCapability({
    memberships,
    actorId,
    brandId: cycle.brandId,
    shopId: cycle.shopId,
    capability: CAPABILITIES.ORDER_WRITE,
  });
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }

function translateInventoryError(error) {
  if (error?.code === 'P0001' && INVENTORY_ERROR_CODES.has(error.message)) {
    let details = {};
    try { details = error.detail ? JSON.parse(error.detail) : {}; } catch { details = {}; }
    throw new DomainError(error.message, inventoryMessage(error.message), details);
  }
  throw error;
}
function inventoryMessage(code) {
  return ({
    CATALOG_SKU_NOT_FOUND: 'Catalog SKU not found during inventory mutation',
    CATALOG_SKU_NOT_PUBLISHED: 'Order contains an unavailable catalog SKU',
    CATALOG_MOQ_NOT_MET: 'Order quantity is below minimum order quantity',
    CATALOG_AVAILABILITY_EXCEEDED: 'Order quantity exceeds available-to-sell',
    CATALOG_RESERVATION_NOT_FOUND: 'Order inventory reservation is missing',
    CATALOG_RELEASE_EXCEEDS_RESERVED: 'Inventory release exceeds reserved quantity',
  })[code] ?? 'Inventory mutation failed';
}
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
