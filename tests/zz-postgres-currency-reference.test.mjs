import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCurrencyReferenceRate } from '../src/modules/currency-reference/public.mjs';
import { createPostgresCurrencyReferenceStore } from '../src/infrastructure/postgres-currency-reference-store.mjs';
import { createCurrencyReferenceIngestService, createCurrencyReferenceQueryService } from '../src/application/currency-reference-service.mjs';
import { migratePostgres } from '../src/infrastructure/postgres-migrator.mjs';
import { createPostgresTestPool } from './postgres-test-pool.mjs';

const databaseUrl = process.env.POSTGRES_TEST_URL;

test('PostgreSQL currency reference registry records official rates with history and resolves the latest one on or before a date', { skip: !databaseUrl }, async () => {
  const pool = createPostgresTestPool({ connectionString: databaseUrl, max: 4 });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let tick = 0;
  const baseTime = Date.parse('2026-09-01T09:00:00.000Z');
  const clock = () => new Date(baseTime + tick++ * 1000).toISOString();
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migratePostgres({ pool, migrationsDir: path.join(root, 'db', 'migrations'), clock });

    const store = createPostgresCurrencyReferenceStore({ pool });
    const ingest = createCurrencyReferenceIngestService({ store, clock });
    const queries = createCurrencyReferenceQueryService({ store });

    await ingest.recordRate({ source: 'cbr', fromCurrency: 'USD', toCurrency: 'RUB', rate: 91.5, effectiveOn: '2026-09-01' });
    await ingest.recordRate({ source: 'cbr', fromCurrency: 'USD', toCurrency: 'RUB', rate: 92.3, effectiveOn: '2026-09-15' });
    await ingest.recordRate({ source: 'cbr', fromCurrency: 'EUR', toCurrency: 'RUB', rate: 99.1, effectiveOn: '2026-09-15' });
    // JPY is quoted by CBR per 100 units; the sync script already divides by Nominal before this
    // point, so the registry itself only ever sees a per-unit rate.
    await ingest.recordRate({ source: 'cbr', fromCurrency: 'JPY', toCurrency: 'RUB', rate: 0.612, effectiveOn: '2026-09-15' });

    // A re-sync of the same day's official rate is a no-op, not a conflict: the daily fixing does
    // not change once published, so running the sync twice must not fail.
    await ingest.recordRate({ source: 'cbr', fromCurrency: 'USD', toCurrency: 'RUB', rate: 91.5, effectiveOn: '2026-09-01' });

    // A genuinely different rate for the same source/pair/date is a real integrity problem, not a
    // retry — it must be rejected, not silently overwrite the day's official value.
    await assert.rejects(
      ingest.recordRate({ source: 'cbr', fromCurrency: 'USD', toCurrency: 'RUB', rate: 91.9, effectiveOn: '2026-09-01' }),
      (error) => { assert.equal(error.code, 'CURRENCY_REFERENCE_RATE_DISAGREES'); return true; },
    );

    const usdHistory = await queries.ratesForActor('user-1', { fromCurrency: 'USD', toCurrency: 'RUB' });
    assert.equal(usdHistory.length, 2);
    // Newest first.
    assert.equal(usdHistory[0].effectiveOn, '2026-09-15');
    assert.equal(usdHistory[0].rate, 92.3);
    assert.equal(usdHistory[1].effectiveOn, '2026-09-01');
    assert.equal(usdHistory[1].rate, 91.5);

    const allRates = await queries.ratesForActor('user-1', {});
    assert.equal(allRates.length, 4);

    // Resolution picks the rate effective on or before the asked date, never a later one it could
    // not have known about at that point.
    const midMonth = resolveCurrencyReferenceRate({ rates: usdHistory, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-09-10' });
    assert.equal(midMonth.rate, 91.5);
    const lateMonth = resolveCurrencyReferenceRate({ rates: usdHistory, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-09-20' });
    assert.equal(lateMonth.rate, 92.3);
    assert.throws(
      () => resolveCurrencyReferenceRate({ rates: usdHistory, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-08-31' }),
      (error) => { assert.equal(error.code, 'CURRENCY_REFERENCE_RATE_NOT_FOUND'); return true; },
    );
  } finally {
    await pool.end();
  }
});
