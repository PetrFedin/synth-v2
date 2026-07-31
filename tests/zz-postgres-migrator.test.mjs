import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL migration ledger serializes runners and rejects changed history', { skip: !databaseUrl }, async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = path.join(root, 'db', 'migrations');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'syntha-v2-migrations-'));
  const migrationFiles = [
    '001_wholesale_v2.sql',
    '002_auth.sql',
    '003_auth_security.sql',
    '004_catalog.sql',
    '005_catalog_availability.sql',
  ];
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const clock = () => '2026-07-31T12:00:00.000Z';
    const results = await Promise.all([
      migratePostgres({ pool, migrationsDir, clock }),
      migratePostgres({ pool, migrationsDir, clock }),
    ]);
    const applied = results.flatMap((result) => result.applied).sort();
    const skipped = results.flatMap((result) => result.skipped).sort();
    assert.deepEqual(applied, migrationFiles);
    assert.deepEqual(skipped, migrationFiles);

    const ledger = await pool.query('SELECT version, length(trim(checksum)) AS checksum_length FROM schema_migrations ORDER BY version');
    assert.deepEqual(ledger.rows, migrationFiles.map((version) => ({ version, checksum_length: 64 })));
    const tables = await pool.query(
      `SELECT to_regclass('public.organisations') AS organisations,
              to_regclass('public.auth_users') AS auth_users,
              to_regclass('public.auth_login_throttles') AS auth_login_throttles,
              to_regclass('public.catalog_skus') AS catalog_skus,
              to_regclass('public.order_inventory_reservations') AS order_inventory_reservations`,
    );
    assert.equal(tables.rows[0].organisations, 'organisations');
    assert.equal(tables.rows[0].auth_users, 'auth_users');
    assert.equal(tables.rows[0].auth_login_throttles, 'auth_login_throttles');
    assert.equal(tables.rows[0].catalog_skus, 'catalog_skus');
    assert.equal(tables.rows[0].order_inventory_reservations, 'order_inventory_reservations');

    for (const file of migrationFiles) await copyFile(path.join(migrationsDir, file), path.join(tempDir, file));
    await appendFile(path.join(tempDir, '005_catalog_availability.sql'), '\n-- changed history must fail\n');
    await assert.rejects(
      () => migratePostgres({ pool, migrationsDir: tempDir, clock }),
      (error) => error?.code === 'MIGRATION_CHECKSUM_MISMATCH' && error.details?.file === '005_catalog_availability.sql',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await pool.end();
  }
});
