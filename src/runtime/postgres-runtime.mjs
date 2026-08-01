import { invariant } from '../core/errors.mjs';
import { createAuthService } from '../application/auth-service.mjs';
import { createCatalogService } from '../application/catalog-service.mjs';
import { createPostgresReadinessService } from '../application/readiness-service.mjs';
import { createWholesalePlatform } from '../application/platform.mjs';
import { createPartnerAccessService } from '../application/partner-access-service.mjs';
import { createShowroomSelectionService } from '../application/showroom-selection-service.mjs';
import { createOrderBuilderService } from '../application/order-builder-service.mjs';
import { createNotificationService } from '../application/notification-service.mjs';
import { createWorkspaceQueryService } from '../application/workspace-query-service.mjs';
import { createCollaborationCalendarService } from '../application/collaboration-calendar-service.mjs';
import { createPostgresAuthStore } from '../infrastructure/postgres-auth-store.mjs';
import { createPostgresCatalogStore } from '../infrastructure/postgres-catalog-store.mjs';
import { createPostgresWholesaleStore } from '../infrastructure/postgres-store.mjs';
import { createPostgresNotificationProjectionStore } from '../infrastructure/postgres-notification-projection-store.mjs';
import { createPostgresWorkspaceReader } from '../infrastructure/postgres-workspace-reader.mjs';
import { createPostgresCollaborationCalendarStore } from '../infrastructure/postgres-collaboration-calendar-store.mjs';
import { createWholesaleHttpHandler } from '../http/api.mjs';
import { createWholesaleFetchHandler } from '../http/fetch-api.mjs';

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
} = {}) {
  invariant(pool, 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  const store = createPostgresWholesaleStore({ pool });
  const catalogStore = createPostgresCatalogStore({ pool });
  const options = { store, ...(clock ? { clock } : {}), ...(nextId ? { nextId } : {}) };
  const auth = createAuthService({
    store: createPostgresAuthStore({ pool }),
    ...(clock ? { clock } : {}),
    ...(nextId ? { nextId } : {}),
    ...(randomBytesImpl ? { randomBytesImpl } : {}),
    ...(sessionTtlMs ? { sessionTtlMs } : {}),
    ...(maxLoginFailures ? { maxLoginFailures } : {}),
    ...(loginWindowMs ? { loginWindowMs } : {}),
    ...(loginBlockMs ? { loginBlockMs } : {}),
    ...(revokedSessionRetentionMs ? { revokedSessionRetentionMs } : {}),
  });
  const readiness = migrationsDir ? createPostgresReadinessService({ pool, migrationsDir, ...(clock ? { clock } : {}) }) : undefined;
  const platform = createWholesalePlatform(options);
  const catalog = createCatalogService({ wholesaleStore: store, catalogStore, ...(clock ? { clock } : {}), ...(nextId ? { nextId } : {}) });
  const partners = createPartnerAccessService(options);
  const collaboration = createShowroomSelectionService({ ...options, catalogReader: catalog });
  const orders = createOrderBuilderService(options);
  const projectionStore = createPostgresNotificationProjectionStore({ pool });
  const notifications = createNotificationService({ sourceStore: store, projectionStore, ...(clock ? { clock } : {}), ...(nextId ? { nextId } : {}) });
  const workspaceReader = createPostgresWorkspaceReader({ pool });
  const workspace = createWorkspaceQueryService({ reader: workspaceReader });
  const collaborationCalendar = createCollaborationCalendarService({
    store: createPostgresCollaborationCalendarStore({ pool }),
    membershipReader: store,
    ...(clock ? { clock } : {}),
    ...(nextId ? { nextId } : {}),
  });
  const transport = { authenticate: auth.authenticate, auth, readiness, platform, catalog, partners, collaboration, orders, notifications, workspace, collaborationCalendar };
  const handler = createWholesaleHttpHandler(transport);
  const fetchHandler = createWholesaleFetchHandler(transport);
  return Object.freeze({ auth, readiness, store, catalogStore, platform, catalog, partners, collaboration, orders, notifications, workspace, collaborationCalendar, handler, fetchHandler });
}
