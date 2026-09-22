import { invariant } from './errors.mjs';

export const MONEY_SCALE = 4;
export const MONEY_PERCENTAGE_SCALE = 4;
export const POSTGRES_INTEGER_MAX = 2_147_483_647;
const MONEY_FACTOR = 10 ** MONEY_SCALE;
const MONEY_PERCENTAGE_FACTOR = 10 ** MONEY_PERCENTAGE_SCALE;
const MAX_SCALED_MONEY = Number.MAX_SAFE_INTEGER;
const MAX_SCALED_MONEY_BIGINT = BigInt(MAX_SCALED_MONEY);

export function normalizeMoney(value, {
  invalidCode = 'MONEY_INVALID',
  scaleCode = 'MONEY_SCALE_INVALID',
  overflowCode = 'MONEY_TOO_LARGE',
  label = 'Money amount',
  allowZero = false,
} = {}) {
  invariant(Number.isFinite(value) && (allowZero ? value >= 0 : value > 0), invalidCode, `${label} must be ${allowZero ? 'non-negative' : 'positive'}`);
  const scaled = Math.round(value * MONEY_FACTOR);
  invariant(Number.isSafeInteger(scaled), overflowCode, `${label} exceeds the safe fixed-point range`, { scale: MONEY_SCALE });
  const normalized = scaled / MONEY_FACTOR;
  const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  invariant(Math.abs(value - normalized) <= tolerance, scaleCode, `${label} must use at most ${MONEY_SCALE} decimal places`, { scale: MONEY_SCALE });
  return normalized;
}

export function calculateMoneyPercentage(numerator, denominator, {
  invalidCode = 'MONEY_PERCENTAGE_INVALID',
  scaleCode = 'MONEY_PERCENTAGE_SCALE_INVALID',
  overflowCode = 'MONEY_PERCENTAGE_TOO_LARGE',
  numeratorLabel = 'Money numerator',
  denominatorLabel = 'Money denominator',
} = {}) {
  const numeratorUnits = toSignedMoneyUnits(numerator, {
    invalidCode,
    scaleCode,
    overflowCode,
    label: numeratorLabel,
  });
  const denominatorUnits = toPositiveMoneyUnits(denominator, {
    invalidCode,
    scaleCode,
    overflowCode,
    label: denominatorLabel,
  });
  const percentageDividend = BigInt(numeratorUnits)
    * 100n
    * BigInt(MONEY_PERCENTAGE_FACTOR);
  const scaledPercentage = divideAndRoundHalfAwayFromZero(
    percentageDividend,
    BigInt(denominatorUnits),
  );
  invariant(
    scaledPercentage <= MAX_SCALED_MONEY_BIGINT
      && scaledPercentage >= -MAX_SCALED_MONEY_BIGINT,
    overflowCode,
    'Money percentage exceeds the safe fixed-point range',
    { scale: MONEY_PERCENTAGE_SCALE },
  );
  return Number(scaledPercentage) / MONEY_PERCENTAGE_FACTOR;
}

/**
 * Округлить сумму до денежной шкалы **так же, как это делает PostgreSQL**.
 *
 * `Math.round` округляет половину к плюс бесконечности: у положительных это «от нуля», а у
 * отрицательных — «к нулю». PostgreSQL у `numeric` округляет половину **от нуля при любом знаке**.
 * Пока числа положительные, разницы нет, и её не было видно годами; на отрицательной величине —
 * убыточной марже, стоимостной коррекции, кредите поставщика — два округления расходятся на одну
 * единицу последнего разряда. Там, где то же число пересчитывает триггер целостности, это не
 * расхождение в копейке, а отказ записи.
 *
 * Поправка `Number.EPSILON` вносится в **модуль** числа, а не в само значение: прибавленная к
 * значению, она сдвигает отрицательные и положительные в разные стороны — то есть чинит
 * представление ценой той самой симметрии, ради которой всё и делается.
 *
 * Минус ноль приводится к нулю: в JSON он неотличим от нуля, а в сравнении — отличим.
 *
 * @param {number} value
 * @param {number} [factor] Множитель шкалы; по умолчанию денежная.
 */
export function roundAwayFromZero(value, factor = MONEY_FACTOR) {
  const magnitude = Math.round((Math.abs(value) + Number.EPSILON) * factor);
  return (value < 0 ? -magnitude : magnitude) / factor + 0;
}

export function calculateMoneyTotal(lines, {
  priceInvalidCode = 'MONEY_INVALID',
  priceScaleCode = 'MONEY_SCALE_INVALID',
  priceOverflowCode = 'MONEY_TOO_LARGE',
  quantityCode = 'QUANTITY_INVALID',
  totalCode = 'MONEY_TOTAL_INVALID',
  totalOverflowCode = 'MONEY_TOTAL_TOO_LARGE',
} = {}) {
  invariant(Array.isArray(lines) && lines.length > 0, totalCode, 'Money total requires at least one line');
  let total = 0n;
  for (const line of lines) {
    const quantity = assertPostgresInteger(line?.quantity, { code: quantityCode, label: 'Quantity', min: 1 });
    const unitPrice = normalizeMoney(line?.unitPrice, {
      invalidCode: priceInvalidCode,
      scaleCode: priceScaleCode,
      overflowCode: priceOverflowCode,
      label: 'Unit price',
    });
    const scaledPrice = BigInt(Math.round(unitPrice * MONEY_FACTOR));
    total += scaledPrice * BigInt(quantity);
    invariant(total <= MAX_SCALED_MONEY_BIGINT, totalOverflowCode, 'Money total exceeds the safe fixed-point range', { scale: MONEY_SCALE });
  }
  invariant(total > 0n, totalCode, 'Money total must be positive');
  return Number(total) / MONEY_FACTOR;
}

export function assertPostgresInteger(value, { code = 'INTEGER_INVALID', label = 'Value', min = 0 } = {}) {
  invariant(Number.isInteger(value) && value >= min && value <= POSTGRES_INTEGER_MAX, code, `${label} must be an integer from ${min} to ${POSTGRES_INTEGER_MAX}`, {
    min,
    max: POSTGRES_INTEGER_MAX,
  });
  return value;
}

function toSignedMoneyUnits(value, {
  invalidCode,
  scaleCode,
  overflowCode,
  label,
}) {
  invariant(Number.isFinite(value), invalidCode, `${label} must be finite`);
  return toMoneyUnits(value, { scaleCode, overflowCode, label });
}

function toPositiveMoneyUnits(value, {
  invalidCode,
  scaleCode,
  overflowCode,
  label,
}) {
  invariant(Number.isFinite(value) && value > 0, invalidCode, `${label} must be positive`);
  return toMoneyUnits(value, { scaleCode, overflowCode, label });
}

function toMoneyUnits(value, { scaleCode, overflowCode, label }) {
  const scaled = Math.round(value * MONEY_FACTOR);
  invariant(Number.isSafeInteger(scaled), overflowCode, `${label} exceeds the safe fixed-point range`, { scale: MONEY_SCALE });
  const normalized = scaled / MONEY_FACTOR;
  const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  invariant(Math.abs(value - normalized) <= tolerance, scaleCode, `${label} must use at most ${MONEY_SCALE} decimal places`, { scale: MONEY_SCALE });
  return scaled;
}

function divideAndRoundHalfAwayFromZero(dividend, divisor) {
  invariant(divisor > 0n, 'MONEY_PERCENTAGE_INVALID', 'Money percentage divisor must be positive');
  const negative = dividend < 0n;
  const absoluteDividend = negative ? -dividend : dividend;
  let quotient = absoluteDividend / divisor;
  const remainder = absoluteDividend % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  return negative ? -quotient : quotient;
}
