import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createPaymentSchedule, paymentScheduleView, recordPayment } from '../modules/supplier-payments/public.mjs';

const CREATE_FIELDS = Object.freeze(new Set(['split']));
const PAY_FIELDS = Object.freeze(new Set(['expectedVersion', 'sequence', 'paidAt', 'reference']));

export function createSupplierPaymentService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PAYMENT_STORE_REQUIRED', 'Supplier payment store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function authorize(tx, brandId, actorId, capability) {
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, capability);
    invariant(membership.organisationType === 'brand', 'PAYMENT_BRAND_MEMBERSHIP_REQUIRED', 'Supplier payments require a brand membership', { brandId, actorId });
  }

  // Доказательство наступления — там, где событие уже живёт.
  //
  // Read inside the same transaction that will write the payment, and never copied into the
  // schedule: the order's own confirmation and Final Quality's shipment release are the events, and
  // a schedule holding its own copy of them could say a lot shipped when it did not.
  async function evidenceFor(tx, order) {
    const release = await tx.getEarliestShipmentRelease(order.productionOrderNumber);
    return Object.freeze({ confirmedAt: order.confirmedAt ?? null, releasedAt: release?.releasedAt ?? null });
  }

  return Object.freeze({
    createSchedule(commandId, actorId, productionOrderNumber, input) {
      validateInput(input, CREATE_FIELDS, 'PAYMENT_SCHEDULE_INPUT_INVALID');
      return execute(commandId, `createPaymentSchedule:${actorId}:${productionOrderNumber}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const order = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, order.brandId, actorId, CAPABILITIES.COST_MANAGE);
          const supplier = requireEntity(await tx.getSupplierByCode(order.brandId, order.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: order.supplierCode });
          return Object.freeze({ order, supplier, existing: await tx.getScheduleByOrderNumber(productionOrderNumber) });
        },
        async (tx, { order, supplier, existing }) => {
          invariant(!existing, 'PAYMENT_SCHEDULE_EXISTS', 'This production order already has a payment schedule', { productionOrderNumber });
          const value = createPaymentSchedule({ id: nextId('payment-schedule'), productionOrder: order, supplier, split: input.split, createdAt: clock(), actorId });
          await tx.insertSchedule(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'supplier-payment.scheduled', aggregateId: value.id, occurredAt: clock(),
            payload: { productionOrderNumber: value.productionOrderNumber, brandId: value.brandId, supplierCode: value.supplierCode, currency: value.currency, totalAmountMinor: value.totalAmountMinor, milestones: value.milestones.length },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    recordPayment(commandId, actorId, productionOrderNumber, input) {
      validateInput(input, PAY_FIELDS, 'PAYMENT_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `recordSupplierPayment:${actorId}:${productionOrderNumber}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const schedule = requireEntity(await tx.getScheduleByOrderNumber(productionOrderNumber), 'PAYMENT_SCHEDULE_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, schedule.brandId, actorId, CAPABILITIES.COST_MANAGE);
          const order = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          return Object.freeze({ schedule, evidence: await evidenceFor(tx, order) });
        },
        async (tx, { schedule, evidence }) => {
          invariant(schedule.version === expectedVersion, 'PAYMENT_CONCURRENCY_CONFLICT', 'This payment schedule was changed by another operation', { productionOrderNumber, expectedVersion, actualVersion: schedule.version });
          const value = recordPayment(schedule, { sequence: input.sequence, paidAt: input.paidAt ?? clock(), reference: input.reference, evidence, actorId });
          await tx.saveSchedule(value, expectedVersion);
          const paid = value.milestones.find((milestone) => milestone.sequence === input.sequence);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'supplier-payment.paid', aggregateId: value.id, occurredAt: clock(),
            payload: { productionOrderNumber: value.productionOrderNumber, brandId: value.brandId, supplierCode: value.supplierCode, sequence: paid.sequence, triggerEvent: paid.triggerEvent, amountMinor: paid.amountMinor, currency: value.currency, paymentReference: paid.paymentReference },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },
  });
}

export function createSupplierPaymentQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.scheduleForActor === 'function' && typeof reader.schedulesForActor === 'function', 'PAYMENT_READER_REQUIRED', 'Supplier payment reader is required');
  return Object.freeze({
    // Статус вехи считается здесь и не хранится нигде, поэтому читатель всегда видит его на «сейчас»,
    // а не на момент последней записи.
    async paymentScheduleForActor(actorId, productionOrderNumber) {
      const found = await reader.scheduleForActor(actorId, productionOrderNumber);
      invariant(found, 'PAYMENT_SCHEDULE_NOT_FOUND', 'Payment schedule not found', { productionOrderNumber });
      return paymentScheduleView(found.schedule, { confirmedAt: found.confirmedAt, releasedAt: found.releasedAt, asOf: clock() });
    },
    async paymentSchedulesForActor(actorId) {
      const rows = await reader.schedulesForActor(actorId);
      invariant(Array.isArray(rows), 'PAYMENT_SCHEDULES_INVALID', 'Payment schedule listing is invalid');
      const asOf = clock();
      return Object.freeze(rows.map((row) => paymentScheduleView(row.schedule, { confirmedAt: row.confirmedAt, releasedAt: row.releasedAt, asOf })));
    },
  });
}

function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'PAYMENT_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function requireEntity(value, code, details) { invariant(value, code, code.replace(/_/g, ' ').toLowerCase(), details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
