import { createSourcingTechPackAllocationService } from '../application/sourcing-tech-pack-allocation-service.mjs';
import { createPostgresSourcingTechPackAllocationStore } from '../infrastructure/postgres-sourcing-tech-pack-allocation-store.mjs';
import { createWholesaleHttpHandler } from '../http/api.mjs';
import { createWholesaleFetchHandler } from '../http/fetch-api.mjs';
import { createPostgresWholesaleRuntime as createBaseRuntime } from './postgres-base-runtime.mjs';

export function createPostgresWholesaleRuntime(options = {}) {
  const base = createBaseRuntime(options);
  const allocationStore = createPostgresSourcingTechPackAllocationStore({ pool: options.pool });
  const allocation = createSourcingTechPackAllocationService({
    store: allocationStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const sourcing = Object.freeze({ ...base.sourcing, ...allocation });
  const transport = {
    authenticate: base.auth.authenticate,
    auth: base.auth,
    readiness: base.readiness,
    platform: base.platform,
    catalog: base.catalog,
    materials: base.materials,
    boms: base.boms,
    measurements: base.measurements,
    samples: base.samples,
    partners: base.partners,
    sourcing,
    techPacks: base.techPacks,
    collaboration: base.collaboration,
    orders: base.orders,
    notifications: base.notifications,
    workspace: base.workspace,
  };
  const handler = createWholesaleHttpHandler(transport);
  const fetchHandler = createWholesaleFetchHandler(transport);
  return Object.freeze({
    ...base,
    sourcingTechPackAllocationStore: allocationStore,
    sourcing,
    handler,
    fetchHandler,
  });
}
