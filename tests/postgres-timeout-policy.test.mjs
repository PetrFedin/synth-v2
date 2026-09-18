import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresMaintenanceStore } from '../src/infrastructure/postgres-maintenance-store.mjs';

const cutoffs = Object.freeze({
  now: '2026-08-02T12:00:00.000Z',
  commandsBefore: '2026-07-03T12:00:00.000Z',
  authAuditBefore: '2026-05-04T12:00:00.000Z',
  throttlesBefore: '2026-07-26T12:00:00.000Z',
  revokedSessionsBefore: '2026-07-26T12:00:00.000Z',
  outboxBefore: '2026-07-03T12:00:00.000Z',
});

function recordingClient() {
  const queries = [];
  const releases = [];
  return {
    queries,
    releases,
    client: {
      async query(sql, params = []) {
        queries.push(sql);
        if (/pg_try_advisory_lock/.test(sql)) return { rowCount: 1, rows: [{ locked: true }] };
        if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ acquired: true }] };
        if (/^SELECT checksum FROM schema_migrations/.test(sql)) return { rowCount: 0, rows: [] };
        return { rowCount: 0, rows: [] };
      },
      release(destroy) { releases.push(destroy); },
    },
  };
}

test('migration session opts out of the request-path timeouts before touching the schema', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-timeout-'));
  await writeFile(path.join(directory, '001_base.sql'), 'CREATE TABLE example (id text PRIMARY KEY);', 'utf8');
  const fixture = recordingClient();

  await migratePostgres({ pool: { async connect() { return fixture.client; } }, migrationsDir: directory });

  assert.deepEqual(fixture.queries.slice(0, 3), [
    'SET statement_timeout = 0',
    'SET lock_timeout = 0',
    'SET idle_in_transaction_session_timeout = 0',
  ]);
});

test('migration session is destroyed on release so relaxed timeouts never return to the pool', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'syntha-timeout-'));
  await writeFile(path.join(directory, '001_base.sql'), 'CREATE TABLE example (id text PRIMARY KEY);', 'utf8');
  const fixture = recordingClient();

  await migratePostgres({ pool: { async connect() { return fixture.client; } }, migrationsDir: directory });

  assert.deepEqual(fixture.releases, [true]);
});

test('retention maintenance pins its own transaction-scoped timeouts', async () => {
  const fixture = recordingClient();
  const store = createPostgresMaintenanceStore({
    pool: { async connect() { return fixture.client; } },
    statementTimeoutMs: 900_000,
    lockTimeoutMs: 10_000,
  });

  await store.cleanup(cutoffs);

  assert.deepEqual(fixture.queries.slice(0, 3), [
    'BEGIN',
    'SET LOCAL statement_timeout = 900000',
    'SET LOCAL lock_timeout = 10000',
  ]);
});

test('retention maintenance defaults to unlimited statement time regardless of pool policy', async () => {
  const fixture = recordingClient();
  const store = createPostgresMaintenanceStore({ pool: { async connect() { return fixture.client; } } });

  await store.cleanup(cutoffs);

  assert.deepEqual(fixture.queries.slice(1, 3), ['SET LOCAL statement_timeout = 0', 'SET LOCAL lock_timeout = 0']);
});

test('retention maintenance rejects a non-integer timeout instead of interpolating it', () => {
  const pool = { async connect() { return recordingClient().client; } };
  const hasCode = (code) => (error) => error.code === code;
  assert.throws(() => createPostgresMaintenanceStore({ pool, statementTimeoutMs: '0; DROP TABLE commands' }), hasCode('MAINTENANCE_STATEMENT_TIMEOUT_INVALID'));
  assert.throws(() => createPostgresMaintenanceStore({ pool, statementTimeoutMs: -1 }), hasCode('MAINTENANCE_STATEMENT_TIMEOUT_INVALID'));
  assert.throws(() => createPostgresMaintenanceStore({ pool, lockTimeoutMs: 1.5 }), hasCode('MAINTENANCE_LOCK_TIMEOUT_INVALID'));
});
