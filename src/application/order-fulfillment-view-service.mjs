import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, ROLE_CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

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
      const { order, seesRecoveries } = await store.transaction(async (tx) => {
        const found = await tx.getOrder(orderId);
        invariant(found, 'ORDER_NOT_FOUND', 'Order not found', { orderId });
        const brandMembership = await tx.getMembership(found.brandId, actorId);
        const shopMembership = await tx.getMembership(found.shopId, actorId);
        const membership = brandMembership ?? shopMembership;
        assertCapability(membership, CAPABILITIES.LOGISTICS_READ);
        // Возврат от поставщика — внутренняя экономика бренда (`getRecoveryForActor` отдаёт его только
        // бренду с правом на маржу). Магазин видит претензию и решение, но не суммы, которые бренд
        // получил от своей фабрики: общий экран цепочки не должен открывать то, что закрыт сам маршрут.
        const seesRecoveries = Boolean(brandMembership?.status === 'active' && brandMembership.organisationId === found.brandId
          && ROLE_CAPABILITIES[brandMembership.role]?.includes(CAPABILITIES.MARGIN_READ));
        return { order: found, seesRecoveries };
      });
      const read = await reader.readOrderFulfillment(order.id);
      const plans = seesRecoveries ? read : Object.freeze(read.map((plan) => Object.freeze({
        ...plan,
        shipments: Object.freeze((plan.shipments ?? []).map(({ supplierRecoveries, ...shipment }) => Object.freeze(shipment))),
      })));
      return Object.freeze({ orderId: order.id, brandId: order.brandId, shopId: order.shopId, currency: order.currency, plans });
    },
  });
}
