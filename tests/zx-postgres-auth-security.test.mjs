import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresAuthStore } from '../src/infrastructure/postgres-auth-store.mjs';
import { createAuthService } from '../src/application/auth-service.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL serializes concurrent login failures and cleans sessions', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  let nowMs = Date.parse('2026-07-31T14:00:00.000Z');
  let id = 0;
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => new Date(nowMs).toISOString() });
    const auth = createAuthService({
      store: createPostgresAuthStore({ pool }),
      clock: () => new Date(nowMs).toISOString(),
      nextId: (prefix) => `${prefix}-${++id}`,
      randomBytesImpl: (size) => Buffer.alloc(size, id),
      sessionTtlMs: 60_000,
      maxLoginFailures: 2,
      loginWindowMs: 60_000,
      loginBlockMs: 120_000,
      revokedSessionRetentionMs: 60_000,
    });
    await auth.bootstrapUser({ id: 'user-secure', email: 'secure@syntha.test', password: 'correct horse battery staple' });

    const attempts = await Promise.allSettled([
      auth.login({ email: 'secure@syntha.test', password: 'wrong password' }),
      auth.login({ email: 'secure@syntha.test', password: 'wrong password' }),
    ]);
    const codes = attempts.map((result) => result.reason?.code).sort();
    assert.deepEqual(codes, ['AUTH_CREDENTIALS_INVALID', 'AUTH_RATE_LIMITED']);

    const throttle = await pool.query('SELECT failure_count, blocked_until IS NOT NULL AS blocked, length(trim(key_hash)) AS key_length FROM auth_login_throttles');
    assert.deepEqual(throttle.rows, [{ failure_count: 2, blocked: true, key_length: 64 }]);
    const audit = await pool.query('SELECT outcome FROM auth_login_audit ORDER BY occurred_at, id');
    assert.deepEqual(audit.rows.map((row) => row.outcome).sort(), ['blocked', 'failed']);

    nowMs += 121_000;
    const login = await auth.login({ email: 'secure@syntha.test', password: 'correct horse battery staple' });
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_login_throttles')).rows[0].count, 0);
    await auth.logout(login.accessToken);
    nowMs += 61_000;
    assert.equal(await auth.cleanupSessions(), 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_sessions')).rows[0].count, 0);
  } finally {
    await pool.end();
  }
});
