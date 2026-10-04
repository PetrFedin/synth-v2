import { invariant } from '../core/errors.mjs';
import { createOrderEconomicsPositionService } from '../application/order-economics-position-service.mjs';
import { createOrderEconomicsLedgerService } from '../application/order-economics-ledger-service.mjs';
import { createOrderMarginBridgeService } from '../application/order-margin-bridge-service.mjs';
import { createPostgresOrderEconomicsStore } from '../infrastructure/postgres-order-economics-store.mjs';
import { createPostgresOrderEconomicsLedgerReader } from '../infrastructure/postgres-order-economics-ledger-reader.mjs';
import { createPostgresOrderMarginBridgeReader } from '../infrastructure/postgres-order-margin-bridge-reader.mjs';

export function createPostgresOrderEconomicsReadServices({ pool } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    ...createOrderEconomicsPositionService({ economicsStore: createPostgresOrderEconomicsStore({ pool }) }),
    ...createOrderEconomicsLedgerService({ reader: createPostgresOrderEconomicsLedgerReader({ pool }) }),
    ...createOrderMarginBridgeService({ reader: createPostgresOrderMarginBridgeReader({ pool }) }),
  });
}
