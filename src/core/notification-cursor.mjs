import { Buffer } from 'node:buffer';
import { invariant } from './errors.mjs';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function encodeNotificationCursor({ createdAt, id }) {
  const normalized = validatePosition({ createdAt, id });
  return Buffer.from(JSON.stringify([
    CURSOR_VERSION,
    normalized.createdAt,
    normalized.id,
  ]), 'utf8').toString('base64url');
}

export function decodeNotificationCursor(cursor) {
  invariant(
    typeof cursor === 'string' && cursor.length >= 1 && cursor.length <= MAX_CURSOR_LENGTH,
    'NOTIFICATION_CURSOR_INVALID',
    'Notification cursor must be a non-empty bounded string',
  );
  invariant(BASE64URL_PATTERN.test(cursor), 'NOTIFICATION_CURSOR_INVALID', 'Notification cursor encoding is invalid');

  let decoded;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    invariant(bytes.toString('base64url') === cursor, 'NOTIFICATION_CURSOR_INVALID', 'Notification cursor encoding is not canonical');
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error?.code === 'NOTIFICATION_CURSOR_INVALID') throw error;
    invariant(false, 'NOTIFICATION_CURSOR_INVALID', 'Notification cursor payload is invalid');
  }

  invariant(
    Array.isArray(decoded) && decoded.length === 3 && decoded[0] === CURSOR_VERSION,
    'NOTIFICATION_CURSOR_INVALID',
    'Notification cursor version or shape is invalid',
  );
  return Object.freeze(validatePosition({ createdAt: decoded[1], id: decoded[2] }));
}

function validatePosition({ createdAt, id }) {
  invariant(
    typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)),
    'NOTIFICATION_CURSOR_INVALID',
    'Notification cursor timestamp is invalid',
  );
  invariant(
    typeof id === 'string' && id.length >= 1 && id.length <= 160,
    'NOTIFICATION_CURSOR_INVALID',
    'Notification cursor identifier is invalid',
  );
  return Object.freeze({ createdAt: new Date(createdAt).toISOString(), id });
}
