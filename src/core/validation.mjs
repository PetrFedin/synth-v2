import { invariant } from './errors.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function requiredText(value, { code, label, min = 2, max = 160 } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(normalized.length >= min && normalized.length <= max, code ?? 'TEXT_INVALID', `${label ?? 'Text'} must contain ${min} to ${max} characters`, { min, max });
  return normalized;
}

export function parseIsoDateTime(value, { code = 'DATETIME_INVALID', label = 'Date and time' } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  invariant(ISO_DATE.test(normalized) || ISO_TIMESTAMP.test(normalized), code, `${label} must use ISO-8601 format`);
  invariant(isRealCalendarDate(normalized), code, `${label} must be a real calendar date`);
  const timestamp = Date.parse(normalized);
  invariant(Number.isFinite(timestamp), code, `${label} must be a valid date and time`);
  return Object.freeze({ value: normalized, timestamp });
}

export function chronologicalRange(start, end, {
  code = 'DATE_RANGE_INVALID',
  startLabel = 'Start',
  endLabel = 'End',
  allowEqual = false,
} = {}) {
  const normalizedStart = parseIsoDateTime(start, { code, label: startLabel });
  const normalizedEnd = parseIsoDateTime(end, { code, label: endLabel });
  invariant(allowEqual ? normalizedStart.timestamp <= normalizedEnd.timestamp : normalizedStart.timestamp < normalizedEnd.timestamp, code, `${startLabel} must be ${allowEqual ? 'before or equal to' : 'before'} ${endLabel}`);
  return Object.freeze({ start: normalizedStart.value, end: normalizedEnd.value });
}

function isRealCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
