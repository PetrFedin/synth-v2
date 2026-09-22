import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

/**
 * «Где товар сейчас» — один ответ на один заказ.
 *
 * Читать может любая сторона сделки: бренд отгружает, магазин принимает, и обе имеют право видеть
 * одну и ту же цепочку. Право на чтение спрашивается у той организации, в которой состоит
 * спрашивающий, — иначе ответ пришлось бы собирать из двух разных прав на один и тот же факт.
 *
 * @param {{ store?: any, reader?: any }} [options]
 */
export function createOrderFulfillmentViewService({ store, reader } = {}) {
  invariant(store && typeof store.transaction === 'function', 'ORDER_FULFILLMENT_STORE_REQUIRED', 'Order store is required');
  invariant(reader && typeof reader.readOrderFulfillment === 'function', 'ORDER_FULFILLMENT_READER_REQUIRED', 'Order fulfillment reader is required');

  return Object.freeze({
    async getOrderFulfillmentForActor(actorId, orderId) {
      const order = await store.transaction(async (tx) => {
        const found = await tx.getOrder(orderId);
        invariant(found, 'ORDER_NOT_FOUND', 'Order not found', { orderId });
        const brandMembership = await tx.getMembership(found.brandId, actorId);
        const shopMembership = await tx.getMembership(found.shopId, actorId);
        const membership = brandMembership ?? shopMembership;
        assertCapability(membership, CAPABILITIES.LOGISTICS_READ);
        return found;
      });
      const plans = await reader.readOrderFulfillment(order.id);
      return Object.freeze({ orderId: order.id, brandId: order.brandId, shopId: order.shopId, currency: order.currency, plans });
    },
  });
}
