(function initializeUiValidation(global) {
  'use strict';

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function requiredText(value, label, { minLength = 2, maxLength = 160 } = {}) {
    const normalized = String(value ?? '').trim();
    if (normalized.length < minLength) fail('FIELD_TOO_SHORT', `${label}: minimum ${minLength} characters`);
    if (normalized.length > maxLength) fail('FIELD_TOO_LONG', `${label}: maximum ${maxLength} characters`);
    return normalized;
  }

  function dateRange(start, end, label = 'Date range') {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) fail('DATE_REQUIRED', `${label}: both dates are required`);
    if (startTime >= endTime) fail('DATE_RANGE_INVALID', `${label}: start must be before end`);
    return Object.freeze({ start, end });
  }

  function futureDate(value, now = new Date().toISOString(), label = 'Expiry') {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= Date.parse(now)) fail('FUTURE_DATE_REQUIRED', `${label}: date must be in the future`);
    return value;
  }

  function currency(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) fail('CURRENCY_INVALID', 'Currency must be a three-letter ISO code');
    return normalized;
  }

  function sku(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(normalized)) fail('SKU_INVALID', 'SKU must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
    return normalized;
  }

  function number(value, label, { integer = false, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) fail('NUMBER_INVALID', `${label}: enter a valid number`);
    if (integer && !Number.isInteger(normalized)) fail('INTEGER_REQUIRED', `${label}: enter a whole number`);
    if (normalized < min || normalized > max) fail('NUMBER_RANGE_INVALID', `${label}: allowed range is ${min} to ${max}`);
    return normalized;
  }

  function different(value, forbiddenValue, label) {
    if (String(value).trim() === String(forbiddenValue).trim()) fail('VALUES_MUST_DIFFER', `${label}: values must differ`);
    return value;
  }

  global.SynthaUiValidation = Object.freeze({ requiredText, dateRange, futureDate, currency, sku, number, different });
})(window);
