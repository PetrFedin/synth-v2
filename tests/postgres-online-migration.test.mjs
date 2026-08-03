import test from 'node:test';
import { createHash } from 'node:crypto';
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

function fakePool({ indexes = {}, failLedgerOnce = false, appliedChecksums = {}, lockResponses = [true] } = {}) {
  const queries = [];
  let ledgerFailurePending = failLedgerOnce;
  const pendingLockResponses = [...lockResponses];
  const state = new Map(Object.entries(indexes));
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === 'SELECT pg_try_advisory_lock($1) AS locked') {
        const locked = pendingLockResponses.length > 1 ? pendingLockResponses.shift() : pendingLockResponses[0];
        return { rowCount: 1, rows: [{ locked }] };
      }
      if (sql === 'SELECT checksum FROM schema_migrations WHERE version = $1') {
        const checksum = appliedChecksums[params[0]];
        return checksum ? { rowCount: 1, rows: [{ checksum }] } : { rowCount: 0, rows: [] };
      }
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
  const ledger = fixture.queries.find((query) => query.sql.startsWith('INSERT INTO schema_migrations'));
  assert.deepEqual(ledger.params[0], '012_online.sql');
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

test('applied online migrations self-heal missing and invalid indexes without rewriting the ledger', async () => {
  const sql = `-- syntha:migration-mode=online
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_valid_idx ON orders (id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_invalid_idx ON orders (brand_id, id);
-- syntha:statement
CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_page_orders_missing_idx ON orders (shop_id, id);
`;
  const version = '012_online.sql';
  const directory = await migrationDir(version, sql);
  const fixture = fakePool({
    indexes: {
      workspace_page_orders_valid_idx: true,
      workspace_page_orders_invalid_idx: false,
    },
    appliedChecksums: {
      [version]: createHash('sha256').update(sql).digest('hex'),
    },
  });

  const result = await migratePostgres({ pool: fixture.pool, migrationsDir: directory });
  assert.deepEqual(result, { applied: [], skipped: [version] });
  assert.equal(fixture.state.get('workspace_page_orders_valid_idx'), true);
  assert.equal(fixture.state.get('workspace_page_orders_invalid_idx'), true);
  assert.equal(fixture.state.get('workspace_page_orders_missing_idx'), true);
  const creates = fixture.queries.filter((query) => /^CREATE INDEX CONCURRENTLY/i.test(query.sql));
  assert.equal(creates.length, 2, 'valid indexes must be skipped while invalid and missing indexes are rebuilt');
  assert.equal(fixture.queries.some((query) => query.sql.startsWith('INSERT INTO schema_migrations')), false);

  await migratePostgres({ pool: fixture.pool, migrationsDir: directory });
  assert.equal(
    fixture.queries.filter((query) => /^CREATE INDEX CONCURRENTLY/i.test(query.sql)).length,
    2,
    'a subsequent startup must not rebuild healthy indexes',
  );
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
  assert.equal(sql.some((value) => /^CREATE INDEX CONCURRENTLY/i.test(value)), false);
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

test('migration lock polling does not leave a blocking server-side advisory lock wait', async () => {
  const directory = await migrationDir('001_base.sql', 'CREATE TABLE example (id text PRIMARY KEY);');
  const fixture = fakePool({ lockResponses: [false, false, true] });
  const sleeps = [];

  const result = await migratePostgres({
    pool: fixture.pool,
    migrationsDir: directory,
    lockAttempts: 3,
    lockDelayMs: 7,
    sleep: async (delayMs) => sleeps.push(delayMs),
  });

  assert.deepEqual(result.applied, ['001_base.sql']);
  assert.deepEqual(sleeps, [7, 7]);
  const sql = fixture.queries.map((query) => query.sql);
  assert.deepEqual(sql.slice(0, 3), [
    'SELECT pg_try_advisory_lock($1) AS locked',
    'SELECT pg_try_advisory_lock($1) AS locked',
    'SELECT pg_try_advisory_lock($1) AS locked',
  ]);
  assert.equal(sql.includes('SELECT pg_advisory_lock($1)'), false);
  assert.ok(sql.indexOf('BEGIN') > 2, 'no transaction may begin while a runner is waiting for the migration lock');
});

test('migration lock timeout fails before schema or ledger mutation and releases the client', async () => {
  const directory = await migrationDir('001_base.sql', 'CREATE TABLE example (id text PRIMARY KEY);');
  const fixture = fakePool({ lockResponses: [false] });

  await assert.rejects(
    () => migratePostgres({
      pool: fixture.pool,
      migrationsDir: directory,
      lockAttempts: 2,
      lockDelayMs: 0,
      sleep: async () => undefined,
    }),
    (error) => error?.code === 'MIGRATION_LOCK_TIMEOUT' && error.details?.attempts === 2,
  );

  const sql = fixture.queries.map((query) => query.sql);
  assert.equal(sql.some((value) => value.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')), false);
  assert.equal(sql.includes('BEGIN'), false);
  assert.equal(sql.at(-1), 'RELEASE');
});
