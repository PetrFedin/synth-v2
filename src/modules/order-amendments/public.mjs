import { invariant } from '../../core/errors.mjs';

// Предложение изменить количество строки уже подтверждённого заказа — и ответ на него. Не
// перезаписывает строку заказа: заказ, его `orderCommitSnapshot` и резервирования склада построены
// вокруг зафиксированных количеств, и это не тот слой, где их можно сдвигать тихо. Применение
// принятой правки к самому заказу — отдельный, следующий шаг.

const MAX_INTEGER = 2_147_483_647;
const REASON_MAX_LENGTH = 1000;
export const ORDER_AMENDMENT_STATUSES = Object.freeze(['proposed', 'accepted', 'rejected']);

export function proposeOrderAmendment({
  id, orderId, lineNo, currentQuantity, proposedQuantity, unitPrice, currency,
  reason, proposedOrganisationId, proposedBy, proposedAt,
}) {
  invariant(typeof id === 'string' && id, 'ORDER_AMENDMENT_ID_REQUIRED', 'Order amendment id is required');
  invariant(typeof orderId === 'string' && orderId, 'ORDER_AMENDMENT_ORDER_REQUIRED', 'Order id is required');
  const normalizedLineNo = positiveInteger(lineNo, 'ORDER_AMENDMENT_LINE_NO_INVALID', 'Order line number');
  const normalizedCurrent = positiveInteger(currentQuantity, 'ORDER_AMENDMENT_QUANTITY_INVALID', 'Current quantity');
  const normalizedProposed = positiveInteger(proposedQuantity, 'ORDER_AMENDMENT_QUANTITY_INVALID', 'Proposed quantity');
  invariant(normalizedProposed !== normalizedCurrent, 'ORDER_AMENDMENT_QUANTITY_UNCHANGED', 'Proposed quantity must differ from the current quantity');
  invariant(typeof currency === 'string' && /^[A-Z]{3}$/.test(currency), 'ORDER_AMENDMENT_CURRENCY_INVALID', 'Currency must be an ISO-4217 code');
  invariant(typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice > 0, 'ORDER_AMENDMENT_UNIT_PRICE_INVALID', 'Unit price must be a positive number');
  const normalizedReason = requiredText(reason, 1, REASON_MAX_LENGTH, 'ORDER_AMENDMENT_REASON_INVALID', 'Amendment reason');
  invariant(typeof proposedOrganisationId === 'string' && proposedOrganisationId, 'ORDER_AMENDMENT_ORGANISATION_REQUIRED', 'Proposing organisation is required');
  invariant(typeof proposedBy === 'string' && proposedBy, 'ORDER_AMENDMENT_ACTOR_REQUIRED', 'Actor id is required');
  return Object.freeze({
    id,
    orderId,
    lineNo: normalizedLineNo,
    currentQuantity: normalizedCurrent,
    proposedQuantity: normalizedProposed,
    deltaAmount: round4((normalizedProposed - normalizedCurrent) * unitPrice),
    currency,
    reason: normalizedReason,
    status: 'proposed',
    responseReason: null,
    proposedOrganisationId,
    proposedBy,
    proposedAt: timestamp(proposedAt, 'ORDER_AMENDMENT_PROPOSED_AT_INVALID'),
    respondedOrganisationId: null,
    respondedBy: null,
    respondedAt: null,
  });
}

export function respondToOrderAmendment(amendment, { decision, responderOrganisationId, responderActorId, responseReason, respondedAt }) {
  invariant(amendment?.status === 'proposed', 'ORDER_AMENDMENT_NOT_PROPOSED', 'Only a proposed amendment can be responded to', { status: amendment?.status });
  invariant(decision === 'accepted' || decision === 'rejected', 'ORDER_AMENDMENT_DECISION_INVALID', 'Decision must be accepted or rejected', { decision });
  invariant(responderOrganisationId !== amendment.proposedOrganisationId, 'ORDER_AMENDMENT_SELF_RESPONSE_FORBIDDEN', 'The organisation that proposed the amendment cannot respond to it');
  const normalizedResponseReason = decision === 'rejected'
    ? requiredText(responseReason, 1, REASON_MAX_LENGTH, 'ORDER_AMENDMENT_RESPONSE_REASON_REQUIRED', 'Rejection reason')
    : optionalText(responseReason, REASON_MAX_LENGTH, 'ORDER_AMENDMENT_RESPONSE_REASON_INVALID', 'Response reason');
  return Object.freeze({
    ...amendment,
    status: decision,
    responseReason: normalizedResponseReason,
    respondedOrganisationId: responderOrganisationId,
    respondedBy: responderActorId,
    respondedAt: timestamp(respondedAt, 'ORDER_AMENDMENT_RESPONDED_AT_INVALID'),
  });
}

function positiveInteger(value, code, label) { invariant(Number.isInteger(value) && value >= 1 && value <= MAX_INTEGER, code, `${label} must be a positive PostgreSQL integer`); return value; }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function optionalText(value, max, code, label) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, max, code, label); }
function timestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function round4(value) { return Math.round(value * 10000) / 10000; }
