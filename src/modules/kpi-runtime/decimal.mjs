import { invariant } from '../../core/errors.mjs';

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
export const KPI_NUMERIC_PRECISION = 38;
export const KPI_NUMERIC_SCALE = 12;

export function canonicalKpiDecimal(value, code = 'KPI_DECIMAL_INVALID') {
  invariant(typeof value === 'string' && DECIMAL_PATTERN.test(value), code, 'KPI numeric value must be a plain decimal string without exponent notation');

  let negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [rawInteger, rawFraction = ''] = unsigned.split('.');
  invariant(rawFraction.length <= KPI_NUMERIC_SCALE, code, `KPI numeric scale must be <= ${KPI_NUMERIC_SCALE}`);

  const integer = rawInteger.replace(/^0+(?=[0-9])/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  const totalDigits = integer.replace(/^0+/, '').length + rawFraction.length;
  invariant(totalDigits <= KPI_NUMERIC_PRECISION, code, `KPI numeric precision must be <= ${KPI_NUMERIC_PRECISION}`);

  const zero = integer === '0' && fraction.length === 0;
  if (zero) negative = false;
  return `${negative ? '-' : ''}${integer}${fraction.length ? `.${fraction}` : ''}`;
}

export function optionalKpiDecimal(value, code = 'KPI_DECIMAL_INVALID') {
  if (value === null || value === undefined) return null;
  return canonicalKpiDecimal(value, code);
}

export function isZeroKpiDecimal(value) {
  return canonicalKpiDecimal(value) === '0';
}

export function absoluteKpiDecimalDifference(left, right) {
  const leftValue = toScaledBigInt(canonicalKpiDecimal(left));
  const rightValue = toScaledBigInt(canonicalKpiDecimal(right));
  const difference = leftValue >= rightValue ? leftValue - rightValue : rightValue - leftValue;
  return fromScaledBigInt(difference);
}

export function compareKpiDecimals(left, right) {
  const a = toScaledBigInt(canonicalKpiDecimal(left));
  const b = toScaledBigInt(canonicalKpiDecimal(right));
  return a === b ? 0 : a < b ? -1 : 1;
}

function toScaledBigInt(value) {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ''] = unsigned.split('.');
  const scaled = BigInt(`${integer}${fraction.padEnd(KPI_NUMERIC_SCALE, '0')}`);
  return negative ? -scaled : scaled;
}

function fromScaledBigInt(value) {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const digits = unsigned.toString().padStart(KPI_NUMERIC_SCALE + 1, '0');
  const integer = digits.slice(0, -KPI_NUMERIC_SCALE);
  const fraction = digits.slice(-KPI_NUMERIC_SCALE).replace(/0+$/, '');
  const result = `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
  return canonicalKpiDecimal(result);
}
