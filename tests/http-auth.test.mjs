import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWholesaleHttpServer } from '../src/http/api.mjs';
import { createAuthService } from '../src/application/auth-service.mjs';
import { createMemoryAuthStore } from '../src/infrastructure/memory-auth-store.mjs';

const empty = {};
function services(auth) {
  return {
    auth,
    authenticate: auth.authenticate,
    platform: empty,
    partners: empty,
    collaboration: empty,
    orders: empty,
    notifications: empty,
    workspace: empty,
    nextRequestId: () => 'request-auth',
  };
}
async function run(server, work) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  try { return await work(`http://127.0.0.1:${port}`); }
  finally { server.close(); await once(server, 'close'); }
}

test('standalone HTTP auth login, me and logout', async () => {
  let id = 0;
  const auth = createAuthService({
    store: createMemoryAuthStore(),
    nextId: () => `id-${++id}`,
    randomBytesImpl: (size) => Buffer.alloc(size, id),
    clock: () => '2026-07-31T10:00:00.000Z',
  });
  await auth.bootstrapUser({ id: 'owner-1', email: 'owner@syntha.test', password: 'correct horse battery staple', displayName: 'Owner' });
  await run(createWholesaleHttpServer(services(auth)), async (base) => {
    const login = await fetch(`${base}/v2/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@syntha.test', password: 'correct horse battery staple' }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json()).data.accessToken;
    const me = await fetch(`${base}/v2/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.deepEqual((await me.json()).data, { actorId: 'owner-1', email: 'owner@syntha.test', displayName: 'Owner' });
    const logout = await fetch(`${base}/v2/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    assert.equal(logout.status, 200);
    assert.equal((await logout.json()).data.revoked, true);
    assert.equal((await fetch(`${base}/v2/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
  });
});

test('invalid credentials return stable 401 without revealing account state', async () => {
  const auth = createAuthService({ store: createMemoryAuthStore() });
  await run(createWholesaleHttpServer(services(auth)), async (base) => {
    const response = await fetch(`${base}/v2/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'missing@syntha.test', password: 'wrong-password-value' }),
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'AUTH_CREDENTIALS_INVALID');
  });
});
