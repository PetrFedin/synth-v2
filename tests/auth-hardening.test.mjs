import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAuthService } from '../src/application/auth-service.mjs';
import { hashPassword, verifyPassword } from '../src/auth/passwords.mjs';

const NOW = '2026-08-01T12:00:00.000Z';
const VALID_TOKEN = `swv2_${Buffer.alloc(32, 7).toString('base64url')}`;

function storeWith(view) {
  let transactions = 0;
  return {
    get transactions() { return transactions; },
    async transaction(work) { transactions += 1; return work(view); },
  };
}

function service(store, options = {}) {
  let id = 0;
  return createAuthService({
    store,
    clock: () => NOW,
    nextId: (prefix) => `${prefix}-${++id}`,
    randomBytesImpl: (length) => Buffer.alloc(length, 7),
    ...options,
  });
}

test('password verification rejects oversized input before expensive derivation', async () => {
  const encoded = await hashPassword('valid-password-123', { randomBytesImpl: (length) => Buffer.alloc(length, 3) });
  assert.equal(await verifyPassword('x'.repeat(1025), encoded), false);
  assert.equal(await verifyPassword('short', encoded), false);
});

test('password hashing rejects malformed random sources', async () => {
  await assert.rejects(
    () => hashPassword('valid-password-123', { randomBytesImpl: () => Buffer.alloc(15) }),
    (error) => error.code === 'AUTH_RANDOM_SOURCE_INVALID',
  );
  await assert.rejects(
    () => hashPassword('valid-password-123', { randomBytesImpl: () => 'not-bytes' }),
    (error) => error.code === 'AUTH_RANDOM_SOURCE_INVALID',
  );
});

test('malformed and oversized access tokens never reach the store', async () => {
  const store = storeWith({});
  const auth = service(store);
  assert.equal(await auth.authenticate('swv2_bad'), null);
  assert.equal(await auth.authenticate(`swv2_${'a'.repeat(100000)}`), null);
  assert.equal(await auth.logout('swv2_bad'), false);
  assert.equal(store.transactions, 0);
});

test('logout uses atomic token revocation when supported', async () => {
  const expectedHash = createHash('sha256').update(VALID_TOKEN).digest('hex');
  let active = true;
  const calls = [];
  const store = storeWith({
    async revokeSessionByTokenHash(tokenHash, revokedAt) {
      calls.push([tokenHash, revokedAt]);
      if (!active) return false;
      active = false;
      return true;
    },
  });
  const auth = service(store);
  assert.equal(await auth.logout(VALID_TOKEN), true);
  assert.equal(await auth.logout(VALID_TOKEN), false);
  assert.deepEqual(calls, [[expectedHash, NOW], [expectedHash, NOW]]);
});

test('login emits only strict fixed-length access tokens', async () => {
  const passwordHash = await hashPassword('valid-password-123', { randomBytesImpl: (length) => Buffer.alloc(length, 4) });
  let insertedSession;
  const store = storeWith({
    async lockLoginKey() {},
    async deleteExpiredSessions() {},
    async getLoginThrottle() { return undefined; },
    async getUserByEmail() {
      return { id: 'user-1', email: 'owner@syntha.local', displayName: 'Owner', passwordHash, status: 'active' };
    },
    async deleteLoginThrottle() {},
    async insertSession(session) { insertedSession = session; },
    async insertLoginAudit() {},
  });
  const auth = service(store);
  const result = await auth.login({ email: 'owner@syntha.local', password: 'valid-password-123' });
  assert.match(result.accessToken, /^swv2_[A-Za-z0-9_-]{43}$/);
  assert.equal(result.accessToken.length, 48);
  assert.equal(insertedSession.tokenHash, createHash('sha256').update(result.accessToken).digest('hex'));
});

test('invalid clocks fail closed before session mutation', async () => {
  const store = storeWith({ async deleteExpiredSessions() { throw new Error('must not execute'); } });
  const auth = service(store, { clock: () => 'not-a-date' });
  await assert.rejects(() => auth.cleanupSessions(), (error) => error.code === 'AUTH_CLOCK_INVALID');
  assert.equal(store.transactions, 0);
});

test('invalid configuration is rejected at service construction', () => {
  const store = storeWith({});
  assert.throws(() => service(store, { maxLoginFailures: 1 }), (error) => error.code === 'AUTH_FAILURE_LIMIT_INVALID');
  assert.throws(() => service(store, { revokedSessionRetentionMs: 1 }), (error) => error.code === 'AUTH_SESSION_RETENTION_INVALID');
  assert.throws(() => service(store, { randomBytesImpl: null }), (error) => error.code === 'AUTH_RANDOM_SOURCE_INVALID');
});
