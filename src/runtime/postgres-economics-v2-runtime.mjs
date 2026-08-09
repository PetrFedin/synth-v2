import { invariant } from '../core/errors.mjs';
import { createEconomicsRouteBundle } from '../http/economics-route-bundle.mjs';
import { wholesaleV2EconomicsOpenApi } from '../http/v2-economics-openapi.mjs';
import { createPostgresCostAllocationRuntime } from './postgres-cost-allocation-runtime.mjs';
import { createPostgresOrderEconomicsRuntime } from './postgres-order-economics-runtime.mjs';

export function createPostgresEconomicsV2Runtime(options = {}) {
  invariant(options.pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const order = createPostgresOrderEconomicsRuntime(options);
  const allocation = createPostgresCostAllocationRuntime(options);
  const routes = createEconomicsRouteBundle({ orderEconomics: order.service, costAllocation: allocation.service });

  return Object.freeze({
    orderEconomicsStore: order.economicsStore,
    orderMarginBridgeReader: order.marginBridgeReader,
    costAllocationStore: allocation.store,
    orderEconomics: order.service,
    costAllocation: allocation.service,
    routes,
    openApi: wholesaleV2EconomicsOpenApi,
  });
}
