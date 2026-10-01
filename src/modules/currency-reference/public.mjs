import { invariant } from '../../core/errors.mjs';
import { assertSaneFxRate } from '../../core/money.mjs';

// Официальный курс, общий для всех.
//
// `target-pricing` уже знает курс, но только курс бренда на сезон: число, которое бренд сам назвал
// для переговоров о целевой цене. У рыночного курса нет владельца — сегодняшний курс ЦБ один и тот
// же для всех брендов и филиалов, и поэтому он не несёт ни brandId, ни campaignId, в отличие от
// season_fx_rates.
//
// Источники сейчас один — ЦБ РФ, но поле названо явно, а не подразумевается: строка всегда несёт,
// откуда взято число, а не просто что оно есть.

export const CURRENCY_REFERENCE_SOURCES = Object.freeze(['cbr']);

/** Записать официальный курс на дату. Источник не пересматривает уже опубликованный курс — только добавляет новый. */
export function recordCurrencyReferenceRate({ id, source, fromCurrency, toCurrency, rate, effectiveOn, recordedAt }) {
  return Object.freeze({
    id: required(id, 'CURRENCY_REFERENCE_RATE_ID_REQUIRED', 'Rate id'),
    source: oneOf(source, CURRENCY_REFERENCE_SOURCES, 'CURRENCY_REFERENCE_RATE_SOURCE_INVALID', 'Rate source'),
    fromCurrency: currency(fromCurrency, 'CURRENCY_REFERENCE_RATE_FROM_INVALID', 'Source currency'),
    toCurrency: pairedCurrency(toCurrency, fromCurrency, 'CURRENCY_REFERENCE_RATE_TO_INVALID', 'Target currency'),
    rate: assertSaneFxRate(positiveNumber(rate, 'CURRENCY_REFERENCE_RATE_INVALID', 'Rate'), { invalidCode: 'CURRENCY_REFERENCE_RATE_INVALID', label: 'Rate' }),
    effectiveOn: day(effectiveOn, 'CURRENCY_REFERENCE_RATE_DATE_INVALID', 'Rate date'),
    recordedAt: timestamp(recordedAt, 'CURRENCY_REFERENCE_RATE_RECORDED_AT_INVALID', 'Recorded time'),
  });
}

/**
 * Последний официальный курс пары, действующий не позже даты.
 *
 * Тот же приём, что и у `resolveSeasonRate` в target-pricing: берётся последняя запись на дату или
 * раньше, а не ближайшая по времени, — курс не может стать известен раньше, чем ЦБ его объявил.
 */
export function resolveCurrencyReferenceRate({ rates, source = 'cbr', fromCurrency, toCurrency, asOf }) {
  const from = currency(fromCurrency, 'CURRENCY_REFERENCE_RATE_FROM_INVALID', 'Source currency');
  const to = pairedCurrency(toCurrency, from, 'CURRENCY_REFERENCE_RATE_TO_INVALID', 'Target currency');
  const on = day(asOf, 'CURRENCY_REFERENCE_RATE_AS_OF_INVALID', 'As-of date');
  const candidates = list(rates)
    .filter((entry) => entry?.source === source && entry?.fromCurrency === from && entry?.toCurrency === to && entry.effectiveOn <= on)
    .sort((left, right) => (left.effectiveOn < right.effectiveOn ? 1 : -1));
  invariant(candidates.length > 0, 'CURRENCY_REFERENCE_RATE_NOT_FOUND',
    'No reference rate is recorded for that pair on or before that date', { source, fromCurrency: from, toCurrency: to, asOf: on });
  return candidates[0];
}

function list(value) { return Array.isArray(value) ? value : []; }
function required(value, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, code, `${label} is required`);
  return value.trim();
}
function oneOf(value, allowed, code, label) {
  invariant(allowed.includes(value), code, `${label} must be one of ${allowed.join(', ')}`, { value });
  return value;
}
function currency(value, code, label) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), code, `${label} must be a three-letter code`, { value });
  return value;
}
function pairedCurrency(value, from, code, label) {
  const to = currency(value, code, label);
  invariant(to !== from, code, 'A rate from a currency to itself is one, and recording it invites it to disagree with one', { currency: from });
  return to;
}
function positiveNumber(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0, code, `${label} must be positive`, { value });
  return number;
}
function day(value, code, label) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`, { value });
  return value.slice(0, 10);
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`);
  return new Date(value).toISOString();
}
