import { invariant } from '../../core/errors.mjs';

const INCOTERMS = Object.freeze(['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP']);

export function createOrderDraft({ id, selection, currency, terms, createdAt }) {
  invariant(id && selection?.id, 'ORDER_DRAFT_IDENTITY_REQUIRED', 'Order id and selection are required');
  invariant(selection.status === 'submitted', 'SELECTION_NOT_SUBMITTED', 'Order builder requires a submitted selection');
  invariant(/^[A-Z]{3}$/.test(currency), 'ORDER_CURRENCY_INVALID', 'Order currency must be an ISO-4217 code');
  const normalizedTerms = validateTerms(terms);
  const lines = Object.freeze(selection.lines.map((line) => Object.freeze({
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  })));
  const totalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  invariant(totalAmount > 0, 'ORDER_TOTAL_INVALID', 'Order total must be positive');
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
  invariant(typeof reason === 'string' && reason.trim().length >= 3, 'ORDER_CANCELLATION_REASON_REQUIRED', 'Cancellation reason must contain at least three characters');
  return Object.freeze({
    ...order,
    status: 'cancelled',
    cancellationReason: reason.trim(),
    cancelledAt,
    version: order.version + 1,
    updatedAt: cancelledAt,
  });
}

function validateTerms(terms) {
  invariant(terms && INCOTERMS.includes(terms.incoterm), 'ORDER_INCOTERM_INVALID', 'Unsupported Incoterm', { incoterm: terms?.incoterm });
  invariant(Number.isInteger(terms.paymentDays) && terms.paymentDays >= 0 && terms.paymentDays <= 365, 'ORDER_PAYMENT_DAYS_INVALID', 'Payment days must be an integer from 0 to 365');
  invariant(Number.isFinite(terms.prepaymentPercent) && terms.prepaymentPercent >= 0 && terms.prepaymentPercent <= 100, 'ORDER_PREPAYMENT_INVALID', 'Prepayment percent must be from 0 to 100');
  invariant(Date.parse(terms.deliveryStart) <= Date.parse(terms.deliveryEnd), 'ORDER_DELIVERY_WINDOW_INVALID', 'Delivery start must not be after delivery end');
  return Object.freeze({
    incoterm: terms.incoterm,
    paymentDays: terms.paymentDays,
    prepaymentPercent: terms.prepaymentPercent,
    deliveryStart: terms.deliveryStart,
    deliveryEnd: terms.deliveryEnd,
  });
}
