import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWholesaleHttpHandler } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';

function options(calls) {
  return {
    authenticate: async (token) => token === 'valid-token' ? { actorId: 'actor-1' } : null,
    auth: {
      login: async () => { calls.login += 1; return { token: 'session' }; },
      logout: async () => { calls.logout += 1; return true; },
    },
    platform: {},
    catalog: {},
    partners: {},
    collaboration: {},
    orders: {},
    notifications: {},
    workspace: {},
    nextRequestId: () => 'request-1',
  };
}

async function withNode(handlerOptions, work) {
  const server = createServer(createWholesaleHttpHandler(handlerOptions));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function errorCode(response) {
  return (await response.json()).error?.code;
}

const loginBody = JSON.stringify({ email: 'owner@syntha.local', password: 'valid-password-123' });
const authenticated = { authorization: 'Bearer valid-token' };

test('Node transport rejects hidden input on operational and auth routes', async () => {
  const calls = { login: 0, logout: 0 };
  await withNode(options(calls), async (base) => {
    assert.equal(await errorCode(await fetch(`${base}/health?deep=1`)), 'HTTP_QUERY_FIELD_UNKNOWN');
    assert.equal(await errorCode(await fetch(`${base}/v2/auth/login?debug=1`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: loginBody,
    })), 'HTTP_QUERY_FIELD_UNKNOWN');
    assert.equal(await errorCode(await fetch(`${base}/v2/auth/me?debug=1`, { headers: authenticated })), 'HTTP_QUERY_FIELD_UNKNOWN');
    assert.equal(await errorCode(await fetch(`${base}/v2/auth/logout`, {
      method: 'POST',
      headers: { ...authenticated, 'content-type': 'application/json' },
      body: JSON.stringify({ allDevices: true }),
    })), 'HTTP_BODY_FIELD_UNKNOWN');
  });
  assert.deepEqual(calls, { login: 0, logout: 0 });
});

test('Fetch transport enforces the same operational and auth contracts', async () => {
  const calls = { login: 0, logout: 0 };
  const handle = createWholesaleFetchHandler(options(calls));

  assert.equal(await errorCode(await handle(new Request('https://syntha.test/openapi.json?debug=1'))), 'HTTP_QUERY_FIELD_UNKNOWN');
  assert.equal(await errorCode(await handle(new Request('https://syntha.test/v2/auth/login?debug=1', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: loginBody,
  }))), 'HTTP_QUERY_FIELD_UNKNOWN');
  assert.equal(await errorCode(await handle(new Request('https://syntha.test/v2/auth/me?debug=1', { headers: authenticated }))), 'HTTP_QUERY_FIELD_UNKNOWN');
  assert.equal(await errorCode(await handle(new Request('https://syntha.test/v2/auth/logout', {
    method: 'POST',
    headers: { ...authenticated, 'content-type': 'application/json' },
    body: JSON.stringify({ allDevices: true }),
  }))), 'HTTP_BODY_FIELD_UNKNOWN');

  assert.deepEqual(calls, { login: 0, logout: 0 });
});
