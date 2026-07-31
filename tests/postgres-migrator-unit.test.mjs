import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPostgres } from '../src/infrastructure/postgres-migrator.mjs';

test('waitForPostgres retries readiness probe until PostgreSQL succeeds', async () => {
  let calls = 0;
  const sleeps = [];
  const result = await waitForPostgres({
    pool: {
      async query(sql) {
        assert.equal(sql, 'SELECT 1');
        calls += 1;
        if (calls < 3) throw new Error('not ready');
      },
    },
    attempts: 4,
    delayMs: 5,
    sleep: async (delay) => sleeps.push(delay),
  });
  assert.deepEqual(result, { attempt: 3 });
  assert.deepEqual(sleeps, [5, 5]);
});

test('waitForPostgres rethrows the final readiness error', async () => {
  const expected = new Error('offline');
  await assert.rejects(
    () => waitForPostgres({
      pool: { query: async () => { throw expected; } },
      attempts: 2,
      delayMs: 0,
      sleep: async () => undefined,
    }),
    (error) => error === expected,
  );
});
