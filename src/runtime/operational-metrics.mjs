import { timingSafeEqual } from 'node:crypto';
import process from 'node:process';

const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const HTTP_BUCKETS_MS = Object.freeze([5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000]);
const WORKER_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const WORKER_OUTCOMES = new Set(['published', 'failed', 'dead-letter', 'lease-lost', 'acknowledgement-failed', 'projected', 'skipped', 'other']);
const MAINTENANCE_STATUSES = new Set(['completed', 'skipped-lock', 'not-due', 'failed', 'unknown']);

export function createOperationalMetrics({ pool, token, clock = () => Date.now(), processRef = process, cacheTtlMs = 5_000 } = {}) {
  if (pool !== undefined && (!pool || typeof pool.query !== 'function')) throw new Error('Metrics PostgreSQL pool must expose query(sql)');
  if (token !== undefined && (typeof token !== 'string' || token.length < 32 || token.length > 512)) {
    throw new Error('Metrics token must contain from 32 to 512 characters');
  }
  if (typeof clock !== 'function') throw new Error('Metrics clock is required');
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 100 || cacheTtlMs > 60_000) {
    throw new Error('Metrics cache TTL must be an integer from 100 to 60000ms');
  }

  const startedAtMs = nowMs(clock);
  const httpRequests = new Map();
  const httpDurations = new Map();
  const workerResults = new Map();
  const workers = new Map();
  const maintenanceRuns = new Map();
  let maintenanceDeleted = 0;
  let maintenanceLastCompletedAt = 0;
  let collectionErrors = 0;
  let postgresCache = Object.freeze({ expiresAtMs: 0, up: 0, stale: 0, snapshot: undefined });
  let postgresCollection;

  const metrics = {
    enabled: Boolean(token),
    contentType: PROMETHEUS_CONTENT_TYPE,

    authorize(authorization) {
      if (!token || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
      const candidate = authorization.slice(7);
      const expected = Buffer.from(token);
      const provided = Buffer.from(candidate);
      return expected.length === provided.length && timingSafeEqual(expected, provided);
    },

    recordHttp({ method, pathname, status, durationMs }) {
      const duration = Number(durationMs);
      if (!Number.isFinite(duration) || duration < 0) return false;
      increment(httpRequests, labelKey([normalizeMethod(method), classifyRoute(pathname), normalizeStatus(status)]));
      observe(httpDurations, labelKey([normalizeMethod(method), classifyRoute(pathname)]), duration);
      return true;
    },

    recordWorkerBatch(worker, results) {
      validateWorkerName(worker);
      if (!Array.isArray(results)) throw new Error('Worker batch results must be an array');
      for (const result of results) {
        const candidate = typeof result?.status === 'string' ? result.status : 'other';
        increment(workerResults, labelKey([worker, WORKER_OUTCOMES.has(candidate) ? candidate : 'other']));
      }
    },

    registerWorker(worker, healthProvider) {
      validateWorkerName(worker);
      if (typeof healthProvider !== 'function') throw new Error('Worker metrics provider must be a function');
      if (workers.has(worker)) throw new Error(`Worker metrics are already registered: ${worker}`);
      workers.set(worker, healthProvider);
      let registered = true;
      return () => {
        if (!registered) return false;
        registered = false;
        return workers.delete(worker);
      };
    },

    recordMaintenance(result) {
      const candidate = typeof result?.status === 'string' ? result.status : 'unknown';
      const status = MAINTENANCE_STATUSES.has(candidate) ? candidate : 'unknown';
      increment(maintenanceRuns, status);
      if (status !== 'completed') return;
      maintenanceLastCompletedAt = nowMs(clock);
      maintenanceDeleted += Object.values(result?.counts ?? {}).reduce((sum, value) => {
        const number = Number(value);
        return Number.isSafeInteger(number) && number > 0 ? sum + number : sum;
      }, 0);
    },

    async render() {
      const lines = [];
      const now = nowMs(clock);
      const memory = typeof processRef?.memoryUsage === 'function' ? processRef.memoryUsage() : {};
      const postgres = await readPostgresMetrics();
      const workerSamples = { ready: [], active: [], runs: [], failures: [], consecutiveFailures: [] };

      for (const [worker, provider] of workers) {
        try {
          const health = await provider();
          workerSamples.ready.push([[worker], health?.status === 'ready' ? 1 : 0]);
          workerSamples.active.push([[worker], health?.active ? 1 : 0]);
          workerSamples.runs.push([[worker], finite(health?.runCount)]);
          workerSamples.failures.push([[worker], finite(health?.failureCount)]);
          workerSamples.consecutiveFailures.push([[worker], finite(health?.consecutiveFailures)]);
        } catch {
          collectionErrors += 1;
          workerSamples.ready.push([[worker], 0]);
          workerSamples.active.push([[worker], 0]);
        }
      }

      metric(lines, 'syntha_process_uptime_seconds', 'Process uptime in seconds.', 'gauge', [], [[[], Math.max(0, (now - startedAtMs) / 1_000)]]);
      metric(lines, 'syntha_process_resident_memory_bytes', 'Resident process memory in bytes.', 'gauge', [], [[[], finite(memory.rss)]]);
      metric(lines, 'syntha_process_heap_used_bytes', 'Used JavaScript heap in bytes.', 'gauge', [], [[[], finite(memory.heapUsed)]]);
      metric(lines, 'syntha_postgres_pool_connections', 'PostgreSQL pool connections by state.', 'gauge', ['state'], [
        [['total'], finite(pool?.totalCount)],
        [['idle'], finite(pool?.idleCount)],
        [['waiting'], finite(pool?.waitingCount)],
      ]);
      metric(lines, 'syntha_metrics_collector_up', 'Whether an operational metrics collector succeeded.', 'gauge', ['collector'], [[['postgres'], postgres.up]]);
      metric(lines, 'syntha_metrics_collector_stale', 'Whether a collector is serving its last successful snapshot.', 'gauge', ['collector'], [[['postgres'], postgres.stale]]);

      if (postgres.snapshot) {
        metric(lines, 'syntha_queue_records', 'Operational queue records by queue and state.', 'gauge', ['queue', 'state'], [
          [['outbox', 'pending'], postgres.snapshot.outboxPending],
          [['outbox', 'dead-letter'], postgres.snapshot.outboxDeadLetter],
          [['catalog-outbox', 'pending'], postgres.snapshot.catalogOutboxPending],
          [['outbox-publication', 'active'], postgres.snapshot.outboxClaimsActive],
          [['outbox-publication', 'scheduled'], postgres.snapshot.outboxClaimsScheduled],
          [['outbox-publication', 'expired'], postgres.snapshot.outboxClaimsExpired],
          [['notification-projection', 'backlog'], postgres.snapshot.notificationBacklog],
          [['notification-projection', 'active'], postgres.snapshot.notificationClaimsActive],
          [['notification-projection', 'expired'], postgres.snapshot.notificationClaimsExpired],
          [['notifications', 'unread'], postgres.snapshot.notificationsUnread],
          [['auth-sessions', 'active'], postgres.snapshot.activeSessions],
        ]);
      }

      mapMetric(lines, 'syntha_http_requests_total', 'HTTP requests by method, bounded route group and status.', 'counter', ['method', 'route_group', 'status'], httpRequests);
      histogramMetric(lines, 'syntha_http_request_duration_milliseconds', 'HTTP request duration in milliseconds.', ['method', 'route_group'], httpDurations);
      mapMetric(lines, 'syntha_worker_results_total', 'Background worker result records by bounded outcome.', 'counter', ['worker', 'outcome'], workerResults);
      metric(lines, 'syntha_worker_ready', 'Whether a background worker is ready.', 'gauge', ['worker'], workerSamples.ready);
      metric(lines, 'syntha_worker_active', 'Whether a background worker is currently active.', 'gauge', ['worker'], workerSamples.active);
      metric(lines, 'syntha_worker_runs_total', 'Background worker runs.', 'counter', ['worker'], workerSamples.runs);
      metric(lines, 'syntha_worker_failures_total', 'Background worker failures.', 'counter', ['worker'], workerSamples.failures);
      metric(lines, 'syntha_worker_consecutive_failures', 'Current consecutive worker failures.', 'gauge', ['worker'], workerSamples.consecutiveFailures);
      mapMetric(lines, 'syntha_maintenance_runs_total', 'Retention maintenance runs by status.', 'counter', ['status'], maintenanceRuns);
      metric(lines, 'syntha_maintenance_deleted_records_total', 'Records deleted by retention maintenance.', 'counter', [], [[[], maintenanceDeleted]]);
      metric(lines, 'syntha_maintenance_last_completed_timestamp_seconds', 'Unix timestamp of the last completed maintenance run.', 'gauge', [], [[[], maintenanceLastCompletedAt > 0 ? maintenanceLastCompletedAt / 1_000 : 0]]);
      metric(lines, 'syntha_metrics_collection_errors_total', 'Metrics collector failures.', 'counter', [], [[[], collectionErrors]]);
      return `${lines.join('\n')}\n`;
    },
  };

  return Object.freeze(metrics);

  async function readPostgresMetrics() {
    if (!pool) return Object.freeze({ up: 0, stale: 0, snapshot: undefined });
    const now = nowMs(clock);
    if (now < postgresCache.expiresAtMs) return postgresCache;
    if (postgresCollection) return postgresCollection;
    postgresCollection = (async () => {
      try {
        const snapshot = await collectPostgres(pool);
        postgresCache = Object.freeze({ up: 1, stale: 0, snapshot, expiresAtMs: now + cacheTtlMs });
      } catch {
        collectionErrors += 1;
        postgresCache = Object.freeze({
          up: 0,
          stale: postgresCache.snapshot ? 1 : 0,
          snapshot: postgresCache.snapshot,
          expiresAtMs: now + cacheTtlMs,
        });
      } finally {
        postgresCollection = undefined;
      }
      return postgresCache;
    })();
    return postgresCollection;
  }
}

async function collectPostgres(pool) {
  const result = await pool.query(
    `SELECT
       (SELECT count(*)::bigint FROM outbox_events WHERE status = 'pending') AS outbox_pending,
       (SELECT count(*)::bigint FROM outbox_events WHERE status = 'dead-letter') AS outbox_dead_letter,
       (SELECT count(*)::bigint FROM catalog_outbox_events WHERE status = 'pending') AS catalog_outbox_pending,
       (SELECT count(*)::bigint FROM outbox_publication_claims WHERE lease_expires_at > now() AND next_attempt_at <= now()) AS outbox_claims_active,
       (SELECT count(*)::bigint FROM outbox_publication_claims WHERE next_attempt_at > now()) AS outbox_claims_scheduled,
       (SELECT count(*)::bigint FROM outbox_publication_claims WHERE lease_expires_at <= now() AND next_attempt_at <= now()) AS outbox_claims_expired,
       (SELECT count(*)::bigint
          FROM outbox_events AS source
         WHERE NOT EXISTS (SELECT 1 FROM notification_projections AS projected WHERE projected.event_id = source.id)) AS notification_backlog,
       (SELECT count(*)::bigint FROM notification_projection_claims WHERE lease_expires_at > now()) AS notification_claims_active,
       (SELECT count(*)::bigint FROM notification_projection_claims WHERE lease_expires_at <= now()) AS notification_claims_expired,
       (SELECT count(*)::bigint FROM notifications WHERE status = 'unread') AS notifications_unread,
       (SELECT count(*)::bigint FROM auth_sessions WHERE status = 'active' AND expires_at > now()) AS active_sessions`,
  );
  const row = result.rows[0] ?? {};
  return Object.freeze({
    outboxPending: count(row.outbox_pending),
    outboxDeadLetter: count(row.outbox_dead_letter),
    catalogOutboxPending: count(row.catalog_outbox_pending),
    outboxClaimsActive: count(row.outbox_claims_active),
    outboxClaimsScheduled: count(row.outbox_claims_scheduled),
    outboxClaimsExpired: count(row.outbox_claims_expired),
    notificationBacklog: count(row.notification_backlog),
    notificationClaimsActive: count(row.notification_claims_active),
    notificationClaimsExpired: count(row.notification_claims_expired),
    notificationsUnread: count(row.notifications_unread),
    activeSessions: count(row.active_sessions),
  });
}

function classifyRoute(pathname) {
  if (typeof pathname !== 'string') return 'unknown';
  if (['/health', '/ready', '/metrics', '/openapi.json'].includes(pathname)) return 'operational';
  if (pathname.startsWith('/v2/auth/')) return 'auth';
  if (pathname === '/v2/workspace') return 'workspace';
  if (pathname.startsWith('/v2/notifications')) return 'notifications';
  if (pathname.startsWith('/v2/catalog')) return 'catalog';
  if (pathname.startsWith('/v2/orders')) return 'orders';
  if (/^\/v2\/(campaigns|collections|showrooms|relationships|invitations|cycles|selections)(?:\/|$)/.test(pathname)) return 'commerce';
  if (pathname.startsWith('/v2/')) return 'other-v2';
  return 'unknown';
}

function normalizeMethod(value) {
  const method = typeof value === 'string' ? value.toUpperCase() : 'UNKNOWN';
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) ? method : 'OTHER';
}
function normalizeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : '0';
}
function validateWorkerName(value) {
  if (typeof value !== 'string' || !WORKER_NAME.test(value)) throw new Error('Worker metric name is invalid');
}
function increment(map, key, value = 1) { map.set(key, (map.get(key) ?? 0) + value); }
function observe(map, key, value) {
  let state = map.get(key);
  if (!state) {
    state = { count: 0, sum: 0, buckets: HTTP_BUCKETS_MS.map(() => 0) };
    map.set(key, state);
  }
  state.count += 1;
  state.sum += value;
  HTTP_BUCKETS_MS.forEach((boundary, index) => { if (value <= boundary) state.buckets[index] += 1; });
}
function mapMetric(lines, name, help, type, labelNames, values) {
  metric(lines, name, help, type, labelNames, [...values.entries()].map(([key, value]) => [JSON.parse(key), value]));
}
function histogramMetric(lines, name, help, labelNames, values) {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} histogram`);
  for (const [key, state] of values) {
    const labels = JSON.parse(key);
    HTTP_BUCKETS_MS.forEach((boundary, index) => {
      lines.push(`${name}_bucket${formatLabels([...labelNames, 'le'], [...labels, String(boundary)])} ${state.buckets[index]}`);
    });
    lines.push(`${name}_bucket${formatLabels([...labelNames, 'le'], [...labels, '+Inf'])} ${state.count}`);
    lines.push(`${name}_sum${formatLabels(labelNames, labels)} ${number(state.sum)}`);
    lines.push(`${name}_count${formatLabels(labelNames, labels)} ${state.count}`);
  }
}
function metric(lines, name, help, type, labelNames, samples) {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);
  for (const [labels, value] of samples) lines.push(`${name}${formatLabels(labelNames, labels)} ${number(value)}`);
}
function formatLabels(names, values) {
  if (!names.length) return '';
  return `{${names.map((name, index) => `${name}="${escapeLabel(values[index])}"`).join(',')}}`;
}
function escapeLabel(value) { return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"'); }
function labelKey(values) { return JSON.stringify(values); }
function count(value) { const parsed = Number(value ?? 0); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0; }
function finite(value) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function number(value) { return Number.isFinite(Number(value)) ? String(Number(value)) : '0'; }
function nowMs(clock) {
  const value = clock();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Metrics clock returned an invalid value');
  return parsed;
}

export { PROMETHEUS_CONTENT_TYPE };
