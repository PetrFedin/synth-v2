import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SCOPE_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
// Позиция страницы — это последняя прочитанная запись, а называется она по-разному: у таблицы по
// SKU это SKU, у канонической — её идентификатор, потому что SKU у канонической нет вовсе. Курсор
// один на оба списка: заводить второй ради другого имени поля значило бы держать две копии одного
// и того же разбора. На проводе форма не меняется — как был [версия, область, значение], так и
// остался.
const POSITION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/;

export function encodeMeasurementCursor({ scope, position }) {
  const normalized = validatePayload({ scope, position });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.scope, normalized.position]), 'utf8').toString('base64url');
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
  const normalized = validatePayload({ scope: decoded[1], position: decoded[2] });
  invariant(scope === undefined || scope === normalized.scope, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor belongs to another filter set');
  return normalized;
}

function validatePayload({ scope, position }) {
  invariant(typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH, 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor scope is invalid');
  invariant(POSITION_PATTERN.test(position ?? ''), 'MEASUREMENT_CURSOR_INVALID', 'Measurement chart cursor position is invalid');
  return Object.freeze({ scope, position });
}
