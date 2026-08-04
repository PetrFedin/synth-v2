import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 3072;
const MAX_SCOPE_LENGTH = 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAMPLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;

export function encodeSampleCursor({ scope, asOf, sampleCode }) {
  const normalized = validatePayload({ scope, asOf, sampleCode });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.scope, normalized.asOf, normalized.sampleCode]), 'utf8').toString('base64url');
}

export function decodeSampleCursor(cursor, { scope } = {}) {
  invariant(typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH, 'SAMPLE_CURSOR_INVALID', 'Sample cursor must be a non-empty bounded string');
  invariant(BASE64URL_PATTERN.test(cursor), 'SAMPLE_CURSOR_INVALID', 'Sample cursor encoding is invalid');
  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'SAMPLE_CURSOR_INVALID', 'Sample cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'SAMPLE_CURSOR_INVALID') throw error;
    invariant(false, 'SAMPLE_CURSOR_INVALID', 'Sample cursor payload is invalid');
  }
  invariant(Array.isArray(decoded) && decoded.length === 4 && decoded[0] === CURSOR_VERSION, 'SAMPLE_CURSOR_INVALID', 'Sample cursor version or shape is invalid');
  const normalized = validatePayload({ scope: decoded[1], asOf: decoded[2], sampleCode: decoded[3] });
  invariant(scope === undefined || scope === normalized.scope, 'SAMPLE_CURSOR_INVALID', 'Sample cursor belongs to another filter set');
  return normalized;
}

function validatePayload({ scope, asOf, sampleCode }) {
  invariant(typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH, 'SAMPLE_CURSOR_INVALID', 'Sample cursor scope is invalid');
  invariant(typeof asOf === 'string' && Number.isFinite(Date.parse(asOf)) && new Date(asOf).toISOString() === asOf, 'SAMPLE_CURSOR_INVALID', 'Sample cursor reference time is invalid');
  invariant(SAMPLE_CODE_PATTERN.test(sampleCode ?? ''), 'SAMPLE_CURSOR_INVALID', 'Sample cursor sample code is invalid');
  return Object.freeze({ scope, asOf, sampleCode });
}
