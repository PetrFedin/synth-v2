import { invariant } from './errors.mjs';

const VERSION = 1;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    invariant(false, 'COMMERCIAL_PUBLICATION_CURSOR_INVALID', 'Commercial publication cursor is malformed');
  }
}

export function encodeCommercialPublicationCursor({ publishedAt, id }) {
  invariant(typeof publishedAt === 'string' && Number.isFinite(Date.parse(publishedAt)), 'COMMERCIAL_PUBLICATION_CURSOR_PUBLISHED_AT_REQUIRED', 'Commercial publication cursor requires publishedAt');
  invariant(typeof id === 'string' && id.length > 0, 'COMMERCIAL_PUBLICATION_CURSOR_ID_REQUIRED', 'Commercial publication cursor requires id');
  return encodePayload({ v: VERSION, publishedAt, id });
}

export function decodeCommercialPublicationCursor(cursor) {
  if (!cursor) return null;
  const payload = decodePayload(cursor);
  invariant(payload && payload.v === VERSION, 'COMMERCIAL_PUBLICATION_CURSOR_INVALID', 'Commercial publication cursor version is invalid');
  invariant(typeof payload.publishedAt === 'string' && Number.isFinite(Date.parse(payload.publishedAt)), 'COMMERCIAL_PUBLICATION_CURSOR_INVALID', 'Commercial publication cursor publishedAt is invalid');
  invariant(typeof payload.id === 'string' && payload.id.length > 0, 'COMMERCIAL_PUBLICATION_CURSOR_INVALID', 'Commercial publication cursor id is invalid');
  return Object.freeze({ publishedAt: payload.publishedAt, id: payload.id });
}
