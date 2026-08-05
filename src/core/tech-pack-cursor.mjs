import { invariant } from './errors.mjs';

export function encodeTechPackCursor({ scope, techPackCode }) {
  invariant(typeof scope === 'string' && typeof techPackCode === 'string', 'TECH_PACK_CURSOR_INVALID', 'Tech pack cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, techPackCode }), 'utf8').toString('base64url');
}

export function decodeTechPackCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'TECH_PACK_CURSOR_INVALID', 'Tech pack cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invariant(false, 'TECH_PACK_CURSOR_INVALID', 'Tech pack cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.techPackCode === 'string', 'TECH_PACK_CURSOR_INVALID', 'Tech pack cursor does not match this query');
  return Object.freeze({ techPackCode: decoded.techPackCode });
}
