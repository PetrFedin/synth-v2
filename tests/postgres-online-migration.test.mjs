import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';

async function migrationDir(name, sql) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-migration-'));
  await writeFile(path.join(directory, name), sql, 'utf8');
  return directory;
}

function fakePool({ indexes = {}, failLedgerOnce = false } = {}) {
  const queries = [];
  let ledgerFailurePending = failLedgerOnce;
  const state = new Map(Object.entries(indexes));
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'SELECT checksum FROM schema_migrations WHERE version = $1') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM pg_class AS index_class')) {
        const value = state.get(params[0]);
        return value === undefined ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ valid: value }] };
      }
      if (sql.startsWith('DROP INDEX CONCURRENTLY')) {
        const name = sql.match(/"([a-z0-9_]+)"/)[1];
        state.delete(name);
        return { rowCount: 0, rows: [] };
      }
      if (/^CREATE INDEX CONCURRENTLY/i.test(sql)) {
        const name = sql.match(/IF NOT EXISTS\s+([a-z][a-z0-9_]*)/i)[1];
        if (!state.has(name)) state.set(name, true);
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        if (ledgerFailurePending) {
          ledgerFailurePending = false;
          throw new Error('ledger unavailable');
        }
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  return { pool: { async connect() { return client; } }, queries, state };
}

test('online migrations execute concurrent indexes separately and repair invalid remnants', async () => {
  const directory = await migrationDir('012_online.sql', `-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_brand_idx ON orders (brand_id, id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_shop_idx ON orders (shop_id, id);
`);
  const fixture = fakePool({ indexes: { workspace_page_orders_brand_idx: false } });
  const result = await migratePostgres({ pool: fixture.pool, migrationsDir: directory, clock: () => '2026-08-03T00:00:00.000Z' });

  assert.deepEqual(result.applied, ['012_online.sql']);
  const sql = fixture.queries.map((query) => query.sql);
  assert.ok(sql.includes('DROP INDEX CONCURRENTLY IF EXISTS "workspace_page_orders_brand_idx"'));
  assert.equal(sql.filter((value) => /^CREATE INDEX CONCURRENTLY/i.test(value)).length, 2);
  assert.equal(sql.includes('BEGIN'), false);
  assert.equal(sql.includes('COMMIT'), false);
  assert.equal(fixture.state.get('workspace_page_orders_brand_idx'), true);
  assert.equal(fixture.state.get('workspace_page_orders_shop_idx'), true);
});

test('online migration retries safely after indexes succeeded but ledger write failed', async () => {
  const directory = await migrationDir('012_online.sql', `-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_catalog_brand_idx ON catalog_skus (brand_id, sku);
`);
  const fixture = fakePool({ failLedgerOnce: true });
  await assert.rejects(() => migratePostgres({ pool: fixture.pool, migrationsDir: directory }), /ledger unavailable/);
  assert.equal(fixture.state.get('workspace_page_catalog_brand_idx'), true);

  const result = await migratePostgres({ pool: fixture.pool, migrationsDir: directory });
  assert.deepEqual(result.applied, ['012_online.sql']);
  const drops = fixture.queries.filter((query) => query.sql.startsWith('DROP INDEX CONCURRENTLY'));
  assert.equal(drops.length, 0, 'valid indexes must survive a ledger-only retry');
});

test('transactional migrations retain atomic BEGIN and COMMIT behavior', async () => {
  const directory = await migrationDir('001_base.sql', 'CREATE TABLE example (id text PRIMARY KEY);');
  const fixture = fakePool();
  const result = await migratePostgres({ pool: fixture.pool, migrationsDir: directory });
  assert.deepEqual(result.applied, ['001_base.sql']);
  const sql = fixture.queries.map((query) => query.sql);
  assert.ok(sql.includes('BEGIN'));
  assert.ok(sql.includes('CREATE TABLE example (id text PRIMARY KEY);'));
  assert.ok(sql.includes('COMMIT'));
});

test('online migration rejects unsafe or multi-statement SQL before execution', async () => {
  for (const sql of [
    '-- syntha:migration-mode=online\nDELETE FROM orders;',
    '-- syntha:migration-mode=online\nCREATE INDEX CONCURRENTLY IF NOT EXISTS safe_idx ON orders (id); DROP TABLE orders;',
    '-- syntha:migration-mode=online\nBEGIN; CREATE INDEX CONCURRENTLY IF NOT EXISTS safe_idx ON orders (id); COMMIT;',
  ]) {
    const directory = await migrationDir('012_invalid.sql', sql);
    const fixture = fakePool();
    await assert.rejects(() => migratePostgres({ pool: fixture.pool, migrationsDir: directory }));
    assert.equal(fixture.queries.some((query) => /^CREATE INDEX CONCURRENTLY/i.test(query.sql)), false);
  }
});
