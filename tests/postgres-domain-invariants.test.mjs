import test from 'node:test';
import assert from 'node:assert/strict';
import { DomainError } from '../src/core/errors.mjs';
import { translatePostgresDomainInvariant } from '../src/infrastructure/postgres-domain-invariants.mjs';
import { withPostgresTransaction } from '../src/infrastructure/postgres-transaction.mjs';

for (const code of [
  'SUPPLY_ORDER_EXECUTION_CONFLICT',
  'ORDER_CANCELLATION_EXECUTION_CONFLICT',
]) {
  test(`PostgreSQL ${code} becomes a domain conflict without leaking database detail`, () => {
    const source = Object.assign(new Error(code), { code: 'P0001', detail: 'internal database detail' });
    const translated = translatePostgresDomainInvariant(source);
    assert.ok(translated instanceof DomainError);
    assert.equal(translated.code, code);
    assert.deepEqual(translated.details, {});
    assert.equal(translated.cause, source);
  });
}

test('unmapped PostgreSQL errors preserve their original identity', () => {
  for (const code of ['SUPPLY_ALLOCATIONS_REQUIRED', 'SUPPLY_COMMERCIAL_STAGE_CONFLICT']) {
    const source = Object.assign(new Error(code), { code: 'P0001' });
    assert.equal(translatePostgresDomainInvariant(source), source);
  }
});

test('transaction rollback translates execution conflicts before they reach HTTP', async () => {
  const statements = [];
  let released = 0;
  const raw = Object.assign(new Error('ORDER_CANCELLATION_EXECUTION_CONFLICT'), { code: 'P0001' });
  const client = {
    async query(statement) { statements.push(statement); },
    async release() { released += 1; },
  };
  const pool = { async connect() { return client; } };

  await assert.rejects(
    () => withPostgresTransaction(pool, async () => { throw raw; }),
    (error) => error instanceof DomainError && error.code === 'ORDER_CANCELLATION_EXECUTION_CONFLICT',
  );
  assert.deepEqual(statements, ['BEGIN', 'ROLLBACK']);
  assert.equal(released, 1);
});
