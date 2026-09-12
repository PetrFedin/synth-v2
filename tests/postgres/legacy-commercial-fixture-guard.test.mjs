import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migratePostgres } from '../../src/infrastructure/postgres-migrator.mjs';
import { withLegacyCommercialInsertGuardsDisabled } from './legacy-commercial-fixture.mjs';

const { Pool } = pg;
const connectionString = process.env.POSTGRES_TEST_URL;
const INSERT_GUARDS = Object.freeze([
  'selections_000_canonical_new_write',
  'orders_000_canonical_new_write',
  'order_commit_000_canonical_new_write',
]);
const UPDATE_GUARDS = Object.freeze([
  'selections_010_canonical_update',
  'orders_010_canonical_update',
]);

async function guardStates(pool) {
  const result = await pool.query(
    `SELECT tgname, tgenabled
       FROM pg_trigger
      WHERE tgname = ANY($1::text[])
      ORDER BY tgname`,
    [[...INSERT_GUARDS, ...UPDATE_GUARDS]],
  );
  return new Map(result.rows.map((row) => [row.tgname, row.tgenabled]));
}

function assertGuardState(states, insertState) {
  assert.equal(states.size, INSERT_GUARDS.length + UPDATE_GUARDS.length);
  for (const name of INSERT_GUARDS) assert.equal(states.get(name), insertState, `${name} must be ${insertState}`);
  for (const name of UPDATE_GUARDS) assert.equal(states.get(name), 'O', `${name} must stay enabled`);
}

test('historical fixture helper disables only INSERT guards and restores them after success and failure', async () => {
  assert.ok(connectionString, 'POSTGRES_TEST_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString, max: 2 });
  const migrationsDir = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

  try {
    await migratePostgres({ pool, migrationsDir });
    assertGuardState(await guardStates(pool), 'O');

    const result = await withLegacyCommercialInsertGuardsDisabled(pool, async (fixturePool) => {
      assert.equal(fixturePool, pool);
      assertGuardState(await guardStates(pool), 'D');
      return 'historical-fixture-created';
    });
    assert.equal(result, 'historical-fixture-created');
    assertGuardState(await guardStates(pool), 'O');

    const sentinel = new Error('fixture-construction-failed');
    await assert.rejects(
      withLegacyCommercialInsertGuardsDisabled(pool, async () => {
        assertGuardState(await guardStates(pool), 'D');
        throw sentinel;
      }),
      (error) => error === sentinel,
    );
    assertGuardState(await guardStates(pool), 'O');
  } finally {
    await pool.end();
  }
});
