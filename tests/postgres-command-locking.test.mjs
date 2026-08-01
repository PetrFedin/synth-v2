import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresCatalogStore } from '../src/infrastructure/postgres-catalog-store.mjs';
import { createPostgresNotificationProjectionStore } from '../src/infrastructure/postgres-notification-projection-store.mjs';
import { createPostgresWholesaleStore } from '../src/infrastructure/postgres-store.mjs';

const completedAt = new Date('2026-08-02T00:00:00.000Z');
const command = Object.freeze({
  id: 'command-1',
  fingerprint: 'fingerprint',
  actorId: 'actor-1',
  result: Object.freeze({ ok: true }),
  completedAt: completedAt.toISOString(),
});

function joinedRow({ scope, includeRegistry = true, includeLedger = true } = {}) {
  return {
    registry_id: includeRegistry ? command.id : null,
    registry_scope: includeRegistry ? scope : null,
    registry_fingerprint: includeRegistry ? command.fingerprint : null,
    registry_actor_id: includeRegistry ? command.actorId : null,
    registry_completed_at: includeRegistry ? completedAt : null,
    ledger_id: includeLedger ? command.id : null,
    ledger_fingerprint: includeLedger ? command.fingerprint : null,
    ledger_actor_id: includeLedger ? command.actorId : null,
    ledger_result: includeLedger ? command.result : null,
    ledger_completed_at: includeLedger ? completedAt : null,
  };
}

function fixture({ table, row } = {}) {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM command_registry AS registry') && sql.includes(`FULL OUTER JOIN ${table} AS ledger`)) {
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (/SELECT scope, fingerprint, actor_id, completed_at FROM command_registry/.test(sql)) {
        return { rows: row?.registry_id ? [{
          scope: row.registry_scope,
          fingerprint: row.registry_fingerprint,
          actor_id: row.registry_actor_id,
          completed_at: row.registry_completed_at,
        }] : [], rowCount: row?.registry_id ? 1 : 0 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() { queries.push({ sql: 'RELEASE', params: [] }); },
  };
  const pool = {
    async connect() { return client; },
    async query() { throw new Error('pool.query is not expected'); },
  };
  return { pool, queries };
}

async function readCommand(store, id = command.id) {
  return store.transaction((tx) => tx.getCommand(id));
}

const storeCases = [
  ['wholesale', 'commands', (pool) => createPostgresWholesaleStore({ pool })],
  ['catalog', 'catalog_commands', (pool) => createPostgresCatalogStore({ pool })],
  ['notification', 'notification_commands', (pool) => createPostgresNotificationProjectionStore({ pool })],
];

for (const [scope, table, createStore] of storeCases) {
  test(`${scope} command lookup uses the shared global lock and scoped ledger join`, async () => {
    const current = fixture({ table, row: joinedRow({ scope }) });
    const result = await readCommand(createStore(current.pool));
    assert.deepEqual(result, command);
    assert.equal(current.queries[0].sql, 'BEGIN');
    assert.match(current.queries[1].sql, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
    assert.deepEqual(current.queries[1].params, ['command:command-1']);
    assert.match(current.queries[2].sql, new RegExp(`FULL OUTER JOIN ${table} AS ledger`));
    assert.deepEqual(current.queries[2].params, ['command-1']);
    assert.equal(current.queries[3].sql, 'COMMIT');
    assert.equal(current.queries[4].sql, 'RELEASE');
  });
}

test('a command id registered by another subsystem fails before domain work executes', async () => {
  const current = fixture({
    table: 'catalog_commands',
    row: joinedRow({ scope: 'wholesale', includeLedger: false }),
  });
  await assert.rejects(
    () => readCommand(createPostgresCatalogStore({ pool: current.pool })),
    (error) => error.code === 'COMMAND_SCOPE_CONFLICT'
      && error.details.commandId === 'command-1'
      && error.details.requestedScope === 'catalog'
      && error.details.registeredScope === 'wholesale',
  );
  assert.equal(current.queries.at(-2).sql, 'ROLLBACK');
  assert.equal(current.queries.at(-1).sql, 'RELEASE');
});

test('new command persistence writes registry before the scoped result in the same transaction', async () => {
  const current = fixture({ table: 'commands' });
  const store = createPostgresWholesaleStore({ pool: current.pool });
  await store.transaction(async (tx) => {
    assert.equal(await tx.getCommand(command.id), undefined);
    await tx.insertCommand(command);
  });

  const registryInsert = current.queries.findIndex((query) => /INSERT INTO command_registry/.test(query.sql));
  const ledgerInsert = current.queries.findIndex((query) => /INSERT INTO commands/.test(query.sql));
  assert.ok(registryInsert > 0);
  assert.ok(ledgerInsert > registryInsert);
  assert.deepEqual(current.queries[registryInsert].params, [
    command.id,
    'wholesale',
    command.fingerprint,
    command.actorId,
    command.completedAt,
  ]);
  assert.deepEqual(current.queries[ledgerInsert].params, [
    command.id,
    command.fingerprint,
    command.actorId,
    JSON.stringify(command.result),
    command.completedAt,
  ]);
  assert.equal(current.queries.at(-2).sql, 'COMMIT');
});

test('legacy scoped rows are backfilled into the global registry under the shared lock', async () => {
  const current = fixture({
    table: 'notification_commands',
    row: joinedRow({ scope: 'notification', includeRegistry: false }),
  });
  const result = await readCommand(createPostgresNotificationProjectionStore({ pool: current.pool }));
  assert.deepEqual(result, command);
  const insert = current.queries.find((query) => /INSERT INTO command_registry/.test(query.sql));
  assert.deepEqual(insert.params, [
    command.id,
    'notification',
    command.fingerprint,
    command.actorId,
    command.completedAt,
  ]);
});

test('registry metadata mismatch is treated as corruption rather than replayed', async () => {
  const row = joinedRow({ scope: 'wholesale' });
  row.registry_fingerprint = 'different-fingerprint';
  const current = fixture({ table: 'commands', row });
  await assert.rejects(
    () => readCommand(createPostgresWholesaleStore({ pool: current.pool })),
    (error) => error.code === 'COMMAND_LEDGER_INCONSISTENT',
  );
});

test('global command lock remains inside the transaction and rollback preserves the original failure', async () => {
  const current = fixture({ table: 'commands' });
  const failure = new Error('mutation failed');
  await assert.rejects(
    () => createPostgresWholesaleStore({ pool: current.pool }).transaction(async (tx) => {
      await tx.getCommand('command-2');
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal(current.queries.at(-2).sql, 'ROLLBACK');
  assert.equal(current.queries.at(-1).sql, 'RELEASE');
});

test('lock keys are parameterized and never expose command ids in SQL text', async () => {
  const current = fixture({ table: 'commands' });
  await readCommand(createPostgresWholesaleStore({ pool: current.pool }), 'unsafe-but-data-only');
  const lock = current.queries[1];
  assert.equal(lock.sql.includes('unsafe-but-data-only'), false);
  assert.deepEqual(lock.params, ['command:unsafe-but-data-only']);
});
