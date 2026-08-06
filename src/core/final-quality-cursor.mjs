import { invariant } from './errors.mjs';

export function encodeFinalQualityCursor({ scope, inspectionCode }) {
  invariant(typeof scope === 'string' && typeof inspectionCode === 'string', 'QUALITY_CURSOR_INVALID', 'Final Quality cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, inspectionCode }), 'utf8').toString('base64url');
}

export function decodeFinalQualityCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'QUALITY_CURSOR_INVALID', 'Final Quality cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invariant(false, 'QUALITY_CURSOR_INVALID', 'Final Quality cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.inspectionCode === 'string', 'QUALITY_CURSOR_INVALID', 'Final Quality cursor does not match this query');
  return Object.freeze({ inspectionCode: decoded.inspectionCode });
}
