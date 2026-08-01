import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { DomainError, invariant } from '../core/errors.mjs';

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function resolveRequestId(candidate, nextRequestId = randomUUID) {
  const supplied = typeof candidate === 'string' ? candidate.trim() : '';
  if (SAFE_REQUEST_ID.test(supplied)) return supplied;
  try {
    const generated = String(nextRequestId()).trim();
    if (SAFE_REQUEST_ID.test(generated)) return generated;
  } catch {
    // Fall through to a cryptographically random request id.
  }
  return randomUUID();
}

export function requireIdempotencyKey(candidate) {
  const value = typeof candidate === 'string' ? candidate.trim() : '';
  invariant(value, 'HTTP_IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for mutations');
  invariant(SAFE_IDEMPOTENCY_KEY.test(value), 'HTTP_IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 1 to 128 safe ASCII characters');
  return value;
}

export function validateContentLength(candidate, limit) {
  if (candidate === undefined || candidate === null || candidate === '') return undefined;
  const size = Number(candidate);
  invariant(Number.isSafeInteger(size) && size >= 0, 'HTTP_CONTENT_LENGTH_INVALID', 'Content-Length must be a non-negative integer');
  invariant(size <= limit, 'HTTP_BODY_TOO_LARGE', 'Request body exceeds configured limit', { maxBodyBytes: limit });
  return size;
}

export function decodeJsonObject(bytes, contentType) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (!buffer.byteLength) return {};
  invariant(JSON_CONTENT_TYPE.test(contentType ?? ''), 'HTTP_CONTENT_TYPE_UNSUPPORTED', 'Request body must use application/json');
  let text;
  try { text = UTF8_DECODER.decode(buffer); }
  catch { throw new DomainError('HTTP_JSON_INVALID', 'Request body must be valid UTF-8 JSON'); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new DomainError('HTTP_JSON_INVALID', 'Request body must be valid JSON'); }
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), 'HTTP_JSON_OBJECT_REQUIRED', 'Request body must be a JSON object');
  return value;
}

export function apiResponseHeaders(requestId, extra = {}) {
  return Object.freeze({
    'x-request-id': requestId,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ...extra,
  });
}

export function queryParameters(url) {
  const result = {};
  for (const [key, value] of url.searchParams.entries()) {
    invariant(result[key] === undefined, 'HTTP_QUERY_DUPLICATE', 'Query parameter must not be repeated', { parameter: key });
    result[key] = value;
  }
  return Object.freeze(result);
}
