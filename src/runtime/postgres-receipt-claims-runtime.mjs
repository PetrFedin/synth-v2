import { invariant } from '../core/errors.mjs';
import { createReceiptClaimsService } from '../application/receipt-claims-service.mjs';
import { createPostgresReceiptClaimsStore } from '../infrastructure/postgres-receipt-claims-store.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresReceiptClaimsRuntime({ pool, clock, nextId } = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresReceiptClaimsStore({ pool });
  const service = createReceiptClaimsService({ store, nextId: resolveRuntimeIdGenerator(nextId), ...(clock ? { clock } : {}) });
  return Object.freeze({ store, service });
}
