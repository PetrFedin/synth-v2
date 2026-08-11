import { invariant } from '../core/errors.mjs';
import { createSupplierRecoveryService } from '../application/supplier-recovery-service.mjs';
import { createPostgresSupplierRecoveryStore } from '../infrastructure/postgres-supplier-recovery-store.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresSupplierRecoveryRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresSupplierRecoveryStore({ pool });
  const service = createSupplierRecoveryService({ store, nextId: resolveRuntimeIdGenerator(nextId), ...(clock ? { clock } : {}) });
  return Object.freeze({ store, service });
}
