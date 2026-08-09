import { invariant } from '../core/errors.mjs';
import { createOrderEconomicsService } from '../application/order-economics-service.mjs';
import { createOrderEconomicsPositionService } from '../application/order-economics-position-service.mjs';
import { createOrderMarginBridgeService } from '../application/order-margin-bridge-service.mjs';
import { createPostgresOrderEconomicsStore } from '../infrastructure/postgres-order-economics-store.mjs';
import { createPostgresOrderMarginBridgeReader } from '../infrastructure/postgres-order-margin-bridge-reader.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresOrderEconomicsRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const runtimeNextId = resolveRuntimeIdGenerator(nextId);
  const economicsStore = createPostgresOrderEconomicsStore({ pool });
  const marginBridgeReader = createPostgresOrderMarginBridgeReader({ pool });

  return Object.freeze({
    economicsStore,
    marginBridgeReader,
    service: Object.freeze({
      ...createOrderEconomicsService({ economicsStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }),
      ...createOrderEconomicsPositionService({ economicsStore }),
      ...createOrderMarginBridgeService({ reader: marginBridgeReader }),
    }),
  });
}
