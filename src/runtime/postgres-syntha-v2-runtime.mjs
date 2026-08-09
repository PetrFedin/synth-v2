import { invariant } from '../core/errors.mjs';
import { createEconomicsRouteBundle } from '../http/economics-route-bundle.mjs';
import { wholesaleV2CompleteOpenApi } from '../http/v2-complete-openapi.mjs';
import { createPostgresWholesaleRuntime } from './postgres-runtime.mjs';

export function createPostgresSynthaV2Runtime(options = {}) {
  invariant(options.pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const runtime = createPostgresWholesaleRuntime(options);
  const economicsRoutes = createEconomicsRouteBundle({
    orderEconomics: runtime.orderEconomics,
    costAllocation: runtime.costAllocation,
  });

  return Object.freeze({
    ...runtime,
    orderEconomicsRoutes: economicsRoutes,
    economicsRoutes,
    openApi: wholesaleV2CompleteOpenApi,
  });
}
