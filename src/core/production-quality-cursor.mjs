import { invariant } from './errors.mjs';

export function encodeProductionQualityCursor({ scope, qualityCaseCode }) {
  invariant(typeof scope === 'string' && typeof qualityCaseCode === 'string', 'PRODUCTION_QUALITY_CURSOR_INVALID', 'Production quality cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, qualityCaseCode }), 'utf8').toString('base64url');
}

export function decodeProductionQualityCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'PRODUCTION_QUALITY_CURSOR_INVALID', 'Production quality cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { invariant(false, 'PRODUCTION_QUALITY_CURSOR_INVALID', 'Production quality cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.qualityCaseCode === 'string', 'PRODUCTION_QUALITY_CURSOR_INVALID', 'Production quality cursor does not match this query');
  return Object.freeze({ qualityCaseCode: decoded.qualityCaseCode });
}
