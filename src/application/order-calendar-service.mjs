import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability, roleHasCapability } from '../modules/access-control/public.mjs';
import { createCalendarMilestone } from '../modules/calendar/public.mjs';

/**
 * Календарные вехи заказа — общая на обе стороны сделки таймлиния поверх уже существующей
 * `calendar_milestones`, которая до сих пор писала только вехи открытия сделки.
 *
 * `visibility` решает, кто видит веху: `private` — только организация, что её завела, `shared` —
 * обе стороны заказа. Поле уже существовало в домене, но ни один читатель его не спрашивал; здесь
 * оно наконец действует.
 *
 * @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options]
 */
export function createOrderCalendarService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'ORDER_CALENDAR_STORE_REQUIRED', 'Order calendar store is required');

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
    addOrderCalendarMilestone(commandId, actorId, orderId, input) {
      const fingerprint = `orderCalendarMilestone.add:${actorId}:${orderId}:${canonicalJson(input ?? null)}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = await loadOrder(tx, orderId);
          const brandMembership = await tx.getMembership(order.brandId, actorId);
          const shopMembership = await tx.getMembership(order.shopId, actorId);
          // Веху заводит та сторона, за которую пишет актёр, а не тело запроса — иначе бренд мог бы
          // завести веху от имени магазина, а это уже не заметка о своём заказе, а подмена автора.
          let ownerOrganisationId;
          if (brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.brandId;
          else if (shopMembership?.status === 'active' && roleHasCapability(shopMembership.role, CAPABILITIES.ORDER_WRITE)) ownerOrganisationId = order.shopId;
          else assertCapability(brandMembership ?? shopMembership, CAPABILITIES.ORDER_WRITE);
          return Object.freeze({ order, ownerOrganisationId });
        },
        async (tx, { order, ownerOrganisationId }) => {
          const milestone = createCalendarMilestone({
            id: nextId('calendar-milestone'),
            ownerOrganisationId,
            cycleId: order.cycleId,
            type: 'order',
            title: input?.title,
            startsAt: input?.startsAt,
            visibility: input?.visibility ?? 'private',
          });
          await tx.insertCalendarMilestone(milestone);
          await append(tx, 'order.calendar-milestone-added', order.id, {
            milestoneId: milestone.id, title: milestone.title, startsAt: milestone.startsAt, visibility: milestone.visibility,
          }, commandId, actorId);
          return milestone;
        },
      );
    },

    getOrderCalendarMilestonesForActor(actorId, orderId) {
      return store.transaction(async (tx) => {
        const order = await loadOrder(tx, orderId);
        const brandMembership = await tx.getMembership(order.brandId, actorId);
        const shopMembership = await tx.getMembership(order.shopId, actorId);
        assertCapability(brandMembership ?? shopMembership, CAPABILITIES.LOGISTICS_READ);
        const ownOrganisationId = brandMembership?.status === 'active' && roleHasCapability(brandMembership.role, CAPABILITIES.LOGISTICS_READ)
          ? order.brandId
          : order.shopId;
        const milestones = await tx.listCalendarMilestonesByCycle(order.cycleId);
        const visible = milestones.filter((milestone) => milestone.ownerOrganisationId === ownOrganisationId || milestone.visibility === 'shared');
        return Object.freeze({ orderId: order.id, milestones: Object.freeze(visible) });
      });
    },
  });
}

function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
