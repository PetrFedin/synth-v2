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

test('server starts notification projection only after successful listen and registers its stopper', async () => {
  const source = await readFile(path.join(root, 'src', 'server.mjs'), 'utf8');
  const listenIndex = source.indexOf('await listen(server');
  const workerIndex = source.indexOf('notificationWorker = createBackgroundWorker');
  const startIndex = source.indexOf('notificationWorker.start()');
  assert.ok(listenIndex >= 0 && workerIndex > listenIndex && startIndex > workerIndex);
  assert.match(source, /projectPending\(\{ limit: settings\.notificationProjectionBatchSize \}\)/);
  assert.match(source, /stoppers: notificationWorker \? \[\(\) => notificationWorker\.stop\(\)\] : \[\]/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_INTERVAL_MS/);
  assert.match(source, /SYNTHA_NOTIFICATION_PROJECTION_BATCH_SIZE/);
});

test('PostgreSQL notification batches exclude projected events and use a 64-bit advisory lock', async () => {
  const source = await readFile(path.join(root, 'src', 'infrastructure', 'postgres-notification-projection-store.mjs'), 'utf8');
  assert.match(source, /NOT EXISTS[\s\S]*notification_projections/);
  assert.match(source, /LIMIT \$1/);
  assert.match(source, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.doesNotMatch(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
});

test('shutdown validates stopper contracts', () => {
  const server = { close() {} };
  const pool = { end() {} };
  assert.throws(
    () => createShutdownCoordinator({ server, pool, stoppers: [null] }),
    /Shutdown stoppers must be functions/,
  );
});
