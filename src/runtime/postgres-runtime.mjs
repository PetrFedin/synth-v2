import { createProductionOrderQueryService } from '../application/production-order-query-service.mjs';
import { createProductionOrderService } from '../application/production-order-service.mjs';
import { createSourcingTechPackAllocationService } from '../application/sourcing-tech-pack-allocation-service.mjs';
import { createPostgresProductionOrderReader } from '../infrastructure/postgres-production-order-reader.mjs';
import { createPostgresProductionOrderStore } from '../infrastructure/postgres-production-order-store.mjs';
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

  const productionOrderStore = createPostgresProductionOrderStore({ pool: options.pool });
  const productionOrderReader = createPostgresProductionOrderReader({ pool: options.pool });
  const productionOrderCommands = createProductionOrderService({
    store: productionOrderStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const productionOrderQueries = createProductionOrderQueryService({ reader: productionOrderReader });
  const productionOrders = Object.freeze({ ...productionOrderQueries, ...productionOrderCommands });

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
    productionOrders,
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
    productionOrderStore,
    productionOrderReader,
    productionOrders,
    handler,
    fetchHandler,
  });
}
