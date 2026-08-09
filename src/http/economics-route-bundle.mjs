import { createOrderEconomicsRouteBundle } from './order-economics-route-bundle.mjs';
import { createCostAllocationRoutes } from './cost-allocation-routes.mjs';

export function createEconomicsRouteBundle({ orderEconomics, costAllocation } = {}) {
  return Object.freeze([
    ...createOrderEconomicsRouteBundle({ orderEconomics }),
    ...createCostAllocationRoutes({ costAllocation }),
  ]);
}
