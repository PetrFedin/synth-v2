import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertProductionOrderVersion,
  cancelProductionOrder,
  confirmProductionOrder,
  createProductionOrderFromAllocation,
  issueProductionOrder,
} from '../modules/production-orders/public.mjs';

const CONFIRM_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'confirmationReference', 'confirmedBy', 'notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createProductionOrderService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCTION_ORDER_STORE_REQUIRED', 'Production Order store is required');

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
    invariant(membership.organisationType === 'brand', 'PRODUCTION_ORDER_BRAND_MEMBERSHIP_REQUIRED', 'Production Order mutation requires a brand membership', { brandId, actorId });
    return membership;
  }

  async function append(tx, type, value, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: value.id,
      occurredAt: clock(),
      payload: {
        productionOrderNumber: value.productionOrderNumber,
        rfqCode: value.rfqCode,
        brandId: value.brandId,
        supplierCode: value.supplierCode,
        sku: value.sku,
        quantity: value.quantity,
        status: value.status,
        version: value.version,
      },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createFromAllocation(commandId, actorId, rfqCode) {
      const fingerprint = `createProductionOrderFromAllocation:${actorId}:${rfqCode}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'RFQ_NOT_FOUND', { rfqCode });
          await authorize(tx, rfq.brandId, actorId, CAPABILITIES.PRODUCTION_ORDER_MANAGE);
          const existingByRfq = await tx.getProductionOrderByRfqCode(rfq.rfqCode);
          const existingByNumber = rfq.allocation?.purchaseOrderNumber
            ? await tx.getProductionOrderByNumber(rfq.allocation.purchaseOrderNumber)
            : null;
          const supplier = rfq.selectedSupplierCode
            ? await tx.getSupplierByCode(rfq.brandId, rfq.selectedSupplierCode)
            : null;
          return Object.freeze({ rfq, supplier, existingByRfq, existingByNumber });
        },
        async (tx, context) => {
          invariant(!context.existingByRfq, 'PRODUCTION_ORDER_FOR_RFQ_EXISTS', 'Allocated RFQ already has a Production Order', { rfqCode: context.rfq.rfqCode, productionOrderNumber: context.existingByRfq?.productionOrderNumber });
          invariant(!context.existingByNumber, 'PRODUCTION_ORDER_NUMBER_EXISTS', 'Production Order number already exists', { productionOrderNumber: context.rfq.allocation?.purchaseOrderNumber });
          const value = createProductionOrderFromAllocation({ id: nextId('production-order'), rfq: context.rfq, supplier: context.supplier, createdAt: clock() });
          await tx.insertProductionOrder(value);
          await append(tx, 'production-order.created', value, commandId, actorId);
          return value;
        });
    },

    issue(commandId, actorId, productionOrderNumber, input) {
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `issueProductionOrder:${actorId}:${productionOrderNumber}:${expectedVersion}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.PRODUCTION_ORDER_MANAGE);
          return current;
        },
        async (tx, current) => {
          assertProductionOrderVersion(current, expectedVersion);
          const value = issueProductionOrder(current, { actorId, issuedAt: clock() });
          await tx.saveProductionOrder(value, expectedVersion);
          await append(tx, 'production-order.issued', value, commandId, actorId);
          return value;
        });
    },

    confirm(commandId, actorId, productionOrderNumber, input) {
      assertObject(input, 'PRODUCTION_ORDER_CONFIRM_INPUT_INVALID', 'Production Order confirmation input is invalid');
      assertAllowedFields(input, CONFIRM_FIELDS, 'PRODUCTION_ORDER_CONFIRM_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `confirmProductionOrder:${actorId}:${productionOrderNumber}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.PRODUCTION_ORDER_CONFIRM);
          return current;
        },
        async (tx, current) => {
          assertProductionOrderVersion(current, expectedVersion);
          const value = confirmProductionOrder(current, { ...without(input, ['expectedVersion']), confirmedAt: clock() });
          await tx.saveProductionOrder(value, expectedVersion);
          await append(tx, 'production-order.confirmed', value, commandId, actorId);
          return value;
        });
    },

    cancel(commandId, actorId, productionOrderNumber, input) {
      assertObject(input, 'PRODUCTION_ORDER_CANCEL_INPUT_INVALID', 'Production Order cancellation input is invalid');
      assertAllowedFields(input, CANCEL_FIELDS, 'PRODUCTION_ORDER_CANCEL_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `cancelProductionOrder:${actorId}:${productionOrderNumber}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.PRODUCTION_ORDER_MANAGE);
          return current;
        },
        async (tx, current) => {
          assertProductionOrderVersion(current, expectedVersion);
          const value = cancelProductionOrder(current, { reason: input.reason, cancelledAt: clock() });
          await tx.saveProductionOrder(value, expectedVersion);
          await append(tx, 'production-order.cancelled', value, commandId, actorId);
          return value;
        });
    },
  });
}

function expectedVersionOf(input) {
  invariant(input && Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'PRODUCTION_ORDER_EXPECTED_VERSION_INVALID', 'Expected Production Order version is invalid');
  return input.expectedVersion;
}
function without(value, fields) { const blocked = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(value || {}).filter(([key]) => !blocked.has(key)))); }
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(value, allowed, code) { const fields = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'Production Order input contains unsupported fields', { fields }); }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
