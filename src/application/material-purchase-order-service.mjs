import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createMaterialPurchaseOrderFromAllocation } from '../modules/material-purchase-orders/public.mjs';
import {
  assertMaterialPurchaseOrderVersion,
  cancelMaterialPurchaseOrder,
  confirmMaterialPurchaseOrder,
  issueMaterialPurchaseOrder,
} from '../modules/material-purchase-orders/public.mjs';

const CONFIRM_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'confirmationReference', 'confirmedBy', 'notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createMaterialPurchaseOrderService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'MATERIAL_PURCHASE_ORDER_STORE_REQUIRED', 'Material Purchase Order store is required');

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
    invariant(membership.organisationType === 'brand', 'MATERIAL_PURCHASE_ORDER_BRAND_MEMBERSHIP_REQUIRED', 'Material Purchase Order mutation requires a brand membership', { brandId, actorId });
    return membership;
  }

  async function append(tx, type, value, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: value.id,
      occurredAt: clock(),
      payload: {
        purchaseOrderNumber: value.purchaseOrderNumber, rfqCode: value.rfqCode, brandId: value.brandId,
        supplierCode: value.supplierCode, materialCode: value.materialCode, quantity: value.quantity,
        status: value.status, version: value.version,
      },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createFromAllocation(commandId, actorId, rfqCode) {
      const fingerprint = `createMaterialPurchaseOrderFromAllocation:${actorId}:${rfqCode}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'MATERIAL_RFQ_NOT_FOUND', { rfqCode });
          await authorize(tx, rfq.brandId, actorId, CAPABILITIES.MATERIAL_PURCHASE_MANAGE);
          const existingByRfq = await tx.getPurchaseOrderByRfqCode(rfq.rfqCode);
          const existingByNumber = rfq.allocation?.purchaseOrderNumber
            ? await tx.getPurchaseOrderByNumber(rfq.allocation.purchaseOrderNumber)
            : null;
          const supplier = rfq.selectedSupplierCode
            ? await tx.getSupplierByCode(rfq.brandId, rfq.selectedSupplierCode)
            : null;
          return Object.freeze({ rfq, supplier, existingByRfq, existingByNumber });
        },
        async (tx, context) => {
          invariant(!context.existingByRfq, 'MATERIAL_PURCHASE_ORDER_FOR_RFQ_EXISTS', 'Allocated Material RFQ already has a Purchase Order', { rfqCode: context.rfq.rfqCode, purchaseOrderNumber: context.existingByRfq?.purchaseOrderNumber });
          invariant(!context.existingByNumber, 'MATERIAL_PURCHASE_ORDER_NUMBER_EXISTS', 'Material Purchase Order number already exists', { purchaseOrderNumber: context.rfq.allocation?.purchaseOrderNumber });
          const value = createMaterialPurchaseOrderFromAllocation({ id: nextId('material-purchase-order'), rfq: context.rfq, supplier: context.supplier, createdAt: clock() });
          await tx.insertPurchaseOrder(value);
          await append(tx, 'material-purchase-order.created', value, commandId, actorId);
          return value;
        });
    },

    issue(commandId, actorId, purchaseOrderNumber, input) {
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `issueMaterialPurchaseOrder:${actorId}:${purchaseOrderNumber}:${expectedVersion}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getPurchaseOrderByNumber(purchaseOrderNumber), 'MATERIAL_PURCHASE_ORDER_NOT_FOUND', { purchaseOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.MATERIAL_PURCHASE_MANAGE);
          return current;
        },
        async (tx, current) => {
          assertMaterialPurchaseOrderVersion(current, expectedVersion);
          const value = issueMaterialPurchaseOrder(current, { actorId, issuedAt: clock() });
          await tx.savePurchaseOrder(value, expectedVersion);
          await append(tx, 'material-purchase-order.issued', value, commandId, actorId);
          return value;
        });
    },

    confirm(commandId, actorId, purchaseOrderNumber, input) {
      assertObject(input, 'MATERIAL_PURCHASE_ORDER_CONFIRM_INPUT_INVALID', 'Material Purchase Order confirmation input is invalid');
      assertAllowedFields(input, CONFIRM_FIELDS, 'MATERIAL_PURCHASE_ORDER_CONFIRM_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `confirmMaterialPurchaseOrder:${actorId}:${purchaseOrderNumber}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getPurchaseOrderByNumber(purchaseOrderNumber), 'MATERIAL_PURCHASE_ORDER_NOT_FOUND', { purchaseOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.MATERIAL_PURCHASE_MANAGE);
          return current;
        },
        async (tx, current) => {
          assertMaterialPurchaseOrderVersion(current, expectedVersion);
          const value = confirmMaterialPurchaseOrder(current, { ...without(input, ['expectedVersion']), confirmedAt: clock() });
          await tx.savePurchaseOrder(value, expectedVersion);
          await append(tx, 'material-purchase-order.confirmed', value, commandId, actorId);
          return value;
        });
    },

    cancel(commandId, actorId, purchaseOrderNumber, input) {
      assertObject(input, 'MATERIAL_PURCHASE_ORDER_CANCEL_INPUT_INVALID', 'Material Purchase Order cancellation input is invalid');
      assertAllowedFields(input, CANCEL_FIELDS, 'MATERIAL_PURCHASE_ORDER_CANCEL_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `cancelMaterialPurchaseOrder:${actorId}:${purchaseOrderNumber}:${canonicalJson(input)}`;
      return execute(commandId, fingerprint, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getPurchaseOrderByNumber(purchaseOrderNumber), 'MATERIAL_PURCHASE_ORDER_NOT_FOUND', { purchaseOrderNumber });
          await authorize(tx, current.brandId, actorId, CAPABILITIES.MATERIAL_PURCHASE_MANAGE);
          return current;
        },
        async (tx, current) => {
          assertMaterialPurchaseOrderVersion(current, expectedVersion);
          const value = cancelMaterialPurchaseOrder(current, { reason: input.reason, cancelledAt: clock() });
          await tx.savePurchaseOrder(value, expectedVersion);
          await append(tx, 'material-purchase-order.cancelled', value, commandId, actorId);
          return value;
        });
    },

    async getForActor(actorId, purchaseOrderNumber) {
      return store.transaction(async (tx) => {
        const current = requireEntity(await tx.getPurchaseOrderByNumber(purchaseOrderNumber), 'MATERIAL_PURCHASE_ORDER_NOT_FOUND', { purchaseOrderNumber });
        const membership = await tx.getMembership(current.brandId, actorId);
        assertCapability(membership, CAPABILITIES.SOURCING_READ);
        return current;
      });
    },
  });
}

function expectedVersionOf(input) {
  invariant(input && Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'MATERIAL_PURCHASE_ORDER_EXPECTED_VERSION_INVALID', 'Expected Material Purchase Order version is invalid');
  return input.expectedVersion;
}
function without(value, fields) { const blocked = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(value || {}).filter(([key]) => !blocked.has(key)))); }
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(value, allowed, code) { const fields = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'Material Purchase Order input contains unsupported fields', { fields }); }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
