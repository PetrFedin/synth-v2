import { createCommercialPublicationRoutes } from './commercial-publication-routes.mjs';
import { createEconomicsRouteBundle } from './economics-route-bundle.mjs';
import { createFinalQualityRoutes } from './final-quality-routes.mjs';
import { createFulfillmentRoutes } from './fulfillment-routes.mjs';
import { createInventoryRoutes } from './inventory-routes.mjs';
import { createProductIdentityRoutes } from './product-identity-routes.mjs';
import { createProductReadinessRoutes } from './product-readiness-routes.mjs';
import { createProductionRequirementRoutes } from './production-requirement-routes.mjs';
import { createReceiptClaimsRoutes } from './receipt-claims-routes.mjs';
import { createRetailDoorRoutes } from './retail-door-routes.mjs';
import { createSelectionMatrixRoutes } from './selection-matrix-routes.mjs';
import { createSupplierRecoveryRoutes } from './supplier-recovery-routes.mjs';
import { createSupplierEconomicPerformanceRoutes } from './supplier-economic-performance-routes.mjs';
import { createProductionExecutionRoutes } from './production-execution-routes.mjs';
import { createProductionOrderRoutes } from './production-order-routes.mjs';
import { createSampleRoutes } from './sample-routes.mjs';
import { createSourcingRoutes } from './sourcing-routes.mjs';
import { createTechPackRoutes } from './tech-pack-routes.mjs';
import { createWholesaleRoutes as createCoreWholesaleRoutes, matchWholesaleRoute } from './routes.mjs';

export function createWholesaleRoutes(services = {}) {
  return Object.freeze([
    ...createCoreWholesaleRoutes(services),
    ...createProductIdentityRoutes({ productIdentity: services.productIdentity }),
    ...createProductReadinessRoutes({ productReadiness: services.productReadiness }),
    ...createCommercialPublicationRoutes({ commercialPublication: services.commercialPublication }),
    ...createRetailDoorRoutes({ retailDoors: services.retailDoors }),
    ...createSelectionMatrixRoutes({ collaboration: services.collaboration }),
    ...createEconomicsRouteBundle({ orderEconomics: services.orderEconomics, costAllocation: services.costAllocation }),
    ...createProductionRequirementRoutes({ productionRequirements: services.productionRequirements }),
    ...createFulfillmentRoutes({ fulfillment: services.fulfillment }),
    ...createInventoryRoutes({ inventory: services.inventory }),
    ...createReceiptClaimsRoutes({ receiptClaims: services.receiptClaims }),
    ...createSupplierRecoveryRoutes({ supplierRecovery: services.supplierRecovery }),
    ...createSupplierEconomicPerformanceRoutes({ supplierPerformance: services.supplierPerformance }),
    ...createSampleRoutes({ samples: services.samples }),
    ...createSourcingRoutes({ sourcing: services.sourcing }),
    ...createTechPackRoutes({ techPacks: services.techPacks }),
    ...createProductionOrderRoutes({ productionOrders: services.productionOrders }),
    ...createProductionExecutionRoutes({ productionExecutions: services.productionExecutions }),
    ...createFinalQualityRoutes({ finalQuality: services.finalQuality }),
  ]);
}

export { matchWholesaleRoute };