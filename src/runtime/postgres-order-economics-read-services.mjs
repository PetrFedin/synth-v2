import { invariant } from '../core/errors.mjs';
import { createOrderEconomicsPositionService } from '../application/order-economics-position-service.mjs';
import { createOrderMarginBridgeService } from '../application/order-margin-bridge-service.mjs';
import { createPostgresOrderEconomicsStore } from '../infrastructure/postgres-order-economics-store.mjs';
import { createPostgresOrderMarginBridgeReader } from '../infrastructure/postgres-order-margin-bridge-reader.mjs';

export function createPostgresOrderEconomicsReadServices({ pool } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    ...createOrderEconomicsPositionService({ economicsStore: createPostgresOrderEconomicsStore({ pool }) }),
    ...createOrderMarginBridgeService({ reader: createPostgresOrderMarginBridgeReader({ pool }) }),
  });
}
