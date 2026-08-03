import { invariant } from '../core/errors.mjs';
import { createAuthService } from '../application/auth-service.mjs';
import { createCatalogService } from '../application/catalog-service.mjs';
import { createCollaborationCalendarService } from '../application/collaboration-calendar-service.mjs';
import { createIntegratedWorkspaceQueryService } from '../application/integrated-workspace-query-service.mjs';
import { createMaintenanceService } from '../application/maintenance-service.mjs';
import { createOutboxPublisherService } from '../application/outbox-publisher-service.mjs';
import { createPostgresReadinessService } from '../application/readiness-service.mjs';
import { createWholesalePlatform } from '../application/platform.mjs';
import { createPartnerAccessService } from '../application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../application/order-builder-service.mjs';
import { createNotificationService } from '../application/notification-service.mjs';
import { createPostgresAuthStore } from '../infrastructure/postgres-auth-store.mjs';
import { createPostgresCatalogStore } from '../infrastructure/postgres-catalog-store.mjs';
import { createPostgresCollaborationCalendarStore } from '../infrastructure/postgres-collaboration-calendar-store.mjs';
import { createPostgresIntegratedWorkspaceReader } from '../infrastructure/postgres-integrated-workspace-reader.mjs';
import { createPostgresMaintenanceStore } from '../infrastructure/postgres-maintenance-store.mjs';
import { createPostgresOutboxPublicationStore } from '../infrastructure/postgres-outbox-publication-store.mjs';
import { createPostgresWholesaleStore } from '../infrastructure/postgres-store.mjs';
import { createPostgresNotificationProjectionStore } from '../infrastructure/postgres-notification-projection-store.mjs';
import { createPostgresNotificationReader } from '../infrastructure/postgres-notification-reader.mjs';
import { createWholesaleHttpHandler } from '../http/api.mjs';
import { createWholesaleFetchHandler } from '../http/fetch-api.mjs';
import { resolveRuntimeIdGenerator } from './id-generator.mjs';

export function createPostgresWholesaleRuntime({
  pool,
  migrationsDir,
  clock,
  nextId,
  randomBytesImpl,
  sessionTtlMs,
  maxLoginFailures,
  loginWindowMs,
  loginBlockMs,
  revokedSessionRetentionMs,
  notificationProjectionWorkerId,
  notificationProjectionLeaseMs,
  notificationProjectionRetryDelayMs,
  notificationProjectionMaxAttempts,
  outboxPublisher,
  outboxPublicationWorkerId,
  outboxPublicationLeaseMs,
  outboxPublicationRetryDelayMs,
  outboxPublicationMaxRetryDelayMs,
  outboxPublicationMaxAttempts,
  maintenanceIntervalMs,
  maintenanceRetryDelayMs,
  commandRetentionMs,
  authAuditRetentionMs,
  throttleRetentionMs,
  outboxRetentionMs,
  operationalReadiness,
} = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  invariant(operationalReadiness === undefined || typeof operationalReadiness === 'function', 'READINESS_OPERATIONAL_CHECK_INVALID', 'Operational readiness check must be a function');
  const runtimeNextId = resolveRuntimeIdGenerator(nextId);
  const store = createPostgresWholesaleStore({ pool });
  const catalogStore = createPostgresCatalogStore({ pool });
  const options = { store, nextId: runtimeNextId, ...(clock ? { clock } : {}) };
  const auth = createAuthService({
    store: createPostgresAuthStore({ pool }),
    nextId: runtimeNextId,
    ...(clock ? { clock } : {}),
    ...(randomBytesImpl ? { randomBytesImpl } : {}),
    ...(sessionTtlMs !== undefined ? { sessionTtlMs } : {}),
    ...(maxLoginFailures !== undefined ? { maxLoginFailures } : {}),
    ...(loginWindowMs !== undefined ? { loginWindowMs } : {}),
    ...(loginBlockMs !== undefined ? { loginBlockMs } : {}),
    ...(revokedSessionRetentionMs !== undefined ? { revokedSessionRetentionMs } : {}),
  });
  const readiness = migrationsDir ? createPostgresReadinessService({
    pool,
    migrationsDir,
    ...(clock ? { clock } : {}),
    ...(operationalReadiness ? { operationalCheck: operationalReadiness } : {}),
  }) : undefined;
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, nextId: runtimeNextId, ...(clock ? { clock } : {}) });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const collaborationCalendar = createCollaborationCalendarService({
    store: createPostgresCollaborationCalendarStore({ pool }),
    membershipReader: store,
    nextId: runtimeNextId,
    ...(clock ? { clock } : {}),
  });
  const orders = createOrderBuilderService(options);
  const projectionStore = createPostgresNotificationProjectionStore({ pool });
  const notifications = createNotificationService({
    sourceStore: store,
    projectionStore,
    reader: createPostgresNotificationReader({ pool }),
    nextId: runtimeNextId,
    ...(clock ? { clock } : {}),
    ...(notificationProjectionWorkerId ? { projectionWorkerId: notificationProjectionWorkerId } : {}),
    ...(notificationProjectionLeaseMs !== undefined ? { projectionLeaseMs: notificationProjectionLeaseMs } : {}),
    ...(notificationProjectionRetryDelayMs !== undefined ? { projectionRetryDelayMs: notificationProjectionRetryDelayMs } : {}),
    ...(notificationProjectionMaxAttempts !== undefined ? { maxProjectionAttempts: notificationProjectionMaxAttempts } : {}),
  });
  const outboxPublication = outboxPublisher ? createOutboxPublisherService({
    store: createPostgresOutboxPublicationStore({ pool }),
    publisher: outboxPublisher,
    ...(clock ? { clock } : {}),
    ...(outboxPublicationWorkerId ? { workerId: outboxPublicationWorkerId } : {}),
    ...(outboxPublicationLeaseMs !== undefined ? { leaseMs: outboxPublicationLeaseMs } : {}),
    ...(outboxPublicationRetryDelayMs !== undefined ? { retryDelayMs: outboxPublicationRetryDelayMs } : {}),
    ...(outboxPublicationMaxRetryDelayMs !== undefined ? { maxRetryDelayMs: outboxPublicationMaxRetryDelayMs } : {}),
    ...(outboxPublicationMaxAttempts !== undefined ? { maxAttempts: outboxPublicationMaxAttempts } : {}),
  }) : undefined;
  const maintenance = createMaintenanceService({
    store: createPostgresMaintenanceStore({ pool }),
    ...(clock ? { clock } : {}),
    ...(maintenanceIntervalMs !== undefined ? { intervalMs: maintenanceIntervalMs } : {}),
    ...(maintenanceRetryDelayMs !== undefined ? { retryDelayMs: maintenanceRetryDelayMs } : {}),
    ...(commandRetentionMs !== undefined ? { commandRetentionMs } : {}),
    ...(authAuditRetentionMs !== undefined ? { authAuditRetentionMs } : {}),
    ...(throttleRetentionMs !== undefined ? { throttleRetentionMs } : {}),
    ...(revokedSessionRetentionMs !== undefined ? { revokedSessionRetentionMs } : {}),
    ...(outboxRetentionMs !== undefined ? { outboxRetentionMs } : {}),
  });
  const workspaceReader = createPostgresIntegratedWorkspaceReader({ pool });
  const workspace = createIntegratedWorkspaceQueryService({ reader: workspaceReader });
  const transport = {
    authenticate: auth.authenticate,
    auth,
    readiness,
    platform,
    catalog,
    partners,
    collaboration,
    collaborationCalendar,
    orders,
    notifications,
    workspace,
  };
  const handler = createWholesaleHttpHandler(transport);
  const fetchHandler = createWholesaleFetchHandler(transport);
  return Object.freeze({
    auth,
    readiness,
    maintenance,
    outboxPublication,
    store,
    catalogStore,
    platform,
    catalog,
    partners,
    collaboration,
    collaborationCalendar,
    orders,
    notifications,
    workspace,
    handler,
    fetchHandler,
  });
}
