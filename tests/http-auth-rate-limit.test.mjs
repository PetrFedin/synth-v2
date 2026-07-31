import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DomainError } from '../src/core/errors.mjs';
import { createWholesaleHttpServer } from '../src/http/api.mjs';
import { createWholesaleFetchHandler } from '../src/http/fetch-api.mjs';

function transport() {
  return {
    authenticate: async () => null,
    auth: { login: async () => { throw new DomainError('AUTH_RATE_LIMITED', 'Too many login attempts', { retryAfterSeconds: 87.2 }); } },
    platform: {}, partners: {}, collaboration: {}, orders: {}, notifications: {}, workspace: {},
    nextRequestId: () => 'request-rate-limit',
  };
}

async function withServer(server, work) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try { return await work(`http://127.0.0.1:${port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('Node and Fetch login rate limits return 429 with Retry-After', async () => {
  const requestBody = JSON.stringify({ email: 'owner@syntha.test', password: 'wrong password' });
  await withServer(createWholesaleHttpServer(transport()), async (base) => {
    const response = await fetch(`${base}/v2/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: requestBody });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '88');
    assert.equal((await response.json()).error.code, 'AUTH_RATE_LIMITED');
  });

  const handler = createWholesaleFetchHandler(transport());
  const response = await handler(new Request('http://syntha.local/v2/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: requestBody }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '88');
  assert.equal((await response.json()).error.code, 'AUTH_RATE_LIMITED');
});
