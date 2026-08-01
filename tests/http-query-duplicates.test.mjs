import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { matchRoute, validateRouteInput } from '../src/http/routes.mjs';

function runtimeFixture() {
  let calls = 0;
  return {
    get calls() { return calls; },
    runtime: {
      authenticate: async () => ({ id: 'user-1' }),
      auth: {},
      readiness: {},
      platform: {},
      catalog: {},
      partners: {},
      collaboration: {},
      orders: {},
      workspace: {},
      notifications: {
        async listForActor() { calls += 1; return []; },
        async pageForActor() { calls += 1; return { items: [], nextCursor: null }; },
      },
    },
  };
}

async function invokeNode(handler, url) {
  const headers = new Map();
  const request = {
    method: 'GET',
    url,
    headers: {
      authorization: 'Bearer token-1',
      'x-request-id': 'request-1',
    },
    socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function* iterator() {},
  };
  const response = {
    statusCode: 0,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    end(value = '') { this.body = String(value); },
  };
  await handler(request, response);
  return {
    status: response.statusCode,
    body: JSON.parse(response.body),
    headers,
  };
}

test('route validation rejects repeated known query parameters', () => {
  const match = matchRoute('GET', '/v2/notifications/page');
  assert.ok(match);
  assert.throws(
    () => validateRouteInput(match.route, {
      url: new URL('https://syntha.test/v2/notifications/page?limit=10&limit=20'),
    }),
    (error) => error.code === 'REQUEST_QUERY_FIELD_DUPLICATE'
      && error.details.field === 'limit'
      && error.details.count === 2,
  );
});

test('Node and Fetch transports reject duplicate query parameters before service invocation', async () => {
  const nodeFixture = runtimeFixture();
  const fetchFixture = runtimeFixture();
  const nodeHandler = createWholesaleHttpHandler(nodeFixture.runtime);
  const fetchHandler = createWholesaleFetchHandler(fetchFixture.runtime);
  const path = '/v2/notifications/page?cursor=first&cursor=second';

  const nodeResponse = await invokeNode(nodeHandler, path);
  const fetchResponse = await fetchHandler(new Request(`https://syntha.test${path}`, {
    headers: {
      authorization: 'Bearer token-1',
      'x-request-id': 'request-1',
    },
  }));
  const fetchBody = await fetchResponse.json();

  assert.equal(nodeResponse.status, 400);
  assert.equal(fetchResponse.status, 400);
  assert.equal(nodeResponse.body.error.code, 'REQUEST_QUERY_FIELD_DUPLICATE');
  assert.equal(fetchBody.error.code, 'REQUEST_QUERY_FIELD_DUPLICATE');
  assert.equal(nodeFixture.calls, 0);
  assert.equal(fetchFixture.calls, 0);
});
