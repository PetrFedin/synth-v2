import { invariant } from '../core/errors.mjs';
import { createFulfillmentService } from '../application/fulfillment-service.mjs';
import { createPhysicalActualCostService } from '../application/physical-actual-cost-service.mjs';
import { createOrderFulfillmentViewService } from '../application/order-fulfillment-view-service.mjs';
import { createPostgresFulfillmentStore } from '../infrastructure/postgres-fulfillment-store.mjs';
import { createPostgresOrderFulfillmentReader } from '../infrastructure/postgres-order-fulfillment-reader.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresFulfillmentRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresFulfillmentStore({ pool });
  const resolvedNextId = resolveRuntimeIdGenerator(nextId);
  const service = Object.freeze({
    ...createFulfillmentService({
      store,
      nextId: resolvedNextId,
      ...(clock ? { clock } : {}),
    }),
    ...createPhysicalActualCostService({
      store,
      nextId: resolvedNextId,
      ...(clock ? { clock } : {}),
    }),
    // Чтение хвоста целиком: отдельная служба, потому что это вопрос «что уже случилось», а не
    // «что сделать дальше», и права у него свои — видеть цепочку вправе обе стороны сделки.
    ...createOrderFulfillmentViewService({ store, reader: createPostgresOrderFulfillmentReader({ pool }) }),
  });
  return Object.freeze({ store, service });
}
