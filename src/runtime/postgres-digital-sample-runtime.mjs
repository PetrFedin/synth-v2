import { assertCapability } from '../modules/access-control/public.mjs';
import { createDigitalSampleService } from '../application/digital-sample-service.mjs';
import { createPostgresDigitalSampleStore } from '../infrastructure/postgres-digital-sample-store.mjs';

export function createPostgresDigitalSampleRuntime(options = {}) {
  const store = createPostgresDigitalSampleStore({ pool: options.pool });
  const service = createDigitalSampleService({
    store,
    authorizeMembership: assertCapability,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  return Object.freeze({ store, service });
}
