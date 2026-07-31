import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresAuthStore } from '../src/infrastructure/postgres-auth-store.mjs';
import { createAuthService } from '../src/application/auth-service.mjs';

const url = process.env.POSTGRES_TEST_URL;
test('PostgreSQL auth persists users and revocable sessions', { skip: !url }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    await pool.query(await readFile(path.join(root, 'db/migrations/002_auth.sql'), 'utf8'));
    await pool.query(await readFile(path.join(root, 'db/migrations/003_auth_security.sql'), 'utf8'));
    await pool.query('TRUNCATE auth_login_audit, auth_login_throttles, auth_sessions, auth_users CASCADE');
    let id = 0;
    const auth = createAuthService({
      store: createPostgresAuthStore({ pool }),
      clock: () => '2026-07-31T10:00:00.000Z',
      nextId: (prefix) => `${prefix}-${++id}`,
      randomBytesImpl: (size) => Buffer.alloc(size, id),
    });
    await auth.bootstrapUser({ id: 'user-pg', email: 'owner@syntha.test', password: 'correct horse battery staple', displayName: 'Owner' });
    const login = await auth.login({ email: 'owner@syntha.test', password: 'correct horse battery staple' });
    assert.equal((await auth.authenticate(login.accessToken)).actorId, 'user-pg');
    await auth.logout(login.accessToken);
    assert.equal(await auth.authenticate(login.accessToken), null);
    const rows = await pool.query('SELECT count(*)::int AS count FROM auth_sessions');
    assert.equal(rows.rows[0].count, 1);
    const audit = await pool.query('SELECT outcome, length(trim(key_hash)) AS key_length FROM auth_login_audit');
    assert.deepEqual(audit.rows, [{ outcome: 'succeeded', key_length: 64 }]);
  } finally { await pool.end(); }
});
