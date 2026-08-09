import { invariant } from '../core/errors.mjs';
import { createOrderEconomicsRouteBundle } from '../http/order-economics-route-bundle.mjs';
import { wholesaleV2CompleteOpenApi } from '../http/v2-complete-openapi.mjs';
import { createPostgresWholesaleRuntime } from './postgres-base-runtime.mjs';
import { createPostgresOrderEconomicsRuntime } from './postgres-order-economics-runtime.mjs';

export function createPostgresSynthaV2Runtime(options = {}) {
  invariant(options.pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const base = createPostgresWholesaleRuntime(options);
  const economics = createPostgresOrderEconomicsRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const orderEconomics = economics.service;
  const orderEconomicsRoutes = createOrderEconomicsRouteBundle({ orderEconomics });

  return Object.freeze({
    ...base,
    orderEconomicsStore: economics.economicsStore,
    orderMarginBridgeReader: economics.marginBridgeReader,
    orderEconomics,
    orderEconomicsRoutes,
    openApi: wholesaleV2CompleteOpenApi,
  });
}
