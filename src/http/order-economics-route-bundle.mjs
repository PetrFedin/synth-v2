import { createOrderEconomicsRoutes } from './order-economics-routes.mjs';
import { createOrderMarginBridgeRoutes } from './order-margin-bridge-routes.mjs';

export function createOrderEconomicsRouteBundle({ orderEconomics } = {}) {
  return Object.freeze([
    ...createOrderEconomicsRoutes({ orderEconomics }),
    ...createOrderMarginBridgeRoutes({ orderMarginBridge: orderEconomics }),
  ]);
}
