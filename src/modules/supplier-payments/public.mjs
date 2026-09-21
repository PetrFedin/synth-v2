import { invariant } from '../../core/errors.mjs';

// Что мы должны фабрике и когда.
//
// Нет ни одного набираемого руками числа. The amount comes from the confirmed production order, the
// currency from the same frozen snapshot, and the term in days from the supplier as they stood when
// the schedule was drawn. A schedule that restates the order's money is a second copy of it, and two
// copies of one number disagree the moment either changes.
//
// Наступление срока здесь не состояние, а вывод. A milestone falls due when its trigger has
// happened — the factory confirmed the order, or Final Quality released the lot — and the date is
// that event plus the term. Nothing marks it due, so nothing can mark it due wrongly: a lot rejected
// at the gate simply never releases, and the balance never falls due. Only the payment is stored,
// because only the payment is a new fact about the world.

export const PAYMENT_TRIGGERS = Object.freeze(['order-confirmed', 'shipment-released']);
export const PAYMENT_MILESTONE_STATUSES = Object.freeze(['planned', 'due', 'overdue', 'paid']);
const BASIS_POINTS = 10_000;

/**
 * Draw the schedule for a confirmed order.
 *
 * The split is the brand's to choose — 30/70 against release is ordinary in this trade, 100 % on
 * release happens, staged thirds happen — so it is an argument rather than a convention buried in
 * the code. What is not negotiable is that the parts add up.
 */
export function createPaymentSchedule({ id, productionOrder, supplier, split, createdAt, actorId }) {
  invariant(productionOrder?.status === 'confirmed', 'PAYMENT_ORDER_NOT_CONFIRMED', 'A payment schedule follows a supplier-confirmed production order', { productionOrderNumber: productionOrder?.productionOrderNumber, status: productionOrder?.status });
  const commercial = productionOrder.commercialSnapshot;
  invariant(commercial && typeof commercial === 'object', 'PAYMENT_ORDER_COMMERCIALS_MISSING', 'The production order carries no commercial snapshot to bill against');
  const totalAmountMinor = positiveInteger(commercial.totalCostMinor, 'PAYMENT_ORDER_TOTAL_INVALID', 'Order total');
  const currency = currencyCode(commercial.currency);
  invariant(supplier?.supplierCode === productionOrder.supplierCode, 'PAYMENT_SUPPLIER_MISMATCH', 'The payment schedule must be drawn against the order\'s own supplier', { orderSupplier: productionOrder.supplierCode, supplier: supplier?.supplierCode });
  // Отсрочка замораживается вместе с остальным. Renegotiating terms changes what the next order is
  // billed on, not what this one already agreed.
  const paymentTermsDays = termDays(supplier.paymentTermsDays);
  const milestones = buildMilestones(split, totalAmountMinor);
  const created = timestamp(createdAt, 'PAYMENT_SCHEDULE_CREATED_AT_INVALID', 'Payment schedule creation time');

  return Object.freeze({
    id: required(id, 'PAYMENT_SCHEDULE_ID_REQUIRED', 'Payment schedule id'),
    brandId: required(productionOrder.brandId, 'PAYMENT_BRAND_REQUIRED', 'Brand id'),
    productionOrderNumber: productionOrder.productionOrderNumber,
    supplierCode: productionOrder.supplierCode,
    sku: productionOrder.sku,
    quantity: productionOrder.quantity,
    currency,
    totalAmountMinor,
    paymentTermsDays,
    milestones,
    version: 1,
    createdAt: created,
    createdBy: required(actorId, 'PAYMENT_SCHEDULE_CREATED_BY_REQUIRED', 'Payment schedule author'),
    updatedAt: created,
  });
}

/**
 * Record that a milestone was actually paid.
 *
 * The evidence is the trigger itself, not a tick box: a balance cannot be paid before the lot it
 * pays for was released, and money out for goods that never shipped is the one mistake here that
 * editing a row afterwards does not undo.
 */
export function recordPayment(schedule, { sequence, paidAt, reference, evidence, actorId }) {
  const index = schedule.milestones.findIndex((milestone) => milestone.sequence === sequence);
  invariant(index >= 0, 'PAYMENT_MILESTONE_NOT_FOUND', 'This schedule has no such milestone', { sequence });
  const milestone = schedule.milestones[index];
  invariant(!milestone.paidAt, 'PAYMENT_ALREADY_RECORDED', 'This milestone is already paid', { sequence, paidAt: milestone.paidAt });
  const at = timestamp(paidAt, 'PAYMENT_PAID_AT_INVALID', 'Payment time');
  const occurredAt = triggerOccurredAt(milestone.triggerEvent, evidence);
  invariant(occurredAt, 'PAYMENT_TRIGGER_HAS_NOT_HAPPENED', 'This milestone cannot be paid because the event it follows has not happened', { sequence, triggerEvent: milestone.triggerEvent });
  invariant(Date.parse(at) >= Date.parse(occurredAt), 'PAYMENT_BEFORE_ITS_TRIGGER', 'A payment cannot precede the event it follows', { sequence, triggerEvent: milestone.triggerEvent, occurredAt, paidAt: at });

  const paid = Object.freeze({
    ...milestone,
    paidAt: at,
    paidBy: required(actorId, 'PAYMENT_PAID_BY_REQUIRED', 'Payer'),
    paymentReference: text(reference, 2, 200, 'PAYMENT_REFERENCE_INVALID', 'Payment reference'),
  });
  const milestones = Object.freeze(schedule.milestones.map((current, position) => (position === index ? paid : current)));
  return Object.freeze({ ...schedule, milestones, version: schedule.version + 1, updatedAt: at });
}

/**
 * The schedule as somebody in finance needs to read it.
 *
 * Status is computed here and stored nowhere. A milestone whose trigger has not happened is
 * `planned` and has no date at all — offering one would invite paying against it.
 */
export function paymentScheduleView(schedule, { confirmedAt, releasedAt, asOf }) {
  const now = timestamp(asOf, 'PAYMENT_AS_OF_INVALID', 'Reference time');
  const evidence = { confirmedAt, releasedAt };
  const milestones = schedule.milestones.map((milestone) => {
    const occurredAt = triggerOccurredAt(milestone.triggerEvent, evidence);
    const dueAt = occurredAt ? addDays(occurredAt, schedule.paymentTermsDays) : null;
    const status = milestone.paidAt
      ? 'paid'
      : !occurredAt
        ? 'planned'
        : Date.parse(now) > Date.parse(dueAt) ? 'overdue' : 'due';
    return Object.freeze({ ...milestone, triggerOccurredAt: occurredAt, dueAt, status });
  });
  const outstanding = milestones.filter((milestone) => milestone.status !== 'paid');
  return Object.freeze({
    ...schedule,
    milestones: Object.freeze(milestones),
    paidAmountMinor: sum(milestones.filter((milestone) => milestone.status === 'paid')),
    // «Причитается» — это только наступившее. Money whose trigger has not happened is not owed yet,
    // and adding it here would turn a forecast into a debt.
    dueAmountMinor: sum(milestones.filter((milestone) => milestone.status === 'due' || milestone.status === 'overdue')),
    overdueAmountMinor: sum(milestones.filter((milestone) => milestone.status === 'overdue')),
    plannedAmountMinor: sum(milestones.filter((milestone) => milestone.status === 'planned')),
    outstandingAmountMinor: sum(outstanding),
  });
}

function buildMilestones(split, totalAmountMinor) {
  invariant(Array.isArray(split) && split.length >= 1 && split.length <= 12, 'PAYMENT_SPLIT_INVALID', 'A schedule has between one and twelve milestones');
  const shares = split.map((part, index) => {
    invariant(part && typeof part === 'object' && !Array.isArray(part), 'PAYMENT_SPLIT_INVALID', 'Payment milestone definition is invalid', { index });
    return {
      triggerEvent: oneOf(part.triggerEvent, PAYMENT_TRIGGERS, 'PAYMENT_TRIGGER_INVALID', 'Payment trigger'),
      shareBasisPoints: basisPoints(part.shareBasisPoints),
      labelRu: text(part.labelRu, 2, 160, 'PAYMENT_LABEL_INVALID', 'Payment milestone label (ru)'),
      labelEn: text(part.labelEn, 2, 160, 'PAYMENT_LABEL_INVALID', 'Payment milestone label (en)'),
    };
  });
  const total = shares.reduce((carried, part) => carried + part.shareBasisPoints, 0);
  invariant(total === BASIS_POINTS, 'PAYMENT_SHARES_MUST_TOTAL_WHOLE', 'Payment shares must total exactly 100 %', { basisPoints: total });

  // Остаток кладётся на последнюю веху. Dividing money by percentages loses fractions, and a
  // fraction lost every order is a supplier underpaid forever; the last milestone carries whatever
  // the divisions left over, so the parts always sum to the whole.
  let allocated = 0;
  const milestones = shares.map((part, index) => {
    const last = index === shares.length - 1;
    const amountMinor = last ? totalAmountMinor - allocated : Math.floor((totalAmountMinor * part.shareBasisPoints) / BASIS_POINTS);
    allocated += amountMinor;
    invariant(amountMinor >= 1, 'PAYMENT_MILESTONE_TOO_SMALL', 'This split leaves a milestone worth nothing on an order this size', { sequence: index + 1, amountMinor });
    return Object.freeze({ sequence: index + 1, ...part, amountMinor, paidAt: null, paidBy: null, paymentReference: null });
  });
  // Порядок вех — это порядок событий, а не порядок ввода: платить за отгрузку раньше, чем за
  // подтверждение, можно только если так и договаривались, и тогда это видно в самом графике.
  return Object.freeze(milestones);
}

function triggerOccurredAt(triggerEvent, evidence) {
  const at = triggerEvent === 'order-confirmed' ? evidence?.confirmedAt : evidence?.releasedAt;
  return typeof at === 'string' && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null;
}
function addDays(at, days) { return new Date(Date.parse(at) + days * 86_400_000).toISOString(); }
function sum(milestones) { return milestones.reduce((carried, milestone) => carried + milestone.amountMinor, 0); }

function oneOf(value, allowed, code, label) {
  invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { value });
  return value;
}
function basisPoints(value) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= BASIS_POINTS, 'PAYMENT_SHARE_INVALID', 'A share is between 1 and 10000 basis points', { value });
  return Number(value);
}
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer of minor units`, { value });
  return Number(value);
}
function termDays(value) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 365, 'PAYMENT_TERMS_INVALID', 'Payment terms are between 0 and 365 days', { value });
  return Number(value);
}
function currencyCode(value) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'PAYMENT_CURRENCY_INVALID', 'Currency must be a three-letter code', { currency: value });
  return value;
}
function required(value, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, code, `${label} is required`);
  return value.trim();
}
function text(value, minimum, maximum, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum, code, `${label} is invalid`);
  return value.trim();
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`);
  return new Date(value).toISOString();
}
