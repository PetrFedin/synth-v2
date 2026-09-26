import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  allocateMaterialRfq as allocateMaterialRfqDomain,
  awardMaterialRfq as awardMaterialRfqDomain,
  cancelMaterialRfq as cancelMaterialRfqDomain,
  createMaterialRfq as createMaterialRfqDomain,
  issueMaterialRfq as issueMaterialRfqDomain,
  updateDraftMaterialRfq as updateDraftMaterialRfqDomain,
  upsertMaterialRfqQuote as upsertMaterialRfqQuoteDomain,
} from '../modules/material-sourcing/public.mjs';

const RFQ_EDITABLE = Object.freeze(['targetQuantity', 'unit', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes']);
const RFQ_CREATE_FIELDS = Object.freeze(new Set(['rfqCode', 'materialCode', ...RFQ_EDITABLE]));
const RFQ_UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...RFQ_EDITABLE]));
const VERSION_FIELDS = Object.freeze(new Set(['expectedVersion']));
const QUOTE_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'currency', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes']));
const AWARD_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode']));
const ALLOCATION_FIELDS = Object.freeze(new Set(['expectedVersion', 'purchaseOrderNumber', 'quantity', 'orderPlacedAt', 'deliveryDueAt', 'notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createMaterialSourcingService({ materialSourcingStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(materialSourcingStore && typeof materialSourcingStore.transaction === 'function', 'MATERIAL_SOURCING_STORE_REQUIRED', 'Material sourcing store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return materialSourcingStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function membership(tx, brandId, actorId, capability) {
    const value = await tx.getMembership(brandId, actorId);
    assertCapability(value, capability);
    invariant(value.organisationType === 'brand', 'MATERIAL_RFQ_BRAND_MEMBERSHIP_REQUIRED', 'Material sourcing operations require a brand membership', { brandId });
    return value;
  }

  async function authorisedRfq(tx, rfqCode, actorId, capability) {
    const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'MATERIAL_RFQ_NOT_FOUND', { rfqCode });
    await membership(tx, rfq.brandId, actorId, capability);
    return rfq;
  }

  async function append(tx, type, rfq, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: rfq.id,
      occurredAt: clock(),
      payload: { rfqCode: rfq.rfqCode, brandId: rfq.brandId, materialCode: rfq.materialCode, status: rfq.status, selectedSupplierCode: rfq.selectedSupplierCode, version: rfq.version },
      metadata: { commandId, actorId },
    }));
  }

  async function rfqTransition({ commandName, eventType, commandId, actorId, rfqCode, input, fields, capability = CAPABILITIES.SOURCING_MANAGE, prepare, transform }) {
    assertObject(input, 'MATERIAL_RFQ_COMMAND_INVALID', 'Material RFQ command input is invalid');
    assertAllowedFields(input, fields, 'MATERIAL_RFQ_COMMAND_FIELD_FORBIDDEN');
    const expectedVersion = expectedVersionOf(input, 'MATERIAL_RFQ_EXPECTED_VERSION_INVALID', 'Expected Material RFQ version');
    return execute(
      commandId,
      `${commandName}:${actorId}:${rfqCode}:${canonicalJson(input)}`,
      actorId,
      async (tx) => {
        const rfq = await authorisedRfq(tx, rfqCode, actorId, capability);
        const extra = prepare ? await prepare(tx, rfq, input) : {};
        return Object.freeze({ rfq, ...extra });
      },
      async (tx, context) => {
        assertExpectedVersion(context.rfq, expectedVersion, 'MATERIAL_RFQ_CONCURRENCY_CONFLICT', { rfqCode });
        const changed = transform(context, withoutExpectedVersion(input));
        if (changed === context.rfq) return context.rfq;
        await tx.saveRfq(changed, expectedVersion);
        await append(tx, eventType(changed), changed, commandId, actorId);
        return changed;
      },
    );
  }

  return Object.freeze({
    createRfq(commandId, actorId, input) {
      assertComplete(input, ['rfqCode', 'materialCode', ...RFQ_EDITABLE], 'MATERIAL_RFQ_INPUT_INVALID', 'MATERIAL_RFQ_FIELD_REQUIRED');
      assertAllowedFields(input, RFQ_CREATE_FIELDS, 'MATERIAL_RFQ_CREATE_FIELD_FORBIDDEN');
      return execute(
        commandId,
        `createMaterialRfq:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const material = requireEntity(await tx.getMaterialByCode(input.materialCode), 'MATERIAL_NOT_FOUND', { materialCode: input.materialCode });
          await membership(tx, material.brandId, actorId, CAPABILITIES.SOURCING_MANAGE);
          const suppliers = await tx.getSuppliersByCodes(input.supplierCodes);
          const existing = await tx.getRfqByCode(input.rfqCode);
          return Object.freeze({ material, suppliers, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'MATERIAL_RFQ_ALREADY_EXISTS', 'Material RFQ code already exists', { rfqCode: input.rfqCode });
          const rfq = createMaterialRfqDomain({ id: nextId('material-rfq'), material: context.material, suppliers: context.suppliers, input, createdAt: clock() });
          await tx.insertRfq(rfq);
          await append(tx, 'material-rfq.created', rfq, commandId, actorId);
          return rfq;
        },
      );
    },

    updateRfq(commandId, actorId, rfqCode, input) {
      assertComplete(input, ['expectedVersion', ...RFQ_EDITABLE], 'MATERIAL_RFQ_INPUT_INVALID', 'MATERIAL_RFQ_FIELD_REQUIRED');
      return rfqTransition({
        commandName: 'updateMaterialRfq', eventType: () => 'material-rfq.updated', commandId, actorId, rfqCode, input, fields: RFQ_UPDATE_FIELDS,
        prepare: async (tx, rfq, value) => ({ material: await tx.getMaterialByCode(rfq.materialCode), suppliers: await tx.getSuppliersByCodes(value.supplierCodes) }),
        transform: (context, value) => updateDraftMaterialRfqDomain(context.rfq, { material: context.material, suppliers: context.suppliers, input: value, updatedAt: clock() }),
      });
    },

    issueRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'issueMaterialRfq', eventType: () => 'material-rfq.issued', commandId, actorId, rfqCode, input, fields: VERSION_FIELDS,
        prepare: async (tx, rfq) => ({ material: await tx.getMaterialByCode(rfq.materialCode), suppliers: await tx.getSuppliersByCodes(rfq.supplierCodes) }),
        transform: (context) => issueMaterialRfqDomain(context.rfq, { material: context.material, suppliers: context.suppliers, issuedAt: clock() }),
      });
    },

    upsertQuote(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'upsertMaterialRfqQuote', eventType: () => 'material-rfq.quote-received', commandId, actorId, rfqCode, input, fields: QUOTE_FIELDS,
        prepare: async (tx, rfq, value) => ({ supplier: requireEntity(await tx.getSupplierByCode(value.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: value.supplierCode }) }),
        transform: (context, value) => upsertMaterialRfqQuoteDomain(context.rfq, { supplier: context.supplier, input: value, receivedAt: clock() }),
      });
    },

    awardRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'awardMaterialRfq', eventType: () => 'material-rfq.awarded', commandId, actorId, rfqCode, input, fields: AWARD_FIELDS, capability: CAPABILITIES.SOURCING_AWARD,
        prepare: async (tx, rfq, value) => ({ supplier: requireEntity(await tx.getSupplierByCode(value.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: value.supplierCode }) }),
        transform: (context) => awardMaterialRfqDomain(context.rfq, { supplier: context.supplier, awardedAt: clock() }),
      });
    },

    allocateRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'allocateMaterialRfq', eventType: () => 'material-rfq.allocated', commandId, actorId, rfqCode, input, fields: ALLOCATION_FIELDS, capability: CAPABILITIES.MATERIAL_PURCHASE_MANAGE,
        prepare: async (tx, rfq) => ({ supplier: requireEntity(await tx.getSupplierByCode(rfq.selectedSupplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: rfq.selectedSupplierCode }) }),
        transform: (context, value) => allocateMaterialRfqDomain(context.rfq, { supplier: context.supplier, input: value, allocatedAt: clock() }),
      });
    },

    cancelRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'cancelMaterialRfq', eventType: () => 'material-rfq.cancelled', commandId, actorId, rfqCode, input, fields: CANCEL_FIELDS,
        transform: (context, value) => cancelMaterialRfqDomain(context.rfq, { reason: value.reason, cancelledAt: clock() }),
      });
    },

    async getForActor(actorId, rfqCode) {
      return materialSourcingStore.transaction(async (tx) => {
        const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'MATERIAL_RFQ_NOT_FOUND', { rfqCode });
        await membership(tx, rfq.brandId, actorId, CAPABILITIES.SOURCING_READ);
        return rfq;
      });
    },
  });
}

function assertComplete(input, fields, invalidCode, requiredCode) {
  assertObject(input, invalidCode, 'Input must be a JSON object');
  const missingFields = fields.filter((field) => !Object.hasOwn(input, field));
  invariant(missingFields.length === 0, requiredCode, 'Request is missing required fields', { missingFields });
}
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(input, allowed, code) { const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'Request contains forbidden fields', { fields }); }
function expectedVersionOf(input, code, label) { return assertPostgresInteger(input.expectedVersion, { code, label, min: 1 }); }
function withoutExpectedVersion(input) { const { expectedVersion, ...rest } = input; return Object.freeze(rest); }
function assertExpectedVersion(entity, expectedVersion, code, details) { invariant(entity.version === expectedVersion, code, 'Aggregate was changed by another operation', { ...details, expectedVersion, actualVersion: entity.version }); }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
