import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenanceService } from '../src/application/maintenance-service.mjs';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-08-02T12:00:00.000Z');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

test('maintenance computes exact retention cutoffs and skips until the next interval', async () => {
  let now = START;
  const calls = [];
  const service = createMaintenanceService({
    store: {
      async cleanup(cutoffs) {
        calls.push(cutoffs);
        return { acquired: true, counts: { commands: 2, outboxEvents: 1 } };
      },
    },
    clock: () => now,
    intervalMs: 6 * 60 * 60 * 1000,
    retryDelayMs: 60_000,
    commandRetentionMs: 30 * DAY,
    authAuditRetentionMs: 90 * DAY,
    throttleRetentionMs: 7 * DAY,
    revokedSessionRetentionMs: 14 * DAY,
    outboxRetentionMs: 45 * DAY,
  });

  const first = await service.runIfDue();
  assert.equal(first.status, 'completed');
  assert.deepEqual(first.counts, { commands: 2, outboxEvents: 1 });
  assert.equal(first.cutoffs.now, new Date(START).toISOString());
  assert.equal(first.cutoffs.commandsBefore, new Date(START - 30 * DAY).toISOString());
  assert.equal(first.cutoffs.authAuditBefore, new Date(START - 90 * DAY).toISOString());
  assert.equal(first.cutoffs.throttlesBefore, new Date(START - 7 * DAY).toISOString());
  assert.equal(first.cutoffs.revokedSessionsBefore, new Date(START - 14 * DAY).toISOString());
  assert.equal(first.cutoffs.outboxBefore, new Date(START - 45 * DAY).toISOString());
  assert.equal(Object.isFrozen(first.cutoffs), true);

  now += 1_000;
  const notDue = await service.runIfDue();
  assert.equal(notDue.status, 'not-due');
  assert.equal(calls.length, 1);

  now = Date.parse(first.nextRunAt);
  const second = await service.runIfDue();
  assert.equal(second.status, 'completed');
  assert.equal(calls.length, 2);
});

test('concurrent callers join one active cleanup before reading the clock again', async () => {
  const gate = deferred();
  let cleanupCalls = 0;
  let clockCalls = 0;
  const service = createMaintenanceService({
    store: {
      async cleanup() {
        cleanupCalls += 1;
        return gate.promise;
      },
    },
    clock: () => {
      clockCalls += 1;
      if (clockCalls > 1) throw new Error('clock must not run for a joined cleanup');
      return START;
    },
  });

  const first = service.runIfDue();
  const second = service.runIfDue();
  await Promise.resolve();
  assert.equal(cleanupCalls, 1);
  assert.equal(clockCalls, 1);
  gate.resolve({ acquired: true, counts: { commands: 1 } });
  const [left, right] = await Promise.all([first, second]);
  assert.deepEqual(left, right);
  assert.equal(left.status, 'completed');
});

test('lock contention is a successful skip and failed cleanup uses bounded retry backoff', async () => {
  let now = START;
  let mode = 'locked';
  let calls = 0;
  const service = createMaintenanceService({
    store: {
      async cleanup() {
        calls += 1;
        if (mode === 'locked') return { acquired: false, counts: {} };
        if (mode === 'fail') throw new Error('database unavailable');
        return { acquired: true, counts: {} };
      },
    },
    clock: () => now,
    intervalMs: 60 * 60 * 1000,
    retryDelayMs: 60_000,
  });

  const skipped = await service.runNow();
  assert.equal(skipped.status, 'skipped-lock');
  mode = 'fail';
  now = Date.parse(skipped.nextRunAt);
  await assert.rejects(() => service.runIfDue(), /database unavailable/);
  assert.equal(service.nextRunAt, new Date(now + 60_000).toISOString());

  now += 30_000;
  assert.equal((await service.runIfDue()).status, 'not-due');
  assert.equal(calls, 2);

  now += 30_000;
  mode = 'success';
  assert.equal((await service.runIfDue()).status, 'completed');
  assert.equal(calls, 3);
});

test('maintenance validates durations clock and store contracts', async () => {
  assert.throws(() => createMaintenanceService({}), (error) => error.code === 'MAINTENANCE_STORE_REQUIRED');
  assert.throws(
    () => createMaintenanceService({ store: { cleanup() {} }, commandRetentionMs: DAY - 1 }),
    (error) => error.code === 'MAINTENANCE_COMMAND_RETENTION_INVALID',
  );
  const invalidClock = createMaintenanceService({ store: { cleanup() {} }, clock: () => 'not-a-date' });
  await assert.rejects(() => invalidClock.runNow(), (error) => error.code === 'MAINTENANCE_CLOCK_INVALID');
});
