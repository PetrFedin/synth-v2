import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { allocateRfqWithAcknowledgedTechPack } from '../modules/sourcing/tech-pack-allocation.mjs';

const ALLOCATION_FIELDS = Object.freeze(new Set(['expectedVersion', 'purchaseOrderNumber', 'quantity', 'productionStartAt', 'deliveryDueAt', 'notes']));

export function createSourcingTechPackAllocationService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'SOURCING_TECH_PACK_STORE_REQUIRED', 'Sourcing Tech Pack allocation store is required');

  return Object.freeze({
    allocateRfq(commandId, actorId, rfqCode, input) {
      invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
      assertObject(input, 'RFQ_ALLOCATION_INPUT_INVALID', 'RFQ allocation input is invalid');
      assertAllowedFields(input, ALLOCATION_FIELDS, 'RFQ_ALLOCATION_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const fingerprint = `allocateRfqWithAcknowledgedTechPack:${actorId}:${rfqCode}:${canonicalJson(input)}`;
      return store.transaction(async (tx) => {
        const previous = await tx.getCommand(commandId);
        if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'RFQ_NOT_FOUND', { rfqCode });
        const membership = await tx.getMembership(rfq.brandId, actorId);
        assertCapability(membership, CAPABILITIES.PRODUCTION_ALLOCATE);
        invariant(membership.organisationType === 'brand', 'SOURCING_BRAND_MEMBERSHIP_REQUIRED', 'Production allocation requires a brand membership', { brandId: rfq.brandId });
        if (previous) return previous.result;
        invariant(rfq.version === expectedVersion, 'RFQ_CONCURRENCY_CONFLICT', 'RFQ was changed by another operation', { rfqCode, expectedVersion, actualVersion: rfq.version });
        const supplier = requireEntity(await tx.getSupplierByCode(rfq.selectedSupplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: rfq.selectedSupplierCode });
        const techPack = await tx.getAcknowledgedTechPack(rfq.sku, rfq.brandId, rfq.selectedSupplierCode);
        const allocated = allocateRfqWithAcknowledgedTechPack(rfq, {
          supplier,
          techPack,
          input: withoutExpectedVersion(input),
          allocatedAt: clock(),
        });
        await tx.saveAllocatedRfq(allocated, expectedVersion);
        const event = domainEvent({
          id: nextId('event'),
          type: 'rfq.allocated',
          aggregateId: allocated.id,
          occurredAt: clock(),
          payload: {
            rfqCode: allocated.rfqCode,
            brandId: allocated.brandId,
            sku: allocated.sku,
            status: allocated.status,
            selectedSupplierCode: allocated.selectedSupplierCode,
            purchaseOrderNumber: allocated.allocation.purchaseOrderNumber,
            techPackCode: allocated.allocation.techPackCode,
            techPackRevision: allocated.allocation.techPackRevision,
            techPackVersion: allocated.allocation.techPackVersion,
            version: allocated.version,
          },
          metadata: { commandId, actorId },
        });
        await tx.appendOutbox(event);
        await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result: allocated, completedAt: clock() }));
        return allocated;
      });
    },
  });
}

function expectedVersionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'RFQ_EXPECTED_VERSION_INVALID', 'Expected RFQ version is invalid');
  return input.expectedVersion;
}
function withoutExpectedVersion(input) { return Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion'))); }
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(value, allowed, code) { const fields = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'RFQ allocation contains unsupported fields', { fields }); }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
