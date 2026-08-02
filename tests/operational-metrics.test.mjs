import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalMetrics, PROMETHEUS_CONTENT_TYPE } from '../src/runtime/operational-metrics.mjs';

const TOKEN = '0123456789abcdef0123456789abcdef';

function databaseRow(overrides = {}) {
  return {
    outbox_pending: '7',
    outbox_dead_letter: '2',
    catalog_outbox_pending: '3',
    outbox_claims_active: '1',
    outbox_claims_scheduled: '4',
    outbox_claims_expired: '0',
    notification_backlog: '8',
    notification_claims_active: '1',
    notification_claims_expired: '2',
    notifications_unread: '9',
    active_sessions: '5',
    ...overrides,
  };
}

test('operational metrics validate configuration and protect bearer access', () => {
  assert.throws(() => createOperationalMetrics({ token: 'short' }), /32 to 512/);
  assert.throws(() => createOperationalMetrics({ cacheTtlMs: 99 }), /100 to 60000/);
  assert.throws(() => createOperationalMetrics({ pool: {} }), /must expose query/);

  const metrics = createOperationalMetrics({ token: TOKEN, clock: () => 1_000 });
  assert.equal(metrics.enabled, true);
  assert.equal(metrics.contentType, PROMETHEUS_CONTENT_TYPE);
  assert.equal(metrics.authorize(`Bearer ${TOKEN}`), true);
  assert.equal(metrics.authorize(`Bearer ${TOKEN}x`), false);
  assert.equal(metrics.authorize('Basic ignored'), false);
  assert.equal(metrics.authorize(undefined), false);
});

test('operational metrics expose bounded labels without sensitive identifiers', async () => {
  let now = 10_000;
  let queries = 0;
  const pool = {
    totalCount: 8,
    idleCount: 6,
    waitingCount: 1,
    async query(sql) {
      queries += 1;
      assert.match(sql, /notification_backlog/);
      return { rows: [databaseRow()] };
    },
  };
  const metrics = createOperationalMetrics({
    pool,
    token: TOKEN,
    clock: () => now,
    cacheTtlMs: 5_000,
    processRef: { memoryUsage: () => ({ rss: 1000, heapUsed: 500 }) },
  });

  metrics.recordHttp({ method: 'get', pathname: '/v2/catalog/skus/customer-secret-123', status: 200, durationMs: 12 });
  metrics.recordHttp({ method: 'POST', pathname: '/v2/orders/order-secret-456/submit', status: 409, durationMs: 37 });
  metrics.recordWorkerBatch('outbox-publication', [
    { status: 'published' },
    { status: 'dead-letter' },
    { status: 'unbounded-user-value' },
  ]);
  metrics.recordMaintenance({ status: 'completed', counts: { commands: 3, sessions: 2 } });
  const unregister = metrics.registerWorker('outbox-publication', () => ({
    status: 'ready', active: true, runCount: 10, failureCount: 2, consecutiveFailures: 0,
  }));

  const output = await metrics.render();
  assert.equal(queries, 1);
  assert.match(output, /syntha_metrics_collector_up\{collector="postgres"\} 1/);
  assert.match(output, /syntha_queue_records\{queue="notification-projection",state="backlog"\} 8/);
  assert.match(output, /syntha_http_requests_total\{method="GET",route_group="catalog",status="200"\} 1/);
  assert.match(output, /syntha_http_requests_total\{method="POST",route_group="orders",status="409"\} 1/);
  assert.match(output, /syntha_worker_results_total\{worker="outbox-publication",outcome="other"\} 1/);
  assert.match(output, /syntha_worker_ready\{worker="outbox-publication"\} 1/);
  assert.match(output, /syntha_maintenance_deleted_records_total 5/);
  assert.doesNotMatch(output, /customer-secret-123|order-secret-456|unbounded-user-value|0123456789abcdef/);
  assert.equal(output.endsWith('\n'), true);

  now += 1_000;
  await metrics.render();
  assert.equal(queries, 1, 'database collection should be cached inside the configured TTL');
  assert.equal(unregister(), true);
  assert.equal(unregister(), false);
});

test('database collector is single-flight and serves a bounded stale snapshot after failure', async () => {
  let now = 20_000;
  let queryMode = 'success';
  let queryCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pool = {
    async query() {
      queryCalls += 1;
      if (queryMode === 'wait') await gate;
      if (queryMode === 'failure') throw new Error('database unavailable');
      return { rows: [databaseRow({ outbox_pending: '11' })] };
    },
  };
  const metrics = createOperationalMetrics({ pool, clock: () => now, cacheTtlMs: 100 });

  const initial = await metrics.render();
  assert.match(initial, /syntha_queue_records\{queue="outbox",state="pending"\} 11/);
  assert.equal(queryCalls, 1);

  now += 101;
  queryMode = 'wait';
  const first = metrics.render();
  const second = metrics.render();
  await Promise.resolve();
  assert.equal(queryCalls, 2, 'concurrent scrapes must share one database query');
  release();
  await Promise.all([first, second]);

  now += 101;
  queryMode = 'failure';
  const stale = await metrics.render();
  assert.equal(queryCalls, 3);
  assert.match(stale, /syntha_metrics_collector_up\{collector="postgres"\} 0/);
  assert.match(stale, /syntha_metrics_collector_stale\{collector="postgres"\} 1/);
  assert.match(stale, /syntha_queue_records\{queue="outbox",state="pending"\} 11/);
  assert.match(stale, /syntha_metrics_collection_errors_total 1/);

  await metrics.render();
  assert.equal(queryCalls, 3, 'failed collections must also respect the retry cache TTL');
});

test('worker and input contracts reject unsafe metric cardinality', () => {
  const metrics = createOperationalMetrics({ clock: () => 1_000 });
  assert.throws(() => metrics.registerWorker('Worker With Spaces', () => ({})), /name is invalid/);
  assert.throws(() => metrics.registerWorker('worker', null), /provider/);
  assert.throws(() => metrics.recordWorkerBatch('worker', {}), /must be an array/);
  assert.equal(metrics.recordHttp({ method: 'GET', pathname: '/', status: 200, durationMs: -1 }), false);
});
