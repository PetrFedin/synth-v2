import { invariant } from '../../core/errors.mjs';
import { calculateMoneyTotal, normalizeMoney } from '../../core/money.mjs';

const INCOTERMS = Object.freeze(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']);
const CANCELLATION_REASON_MAX_LENGTH = 1_000;

export function createOrderDraft({ id, selection, currency, terms, createdAt }) {
  invariant(id && selection?.id, 'ORDER_DRAFT_IDENTITY_REQUIRED', 'Order id and selection are required');
  invariant(selection.status === 'submitted', 'SELECTION_NOT_SUBMITTED', 'Order builder requires a submitted selection');
  invariant(/^[A-Z]{3}$/.test(currency), 'ORDER_CURRENCY_INVALID', 'Order currency must be an ISO-4217 code');
  const normalizedTerms = validateTerms(terms);
  const lines = Object.freeze(selection.lines.map((line) => Object.freeze({
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: normalizeMoney(line.unitPrice, {
      invalidCode: 'ORDER_LINE_PRICE_INVALID',
      scaleCode: 'ORDER_LINE_PRICE_SCALE_INVALID',
      overflowCode: 'ORDER_LINE_PRICE_TOO_LARGE',
      label: 'Order line unit price',
    }),
  })));
  const totalAmount = calculateMoneyTotal(lines, {
    priceInvalidCode: 'ORDER_LINE_PRICE_INVALID',
    priceScaleCode: 'ORDER_LINE_PRICE_SCALE_INVALID',
    priceOverflowCode: 'ORDER_LINE_PRICE_TOO_LARGE',
    quantityCode: 'ORDER_LINE_QUANTITY_INVALID',
    totalCode: 'ORDER_TOTAL_INVALID',
    totalOverflowCode: 'ORDER_TOTAL_TOO_LARGE',
  });
  return Object.freeze({
    id,
    selectionId: selection.id,
    cycleId: selection.cycleId,
    brandId: selection.brandId,
    shopId: selection.shopId,
    currency,
    lines,
    totalAmount,
    terms: normalizedTerms,
    acceptedOrganisationIds: Object.freeze([]),
    status: 'draft',
    cancellationReason: null,
    cancelledAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function acceptOrderTerms(order, organisationId, updatedAt) {
  invariant(order.status === 'draft' || order.status === 'ready', 'ORDER_TERMS_NOT_ACCEPTABLE', 'Order terms can no longer be accepted');
  invariant(organisationId === order.brandId || organisationId === order.shopId, 'ORDER_PARTY_INVALID', 'Only order parties can accept terms', { organisationId });
  const accepted = new Set(order.acceptedOrganisationIds);
  accepted.add(organisationId);
  const acceptedOrganisationIds = Object.freeze([...accepted].sort());
  const status = accepted.has(order.brandId) && accepted.has(order.shopId) ? 'ready' : 'draft';
  return Object.freeze({
    ...order,
    acceptedOrganisationIds,
    status,
    version: order.version + 1,
    updatedAt,
  });
}

export function attachReadyOrder(order, updatedAt) {
  invariant(order.status === 'ready', 'ORDER_NOT_READY', 'Both Brand and Shop must accept order terms');
  return Object.freeze({ ...order, status: 'attached', version: order.version + 1, updatedAt });
}

export function cancelAttachedOrder(order, reason, cancelledAt) {
  invariant(order.status === 'attached', 'ORDER_NOT_ATTACHED', 'Only an attached order can be cancelled');
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  invariant(normalizedReason.length >= 3 && normalizedReason.length <= CANCELLATION_REASON_MAX_LENGTH, 'ORDER_CANCELLATION_REASON_REQUIRED', `Cancellation reason must contain 3 to ${CANCELLATION_REASON_MAX_LENGTH} characters`);
  return Object.freeze({
    ...order,
    status: 'cancelled',
    cancellationReason: normalizedReason,
    cancelledAt,
    version: order.version + 1,
    updatedAt: cancelledAt,
  });
}

function validateTerms(terms) {
  invariant(terms && INCOTERMS.includes(terms.incoterm), 'ORDER_INCOTERM_INVALID', 'Unsupported Incoterm', { incoterm: terms?.incoterm });
  invariant(Number.isInteger(terms.paymentDays) && terms.paymentDays >= 0 && terms.paymentDays <= 365, 'ORDER_PAYMENT_DAYS_INVALID', 'Payment days must be an integer from 0 to 365');
  invariant(Number.isFinite(terms.prepaymentPercent) && terms.prepaymentPercent >= 0 && terms.prepaymentPercent <= 100, 'ORDER_PREPAYMENT_INVALID', 'Prepayment percent must be from 0 to 100');
  const deliveryStart = Date.parse(terms.deliveryStart);
  const deliveryEnd = Date.parse(terms.deliveryEnd);
  invariant(Number.isFinite(deliveryStart) && Number.isFinite(deliveryEnd) && deliveryStart <= deliveryEnd, 'ORDER_DELIVERY_WINDOW_INVALID', 'Delivery start and end must be valid and ordered');
  return Object.freeze({
    incoterm: terms.incoterm,
    paymentDays: terms.paymentDays,
    prepaymentPercent: terms.prepaymentPercent,
    deliveryStart: new Date(deliveryStart).toISOString(),
    deliveryEnd: new Date(deliveryEnd).toISOString(),
  });
}
