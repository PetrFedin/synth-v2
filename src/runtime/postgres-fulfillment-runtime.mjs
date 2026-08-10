import { invariant } from '../core/errors.mjs';
import { createFulfillmentService } from '../application/fulfillment-service.mjs';
import { createPhysicalActualCostService } from '../application/physical-actual-cost-service.mjs';
import { createPostgresFulfillmentStore } from '../infrastructure/postgres-fulfillment-store.mjs';
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
  });
  return Object.freeze({ store, service });
}
