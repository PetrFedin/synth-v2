import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/application/auth-service.mjs';
import { createMemoryAuthStore } from '../src/infrastructure/memory-auth-store.mjs';

function fixture() {
  let nowMs = Date.parse('2026-07-31T13:00:00.000Z');
  let id = 0;
  const store = createMemoryAuthStore();
  const auth = createAuthService({
    store,
    clock: () => new Date(nowMs).toISOString(),
    nextId: (prefix) => `${prefix}-${++id}`,
    randomBytesImpl: (size) => Buffer.alloc(size, id),
    sessionTtlMs: 60_000,
    maxLoginFailures: 2,
    loginWindowMs: 60_000,
    loginBlockMs: 120_000,
    revokedSessionRetentionMs: 60_000,
  });
  return { auth, store, advance: (ms) => { nowMs += ms; } };
}

test('login throttle commits failures, blocks, audits and resets after expiry', async () => {
  const { auth, store, advance } = fixture();
  await auth.bootstrapUser({ id: 'user-1', email: 'owner@syntha.test', password: 'correct horse battery staple' });

  await assert.rejects(
    () => auth.login({ email: 'owner@syntha.test', password: 'wrong password' }),
    (error) => error?.code === 'AUTH_CREDENTIALS_INVALID',
  );
  assert.equal(store.snapshot().throttles[0].failureCount, 1);

  await assert.rejects(
    () => auth.login({ email: 'owner@syntha.test', password: 'wrong password' }),
    (error) => error?.code === 'AUTH_RATE_LIMITED' && error.details.retryAfterSeconds === 120,
  );
  await assert.rejects(
    () => auth.login({ email: 'owner@syntha.test', password: 'correct horse battery staple' }),
    (error) => error?.code === 'AUTH_RATE_LIMITED',
  );

  const blockedSnapshot = store.snapshot();
  assert.equal(blockedSnapshot.throttles[0].failureCount, 2);
  assert.deepEqual(blockedSnapshot.audits.map((entry) => entry.outcome), ['failed', 'blocked', 'blocked']);
  assert.equal(blockedSnapshot.audits.every((entry) => entry.keyHash.length === 64), true);
  assert.equal(JSON.stringify(blockedSnapshot.audits).includes('owner@syntha.test'), false);

  advance(121_000);
  const login = await auth.login({ email: 'owner@syntha.test', password: 'correct horse battery staple' });
  assert.match(login.accessToken, /^swv2_/);
  assert.equal(store.snapshot().throttles.length, 0);
  assert.equal(store.snapshot().audits.at(-1).outcome, 'succeeded');

  await auth.logout(login.accessToken);
  advance(61_000);
  assert.equal(await auth.cleanupSessions(), 1);
  assert.equal(store.snapshot().sessions.length, 0);
});
