import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres, waitForPostgres } from './infrastructure/postgres-migrator.mjs';
import { createPostgresWholesaleRuntime } from './runtime/postgres-runtime.mjs';
import { createBackgroundWorker } from './runtime/background-worker.mjs';
import { createHealthRegistry } from './runtime/health-registry.mjs';
import { configureHttpServer, createShutdownCoordinator, listen, readIntegerSetting } from './runtime/server-lifecycle.mjs';
import { createStandaloneHandler } from './web/static-handler.mjs';

const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const notificationProjectionIntervalMs = integerSetting('SYNTHA_NOTIFICATION_PROJECTION_INTERVAL_MS', 1_000, 100, 60_000);
const settings = Object.freeze({
  port: integerSetting('PORT', 4100, 1, 65_535),
  host: process.env.HOST?.trim() || '127.0.0.1',
  dbPoolMax: integerSetting('SYNTHA_DB_POOL_MAX', 10, 1, 100),
  dbConnectTimeoutMs: integerSetting('SYNTHA_DB_CONNECT_TIMEOUT_MS', 5_000, 100, 60_000),
  dbIdleTimeoutMs: integerSetting('SYNTHA_DB_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),
  dbReadyAttempts: integerSetting('SYNTHA_DB_READY_ATTEMPTS', 30, 1, 300),
  dbReadyDelayMs: integerSetting('SYNTHA_DB_READY_DELAY_MS', 1_000, 10, 60_000),
  sessionTtlMs: integerSetting('SYNTHA_SESSION_TTL_MS', 43_200_000, 60_000, 31_536_000_000),
  maxLoginFailures: integerSetting('SYNTHA_AUTH_MAX_FAILURES', 5, 2, 100),
  loginWindowMs: integerSetting('SYNTHA_AUTH_WINDOW_MS', 900_000, 60_000, 86_400_000),
  loginBlockMs: integerSetting('SYNTHA_AUTH_BLOCK_MS', 900_000, 60_000, 86_400_000),
  revokedSessionRetentionMs: integerSetting('SYNTHA_REVOKED_SESSION_RETENTION_MS', 604_800_000, 60_000, 31_536_000_000),
  notificationProjectionIntervalMs,
  notificationProjectionBatchSize: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_BATCH_SIZE', 100, 1, 1_000),
  notificationProjectionStaleMs: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_STALE_MS', notificationProjectionIntervalMs * 5, notificationProjectionIntervalMs, 300_000),
  notificationProjectionFailureThreshold: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_FAILURE_THRESHOLD', 3, 1, 100),
  requestTimeoutMs: integerSetting('SYNTHA_HTTP_REQUEST_TIMEOUT_MS', 30_000, 1_000, 300_000),
  headersTimeoutMs: integerSetting('SYNTHA_HTTP_HEADERS_TIMEOUT_MS', 15_000, 1_000, 300_000),
  keepAliveTimeoutMs: integerSetting('SYNTHA_HTTP_KEEP_ALIVE_TIMEOUT_MS', 5_000, 100, 120_000),
  maxRequestsPerSocket: integerSetting('SYNTHA_HTTP_MAX_REQUESTS_PER_SOCKET', 1_000, 1, 100_000),
  maxHeadersCount: integerSetting('SYNTHA_HTTP_MAX_HEADERS_COUNT', 100, 16, 1_000),
  shutdownGraceMs: integerSetting('SYNTHA_SHUTDOWN_GRACE_MS', 10_000, 1_000, 120_000),
});

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: settings.dbPoolMax,
  connectionTimeoutMillis: settings.dbConnectTimeoutMs,
  idleTimeoutMillis: settings.dbIdleTimeoutMs,
});
pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error', error));

const healthRegistry = createHealthRegistry();
let server;
let notificationWorker;
let unregisterNotificationHealth;
try {
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  await waitForPostgres({ pool, attempts: settings.dbReadyAttempts, delayMs: settings.dbReadyDelayMs });
  const migrationResult = await migratePostgres({ pool, migrationsDir });
  console.log(`Syntha V2 migrations: applied=${migrationResult.applied.length}, skipped=${migrationResult.skipped.length}`);

  const runtime = createPostgresWholesaleRuntime({
    pool,
    migrationsDir,
    sessionTtlMs: settings.sessionTtlMs,
    maxLoginFailures: settings.maxLoginFailures,
    loginWindowMs: settings.loginWindowMs,
    loginBlockMs: settings.loginBlockMs,
    revokedSessionRetentionMs: settings.revokedSessionRetentionMs,
    operationalReadiness: () => healthRegistry.check(),
  });
  const handler = createStandaloneHandler({ apiHandler: runtime.handler });
  server = configureHttpServer(createServer(handler), settings);
  notificationWorker = createBackgroundWorker({
    name: 'notification-projection',
    intervalMs: settings.notificationProjectionIntervalMs,
    task: async () => {
      const results = await runtime.notifications.projectPending({ limit: settings.notificationProjectionBatchSize });
      const terminalFailures = results.filter((result) => result.status === 'failed' && !result.retryable);
      if (terminalFailures.length) console.warn(`Notification projection checkpointed ${terminalFailures.length} terminal event failure(s)`);
      const retryableFailures = results.filter((result) => result.status === 'failed' && result.retryable);
      if (retryableFailures.length) {
        const error = new Error(`Notification projection failed for ${retryableFailures.length} retryable event(s)`);
        error.code = 'NOTIFICATION_PROJECTION_RETRYABLE_FAILURE';
        error.failures = retryableFailures;
        throw error;
      }
    },
  });
  unregisterNotificationHealth = healthRegistry.register('notification-projection', () => notificationWorker.health({
    maxStalenessMs: settings.notificationProjectionStaleMs,
    maxConsecutiveFailures: settings.notificationProjectionFailureThreshold,
  }));

  await listen(server, { port: settings.port, host: settings.host });
  notificationWorker.start();
  console.log(`Syntha V2 listening on http://${settings.host}:${settings.port}`);
} catch (error) {
  console.error('Syntha V2 failed to start', error);
  unregisterNotificationHealth?.();
  await notificationWorker?.stop().catch((workerError) => console.error('Failed to stop notification worker after startup error', workerError));
  server?.closeAllConnections?.();
  server = undefined;
  await pool.end().catch((poolError) => console.error('Failed to close PostgreSQL pool after startup error', poolError));
  process.exitCode = 1;
}

if (server) {
  const shutdown = createShutdownCoordinator({
    server,
    pool,
    graceMs: settings.shutdownGraceMs,
    stoppers: notificationWorker ? [() => notificationWorker.stop()] : [],
  });
  const beginShutdown = (reason, error) => {
    if (error) console.error(`Fatal ${reason}`, error);
    process.exitCode = error ? 1 : (process.exitCode ?? 0);
    void shutdown(reason).catch((shutdownError) => {
      console.error('Syntha V2 shutdown failed', shutdownError);
      process.exitCode = 1;
      server.closeAllConnections?.();
    });
  };

  process.once('SIGINT', () => beginShutdown('SIGINT'));
  process.once('SIGTERM', () => beginShutdown('SIGTERM'));
  process.once('uncaughtException', (error) => beginShutdown('uncaughtException', error));
  process.once('unhandledRejection', (reason) => beginShutdown('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))));
  server.on('error', (error) => beginShutdown('httpServerError', error));
}

function integerSetting(name, defaultValue, min, max) {
  return readIntegerSetting(process.env[name], { name, defaultValue, min, max });
}
