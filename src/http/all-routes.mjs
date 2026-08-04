import { createSampleRoutes } from './sample-routes.mjs';
import { createSourcingRoutes } from './sourcing-routes.mjs';
import { createWholesaleRoutes as createCoreWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';

export function createWholesaleRoutes(services = {}) {
  return Object.freeze([
    ...createCoreWholesaleRoutes(services),
    ...createSampleRoutes({ samples: services.samples }),
    ...createSourcingRoutes({ sourcing: services.sourcing }),
  ]);
}

export { matchWholesaleRoute };
