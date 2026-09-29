import { invariant } from '../core/errors.mjs';
import { withPostgresTransaction } from './postgres-transaction.mjs';

const SNAPSHOT_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';

// Справочник — не бизнес-мутация: у записи нет актёра, которому её приписать, и нет организации,
// чьё членство проверять. Курс ЦБ на дату существует один раз для всех, поэтому запись сюда не
// проходит через командный леджер и не несёт исходящего события — тем же приёмом, что и загрузка
// MDM-справочников (`mdm-reference-bootstrap.mjs`): это инфраструктурная загрузка, а не действие
// актёра через HTTP.
export function createPostgresCurrencyReferenceStore({ pool } = {}) {
  invariant(pool && typeof pool.connect === 'function', 'POSTGRES_POOL_REQUIRED', 'PostgreSQL pool is required');
  return Object.freeze({
    async insertRate(value) {
      await withPostgresTransaction(pool, async (client) => {
        // `ON CONFLICT DO NOTHING` instead of catching 23505: a caught unique-violation leaves the
        // transaction aborted in Postgres until rollback, and a plain SELECT right after it would
        // itself fail with "current transaction is aborted". Conflict handled this way never raises,
        // so the compare-and-report step below can run in the same transaction.
        const inserted = await client.query(
          `INSERT INTO currency_reference_rates (id,source,from_currency,to_currency,rate,effective_on,recorded_at,payload)
           VALUES ($1,$2,$3,$4,$5,$6::date,$7::timestamptz,$8::jsonb)
           ON CONFLICT (source, from_currency, to_currency, effective_on) DO NOTHING`,
          [value.id, value.source, value.fromCurrency, value.toCurrency, value.rate, value.effectiveOn, value.recordedAt, JSON.stringify(value)],
        );
        if (inserted.rowCount === 1) return;
        const existing = await client.query(
          'SELECT rate FROM currency_reference_rates WHERE source = $1 AND from_currency = $2 AND to_currency = $3 AND effective_on = $4::date',
          [value.source, value.fromCurrency, value.toCurrency, value.effectiveOn],
        );
        const recorded = existing.rows[0]?.rate === undefined ? null : Number(existing.rows[0].rate);
        invariant(recorded !== null && Math.abs(recorded - value.rate) < 1e-8, 'CURRENCY_REFERENCE_RATE_DISAGREES',
          'A different rate is already recorded for that source, pair and date', { source: value.source, fromCurrency: value.fromCurrency, toCurrency: value.toCurrency, effectiveOn: value.effectiveOn, recorded, submitted: value.rate });
        // Тот же курс уже записан — повторный прогон синхронизации идемпотентен.
      });
    },
    async listRates({ source, fromCurrency, toCurrency, limit } = {}) {
      return withPostgresTransaction(pool, async (client) => {
        const conditions = [];
        const values = [];
        if (source) { values.push(source); conditions.push(`source = $${values.length}`); }
        if (fromCurrency) { values.push(fromCurrency); conditions.push(`from_currency = $${values.length}`); }
        if (toCurrency) { values.push(toCurrency); conditions.push(`to_currency = $${values.length}`); }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const boundedLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= 500 ? limit : 200;
        values.push(boundedLimit);
        const result = await client.query(
          `SELECT payload FROM currency_reference_rates ${where} ORDER BY effective_on DESC, from_currency, to_currency LIMIT $${values.length}`,
          values,
        );
        return result.rows.map((row) => row.payload);
      }, { begin: SNAPSHOT_BEGIN });
    },
  });
}
