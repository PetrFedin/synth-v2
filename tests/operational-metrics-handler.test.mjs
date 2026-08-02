import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createOperationalMetricsHandler } from '../src/http/operational-metrics-handler.mjs';

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Map();
    this.body = '';
    this.writableEnded = false;
  }
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  end(body = '') {
    this.body = body;
    this.writableEnded = true;
    this.emit('finish');
    this.emit('close');
  }
}

function request({ method = 'GET', url = '/metrics', authorization } = {}) {
  return { method, url, headers: { ...(authorization ? { authorization } : {}) } };
}

function metrics(overrides = {}) {
  const records = [];
  return {
    enabled: true,
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    authorize: (value) => value === 'Bearer valid-token',
    render: async () => 'syntha_test 1\n',
    recordHttp: (value) => records.push(value),
    records,
    ...overrides,
  };
}

test('metrics endpoint requires exact bearer authentication', async () => {
  const registry = metrics();
  const handler = createOperationalMetricsHandler({ next() { throw new Error('unexpected next'); }, metrics: registry, monotonicClock: sequenceClock() });
  const response = new FakeResponse();
  await handler(request(), response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.getHeader('www-authenticate'), 'Bearer realm="metrics"');
  assert.match(response.body, /METRICS_AUTH_REQUIRED/);
  assert.equal(registry.records.length, 1);
  assert.equal(registry.records[0].pathname, '/metrics');
  assert.equal(registry.records[0].status, 401);
});

test('metrics endpoint serves GET and HEAD with no-store security headers', async () => {
  for (const method of ['GET', 'HEAD']) {
    const registry = metrics();
    const handler = createOperationalMetricsHandler({ next() { throw new Error('unexpected next'); }, metrics: registry, monotonicClock: sequenceClock() });
    const response = new FakeResponse();
    await handler(request({ method, authorization: 'Bearer valid-token' }), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.getHeader('cache-control'), 'no-store');
    assert.equal(response.getHeader('x-content-type-options'), 'nosniff');
    assert.equal(response.getHeader('content-type'), registry.contentType);
    assert.equal(response.body, method === 'HEAD' ? '' : 'syntha_test 1\n');
    assert.equal(registry.records.length, 1);
    assert.equal(registry.records[0].status, 200);
  }
});

test('metrics endpoint rejects methods and query parameters before collection', async () => {
  let renders = 0;
  const registry = metrics({ render: async () => { renders += 1; return ''; } });
  const handler = createOperationalMetricsHandler({ next() { throw new Error('unexpected next'); }, metrics: registry, monotonicClock: sequenceClock() });

  const queryResponse = new FakeResponse();
  await handler(request({ url: '/metrics?organisation=secret', authorization: 'Bearer valid-token' }), queryResponse);
  assert.equal(queryResponse.statusCode, 400);
  assert.match(queryResponse.body, /METRICS_QUERY_INVALID/);

  const methodResponse = new FakeResponse();
  await handler(request({ method: 'POST', authorization: 'Bearer valid-token' }), methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.getHeader('allow'), 'GET, HEAD');
  assert.equal(renders, 0);
});

test('disabled metrics pass through while still instrumenting the final response', async () => {
  const registry = metrics({ enabled: false });
  const handler = createOperationalMetricsHandler({
    metrics: registry,
    monotonicClock: sequenceClock(),
    next(_request, response) {
      response.statusCode = 404;
      response.end('not found');
    },
  });
  const response = new FakeResponse();
  await handler(request(), response);
  assert.equal(response.statusCode, 404);
  assert.equal(response.body, 'not found');
  assert.equal(registry.records.length, 1);
  assert.equal(registry.records[0].status, 404);
});

test('metrics collection failures return a bounded 503 response', async () => {
  const registry = metrics({ render: async () => { throw new Error('database details must not leak'); } });
  const handler = createOperationalMetricsHandler({ next() { throw new Error('unexpected next'); }, metrics: registry, monotonicClock: sequenceClock() });
  const response = new FakeResponse();
  await handler(request({ authorization: 'Bearer valid-token' }), response);
  assert.equal(response.statusCode, 503);
  assert.match(response.body, /METRICS_UNAVAILABLE/);
  assert.doesNotMatch(response.body, /database details/);
});

function sequenceClock() {
  let value = 100;
  return () => { value += 5; return value; };
}
