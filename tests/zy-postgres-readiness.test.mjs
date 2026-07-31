import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresReadinessService } from '../src/application/readiness-service.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL readiness detects current schema and checksum drift', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir, clock: () => '2026-07-31T13:10:00.000Z' });
    const readiness = createPostgresReadinessService({ pool, migrationsDir, clock: () => '2026-07-31T13:11:00.000Z' });

    const healthy = await readiness.check();
    assert.equal(healthy.status, 'ready');
    assert.equal(healthy.database.status, 'available');
    assert.equal(healthy.migrations.status, 'current');
    assert.deepEqual(healthy.migrations.pending, []);
    assert.deepEqual(healthy.migrations.mismatched, []);
    assert.deepEqual(healthy.migrations.unknown, []);

    await pool.query("UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE version = '002_auth.sql'");
    const drift = await readiness.check();
    assert.equal(drift.status, 'not-ready');
    assert.equal(drift.reason, 'migration-drift');
    assert.deepEqual(drift.migrations.mismatched, ['002_auth.sql']);
  } finally {
    await pool.end();
  }
});
