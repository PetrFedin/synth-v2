import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { configureHttpServer, createShutdownCoordinator, listen, readHostSetting, readIntegerSetting } from '../src/runtime/server-lifecycle.mjs';

test('integer settings use defaults and reject invalid values', () => {
  assert.equal(readIntegerSetting(undefined, { name: 'PORT', defaultValue: 4100, min: 1, max: 65535 }), 4100);
  assert.equal(readIntegerSetting('5000', { name: 'PORT', defaultValue: 4100, min: 1, max: 65535 }), 5000);
  assert.throws(() => readIntegerSetting('NaN', { name: 'PORT', defaultValue: 4100, min: 1, max: 65535 }), /PORT must be an integer/);
  assert.throws(() => readIntegerSetting('70000', { name: 'PORT', defaultValue: 4100, min: 1, max: 65535 }), /PORT must be an integer/);
});

test('HTTP host defaults to cloud-reachable binding and preserves explicit configuration', () => {
  assert.equal(readHostSetting(undefined), '0.0.0.0');
  assert.equal(readHostSetting('   '), '0.0.0.0');
  assert.equal(readHostSetting(' 127.0.0.1 '), '127.0.0.1');
  assert.equal(readHostSetting('::', { defaultValue: '127.0.0.1' }), '::');
  assert.throws(() => readHostSetting(undefined, { defaultValue: '   ' }), /Default HTTP host is required/);
});

test('HTTP timeout configuration is explicit and internally consistent', () => {
  const server = {};
  configureHttpServer(server, {
    requestTimeoutMs: 30_000,
    headersTimeoutMs: 15_000,
    keepAliveTimeoutMs: 5_000,
    maxRequestsPerSocket: 1_000,
    maxHeadersCount: 100,
  });
  assert.equal(server.requestTimeout, 30_000);
  assert.equal(server.headersTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxRequestsPerSocket, 1_000);
  assert.equal(server.maxHeadersCount, 100);
  assert.throws(() => configureHttpServer({}, { requestTimeoutMs: 1000, headersTimeoutMs: 2000 }), /cannot exceed/);
});

test('shutdown is idempotent and closes pool exactly once', async () => {
  let closeCalls = 0;
  let idleCalls = 0;
  let poolCalls = 0;
  const server = {
    close(callback) { closeCalls += 1; queueMicrotask(() => callback()); },
    closeIdleConnections() { idleCalls += 1; },
  };
  const pool = { async end() { poolCalls += 1; } };
  const shutdown = createShutdownCoordinator({ server, pool, graceMs: 50, logger: {} });
  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(first, second);
  assert.deepEqual(await first, { forced: false });
  assert.equal(closeCalls, 1);
  assert.equal(idleCalls, 1);
  assert.equal(poolCalls, 1);
});

test('shutdown force-closes active connections after grace period', async () => {
  let callback;
  let forcedCalls = 0;
  const server = {
    close(next) { callback = next; },
    closeIdleConnections() {},
    closeAllConnections() { forcedCalls += 1; callback(); },
  };
  const pool = { async end() {} };
  const shutdown = createShutdownCoordinator({ server, pool, graceMs: 5, logger: {} });
  assert.deepEqual(await shutdown('SIGTERM'), { forced: true });
  assert.equal(forcedCalls, 1);
});

test('listen rejects asynchronous startup errors instead of leaving a half-started process', async () => {
  class FakeServer extends EventEmitter {
    listen() { queueMicrotask(() => this.emit('error', Object.assign(new Error('bind failed'), { code: 'EADDRINUSE' }))); }
  }
  await assert.rejects(() => listen(new FakeServer(), { port: 4100, host: '127.0.0.1' }), /bind failed/);
});

test('listen rejects synchronous startup errors', async () => {
  class FakeServer extends EventEmitter {
    listen() { throw new Error('invalid listen options'); }
  }
  await assert.rejects(() => listen(new FakeServer(), { port: 4100, host: '127.0.0.1' }), /invalid listen options/);
});
