import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SCOPE_LENGTH = 512;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export function encodeCatalogCursor({ scope, sku }) {
  const normalized = validatePayload({ scope, sku });
  return Buffer.from(JSON.stringify([CURSOR_VERSION, normalized.scope, normalized.sku]), 'utf8').toString('base64url');
}

export function decodeCatalogCursor(cursor, { scope } = {}) {
  invariant(
    typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH,
    'CATALOG_CURSOR_INVALID',
    'Catalog cursor must be a non-empty bounded string',
  );
  invariant(BASE64URL_PATTERN.test(cursor), 'CATALOG_CURSOR_INVALID', 'Catalog cursor encoding is invalid');

  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'CATALOG_CURSOR_INVALID', 'Catalog cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'CATALOG_CURSOR_INVALID') throw error;
    invariant(false, 'CATALOG_CURSOR_INVALID', 'Catalog cursor payload is invalid');
  }

  invariant(
    Array.isArray(decoded) && decoded.length === 3 && decoded[0] === CURSOR_VERSION,
    'CATALOG_CURSOR_INVALID',
    'Catalog cursor version or shape is invalid',
  );
  const normalized = validatePayload({ scope: decoded[1], sku: decoded[2] });
  invariant(
    scope === undefined || scope === normalized.scope,
    'CATALOG_CURSOR_INVALID',
    'Catalog cursor belongs to another filter set',
  );
  return normalized;
}

function validatePayload({ scope, sku }) {
  invariant(
    typeof scope === 'string' && scope.length >= 1 && scope.length <= MAX_SCOPE_LENGTH,
    'CATALOG_CURSOR_INVALID',
    'Catalog cursor scope is invalid',
  );
  invariant(SKU_PATTERN.test(sku ?? ''), 'CATALOG_CURSOR_INVALID', 'Catalog cursor SKU is invalid');
  return Object.freeze({ scope, sku });
}
