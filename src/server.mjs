import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createHttpOutboxPublisher } from './infrastructure/http-outbox-publisher.mjs';
import { migratePostgres, waitForPostgres } from './infrastructure/postgres-migrator.mjs';
import { createOperationalMetricsHandler } from './http/operational-metrics-handler.mjs';
import { createPostgresWholesaleRuntime } from './runtime/postgres-runtime.mjs';
import { createBackgroundWorker } from './runtime/background-worker.mjs';
import { createHealthRegistry } from './runtime/health-registry.mjs';
import { createOperationalMetrics } from './runtime/operational-metrics.mjs';
import { configureHttpServer, createShutdownCoordinator, listen, readIntegerSetting } from './runtime/server-lifecycle.mjs';
import { createStandaloneHandler } from './web/static-handler.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const OUTBOX_LEASE_SAFETY_MARGIN_MS = 1_000;
const databaseUrl = process.env.SYNTHA_V2_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('SYNTHA_V2_DATABASE_URL is required');

const outboxWebhookUrl = process.env.SYNTHA_OUTBOX_WEBHOOK_URL?.trim() || undefined;
const outboxWebhookSecret = secretSetting('SYNTHA_OUTBOX_WEBHOOK_SECRET');
if (Boolean(outboxWebhookUrl) !== Boolean(outboxWebhookSecret)) {
  throw new Error('SYNTHA_OUTBOX_WEBHOOK_URL and SYNTHA_OUTBOX_WEBHOOK_SECRET must be configured together');
}

const metricsEnabled = booleanSetting('SYNTHA_METRICS_ENABLED', false);
const metricsToken = secretSetting('SYNTHA_METRICS_TOKEN');
if (metricsEnabled && !metricsToken) throw new Error('SYNTHA_METRICS_TOKEN is required when SYNTHA_METRICS_ENABLED is true');

const notificationProjectionIntervalMs = integerSetting('SYNTHA_NOTIFICATION_PROJECTION_INTERVAL_MS', 1_000, 100, 60_000);
const outboxPublicationIntervalMs = integerSetting('SYNTHA_OUTBOX_PUBLICATION_INTERVAL_MS', 1_000, 100, 60_000);
const settings = Object.freeze({
  port: integerSetting('PORT', 4100, 1, 65_535),
  host: process.env.HOST?.trim() || '127.0.0.1',
  dbPoolMax: integerSetting('SYNTHA_DB_POOL_MAX', 10, 1, 100),
  dbConnectTimeoutMs: integerSetting('SYNTHA_DB_CONNECT_TIMEOUT_MS', 5_000, 100, 60_000),
  dbIdleTimeoutMs: integerSetting('SYNTHA_DB_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),
  dbStatementTimeoutMs: integerSetting('SYNTHA_DB_STATEMENT_TIMEOUT_MS', 30_000, 0, 600_000),
  dbLockTimeoutMs: integerSetting('SYNTHA_DB_LOCK_TIMEOUT_MS', 5_000, 0, 600_000),
  dbIdleInTransactionTimeoutMs: integerSetting('SYNTHA_DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 60_000, 0, 600_000),
  maintenanceStatementTimeoutMs: integerSetting('SYNTHA_DB_MAINTENANCE_STATEMENT_TIMEOUT_MS', 0, 0, 3_600_000),
  dbReadyAttempts: integerSetting('SYNTHA_DB_READY_ATTEMPTS', 30, 1, 300),
  dbReadyDelayMs: integerSetting('SYNTHA_DB_READY_DELAY_MS', 1_000, 10, 60_000),
  sessionTtlMs: integerSetting('SYNTHA_SESSION_TTL_MS', 43_200_000, 60_000, 31_536_000_000),
  maxLoginFailures: integerSetting('SYNTHA_AUTH_MAX_FAILURES', 5, 2, 100),
  loginWindowMs: integerSetting('SYNTHA_AUTH_WINDOW_MS', 900_000, 60_000, 86_400_000),
  loginBlockMs: integerSetting('SYNTHA_AUTH_BLOCK_MS', 900_000, 60_000, 86_400_000),
  revokedSessionRetentionMs: integerSetting('SYNTHA_REVOKED_SESSION_RETENTION_MS', 7 * DAY_MS, DAY_MS, 31_536_000_000),
  notificationProjectionIntervalMs,
  notificationProjectionBatchSize: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_BATCH_SIZE', 100, 1, 1_000),
  notificationProjectionWorkerId: process.env.SYNTHA_NOTIFICATION_PROJECTION_WORKER_ID?.trim() || undefined,
  notificationProjectionLeaseMs: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_LEASE_MS', 30_000, 1_000, 900_000),
  notificationProjectionRetryDelayMs: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_RETRY_DELAY_MS', 5_000, 100, 300_000),
  notificationProjectionMaxAttempts: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_MAX_ATTEMPTS', 5, 1, 100),
  notificationProjectionStaleMs: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_STALE_MS', notificationProjectionIntervalMs * 5, notificationProjectionIntervalMs, 300_000),
  notificationProjectionFailureThreshold: integerSetting('SYNTHA_NOTIFICATION_PROJECTION_FAILURE_THRESHOLD', 3, 1, 100),
  outboxWebhookUrl,
  outboxWebhookSecret,
  outboxWebhookTimeoutMs: integerSetting('SYNTHA_OUTBOX_WEBHOOK_TIMEOUT_MS', 10_000, 100, 120_000),
  outboxAllowInsecureLocalhost: booleanSetting('SYNTHA_OUTBOX_ALLOW_INSECURE_LOCALHOST', false),
  outboxPublicationIntervalMs,
  outboxPublicationBatchSize: integerSetting('SYNTHA_OUTBOX_PUBLICATION_BATCH_SIZE', 25, 1, 100),
  outboxPublicationParallelism: integerSetting('SYNTHA_OUTBOX_PUBLICATION_PARALLELISM', 4, 1, 16),
  outboxPublicationWorkerId: process.env.SYNTHA_OUTBOX_PUBLICATION_WORKER_ID?.trim() || undefined,
  outboxPublicationLeaseMs: integerSetting('SYNTHA_OUTBOX_PUBLICATION_LEASE_MS', 300_000, 30_000, 3_600_000),
  outboxPublicationRetryDelayMs: integerSetting('SYNTHA_OUTBOX_PUBLICATION_RETRY_DELAY_MS', 5_000, 100, 3_600_000),
  outboxPublicationMaxRetryDelayMs: integerSetting('SYNTHA_OUTBOX_PUBLICATION_MAX_RETRY_DELAY_MS', 300_000, 100, 86_400_000),
  outboxPublicationMaxAttempts: integerSetting('SYNTHA_OUTBOX_PUBLICATION_MAX_ATTEMPTS', 10, 1, 100),
  outboxPublicationStaleMs: integerSetting('SYNTHA_OUTBOX_PUBLICATION_STALE_MS', outboxPublicationIntervalMs * 5, outboxPublicationIntervalMs, 3_600_000),
  outboxPublicationFailureThreshold: integerSetting('SYNTHA_OUTBOX_PUBLICATION_FAILURE_THRESHOLD', 3, 1, 100),
  maintenanceIntervalMs: integerSetting('SYNTHA_MAINTENANCE_INTERVAL_MS', 6 * 60 * 60 * 1000, 60_000, 31_536_000_000),
  maintenanceRetryDelayMs: integerSetting('SYNTHA_MAINTENANCE_RETRY_DELAY_MS', 5 * 60 * 1000, 1_000, 3_600_000),
  commandRetentionMs: integerSetting('SYNTHA_COMMAND_RETENTION_MS', 30 * DAY_MS, DAY_MS, 31_536_000_000),
  authAuditRetentionMs: integerSetting('SYNTHA_AUTH_AUDIT_RETENTION_MS', 90 * DAY_MS, DAY_MS, 31_536_000_000),
  throttleRetentionMs: integerSetting('SYNTHA_AUTH_THROTTLE_RETENTION_MS', 7 * DAY_MS, DAY_MS, 31_536_000_000),
  outboxRetentionMs: integerSetting('SYNTHA_OUTBOX_RETENTION_MS', 30 * DAY_MS, DAY_MS, 31_536_000_000),
  metricsEnabled,
  metricsToken: metricsEnabled ? metricsToken : undefined,
  metricsCacheTtlMs: integerSetting('SYNTHA_METRICS_CACHE_TTL_MS', 5_000, 100, 60_000),
  requestTimeoutMs: integerSetting('SYNTHA_HTTP_REQUEST_TIMEOUT_MS', 30_000, 1_000, 300_000),
  headersTimeoutMs: integerSetting('SYNTHA_HTTP_HEADERS_TIMEOUT_MS', 15_000, 1_000, 300_000),
  keepAliveTimeoutMs: integerSetting('SYNTHA_HTTP_KEEP_ALIVE_TIMEOUT_MS', 5_000, 100, 120_000),
  maxRequestsPerSocket: integerSetting('SYNTHA_HTTP_MAX_REQUESTS_PER_SOCKET', 1_000, 1, 100_000),
  maxHeadersCount: integerSetting('SYNTHA_HTTP_MAX_HEADERS_COUNT', 100, 16, 1_000),
  shutdownGraceMs: integerSetting('SYNTHA_SHUTDOWN_GRACE_MS', 10_000, 1_000, 120_000),
});
const requiredOutboxLeaseMs = (settings.outboxWebhookTimeoutMs * settings.outboxPublicationBatchSize) + OUTBOX_LEASE_SAFETY_MARGIN_MS;
if (settings.outboxWebhookUrl && (!Number.isSafeInteger(requiredOutboxLeaseMs) || settings.outboxPublicationLeaseMs <= requiredOutboxLeaseMs)) {
  throw new Error(`SYNTHA_OUTBOX_PUBLICATION_LEASE_MS must exceed ${requiredOutboxLeaseMs}ms for the configured webhook timeout and batch size`);
}
if (settings.outboxPublicationMaxRetryDelayMs < settings.outboxPublicationRetryDelayMs) {
  throw new Error('SYNTHA_OUTBOX_PUBLICATION_MAX_RETRY_DELAY_MS must be at least SYNTHA_OUTBOX_PUBLICATION_RETRY_DELAY_MS');
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: settings.dbPoolMax,
  connectionTimeoutMillis: settings.dbConnectTimeoutMs,
  idleTimeoutMillis: settings.dbIdleTimeoutMs,
  statement_timeout: settings.dbStatementTimeoutMs,
  lock_timeout: settings.dbLockTimeoutMs,
  idle_in_transaction_session_timeout: settings.dbIdleInTransactionTimeoutMs,
});
pool.on('error', (error) => console.error('Unexpected idle PostgreSQL client error', error));

const healthRegistry = createHealthRegistry();
const operationalMetrics = createOperationalMetrics({
  pool,
  token: settings.metricsToken,
  cacheTtlMs: settings.metricsCacheTtlMs,
});
let server;
let notificationWorker;
let outboxWorker;
let unregisterNotificationHealth;
let unregisterOutboxHealth;
let unregisterNotificationMetrics;
let unregisterOutboxMetrics;
// Последнее известное состояние очереди. Снимок, а не запрос на каждый `/ready`: проверка
// готовности вызывается балансировщиком часто, и счёт по растущей таблице на каждый её запрос сам стал бы
// нагрузкой. Возраст самого снимка тоже сообщается — устаревшие цифры должны быть видны как устаревшие.
let outboxBacklog = null;
try {
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  await waitForPostgres({ pool, attempts: settings.dbReadyAttempts, delayMs: settings.dbReadyDelayMs });
  const migrationResult = await migratePostgres({ pool, migrationsDir });
  console.log(`Syntha V2 migrations: applied=${migrationResult.applied.length}, skipped=${migrationResult.skipped.length}`);

  const outboxPublisher = settings.outboxWebhookUrl ? createHttpOutboxPublisher({
    endpoint: settings.outboxWebhookUrl,
    secret: settings.outboxWebhookSecret,
    timeoutMs: settings.outboxWebhookTimeoutMs,
    allowInsecureLocalhost: settings.outboxAllowInsecureLocalhost,
  }) : undefined;
  const runtime = createPostgresWholesaleRuntime({
    pool,
    migrationsDir,
    sessionTtlMs: settings.sessionTtlMs,
    maxLoginFailures: settings.maxLoginFailures,
    loginWindowMs: settings.loginWindowMs,
    loginBlockMs: settings.loginBlockMs,
    revokedSessionRetentionMs: settings.revokedSessionRetentionMs,
    notificationProjectionWorkerId: settings.notificationProjectionWorkerId,
    notificationProjectionLeaseMs: settings.notificationProjectionLeaseMs,
    notificationProjectionRetryDelayMs: settings.notificationProjectionRetryDelayMs,
    notificationProjectionMaxAttempts: settings.notificationProjectionMaxAttempts,
    outboxPublisher,
    outboxPublicationWorkerId: settings.outboxPublicationWorkerId,
    outboxPublicationLeaseMs: settings.outboxPublicationLeaseMs,
    outboxPublicationRetryDelayMs: settings.outboxPublicationRetryDelayMs,
    outboxPublicationMaxRetryDelayMs: settings.outboxPublicationMaxRetryDelayMs,
    outboxPublicationMaxAttempts: settings.outboxPublicationMaxAttempts,
    maintenanceIntervalMs: settings.maintenanceIntervalMs,
    maintenanceRetryDelayMs: settings.maintenanceRetryDelayMs,
    maintenanceStatementTimeoutMs: settings.maintenanceStatementTimeoutMs,
    commandRetentionMs: settings.commandRetentionMs,
    authAuditRetentionMs: settings.authAuditRetentionMs,
    throttleRetentionMs: settings.throttleRetentionMs,
    outboxRetentionMs: settings.outboxRetentionMs,
    operationalReadiness: () => healthRegistry.check(),
  });
  // Один замер на старте и дальше по циклу обслуживания. Без него запуск с тысячей ждущих событий
  // и запуск с пустой очередью выглядят в журнале одинаково.
  const refreshOutboxBacklog = async () => {
    try {
      const backlog = await runtime.outboxPublicationStore.readBacklog();
      outboxBacklog = Object.freeze({ ...backlog, observedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('Outbox backlog could not be measured', error?.message || error);
    }
    return outboxBacklog;
  };
  await refreshOutboxBacklog();
  if (outboxBacklog?.pending > 0) {
    const waitedMs = outboxBacklog.oldestQueuedAt ? Date.now() - Date.parse(outboxBacklog.oldestQueuedAt) : 0;
    const waitedDays = Math.floor(waitedMs / DAY_MS);
    console.log(settings.outboxWebhookUrl
      ? `Syntha V2 outbox: ${outboxBacklog.pending} event(s) pending, oldest queued ${waitedDays} day(s) ago`
      : `Syntha V2 outbox: ${outboxBacklog.pending} event(s) pending and no subscriber is configured (SYNTHA_OUTBOX_WEBHOOK_URL is unset), oldest queued ${waitedDays} day(s) ago`);
  } else if (!settings.outboxWebhookUrl) {
    console.log('Syntha V2 outbox: no subscriber is configured (SYNTHA_OUTBOX_WEBHOOK_URL is unset); events accumulate as pending');
  }

  const applicationHandler = createStandaloneHandler({ apiHandler: runtime.handler });
  const handler = createOperationalMetricsHandler({ next: applicationHandler, metrics: operationalMetrics });
  server = configureHttpServer(createServer(handler), settings);
  notificationWorker = createBackgroundWorker({
    name: 'notification-projection',
    intervalMs: settings.notificationProjectionIntervalMs,
    task: async () => {
      const results = await runtime.notifications.projectPending({ limit: settings.notificationProjectionBatchSize });
      operationalMetrics.recordWorkerBatch('notification-projection', results);
      const terminalFailures = results.filter((result) => result.status === 'failed' && !result.retryable);
      if (terminalFailures.length) console.warn(`Notification projection checkpointed ${terminalFailures.length} terminal event failure(s)`);

      let maintenance;
      try {
        maintenance = await runtime.maintenance.runIfDue();
        operationalMetrics.recordMaintenance(maintenance);
      } catch (error) {
        operationalMetrics.recordMaintenance({ status: 'failed' });
        throw error;
      }
      if (maintenance.status === 'completed') {
        const deleted = Object.values(maintenance.counts).reduce((sum, value) => sum + Number(value || 0), 0);
        if (deleted > 0) console.log(`Syntha V2 maintenance removed ${deleted} expired record(s)`);
        // Обслуживание удаляет только доставленные и похороненные события — ждущие оно не трогает,
        // и правильно делает. Поэтому ровно здесь и надо пересматривать остаток: число, которое никто не
        // уменьшает, единственное, что может расти без предела.
        await refreshOutboxBacklog();
      }

      const retryableFailures = results.filter((result) => result.status === 'failed' && result.retryable);
      if (retryableFailures.length) {
        const error = new Error(`Notification projection failed for ${retryableFailures.length} retryable event(s)`);
        error.code = 'NOTIFICATION_PROJECTION_RETRYABLE_FAILURE';
        error.failures = retryableFailures;
        throw error;
      }
    },
  });
  const notificationHealth = () => notificationWorker.health({
    maxStalenessMs: settings.notificationProjectionStaleMs,
    maxConsecutiveFailures: settings.notificationProjectionFailureThreshold,
  });
  unregisterNotificationHealth = healthRegistry.register('notification-projection', notificationHealth);
  unregisterNotificationMetrics = operationalMetrics.registerWorker('notification-projection', notificationHealth);

  if (!runtime.outboxPublication) {
    // Отсутствие подписчика не делает узел неготовым: работа без внешнего потребителя событий —
    // законная настройка, и платформа не вправе решать за эксплуатацию, нужен ли он. Но проверка
    // готовности больше не молчит об этом: раньше `/ready` отвечал 200 и не упоминал очередь вовсе,
    // потому что проверял живость **зарегистрированных** работников, а этот не регистрировался.
    unregisterOutboxHealth = healthRegistry.register('outbox-publication', () => Object.freeze({
      status: 'ready',
      publisher: 'not-configured',
      pending: outboxBacklog?.pending ?? null,
      oldestQueuedAt: outboxBacklog?.oldestQueuedAt ?? null,
      observedAt: outboxBacklog?.observedAt ?? null,
    }));
  }

  if (runtime.outboxPublication) {
    outboxWorker = createBackgroundWorker({
      name: 'outbox-publication',
      intervalMs: settings.outboxPublicationIntervalMs,
      task: async () => {
        const results = await runtime.outboxPublication.publishPending({
          limit: settings.outboxPublicationBatchSize,
          parallelism: settings.outboxPublicationParallelism,
        });
        operationalMetrics.recordWorkerBatch('outbox-publication', results);
        const deadLetters = results.filter((result) => result.status === 'dead-letter');
        if (deadLetters.length) console.warn(`Outbox publication dead-lettered ${deadLetters.length} event(s)`);
        const retryableFailures = results.filter((result) => result.retryable);
        if (retryableFailures.length) {
          const error = new Error(`Outbox publication requires retry for ${retryableFailures.length} event(s)`);
          error.code = 'OUTBOX_PUBLICATION_RETRYABLE_FAILURE';
          error.failures = retryableFailures;
          throw error;
        }
      },
    });
    const outboxHealth = () => outboxWorker.health({
      maxStalenessMs: settings.outboxPublicationStaleMs,
      maxConsecutiveFailures: settings.outboxPublicationFailureThreshold,
    });
    unregisterOutboxHealth = healthRegistry.register('outbox-publication', outboxHealth);
    unregisterOutboxMetrics = operationalMetrics.registerWorker('outbox-publication', outboxHealth);
  }

  await listen(server, { port: settings.port, host: settings.host });
  notificationWorker.start();
  outboxWorker?.start();
  console.log(`Syntha V2 listening on http://${settings.host}:${settings.port}`);
} catch (error) {
  console.error('Syntha V2 failed to start', error);
  unregisterOutboxMetrics?.();
  unregisterNotificationMetrics?.();
  unregisterOutboxHealth?.();
  unregisterNotificationHealth?.();
  await outboxWorker?.stop().catch((workerError) => console.error('Failed to stop outbox worker after startup error', workerError));
  await notificationWorker?.stop().catch((workerError) => console.error('Failed to stop notification worker after startup error', workerError));
  server?.closeAllConnections?.();
  server = undefined;
  await pool.end().catch((poolError) => console.error('Failed to close PostgreSQL pool after startup error', poolError));
  process.exitCode = 1;
}

if (server) {
  const stoppers = [notificationWorker, outboxWorker].filter(Boolean).map((worker) => () => worker.stop());
  const shutdown = createShutdownCoordinator({
    server,
    pool,
    graceMs: settings.shutdownGraceMs,
    stoppers,
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

function secretSetting(name) {
  const raw = process.env[name];
  return raw === undefined || raw.length === 0 ? undefined : raw;
}

function booleanSetting(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean value`);
}
