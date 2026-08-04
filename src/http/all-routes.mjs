import { createSampleRoutes } from './sample-routes.mjs';
import { createTechPackRoutes } from './tech-pack-routes.mjs';
import { createWholesaleRoutes as createCoreWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';

export function createWholesaleRoutes(services = {}) {
  return Object.freeze([
    ...createCoreWholesaleRoutes(services),
    ...createSampleRoutes({ samples: services.samples }),
    ...createTechPackRoutes({ techPacks: services.techPacks }),
  ]);
}

export { matchWholesaleRoute };
