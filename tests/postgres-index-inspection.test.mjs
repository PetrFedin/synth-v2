import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectPostgresMigrations } from '../src/infrastructure/postgres-migrator.mjs';

async function fixture(sql) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-inspection-'));
  const version = '012_online.sql';
  await writeFile(path.join(directory, version), sql, 'utf8');
  return { directory, version, checksum: createHash('sha256').update(sql).digest('hex') };
}

test('migration inspection reports missing and invalid required online indexes', async () => {
  const migration = await fixture(`-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS required_valid_idx ON orders (id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS required_invalid_idx ON orders (brand_id, id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS required_missing_idx ON orders (shop_id, id);
`);
  const calls = [];
  const pool = { async query(sql, params = []) {
    calls.push({ sql, params });
    if (sql.includes('to_regclass')) return { rows: [{ table_name: 'schema_migrations' }] };
    if (sql.startsWith('SELECT version, checksum')) return { rowCount: 1, rows: [{ version: migration.version, checksum: migration.checksum }] };
    if (sql.includes('FROM unnest')) return { rows: [
      { index_name: 'required_invalid_idx', exists: true, valid: false },
      { index_name: 'required_missing_idx', exists: false, valid: false },
      { index_name: 'required_valid_idx', exists: true, valid: true },
    ] };
    throw new Error(`unexpected query: ${sql}`);
  } };

  const result = await inspectPostgresMigrations({ pool, migrationsDir: migration.directory });
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.mismatched, []);
  assert.deepEqual(result.missingIndexes, ['required_missing_idx']);
  assert.deepEqual(result.invalidIndexes, ['required_invalid_idx']);
  assert.deepEqual(calls.at(-1).params[0], ['required_invalid_idx', 'required_missing_idx', 'required_valid_idx']);
});

test('missing migration ledger reports required online indexes as missing', async () => {
  const migration = await fixture(`-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS required_idx ON orders (id);
`);
  const pool = { async query(sql) {
    if (sql.includes('to_regclass')) return { rows: [{ table_name: null }] };
    throw new Error(`unexpected query: ${sql}`);
  } };

  const result = await inspectPostgresMigrations({ pool, migrationsDir: migration.directory });
  assert.deepEqual(result.pending, [migration.version]);
  assert.deepEqual(result.missingIndexes, ['required_idx']);
  assert.deepEqual(result.invalidIndexes, []);
});
