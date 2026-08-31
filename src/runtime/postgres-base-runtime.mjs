import { invariant } from '../core/errors.mjs';
import { createAuthService } from '../application/auth-service.mjs';
import { createBomService } from '../application/bom-service.mjs';
import { createBomQueryService } from '../application/bom-query-service.mjs';
import { createCatalogService } from '../application/catalog-service.mjs';
import { createCatalogQueryService } from '../application/catalog-query-service.mjs';
import { createCommercialPublicationService } from '../application/commercial-publication-service.mjs';
import { createMaterialService } from '../application/material-service.mjs';
import { createMaterialQueryService } from '../application/material-query-service.mjs';
import { createMeasurementService } from '../application/measurement-service.mjs';
import { createMeasurementQueryService } from '../application/measurement-query-service.mjs';
import { createOrderEconomicsService } from '../application/order-economics-service.mjs';
import { createOrderEconomicsPositionService } from '../application/order-economics-position-service.mjs';
import { createPostCloseAllocationReconciliationService } from '../application/post-close-allocation-reconciliation-service.mjs';
import { createProductIdentityService } from '../application/product-identity-service.mjs';
import { createProductIdentityQueryService } from '../application/product-identity-query-service.mjs';
import { createProductReadinessService } from '../application/product-readiness-service.mjs';
import { createSampleService } from '../application/sample-service.mjs';
import { createSampleQueryService } from '../application/sample-query-service.mjs';
import { createSourcingService } from '../application/sourcing-service.mjs';
import { createSourcingQueryService } from '../application/sourcing-query-service.mjs';
import { createTechPackService } from '../application/tech-pack-service.mjs';
import { createTechPackQueryService } from '../application/tech-pack-query-service.mjs';
import { createMaintenanceService } from '../application/maintenance-service.mjs';
import { withNotificationPageMetadata } from '../application/notification-page-service.mjs';
import { createOutboxPublisherService } from '../application/outbox-publisher-service.mjs';
import { createPostgresReadinessService } from '../application/readiness-service.mjs';
import { createWholesalePlatform } from '../application/platform.mjs';
import { createPartnerAccessService } from '../application/partner-access-service.mjs';
import { createRetailDoorService } from '../application/retail-door-service.mjs';
import { createShowroomSelectionService } from '../application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../application/order-builder-service.mjs';
import { createNotificationService } from '../application/notification-service.mjs';
import { createWorkspaceQueryService } from '../application/workspace-query-service.mjs';
import { createPostgresAuthStore } from '../infrastructure/postgres-auth-store.mjs';
import { createPostgresBomStore } from '../infrastructure/postgres-bom-store.mjs';
import { createPostgresBomReader } from '../infrastructure/postgres-bom-reader.mjs';
import { createPostgresCatalogStore } from '../infrastructure/postgres-catalog-store.mjs';
import { createPostgresCatalogReader } from '../infrastructure/postgres-catalog-reader.mjs';
import { createPostgresCommercialPublicationStore } from '../infrastructure/postgres-commercial-publication-store.mjs';
import { createPostgresMaterialStore } from '../infrastructure/postgres-material-store.mjs';
import { createPostgresMaterialReader } from '../infrastructure/postgres-material-reader.mjs';
import { createPostgresMeasurementStore } from '../infrastructure/postgres-measurement-store.mjs';
import { createPostgresMeasurementReader } from '../infrastructure/postgres-measurement-reader.mjs';
import { createPostgresOrderEconomicsStore } from '../infrastructure/postgres-order-economics-store.mjs';
import { createPostgresProductIdentityStore } from '../infrastructure/postgres-product-identity-store.mjs';
import { createPostgresProductIdentityReader } from '../infrastructure/postgres-product-identity-reader.mjs';
import { createPostgresProductReadinessStore } from '../infrastructure/postgres-product-readiness-store.mjs';
import { createPostgresProductReadinessSourceReader } from '../infrastructure/postgres-product-readiness-source-reader.mjs';
import { createPostgresSampleStore } from '../infrastructure/postgres-sample-store.mjs';
import { createPostgresSampleReader } from '../infrastructure/postgres-sample-reader.mjs';
import { createPostgresSourcingStore } from '../infrastructure/postgres-sourcing-store.mjs';
import { createPostgresSourcingReader } from '../infrastructure/postgres-sourcing-reader.mjs';
import { createPostgresTechPackStore } from '../infrastructure/postgres-tech-pack-store.mjs';
import { createPostgresTechPackReader } from '../infrastructure/postgres-tech-pack-reader.mjs';
import { createPostgresMaintenanceStore } from '../infrastructure/postgres-maintenance-store.mjs';
import { createPostgresOutboxPublicationStore } from '../infrastructure/postgres-outbox-publication-store.mjs';
import { createPostgresWholesaleStore } from '../infrastructure/postgres-store.mjs';
import { createPostgresNotificationProjectionStore } from '../infrastructure/postgres-notification-projection-store.mjs';
import { createPostgresNotificationReader } from '../infrastructure/postgres-notification-reader.mjs';
import { createPostgresWorkspaceReader } from '../infrastructure/postgres-workspace-reader.mjs';
import { createWholesaleHttpHandler } from '../http/api.mjs';
import { createWholesaleFetchHandler } from '../http/fetch-api.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresWholesaleRuntime({
  pool, migrationsDir, clock, nextId, randomBytesImpl, sessionTtlMs, maxLoginFailures, loginWindowMs,
  loginBlockMs, revokedSessionRetentionMs, notificationProjectionWorkerId, notificationProjectionLeaseMs,
  notificationProjectionRetryDelayMs, notificationProjectionMaxAttempts, outboxPublisher,
  outboxPublicationWorkerId, outboxPublicationLeaseMs, outboxPublicationRetryDelayMs,
  outboxPublicationMaxRetryDelayMs, outboxPublicationMaxAttempts, maintenanceIntervalMs,
  maintenanceRetryDelayMs, commandRetentionMs, authAuditRetentionMs, throttleRetentionMs,
  outboxRetentionMs, operationalReadiness,
} = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  invariant(operationalReadiness === undefined || typeof operationalReadiness === 'function', 'READINESS_OPERATIONAL_CHECK_INVALID', 'Operational readiness check must be a function');
  const runtimeNextId = resolveRuntimeIdGenerator(nextId);
  const store = createPostgresWholesaleStore({ pool });
  const catalogStore = createPostgresCatalogStore({ pool });
  const commercialPublicationStore = createPostgresCommercialPublicationStore({ pool });
  const orderEconomicsStore = createPostgresOrderEconomicsStore({ pool });
  const productIdentityStore = createPostgresProductIdentityStore({ pool });
  const productReadinessStore = createPostgresProductReadinessStore({ pool });
  const materialStore = createPostgresMaterialStore({ pool });
  const bomStore = createPostgresBomStore({ pool });
  const measurementStore = createPostgresMeasurementStore({ pool });
  const sampleStore = createPostgresSampleStore({ pool });
  const sourcingStore = createPostgresSourcingStore({ pool });
  const techPackStore = createPostgresTechPackStore({ pool });
  const options = { store, nextId: runtimeNextId, ...(clock ? { clock } : {}) };
  const auth = createAuthService({
    store: createPostgresAuthStore({ pool }), nextId: runtimeNextId,
    ...(clock ? { clock } : {}), ...(randomBytesImpl ? { randomBytesImpl } : {}),
    ...(sessionTtlMs !== undefined ? { sessionTtlMs } : {}),
    ...(maxLoginFailures !== undefined ? { maxLoginFailures } : {}),
    ...(loginWindowMs !== undefined ? { loginWindowMs } : {}),
    ...(loginBlockMs !== undefined ? { loginBlockMs } : {}),
    ...(revokedSessionRetentionMs !== undefined ? { revokedSessionRetentionMs } : {}),
  });
  const readiness = migrationsDir ? createPostgresReadinessService({ pool, migrationsDir, ...(clock ? { clock } : {}), ...(operationalReadiness ? { operationalCheck: operationalReadiness } : {}) }) : undefined;
  const platform = createWholesalePlatform({ ...options, productIdentityStore });
  const catalog = Object.freeze({ ...createCatalogService({ wholesaleStore: store, catalogStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createCatalogQueryService({ reader: createPostgresCatalogReader({ pool }) }) });
  const productIdentityReader = createPostgresProductIdentityReader({ pool });
  const productIdentity = Object.freeze({
    ...createProductIdentityService({ store: productIdentityStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }),
    ...createProductIdentityQueryService({ reader: productIdentityReader }),
  });
  const productReadinessSourceReader = createPostgresProductReadinessSourceReader({ pool, productIdentityReader });
  const productReadiness = createProductReadinessService({
    store: productReadinessStore,
    sourceReader: productReadinessSourceReader,
    nextId: runtimeNextId,
    ...(clock ? { clock } : {}),
  });
  const commercialPublication = createCommercialPublicationService({
    commercialStore: commercialPublicationStore,
    wholesaleStore: store,
    catalogReader: catalog,
    nextId: runtimeNextId,
    ...(clock ? { clock } : {}),
  });
  const orderEconomics = Object.freeze({
    ...createOrderEconomicsService({ economicsStore: orderEconomicsStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }),
    ...createPostCloseAllocationReconciliationService({ economicsStore: orderEconomicsStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }),
    ...createOrderEconomicsPositionService({ economicsStore: orderEconomicsStore }),
  });
  const materials = Object.freeze({ ...createMaterialService({ materialStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createMaterialQueryService({ reader: createPostgresMaterialReader({ pool }) }) });
  const boms = Object.freeze({ ...createBomService({ bomStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createBomQueryService({ reader: createPostgresBomReader({ pool }) }) });
  const measurements = Object.freeze({ ...createMeasurementService({ measurementStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createMeasurementQueryService({ reader: createPostgresMeasurementReader({ pool }) }) });
  const samples = Object.freeze({ ...createSampleService({ sampleStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createSampleQueryService({ reader: createPostgresSampleReader({ pool }), ...(clock ? { clock } : {}) }) });
  const sourcing = Object.freeze({ ...createSourcingService({ sourcingStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createSourcingQueryService({ reader: createPostgresSourcingReader({ pool }), ...(clock ? { clock } : {}) }) });
  const techPacks = Object.freeze({ ...createTechPackService({ techPackStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) }), ...createTechPackQueryService({ reader: createPostgresTechPackReader({ pool }) }) });
  const partners = createPartnerAccessService(options);
  const retailDoors = createRetailDoorService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog, commercialPublicationReader: commercialPublication });
  const orders = createOrderBuilderService({ ...options, commercialPublicationReader: commercialPublication });
  const projectionStore = createPostgresNotificationProjectionStore({ pool });
  const notificationReader = createPostgresNotificationReader({ pool });
  const notificationCore = createNotificationService({
    sourceStore: store, projectionStore, reader: notificationReader, nextId: runtimeNextId,
    ...(clock ? { clock } : {}), ...(notificationProjectionWorkerId ? { projectionWorkerId: notificationProjectionWorkerId } : {}),
    ...(notificationProjectionLeaseMs !== undefined ? { projectionLeaseMs: notificationProjectionLeaseMs } : {}),
    ...(notificationProjectionRetryDelayMs !== undefined ? { projectionRetryDelayMs: notificationProjectionRetryDelayMs } : {}),
    ...(notificationProjectionMaxAttempts !== undefined ? { maxProjectionAttempts: notificationProjectionMaxAttempts } : {}),
  });
  const notifications = withNotificationPageMetadata({ service: notificationCore, reader: notificationReader });
  const outboxPublication = outboxPublisher ? createOutboxPublisherService({
    store: createPostgresOutboxPublicationStore({ pool }), publisher: outboxPublisher,
    ...(clock ? { clock } : {}), ...(outboxPublicationWorkerId ? { workerId: outboxPublicationWorkerId } : {}),
    ...(outboxPublicationLeaseMs !== undefined ? { leaseMs: outboxPublicationLeaseMs } : {}),
    ...(outboxPublicationRetryDelayMs !== undefined ? { retryDelayMs: outboxPublicationRetryDelayMs } : {}),
    ...(outboxPublicationMaxRetryDelayMs !== undefined ? { maxRetryDelayMs: outboxPublicationMaxRetryDelayMs } : {}),
    ...(outboxPublicationMaxAttempts !== undefined ? { maxAttempts: outboxPublicationMaxAttempts } : {}),
  }) : undefined;
  const maintenance = createMaintenanceService({
    store: createPostgresMaintenanceStore({ pool }), ...(clock ? { clock } : {}),
    ...(maintenanceIntervalMs !== undefined ? { intervalMs: maintenanceIntervalMs } : {}),
    ...(maintenanceRetryDelayMs !== undefined ? { retryDelayMs: maintenanceRetryDelayMs } : {}),
    ...(commandRetentionMs !== undefined ? { commandRetentionMs } : {}),
    ...(authAuditRetentionMs !== undefined ? { authAuditRetentionMs } : {}),
    ...(throttleRetentionMs !== undefined ? { throttleRetentionMs } : {}),
    ...(revokedSessionRetentionMs !== undefined ? { revokedSessionRetentionMs } : {}),
    ...(outboxRetentionMs !== undefined ? { outboxRetentionMs } : {}),
  });
  const workspace = createWorkspaceQueryService({ reader: createPostgresWorkspaceReader({ pool }) });
  const transport = { authenticate: auth.authenticate, auth, readiness, platform, catalog, productIdentity, productReadiness, commercialPublication, orderEconomics, materials, boms, measurements, samples, partners, retailDoors, sourcing, techPacks, collaboration, orders, notifications, workspace };
  const handler = createWholesaleHttpHandler(transport);
  const fetchHandler = createWholesaleFetchHandler(transport);
  return Object.freeze({
    auth, readiness, maintenance, outboxPublication, store, catalogStore, productIdentityStore, productIdentityReader, productReadinessStore, productReadinessSourceReader, commercialPublicationStore, orderEconomicsStore, materialStore, bomStore, measurementStore, sampleStore, sourcingStore, techPackStore,
    platform, catalog, productIdentity, productReadiness, commercialPublication, orderEconomics, materials, boms, measurements, samples, partners, retailDoors, sourcing, techPacks, collaboration, orders, notifications, workspace,
    handler, fetchHandler,
  });
}