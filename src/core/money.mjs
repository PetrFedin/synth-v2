import { invariant } from './errors.mjs';

export const MONEY_SCALE = 4;
export const POSTGRES_INTEGER_MAX = 2_147_483_647;
const MONEY_FACTOR = 10 ** MONEY_SCALE;
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
