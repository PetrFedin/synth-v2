import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackgroundWorker } from '../src/runtime/background-worker.mjs';
import { createHealthRegistry } from '../src/runtime/health-registry.mjs';
import { createPostgresReadinessService } from '../src/application/readiness-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const currentMigrations = Object.freeze({
  totalCount: 3,
  appliedCount: 3,
  pending: Object.freeze([]),
  mismatched: Object.freeze([]),
  unknown: Object.freeze([]),
});

function nextTurn() { return new Promise((resolve) => setImmediate(resolve)); }

test('worker health reports success, staleness and consecutive failures', async () => {
  let now = 0;
  const timers = [];
  const successful = createBackgroundWorker({
    name: 'successful-worker',
    intervalMs: 100,
    task: async () => {},
    clock: () => now,
    setTimeoutImpl: (fn) => { timers.push(fn); return { unref() {} }; },
    clearTimeoutImpl: () => {},
  });
  assert.equal(successful.health().reason, 'worker-not-running');
  successful.start();
  await nextTurn();
  let status = successful.health({ maxStalenessMs: 500, maxConsecutiveFailures: 2 });
  assert.equal(status.status, 'ready');
  assert.equal(status.runCount, 1);
  assert.equal(status.successCount, 1);
  now = 501;
  status = successful.health({ maxStalenessMs: 500, maxConsecutiveFailures: 2 });
  assert.equal(status.status, 'not-ready');
  assert.equal(status.reason, 'worker-stale');
  await successful.stop();

  now = 0;
  const failing = createBackgroundWorker({
    name: 'failing-worker',
    intervalMs: 100,
    task: async () => { throw Object.assign(new Error('temporary'), { code: 'TEMPORARY_FAILURE' }); },
    clock: () => now,
    logger: {},
    setTimeoutImpl: () => ({ unref() {} }),
    clearTimeoutImpl: () => {},
  });
  failing.start();
  await nextTurn();
  await failing.runOnce();
  status = failing.health({ maxStalenessMs: 500, maxConsecutiveFailures: 2 });
  assert.equal(status.status, 'not-ready');
  assert.equal(status.reason, 'consecutive-failures');
  assert.equal(status.failureCount, 2);
  assert.equal(status.lastErrorCode, 'TEMPORARY_FAILURE');
  await failing.stop();
});

test('health registry isolates bad probes and supports deterministic unregister', async () => {
  const registry = createHealthRegistry();
  const unregisterReady = registry.register('ready-probe', async () => ({ status: 'ready', detail: { count: 1 } }));
  const unregisterFailed = registry.register('failed-probe', async () => { throw new Error('secret failure'); });
  let result = await registry.check();
  assert.equal(result.status, 'not-ready');
  assert.equal(result.failedCheck, 'failed-probe');
  assert.equal(result.checks['failed-probe'].reason, 'probe-failed');
  assert.equal(JSON.stringify(result).includes('secret failure'), false);
  assert.equal(Object.isFrozen(result.checks['ready-probe'].detail), true);
  assert.equal(unregisterFailed(), true);
  assert.equal(unregisterFailed(), false);
  result = await registry.check();
  assert.equal(result.status, 'ready');
  assert.equal(unregisterReady(), true);
  assert.equal(registry.size, 0);
});

test('readiness becomes unavailable when an operational dependency is unhealthy', async () => {
  const readiness = createPostgresReadinessService({
    pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
    migrationsDir: '/migrations',
    clock: () => '2026-08-02T00:00:00.000Z',
    migrationInspector: async () => currentMigrations,
    operationalCheck: async () => ({
      status: 'not-ready',
      reason: 'operational-dependency-unavailable',
      failedCheck: 'notification-projection',
      checks: { 'notification-projection': { status: 'not-ready', reason: 'worker-stale' } },
    }),
  });
  const result = await readiness.check();
  assert.equal(result.status, 'not-ready');
  assert.equal(result.reason, 'operational-dependency-unavailable');
  assert.equal(result.runtime.failedCheck, 'notification-projection');
  assert.equal(result.runtime.checks['notification-projection'].reason, 'worker-stale');
  assert.equal(Object.isFrozen(result.runtime.checks['notification-projection']), true);
});

test('operational check failures are sanitized and migration drift takes precedence', async () => {
  const base = {
    pool: { query: async () => ({ rows: [] }) },
    migrationsDir: '/migrations',
    clock: () => '2026-08-02T00:00:00.000Z',
  };
  const failed = createPostgresReadinessService({
    ...base,
    migrationInspector: async () => currentMigrations,
    operationalCheck: async () => { throw new Error('postgresql://secret:password@internal'); },
  });
  const failedResult = await failed.check();
  assert.equal(failedResult.status, 'not-ready');
  assert.equal(failedResult.reason, 'operational-check-failed');
  assert.equal(JSON.stringify(failedResult).includes('password'), false);

  let operationalCalls = 0;
  const drift = createPostgresReadinessService({
    ...base,
    migrationInspector: async () => ({ ...currentMigrations, pending: ['004.sql'], appliedCount: 2 }),
    operationalCheck: async () => { operationalCalls += 1; return { status: 'ready' }; },
  });
  const driftResult = await drift.check();
  assert.equal(driftResult.reason, 'migration-drift');
  assert.equal(operationalCalls, 0);
});

test('production server registers worker health before listen and exposes it through runtime readiness', async () => {
  const source = await readFile(path.join(root, 'src', 'server.mjs'), 'utf8');
  assert.match(source, /createHealthRegistry/);
  assert.match(source, /operationalReadiness: \(\) => healthRegistry\.check\(\)/);
  assert.match(source, /healthRegistry\.register\('notification-projection'/);
  assert.match(source, /notificationWorker\.health\(\{/);
  assert.ok(source.indexOf("healthRegistry.register('notification-projection'") < source.indexOf('await listen(server'));
  assert.ok(source.indexOf('await listen(server') < source.indexOf('notificationWorker.start()'));
  assert.match(source, /result\.status === 'failed' && result\.retryable/);
});
