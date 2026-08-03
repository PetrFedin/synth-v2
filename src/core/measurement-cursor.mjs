import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SCOPE_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export function encodeMeasurementCursor({ scope, sku }) {
  const normalized = validatePayload({ scope, sku });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.scope, normalized.sku]), 'utf8').toString('base64url');
}

export function decodeMeasurementCursor(cursor, { scope } = {}) {
  invariant(typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor must be a non-empty bounded string');
  invariant(BASE64URL_PATTERN.test(cursor), 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor encoding is invalid');
  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'MEASUREMENT_CURSOR_INVALID') throw error;
    invariant(false, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor payload is invalid');
  }
  invariant(Array.isArray(decoded) && decoded.length === 3 && decoded[0] === CURSOR_VERSION, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor version or shape is invalid');
  const normalized = validatePayload({ scope: decoded[1], sku: decoded[2] });
  invariant(scope === undefined || scope === normalized.scope, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor belongs to another filter set');
  return normalized;
}

function validatePayload({ scope, sku }) {
  invariant(typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor scope is invalid');
  invariant(SKU_PATTERN.test(sku ?? ''), 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor SKU is invalid');
  return Object.freeze({ scope, sku });
}
