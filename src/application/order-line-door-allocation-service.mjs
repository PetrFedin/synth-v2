import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { orderLineDoorAllocation, assertAllocationWithinOrderedQuantity } from '../modules/order-line-door-allocations/public.mjs';

/**
 * Распределение строки заказа по точкам розницы магазина.
 *
 * Только магазин распределяет свой собственный заказ по своим собственным дверям — бренд читает
 * результат (та же способность, что уже открывает диалог «Поставка»), но не решает за магазин,
 * куда тот развозит свой товар.
 *
 * @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options]
 */
export function createOrderLineDoorAllocationService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'ORDER_LINE_DOOR_ALLOCATION_STORE_REQUIRED', 'Order line door allocation store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, orderId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: orderId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  async function loadOrder(tx, orderId) {
    const order = await tx.getOrder(orderId);
    invariant(order, 'ORDER_NOT_FOUND', 'Order not found', { orderId });
    return order;
  }

  return Object.freeze({
    setOrderLineDoorAllocation(commandId, actorId, orderId, input) {
      const lineNo = input?.lineNo;
      const retailDoorId = input?.retailDoorId;
      const quantity = input?.quantity ?? null;
      const fingerprint = `orderLineDoorAllocation.set:${actorId}:${orderId}:${lineNo}:${retailDoorId}:${canonicalJson(quantity)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = await loadOrder(tx, orderId);
          invariant(Number.isInteger(lineNo) && lineNo >= 1 && lineNo <= order.lines.length, 'ORDER_LINE_DOOR_ALLOCATION_LINE_NOT_FOUND', 'Order does not have that line', { orderId, lineNo, lineCount: order.lines.length });
          // Только магазин распределяет свой собственный заказ по своим дверям: членство спрашивается
          // именно у order.shopId, а не у брендовой стороны заказа — у бренда там просто не будет
          // членства, и запрос откажет самим отсутствием активного членства, а не отдельным кодом.
          const membership = await tx.getMembership(order.shopId, actorId);
          assertCapability(membership, CAPABILITIES.ORDER_WRITE);
          const door = await tx.getRetailDoor(retailDoorId);
          invariant(door, 'ORDER_LINE_DOOR_ALLOCATION_DOOR_NOT_FOUND', 'Retail door not found', { retailDoorId });
          invariant(door.shopId === order.shopId, 'ORDER_LINE_DOOR_ALLOCATION_DOOR_ORGANISATION_MISMATCH', 'Retail door does not belong to this order’s shop', { shopId: order.shopId, retailDoorId });
          invariant(door.status === 'active', 'ORDER_LINE_DOOR_ALLOCATION_DOOR_INACTIVE', 'Retail door is not active', { retailDoorId });
          const existing = await tx.listOrderLineDoorAllocations(orderId);
          const orderedQuantity = order.lines[lineNo - 1].quantity;
          return Object.freeze({ order, existing: existing.filter((entry) => entry.lineNo === lineNo), orderedQuantity });
        },
        async (tx, { existing, orderedQuantity }) => {
          const trimmedQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : null;
          if (!trimmedQuantity) {
            await tx.deleteOrderLineDoorAllocation({ orderId, lineNo, retailDoorId });
            await append(tx, 'order.line-door-allocation-cleared', orderId, { lineNo, retailDoorId }, commandId, actorId);
            return Object.freeze({ orderId, lineNo, retailDoorId, quantity: null });
          }
          assertAllocationWithinOrderedQuantity(existing, retailDoorId, trimmedQuantity, orderedQuantity);
          const value = orderLineDoorAllocation({ orderId, lineNo, retailDoorId, quantity: trimmedQuantity, updatedAt: clock(), updatedBy: actorId });
          await tx.upsertOrderLineDoorAllocation(value);
          await append(tx, 'order.line-door-allocation-set', orderId, { lineNo, retailDoorId, quantity: value.quantity }, commandId, actorId);
          return value;
        },
      );
    },

    getOrderLineDoorAllocationsForActor(actorId, orderId) {
      return store.transaction(async (tx) => {
        const order = await loadOrder(tx, orderId);
        const brandMembership = await tx.getMembership(order.brandId, actorId);
        const shopMembership = await tx.getMembership(order.shopId, actorId);
        assertCapability(brandMembership ?? shopMembership, CAPABILITIES.LOGISTICS_READ);
        const allocations = await tx.listOrderLineDoorAllocations(order.id);
        return Object.freeze({ orderId: order.id, allocations: Object.freeze(allocations) });
      });
    },
  });
}

function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
