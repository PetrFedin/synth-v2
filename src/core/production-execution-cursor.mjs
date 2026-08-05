import { invariant } from './errors.mjs';

export function encodeProductionExecutionCursor({ scope, executionCode }) {
  invariant(typeof scope === 'string' && typeof executionCode === 'string', 'PRODUCTION_EXECUTION_CURSOR_INVALID', 'Production execution cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, executionCode }), 'utf8').toString('base64url');
}

export function decodeProductionExecutionCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'PRODUCTION_EXECUTION_CURSOR_INVALID', 'Production execution cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invariant(false, 'PRODUCTION_EXECUTION_CURSOR_INVALID', 'Production execution cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.executionCode === 'string', 'PRODUCTION_EXECUTION_CURSOR_INVALID', 'Production execution cursor does not match this query');
  return Object.freeze({ executionCode: decoded.executionCode });
}
