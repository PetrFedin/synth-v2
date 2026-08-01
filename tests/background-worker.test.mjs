import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundWorker } from '../src/runtime/background-worker.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

test('worker starts immediately and never overlaps task executions', async () => {
  const gate = deferred();
  let calls = 0;
  let scheduled;
  const worker = createBackgroundWorker({
    name: 'notifications',
    intervalMs: 100,
    task: async () => { calls += 1; await gate.promise; },
    setTimeoutImpl: (fn) => { scheduled = fn; return { unref() {} }; },
    clearTimeoutImpl: () => {},
  });
  assert.equal(worker.start(), true);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(await worker.runOnce(), false);
  gate.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof scheduled, 'function');
});

test('worker logs task failures and schedules the next batch', async () => {
  const messages = [];
  let scheduled;
  const worker = createBackgroundWorker({
    name: 'notifications',
    intervalMs: 100,
    task: async () => { throw new Error('projection failed'); },
    logger: { error: (...args) => messages.push(args) },
    setTimeoutImpl: (fn) => { scheduled = fn; return { unref() {} }; },
    clearTimeoutImpl: () => {},
  });
  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.match(messages[0][0], /notifications background worker failed/);
  assert.equal(typeof scheduled, 'function');
});

test('stop waits for the active batch and prevents further execution', async () => {
  const gate = deferred();
  const worker = createBackgroundWorker({
    name: 'notifications',
    intervalMs: 100,
    task: () => gate.promise,
    setTimeoutImpl: () => ({ unref() {} }),
    clearTimeoutImpl: () => {},
  });
  worker.start();
  await Promise.resolve();
  let stopped = false;
  const stopping = worker.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  gate.resolve();
  await stopping;
  assert.equal(worker.state, 'stopped');
  assert.equal(await worker.runOnce(), false);
});

test('worker validates configuration and cannot restart after shutdown', async () => {
  assert.throws(() => createBackgroundWorker({ name: '', task() {}, intervalMs: 100 }), /name is required/);
  assert.throws(() => createBackgroundWorker({ name: 'x', task() {}, intervalMs: 99 }), /at least 100ms/);
  const worker = createBackgroundWorker({ name: 'x', task() {}, intervalMs: 100 });
  await worker.stop();
  assert.throws(() => worker.start(), /cannot restart/);
});
