import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 3072;
const MAX_SCOPE_LENGTH = 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const KINDS = Object.freeze(['supplier', 'rfq']);

export function encodeSourcingCursor({ kind, scope, asOf, code }) {
  const normalized = validatePayload({ kind, scope, asOf, code });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.kind, normalized.scope, normalized.asOf, normalized.code]), 'utf8').toString('base64url');
}

export function decodeSourcingCursor(cursor, { kind, scope } = {}) {
  invariant(typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor must be a non-empty bounded string');
  invariant(BASE64URL_PATTERN.test(cursor), 'SOURCING_CURSOR_INVALID', 'Sourcing cursor encoding is invalid');
  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'SOURCING_CURSOR_INVALID') throw error;
    invariant(false, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor payload is invalid');
  }
  invariant(Array.isArray(decoded) && decoded.length === 5 && decoded[0] === CURSOR_VERSION, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor version or shape is invalid');
  const normalized = validatePayload({ kind: decoded[1], scope: decoded[2], asOf: decoded[3], code: decoded[4] });
  invariant(kind === undefined || kind === normalized.kind, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor belongs to another resource type');
  invariant(scope === undefined || scope === normalized.scope, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor belongs to another filter set');
  return normalized;
}

function validatePayload({ kind, scope, asOf, code }) {
  invariant(KINDS.includes(kind), 'SOURCING_CURSOR_INVALID', 'Sourcing cursor kind is invalid');
  invariant(typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor scope is invalid');
  invariant(typeof asOf === 'string' && Number.isFinite(Date.parse(asOf)) && new Date(asOf).toISOString() === asOf, 'SOURCING_CURSOR_INVALID', 'Sourcing cursor reference time is invalid');
  invariant(CODE_PATTERN.test(code ?? ''), 'SOURCING_CURSOR_INVALID', 'Sourcing cursor continuation code is invalid');
  return Object.freeze({ kind, scope, asOf, code });
}
