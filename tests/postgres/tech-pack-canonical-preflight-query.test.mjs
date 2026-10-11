import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTechPackCanonicalPreflightReader } from '../../src/infrastructure/postgres-tech-pack-canonical-preflight-reader.mjs';

const connectionString = process.env.POSTGRES_TEST_URL;
const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

test('canonical Tech Pack source query compiles against migrated PostgreSQL and fails closed for inaccessible packs', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL must identify the isolated verification database');
  const pool = new pg.Pool({ connectionString, max: 2 });
  try {
    await migratePostgres({ pool, migrationsDir });
    const reader = createPostgresTechPackCanonicalPreflightReader({ pool });
    assert.equal(await reader.forActor('no-such-brand-user', 'TP-UNAUTHORIZED-PROBE'), undefined);
    // No test fixture, synthetic Pack or SQL writer is needed: this exercises
    // actual table/column names, the active-membership subquery and read-only SQL.
    // It is NOT a positive end-to-end canonical issuance proof.
  } finally {
    await pool.end();
  }
});
