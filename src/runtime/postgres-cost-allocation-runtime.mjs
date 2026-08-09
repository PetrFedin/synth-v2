import { invariant } from '../core/errors.mjs';
import { createCostAllocationService } from '../application/cost-allocation-service.mjs';
import { createPostgresCostAllocationStore } from '../infrastructure/postgres-cost-allocation-store.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresCostAllocationRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresCostAllocationStore({ pool });
  const service = createCostAllocationService({
    store,
    nextId: resolveRuntimeIdGenerator(nextId),
    ...(clock ? { clock } : {}),
  });
  return Object.freeze({ store, service });
}
