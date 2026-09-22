import { createFinalQualityQueryService } from '../application/final-quality-query-service.mjs';
import { createFinalQualityService } from '../application/final-quality-service.mjs';
import { createOrderMarginBridgeService } from '../application/order-margin-bridge-service.mjs';
import { createProductionExecutionQueryService } from '../application/production-execution-query-service.mjs';
import { createProductionExecutionService } from '../application/production-execution-service.mjs';
import { createProductionOrderQueryService } from '../application/production-order-query-service.mjs';
import { createProductionOrderService } from '../application/production-order-service.mjs';
import { createProductionRequirementService } from '../application/production-requirement-service.mjs';
import { createProductionSourcingService } from '../application/production-sourcing-service.mjs';
import { createSourcingTechPackAllocationService } from '../application/sourcing-tech-pack-allocation-service.mjs';
import { createSupplierEconomicPerformanceService } from '../application/supplier-economic-performance-service.mjs';
import { createPostgresFinalQualityReader } from '../infrastructure/postgres-final-quality-reader.mjs';
import { createPostgresInlineQualityReader } from '../infrastructure/postgres-inline-quality-reader.mjs';
import { createPostgresInlineQualityStore } from '../infrastructure/postgres-inline-quality-store.mjs';
import { createInlineQualityService } from '../application/inline-quality-service.mjs';
import { createInlineQualityQueryService } from '../application/inline-quality-query-service.mjs';
import { createPostgresSupplierPaymentStore } from '../infrastructure/postgres-supplier-payment-store.mjs';
import { createPostgresSupplierPaymentReader } from '../infrastructure/postgres-supplier-payment-reader.mjs';
import { createSupplierPaymentService, createSupplierPaymentQueryService } from '../application/supplier-payment-service.mjs';
import { createPostgresMaterialLotStore } from '../infrastructure/postgres-material-lot-store.mjs';
import { createPostgresMaterialLotReader } from '../infrastructure/postgres-material-lot-reader.mjs';
import { createMaterialLotService, createMaterialLotQueryService } from '../application/material-lot-service.mjs';
import { createPostgresCuttingStore } from '../infrastructure/postgres-cutting-store.mjs';
import { createPostgresCuttingReader } from '../infrastructure/postgres-cutting-reader.mjs';
import { createCuttingService, createCuttingQueryService } from '../application/cutting-service.mjs';
import { createPostgresOperationSequenceStore } from '../infrastructure/postgres-operation-sequence-store.mjs';
import { createPostgresOperationSequenceReader } from '../infrastructure/postgres-operation-sequence-reader.mjs';
import { createOperationSequenceService, createOperationSequenceQueryService } from '../application/operation-sequence-service.mjs';
import { createPostgresTargetPricingStore } from '../infrastructure/postgres-target-pricing-store.mjs';
import { createPostgresTargetPricingReader } from '../infrastructure/postgres-target-pricing-reader.mjs';
import { createTargetPricingService, createTargetPricingQueryService } from '../application/target-pricing-service.mjs';
import { createPostgresSeasonEconomicsReader } from '../infrastructure/postgres-season-economics-reader.mjs';
import { createSeasonEconomicsQueryService } from '../application/season-economics-service.mjs';
import { createPostgresMaterialColourStore } from '../infrastructure/postgres-material-colour-store.mjs';
import { createPostgresMaterialColourReader } from '../infrastructure/postgres-material-colour-reader.mjs';
import { createMaterialColourService, createMaterialColourQueryService } from '../application/material-colour-service.mjs';
import { createSeasonPaletteService } from '../application/season-palette-service.mjs';
import { createPostgresSeasonPaletteStore } from '../infrastructure/postgres-season-palette-store.mjs';
import { createPostgresBomSizeLineReader } from '../infrastructure/postgres-bom-size-line-reader.mjs';
import { createBomSizeLineQueryService } from '../application/bom-size-line-service.mjs';
import { createPostgresFinalQualityStore } from '../infrastructure/postgres-final-quality-store.mjs';
import { createPostgresOrderMarginBridgeReader } from '../infrastructure/postgres-order-margin-bridge-reader.mjs';
import { createPostgresProductionExecutionReader } from '../infrastructure/postgres-production-execution-reader.mjs';
import { createPostgresProductionExecutionStore } from '../infrastructure/postgres-production-execution-store.mjs';
import { createPostgresProductionOrderReader } from '../infrastructure/postgres-production-order-reader.mjs';
import { createPostgresProductionOrderStore } from '../infrastructure/postgres-production-order-store.mjs';
import { createPostgresProductionRequirementStore } from '../infrastructure/postgres-production-requirement-store.mjs';
import { createPostgresProductionSourcingStore } from '../infrastructure/postgres-production-sourcing-store.mjs';
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

  const productionRequirementStore = createPostgresProductionRequirementStore({ pool: options.pool });
  const productionRequirements = createProductionRequirementService({
    store: productionRequirementStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });

  const allocationStore = createPostgresSourcingTechPackAllocationStore({ pool: options.pool });
  const allocation = createSourcingTechPackAllocationService({
    store: allocationStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const productionSourcingStore = createPostgresProductionSourcingStore({ pool: options.pool });
  const productionSourcing = createProductionSourcingService({
    store: productionSourcingStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const sourcing = Object.freeze({ ...base.sourcing, ...allocation, ...productionSourcing });

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

  // Пооперационный контроль стоит рядом с финальным, а не внутри него: одна проверка относится к
  // вехе производства, другая — к партии целиком, и смешивать их означало бы, что запись не может
  // сказать, на каком этапе брак был найден.
  const inlineQualityStore = createPostgresInlineQualityStore({ pool: options.pool });
  const inlineQualityReader = createPostgresInlineQualityReader({ pool: options.pool });
  const inlineQualityCommands = createInlineQualityService({
    store: inlineQualityStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const inlineQualityQueries = createInlineQualityQueryService({ reader: inlineQualityReader });
  const inlineQuality = Object.freeze({ ...inlineQualityQueries, ...inlineQualityCommands });

  // Деньги фабрике стоят после приёмки, а не рядом с ней: веха оплаты наступает от события, которое
  // порождает контроль качества, поэтому платежи собираются последними в этой цепочке.
  const supplierPaymentStore = createPostgresSupplierPaymentStore({ pool: options.pool });
  const supplierPaymentReader = createPostgresSupplierPaymentReader({ pool: options.pool });
  const supplierPaymentCommands = createSupplierPaymentService({
    store: supplierPaymentStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const supplierPaymentQueries = createSupplierPaymentQueryService({
    reader: supplierPaymentReader,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const supplierPayments = Object.freeze({ ...supplierPaymentQueries, ...supplierPaymentCommands });

  // Партии материала стоят перед производством: рулон принимают, выпускают из карантина и только
  // потом выдают в раскрой, поэтому и собираются они до исполнения, а не после него.
  const materialLotStore = createPostgresMaterialLotStore({ pool: options.pool });
  const materialLotReader = createPostgresMaterialLotReader({ pool: options.pool });
  const materialLotCommands = createMaterialLotService({
    store: materialLotStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const materialLotQueries = createMaterialLotQueryService({ reader: materialLotReader });
  const materialLots = Object.freeze({ ...materialLotQueries, ...materialLotCommands });

  // Раскрой стоит сразу за партиями материала: настил делается из выданных рулонов, поэтому его
  // сборка следует за ними и предшествует пооперационному контролю, который проверяет уже детали.
  const cuttingStore = createPostgresCuttingStore({ pool: options.pool });
  const cuttingReader = createPostgresCuttingReader({ pool: options.pool });
  const cuttingCommands = createCuttingService({
    store: cuttingStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const cuttingQueries = createCuttingQueryService({ reader: cuttingReader });
  const cutting = Object.freeze({ ...cuttingQueries, ...cuttingCommands });

  // Технологическая последовательность описывает изделие, а не партию, поэтому собирается рядом с
  // техпаком: печатный пакет ссылается на неё, а пооперационный контроль называет по ней операцию.
  const operationSequenceStore = createPostgresOperationSequenceStore({ pool: options.pool });
  const operationSequenceReader = createPostgresOperationSequenceReader({ pool: options.pool });
  const operationSequenceCommands = createOperationSequenceService({
    store: operationSequenceStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const operationSequenceQueries = createOperationSequenceQueryService({ reader: operationSequenceReader });
  const operationSequences = Object.freeze({ ...operationSequenceQueries, ...operationSequenceCommands });

  // Целевая цена стоит раньше закупки: она отвечает, сколько можно платить, и её сравнивают с тем,
  // что фабрика запросила в подтверждённом заказе.
  const targetPricingStore = createPostgresTargetPricingStore({ pool: options.pool });
  const targetPricingReader = createPostgresTargetPricingReader({ pool: options.pool });
  const targetPricingCommands = createTargetPricingService({
    store: targetPricingStore,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const targetPricingQueries = createTargetPricingQueryService({ reader: targetPricingReader });
  const targetPricing = Object.freeze({ ...targetPricingQueries, ...targetPricingCommands });

  // Плановая экономика сезона замыкает ту же цепочку сверху: слот линейного плана, целевая цена по
  // нему и цена из подтверждённого заказа сводятся в одну маржу. Читается и только читается —
  // ни одно из сведённых чисел не хранится.
  // Цвет материала и его утверждение стоят раньше закупки: пока лабораторный образец не принят,
  // красить тираж нельзя — перекрасить принятую партию невозможно, её можно только не принять.
  const materialColourCommands = createMaterialColourService({
    store: createPostgresMaterialColourStore({ pool: options.pool }),
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });
  const materialColourQueries = createMaterialColourQueryService({
    reader: createPostgresMaterialColourReader({ pool: options.pool }),
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const materialColours = Object.freeze({ ...materialColourQueries, ...materialColourCommands });
  // Палитра сезона: регистр, которого у заведённой таблицы не было ни строкой кода.
  const seasonPalette = createSeasonPaletteService({
    store: createPostgresSeasonPaletteStore({ pool: options.pool }),
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.nextId ? { nextId: options.nextId } : {}),
  });

  // Размерный ряд ведомости читается стилем целиком: автор заполняет ведомость на каждый размер
  // отдельно и без ряда не может сравнить их между собой, а опечатку показывает именно сравнение.
  const bomSizeLine = createBomSizeLineQueryService({
    reader: createPostgresBomSizeLineReader({ pool: options.pool }),
  });

  const seasonEconomics = createSeasonEconomicsQueryService({
    reader: createPostgresSeasonEconomicsReader({ pool: options.pool }),
  });

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
    productionRequirements,
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
    retailDoors: base.retailDoors,
    sourcing,
    techPacks: base.techPacks,
    libraries: base.libraries,
    history: base.history,
    supplierPortal: base.supplierPortal,
    categoryAttributes: base.categoryAttributes,
    organisationMembers: base.organisationMembers,
    productionOrders,
    productionExecutions,
    finalQuality,
    inlineQuality,
    supplierPayments,
    materialLots,
    cutting,
    operationSequences,
    targetPricing,
    seasonEconomics,
    seasonPalette,
    materialColours,
    bomSizeLine,
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
    productionRequirementStore,
    productionRequirements,
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
    productionSourcingStore,
    sourcing,
    productionOrderStore,
    productionOrderReader,
    productionOrders,
    productionExecutionStore,
    productionExecutionReader,
    productionExecutions,
    targetPricingStore,
    targetPricingReader,
    targetPricing,
    seasonEconomics,
    materialColours,
    bomSizeLine,
    operationSequenceStore,
    operationSequenceReader,
    operationSequences,
    cuttingStore,
    cuttingReader,
    cutting,
    materialLotStore,
    materialLotReader,
    materialLots,
    supplierPaymentStore,
    supplierPaymentReader,
    supplierPayments,
    inlineQualityStore,
    inlineQualityReader,
    inlineQuality,
    finalQualityStore,
    finalQualityReader,
    finalQuality,
    handler,
    fetchHandler,
  });
}
