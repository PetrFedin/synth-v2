import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SCOPE_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export function encodeMaterialCursor({ scope, code }) {
  const normalized = validatePayload({ scope, code });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.scope, normalized.code]), 'utf8').toString('base64url');
}

export function decodeMaterialCursor(cursor, { scope } = {}) {
  invariant(typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH, 'MATERIAL_CURSOR_INVALID', 'Material cursor must be a non-empty bounded string');
  invariant(BASE64URL_PATTERN.test(cursor), 'MATERIAL_CURSOR_INVALID', 'Material cursor encoding is invalid');
  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'MATERIAL_CURSOR_INVALID', 'Material cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'MATERIAL_CURSOR_INVALID') throw error;
    invariant(false, 'MATERIAL_CURSOR_INVALID', 'Material cursor payload is invalid');
  }
  invariant(Array.isArray(decoded) && decoded.length === 3 && decoded[0] === CURSOR_VERSION, 'MATERIAL_CURSOR_INVALID', 'Material cursor version or shape is invalid');
  const normalized = validatePayload({ scope: decoded[1], code: decoded[2] });
  invariant(scope === undefined || scope === normalized.scope, 'MATERIAL_CURSOR_INVALID', 'Material cursor belongs to another filter set');
  return normalized;
}

function validatePayload({ scope, code }) {
  invariant(typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH, 'MATERIAL_CURSOR_INVALID', 'Material cursor scope is invalid');
  invariant(CODE_PATTERN.test(code ?? ''), 'MATERIAL_CURSOR_INVALID', 'Material cursor code is invalid');
  return Object.freeze({ scope, code });
}
