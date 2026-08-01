import test from 'node:test';
import assert from 'node:assert/strict';
import { withPostgresTransaction } from '../src/infrastructure/postgres-transaction.mjs';

function createFixture({ query, release } = {}) {
  const operations = [];
  const client = {
    async query(sql) {
      operations.push(sql);
      if (query) return query(sql);
      return { rows: [], rowCount: 0 };
    },
    async release() {
      operations.push('RELEASE');
      if (release) return release();
      return undefined;
    },
  };
  return {
    operations,
    client,
    pool: { async connect() { return client; } },
  };
}

test('transaction commits the work result and releases the client', async () => {
  const fixture = createFixture();
  const result = await withPostgresTransaction(
    fixture.pool,
    async (view) => {
      assert.equal(view.client, fixture.client);
      return { ok: true };
    },
    { createView: (client) => ({ client }) },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(fixture.operations, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('rollback failure never replaces the primary transaction error', async () => {
  const primaryError = new Error('business operation failed');
  const rollbackError = new Error('rollback connection failed');
  const releaseError = new Error('release failed');
  const fixture = createFixture({
    query(sql) {
      if (sql === 'ROLLBACK') throw rollbackError;
      return { rows: [], rowCount: 0 };
    },
    release() { throw releaseError; },
  });

  await assert.rejects(
    () => withPostgresTransaction(fixture.pool, async () => { throw primaryError; }),
    (error) => {
      assert.equal(error, primaryError);
      assert.equal(error.rollbackError, rollbackError);
      assert.equal(error.releaseError, releaseError);
      assert.equal(Object.keys(error).includes('rollbackError'), false);
      assert.equal(Object.keys(error).includes('releaseError'), false);
      return true;
    },
  );
  assert.deepEqual(fixture.operations, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('commit failure is rolled back and remains the surfaced error', async () => {
  const commitError = new Error('commit failed');
  const fixture = createFixture({
    query(sql) {
      if (sql === 'COMMIT') throw commitError;
      return { rows: [], rowCount: 0 };
    },
  });

  await assert.rejects(
    () => withPostgresTransaction(fixture.pool, async () => 'result'),
    (error) => error === commitError,
  );
  assert.deepEqual(fixture.operations, ['BEGIN', 'COMMIT', 'ROLLBACK', 'RELEASE']);
});

test('release failure after a successful commit is not silently ignored', async () => {
  const releaseError = new Error('release failed');
  const fixture = createFixture({ release() { throw releaseError; } });

  await assert.rejects(
    () => withPostgresTransaction(fixture.pool, async () => 'result'),
    (error) => error === releaseError,
  );
  assert.deepEqual(fixture.operations, ['BEGIN', 'COMMIT', 'RELEASE']);
});

test('primitive thrown values are preserved even when release also fails', async () => {
  const fixture = createFixture({ release() { throw new Error('release failed'); } });
  let rejected = false;
  let rejection;

  try {
    await withPostgresTransaction(fixture.pool, async () => { throw undefined; });
  } catch (error) {
    rejected = true;
    rejection = error;
  }

  assert.equal(rejected, true);
  assert.equal(rejection, undefined);
  assert.deepEqual(fixture.operations, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});

test('transaction inputs are validated before acquiring a client', async () => {
  await assert.rejects(
    () => withPostgresTransaction(undefined, async () => undefined),
    /pool with connect\(\) is required/i,
  );
  await assert.rejects(
    () => withPostgresTransaction({ connect() {} }, undefined),
    /work must be a function/i,
  );
});
