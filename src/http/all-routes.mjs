import { createProductionExecutionRoutes } from './production-execution-routes.mjs';
import { createProductionOrderRoutes } from './production-order-routes.mjs';
import { createSampleRoutes } from './sample-routes.mjs';
import { createSourcingRoutes } from './sourcing-routes.mjs';
import { createTechPackRoutes } from './tech-pack-routes.mjs';
import { createWholesaleRoutes as createCoreWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';

export function createWholesaleRoutes(services = {}) {
  return Object.freeze([
    ...createCoreWholesaleRoutes(services),
    ...createSampleRoutes({ samples: services.samples }),
    ...createSourcingRoutes({ sourcing: services.sourcing }),
    ...createTechPackRoutes({ techPacks: services.techPacks }),
    ...createProductionOrderRoutes({ productionOrders: services.productionOrders }),
    ...createProductionExecutionRoutes({ productionExecutions: services.productionExecutions }),
  ]);
}

export { matchWholesaleRoute };
