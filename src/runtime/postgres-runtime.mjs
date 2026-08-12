import { createFinalQualityQueryService } from '../application/final-quality-query-service.mjs';
import { createFinalQualityService } from '../application/final-quality-service.mjs';
import { createOrderMarginBridgeService } from '../application/order-margin-bridge-service.mjs';
import { createProductionExecutionQueryService } from '../application/production-execution-query-service.mjs';
import { createProductionExecutionService } from '../application/production-execution-service.mjs';
import { createProductionOrderQueryService } from '../application/production-order-query-service.mjs';
import { createProductionOrderService } from '../application/production-order-service.mjs';
import { createSourcingTechPackAllocationService } from '../application/sourcing-tech-pack-allocation-service.mjs';
import { createSupplierEconomicPerformanceService } from '../application/supplier-economic-performance-service.mjs';
import { createPostgresFinalQualityReader } from '../infrastructure/postgres-final-quality-reader.mjs';
import { createPostgresFinalQualityStore } from '../infrastructure/postgres-final-quality-store.mjs';
import { createPostgresOrderMarginBridgeReader } from '../infrastructure/postgres-order-margin-bridge-reader.mjs';
import { createPostgresProductionExecutionReader } from '../infrastructure/postgres-production-execution-reader.mjs';
import { createPostgresProductionExecutionStore } from '../infrastructure/postgres-production-execution-store.mjs';
import { createPostgresProductionOrderReader } from '../infrastructure/postgres-production-order-reader.mjs';
import { createPostgresProductionOrderStore } from '../infrastructure/postgres-production-order-store.mjs';
import { createPostgresSourcingTechPackAllocationStore } from '../infrastructure/postgres-sourcing-tech-pack-allocation-store.mjs';
import { createPostgresSupplierEconomicPerformanceReader } from '../infrastructure/postgres-supplier-economic-performance-reader.mjs';
import { createWholesaleHttpHandler } from '../http/api.mjs';
import { createWholesaleFetchHandler } from '../http/fetch-api.mjs';
import { createPostgresWholesaleRuntime as createBaseRuntime } from './postgres-base-runtime.mjs';
import { createPostgresCostAllocationRuntime } from './postgres-cost-allocation-runtime.mjs';
import { createPostgresFulfillmentRuntime } from './postgres-fulfillment-runtime.mjs';
import { createPostgresInventoryRuntime } from './postgres-inventory-runtime.mjs';
import { createPostgresReceiptClaimsRuntime } from './postgres-receipt-claims-runtime.mjs';
import { createPostgresSupplierRecoveryRuntime } from './postgres-supplier-recovery-runtime.mjs';

export function createPostgresWholesaleRuntime(options = {}) {
  const base = createBaseRuntime(options);

  const orderMarginBridgeReader = createPostgresOrderMarginBridgeReader({ pool: options.pool });
  const orderEconomics = Object.freeze({
    ...base.orderEconomics,
    ...createOrderMarginBridgeService({ reader: orderMarginBridgeReader }),
  });
  const costAllocationRuntime = createPostgresCostAllocationRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const costAllocation = costAllocationRuntime.service;
  const fulfillmentRuntime = createPostgresFulfillmentRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const fulfillment = fulfillmentRuntime.service;
  const inventoryRuntime = createPostgresInventoryRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const inventory = inventoryRuntime.service;
  const receiptClaimsRuntime = createPostgresReceiptClaimsRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const receiptClaims = receiptClaimsRuntime.service;
  const supplierRecoveryRuntime = createPostgresSupplierRecoveryRuntime({
    pool: options.pool,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const supplierRecovery = supplierRecoveryRuntime.service;
  const supplierPerformanceReader = createPostgresSupplierEconomicPerformanceReader({ pool: options.pool });
  const supplierPerformance = createSupplierEconomicPerformanceService({ reader: supplierPerformanceReader });

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

  const productionExecutionStore = createPostgresProductionExecutionStore({ pool: options.pool });
  const productionExecutionReader = createPostgresProductionExecutionReader({ pool: options.pool });
  const productionExecutionCommands = createProductionExecutionService({
    store: productionExecutionStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const productionExecutionQueries = createProductionExecutionQueryService({ reader: productionExecutionReader });
  const productionExecutions = Object.freeze({ ...productionExecutionQueries, ...productionExecutionCommands });

  const finalQualityStore = createPostgresFinalQualityStore({ pool: options.pool });
  const finalQualityReader = createPostgresFinalQualityReader({ pool: options.pool });
  const finalQualityCommands = createFinalQualityService({
    store: finalQualityStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const finalQualityQueries = createFinalQualityQueryService({ reader: finalQualityReader });
  const finalQuality = Object.freeze({ ...finalQualityQueries, ...finalQualityCommands });

  const transport = {
    authenticate: base.auth.authenticate,
    auth: base.auth,
    readiness: base.readiness,
    platform: base.platform,
    catalog: base.catalog,
    productIdentity: base.productIdentity,
    productReadiness: base.productReadiness,
    commercialPublication: base.commercialPublication,
    orderEconomics,
    costAllocation,
    fulfillment,
    inventory,
    receiptClaims,
    supplierRecovery,
    supplierPerformance,
    materials: base.materials,
    boms: base.boms,
    measurements: base.measurements,
    samples: base.samples,
    partners: base.partners,
    sourcing,
    techPacks: base.techPacks,
    productionOrders,
    productionExecutions,
    finalQuality,
    collaboration: base.collaboration,
    orders: base.orders,
    notifications: base.notifications,
    workspace: base.workspace,
  };
  const handler = createWholesaleHttpHandler(transport);
  const fetchHandler = createWholesaleFetchHandler(transport);
  return Object.freeze({
    ...base,
    orderMarginBridgeReader,
    orderEconomics,
    costAllocationStore: costAllocationRuntime.store,
    costAllocation,
    fulfillmentStore: fulfillmentRuntime.store,
    fulfillment,
    inventoryStore: inventoryRuntime.store,
    inventory,
    receiptClaimsStore: receiptClaimsRuntime.store,
    receiptClaims,
    supplierRecoveryStore: supplierRecoveryRuntime.store,
    supplierRecovery,
    supplierPerformanceReader,
    supplierPerformance,
    sourcingTechPackAllocationStore: allocationStore,
    sourcing,
    productionOrderStore,
    productionOrderReader,
    productionOrders,
    productionExecutionStore,
    productionExecutionReader,
    productionExecutions,
    finalQualityStore,
    finalQualityReader,
    finalQuality,
    handler,
    fetchHandler,
  });
}
