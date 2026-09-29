import { invariant } from '../../core/errors.mjs';

const MAX_INTEGER = 2_147_483_647;
const SIDES = Object.freeze(['supplier', 'customer']);

export function orderLineComment({ orderId, lineNo, side, body, commentedAt, commentedBy }) {
  invariant(typeof orderId === 'string' && orderId.length > 0, 'ORDER_LINE_COMMENT_ORDER_REQUIRED', 'Order id is required');
  const normalizedLineNo = positiveInteger(lineNo, 'ORDER_LINE_COMMENT_LINE_NO_INVALID', 'Order line number');
  invariant(SIDES.includes(side), 'ORDER_LINE_COMMENT_SIDE_INVALID', 'Comment side must be supplier or customer', { side });
  const normalizedBody = requiredText(body, 1, 1000, 'ORDER_LINE_COMMENT_BODY_INVALID', 'Comment body');
  return Object.freeze({
    orderId,
    lineNo: normalizedLineNo,
    side,
    body: normalizedBody,
    commentedAt: requiredTimestamp(commentedAt, 'ORDER_LINE_COMMENT_COMMENTED_AT_INVALID'),
    commentedBy: requiredText(commentedBy, 1, 200, 'ORDER_LINE_COMMENT_COMMENTED_BY_INVALID', 'Comment author'),
  });
}

function positiveInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, code, `${label} must be a positive PostgreSQL integer`); return value; }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
