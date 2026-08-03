import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShutdownCoordinator } from '../src/runtime/server-lifecycle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

test('shutdown waits for background workers before closing the database pool', async () => {
  const gate = deferred();
  const order = [];
  const server = {
    close(callback) { order.push('server-close'); callback(); },
    closeIdleConnections() { order.push('idle-close'); },
  };
  const pool = { async end() { order.push('pool-end'); } };
  const shutdown = createShutdownCoordinator({
    server,
    pool,
    graceMs: 100,
    logger: {},
    stoppers: [async () => { order.push('worker-stop-start'); await gate.promise; order.push('worker-stop-end'); }],
  });
  let finished = false;
  const closing = shutdown('test').then(() => { finished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  assert.equal(order.includes('pool-end'), false);
  gate.resolve();
  await closing;
  assert.ok(order.indexOf('worker-stop-end') < order.indexOf('pool-end'));
});

test('server registers notification health before listen but starts work only after successful bind', async () => {
  const source = await readFile(path.join(root, 'src', 'server.mjs'), 'utf8');
  const workerIndex = source.indexOf('notificationWorker = createBackgroundWorker');
  const healthIndex = source.indexOf("healthRegistry.register('notification-projection'");
  const listenIndex = source.indexOf('await listen(server');
  const startIndex = source.indexOf('notificationWorker.start()');
  assert.ok(workerIndex >= 0 && healthIndex > workerIndex && listenIndex > healthIndex && startIndex > listenIndex);
  assert.match(source, /projectPending\(\{ limit: settings\.notificationProjectionBatchSize \}\)/);
  assert.match(source, /const stoppers = \[notificationWorker, outboxWorker\]\.filter\(Boolean\)\.map\(\(worker\) => \(\) => worker\.stop\(\)\)/);
  assert.match(source, /stoppers,/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_INTERVAL_MS/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_BATCH_SIZE/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_LEASE_MS/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_RETRY_DELAY_MS/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_MAX_ATTEMPTS/);
  assert.match(source, /notificationProjectionLeaseMs: settings\.notificationProjectionLeaseMs/);
  assert.match(source, /notificationProjectionRetryDelayMs: settings\.notificationProjectionRetryDelayMs/);
  assert.match(source, /notificationProjectionMaxAttempts: settings\.notificationProjectionMaxAttempts/);
  assert.match(source, /operationalReadiness: \(\) => healthRegistry\.check\(\)/);
});

test('PostgreSQL notification batches use expiring claims and a 64-bit advisory lock', async () => {
  const source = await readFile(path.join(root, 'src', 'infrastructure', 'postgres-notification-projection-store.mjs'), 'utf8');
  assert.match(source, /NOT EXISTS[\s\S]*notification_projections/);
  assert.match(source, /notification_projection_claims/);
  assert.match(source, /lease_expires_at > \$2/);
  assert.match(source, /LIMIT \$4[\s\S]*FOR UPDATE OF source SKIP LOCKED/);
  assert.match(source, /ON CONFLICT \(event_id\) DO UPDATE/);
  assert.match(source, /attempt_count = notification_projection_claims\.attempt_count \+ 1/);
  assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.doesNotMatch(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.doesNotMatch(source, /source\.status\s*=\s*'pending'/);
});

test('shutdown validates stopper contracts', () => {
  const server = { close() {} };
  const pool = { end() {} };
  assert.throws(
    () => createShutdownCoordinator({ server, pool, stoppers: [null] }),
    /Shutdown stoppers must be functions/,
  );
});
