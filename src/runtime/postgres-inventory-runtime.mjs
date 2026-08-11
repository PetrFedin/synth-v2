import { invariant } from '../core/errors.mjs';
import { createInventoryService } from '../application/inventory-service.mjs';
import { createPostgresInventoryStore } from '../infrastructure/postgres-inventory-store.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresInventoryRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresInventoryStore({ pool });
  const service = createInventoryService({
    store,
    nextId: resolveRuntimeIdGenerator(nextId),
    ...(clock ? { clock } : {}),
  });
  return Object.freeze({ store, service });
}
