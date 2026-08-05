import { invariant } from './errors.mjs';

export function encodeProductionOrderCursor({ scope, productionOrderNumber }) {
  invariant(typeof scope === 'string' && typeof productionOrderNumber === 'string', 'PRODUCTION_ORDER_CURSOR_INVALID', 'Production Order cursor is invalid');
  return Buffer.from(JSON.stringify({ v: 1, scope, productionOrderNumber }), 'utf8').toString('base64url');
}

export function decodeProductionOrderCursor(value, { scope }) {
  invariant(typeof value === 'string' && value.length <= 2048, 'PRODUCTION_ORDER_CURSOR_INVALID', 'Production Order cursor is invalid');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { invariant(false, 'PRODUCTION_ORDER_CURSOR_INVALID', 'Production Order cursor is invalid'); }
  invariant(decoded?.v === 1 && decoded.scope === scope && typeof decoded.productionOrderNumber === 'string', 'PRODUCTION_ORDER_CURSOR_INVALID', 'Production Order cursor does not match this query');
  return Object.freeze({ productionOrderNumber: decoded.productionOrderNumber });
}
