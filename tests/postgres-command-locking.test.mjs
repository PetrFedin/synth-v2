import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';

function fixture(commandTable, result = undefined) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith(`SELECT id, fingerprint, actor_id, result, completed_at FROM ${commandTable}`)) {
        return { rows: result ? [result] : [], rowCount: result ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const pool = {
    async connect() { return client; },
    async query() { throw new Error('pool.query is not expected'); },
  };
  return { pool, queries };
}

async function readCommand(store, id) {
  return store.transaction((tx) => tx.getCommand(id));
}

test('wholesale command lookup takes a transaction-scoped advisory lock before SELECT', async () => {
  const row = {
    id: 'command-1',
    fingerprint: 'fingerprint',
    actor_id: 'actor-1',
    result: { ok: true },
    completed_at: new Date('2026-08-02T00:00:00.000Z'),
  };
  const fixtureValue = fixture('commands', row);
  const result = await readCommand(createPostgresWholesaleStore({ pool: fixtureValue.pool }), 'command-1');
  assert.deepEqual(result.result, { ok: true });
  assert.equal(fixtureValue.queries[0].sql, 'BEGIN');
  assert.match(fixtureValue.queries[1].sql, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.deepEqual(fixtureValue.queries[1].params, ['wholesale-command:command-1']);
  assert.match(fixtureValue.queries[2].sql, /FROM commands WHERE id = \$1/);
  assert.equal(fixtureValue.queries[3].sql, 'COMMIT');
  assert.equal(fixtureValue.queries[4].sql, 'RELEASE');
});

test('catalog command lookup uses an independent lock namespace', async () => {
  const fixtureValue = fixture('catalog_commands');
  const result = await readCommand(createPostgresCatalogStore({ pool: fixtureValue.pool }), 'command-1');
  assert.equal(result, undefined);
  assert.deepEqual(fixtureValue.queries[1].params, ['catalog-command:command-1']);
  assert.match(fixtureValue.queries[2].sql, /FROM catalog_commands WHERE id = \$1/);
});

test('command locks remain inside the transaction and rollback on later failure', async () => {
  const queries = [];
  const failure = new Error('mutation failed');
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/FROM commands WHERE id/.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const store = createPostgresWholesaleStore({
    pool: { async connect() { return client; }, async query() { return { rows: [] }; } },
  });
  await assert.rejects(
    () => store.transaction(async (tx) => {
      await tx.getCommand('command-2');
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal(queries.at(-2).sql, 'ROLLBACK');
  assert.equal(queries.at(-1).sql, 'RELEASE');
});

test('lock keys are namespaced and do not expose raw command ids as SQL', async () => {
  const fixtureValue = fixture('commands');
  await readCommand(createPostgresWholesaleStore({ pool: fixtureValue.pool }), 'unsafe-but-data-only');
  const lock = fixtureValue.queries[1];
  assert.equal(lock.sql.includes('unsafe-but-data-only'), false);
  assert.deepEqual(lock.params, ['wholesale-command:unsafe-but-data-only']);
});
