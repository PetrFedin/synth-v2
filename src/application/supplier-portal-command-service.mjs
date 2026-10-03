import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import {
  SUPPLIER_PORTAL_CAPABILITIES,
  assertSupplierPortalCapability,
  supplierPortalOrderReceipt,
  supplierPortalRfqReceipt,
} from '../modules/supplier-portal/public.mjs';
import { acceptRfqCounterOffer, upsertRfqQuote } from '../modules/sourcing/public.mjs';
import { confirmProductionOrder, assertProductionOrderVersion } from '../modules/production-orders/public.mjs';

// S-01. The supplier answers for itself. Every command here runs the same domain function the brand's
// own command runs, so the invariants are the same ones; what differs is who is allowed to call it and
// what it is allowed to touch.
//
//   * The standing is the grant, not a membership: an active grant for the supplier the command names,
//     held by the caller. A person at two factories holds two grants and chooses which one answers.
//   * The aggregate must be addressed to that supplier. A request the supplier was not invited to, a
//     request of another brand, an order placed with another supplier and a thing that does not exist
//     all answer the same way, so the portal cannot be used to find out which of them are real.
//   * The supplier must still be qualified (Q-03). Suspension or archive closes the writes the moment
//     it happens, in the same transaction that would have written.
//   * Nothing the caller names can make it somebody else: the supplier code is checked against the
//     grant, the confirming person is the grant's contact, never a field in the body.
//   * The answer is the supplier's own part of the aggregate (a receipt), never the aggregate.
//   * The event is the one the brand's command emits, so everything downstream keeps working, and its
//     metadata says the actor is a supplier acting through the portal.
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const QUOTE_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes', 'tiers']));
const ACCEPT_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode']));
const CONFIRM_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'confirmationReference', 'notes']));

/** @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options] */
export function createSupplierPortalCommandService({ store, clock = () => new Date().toISOString(), nextId = (prefix) => `${prefix}_${randomUUID()}` } = {}) {
  invariant(store && typeof store.transaction === 'function', 'SUPPLIER_PORTAL_STORE_REQUIRED', 'Supplier portal store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      // A replay is authorised again: access that was revoked after the first call does not replay.
      const context = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  // The caller, the supplier it names, and the capability the command needs. The grant is read
  // without a lock first to learn the brand, then again with one once the aggregate is held, so the
  // locks are taken in the same order as the brand's commands take them.
  async function standing(tx, actorId, input, capability, load) {
    invariant(typeof actorId === 'string' && actorId.trim(), 'SUPPLIER_PORTAL_ACTOR_REQUIRED', 'Portal actor is required');
    const supplierCode = input.supplierCode;
    invariant(typeof supplierCode === 'string' && CODE.test(supplierCode), 'SUPPLIER_CODE_INVALID', 'Supplier code is invalid', { supplierCode });
    const first = await tx.findActiveGrant(actorId, supplierCode);
    assertSupplierPortalCapability(first, { supplierCode, capability });
    const aggregate = await load(first);
    const supplier = await tx.getSupplier(first.brandId, supplierCode);
    const grant = await tx.lockActiveGrant(actorId, supplierCode);
    assertSupplierPortalCapability(grant, { supplierCode, capability });
    invariant(supplier?.status === 'qualified', 'SUPPLIER_PORTAL_SUPPLIER_NOT_QUALIFIED',
      'The portal accepts answers only from a qualified supplier', { supplierCode, status: supplier?.status ?? null });
    return Object.freeze({ grant, supplier, aggregate });
  }

  async function rfqStanding(tx, actorId, rfqCode, input, capability) {
    return standing(tx, actorId, input, capability, async (grant) => {
      const rfq = await tx.getRfqForUpdate(rfqCode);
      // One answer for "does not exist", "is another brand's", "is a draft" and "was not addressed to you".
      invariant(rfq && rfq.brandId === grant.brandId && rfq.status !== 'draft' && rfq.supplierCodes?.includes(grant.supplierCode),
        'RFQ_NOT_FOUND', 'Request for quotation was not found', { rfqCode });
      return rfq;
    });
  }

  async function appendEvent(tx, type, aggregate, payload, { commandId, actorId, grant }) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: aggregate.id, occurredAt: clock(), payload,
      metadata: { commandId, actorId, actorKind: 'supplier', via: 'supplier-portal', supplierCode: grant.supplierCode, portalGrantId: grant.id },
    }));
  }

  const rfqPayload = (rfq) => ({ rfqCode: rfq.rfqCode, brandId: rfq.brandId, sku: rfq.sku, status: rfq.status, selectedSupplierCode: rfq.selectedSupplierCode, version: rfq.version });

  function rfqCommand({ name, capability, fields, eventType, commandId, actorId, rfqCode, input, transform }) {
    assertObject(input, 'RFQ_COMMAND_INVALID', 'RFQ command input is invalid');
    assertAllowedFields(input, fields, 'RFQ_COMMAND_FIELD_FORBIDDEN');
    const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'RFQ_EXPECTED_VERSION_INVALID', label: 'Expected RFQ version', min: 1 });
    return execute(commandId, `${name}:${actorId}:${rfqCode}:${canonicalJson(input)}`, actorId,
      (tx) => rfqStanding(tx, actorId, rfqCode, input, capability),
      async (tx, { grant, supplier, aggregate }) => {
        invariant(aggregate.version === expectedVersion, 'RFQ_CONCURRENCY_CONFLICT', 'Aggregate was changed by another operation', { rfqCode, expectedVersion, actualVersion: aggregate.version });
        const changed = transform({ rfq: aggregate, supplier, grant, input: withoutFields(input, ['expectedVersion']) });
        await tx.saveRfq(changed, expectedVersion);
        await appendEvent(tx, eventType, changed, rfqPayload(changed), { commandId, actorId, grant });
        return supplierPortalRfqReceipt(changed, grant.supplierCode);
      });
  }

  return Object.freeze({
    // (1) A quotation, or a new revision of one. The deadline, the minimum order, the validity and the
    // price ladder are checked by the same function that checks the brand's entry.
    submitQuote(commandId, actorId, rfqCode, input) {
      return rfqCommand({
        name: 'portalSubmitQuote', capability: SUPPLIER_PORTAL_CAPABILITIES.QUOTE_SUBMIT, fields: QUOTE_FIELDS, eventType: 'rfq.quote-received',
        commandId, actorId, rfqCode, input,
        transform: ({ rfq, supplier, input: value }) => upsertRfqQuote(rfq, { supplier, input: value, receivedAt: clock(), submittedBy: actorId }),
      });
    },

    // (2) The supplier agrees to the brand's counter-offer. Making a counter-offer stays the brand's
    // move; the supplier's other answer to one is a revised quotation, which is (1).
    acceptCounterOffer(commandId, actorId, rfqCode, input) {
      return rfqCommand({
        name: 'portalAcceptCounterOffer', capability: SUPPLIER_PORTAL_CAPABILITIES.COUNTER_ACCEPT, fields: ACCEPT_FIELDS, eventType: 'rfq.counter-accepted',
        commandId, actorId, rfqCode, input,
        transform: ({ rfq, supplier }) => acceptRfqCounterOffer(rfq, { supplier, acceptedAt: clock(), acceptedBy: actorId, acceptedVia: 'supplier-portal' }),
      });
    },

    // (3) The supplier confirms an order placed with it. The confirming person is the grant's contact,
    // not a field the caller types, so a confirmation cannot be signed in another person's name.
    confirmOrder(commandId, actorId, productionOrderNumber, input) {
      assertObject(input, 'PRODUCTION_ORDER_CONFIRM_INPUT_INVALID', 'Production Order confirmation input is invalid');
      assertAllowedFields(input, CONFIRM_FIELDS, 'PRODUCTION_ORDER_CONFIRM_FIELD_FORBIDDEN');
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'PRODUCTION_ORDER_EXPECTED_VERSION_INVALID', label: 'Expected Production Order version', min: 1 });
      return execute(commandId, `portalConfirmOrder:${actorId}:${productionOrderNumber}:${canonicalJson(input)}`, actorId,
        (tx) => standing(tx, actorId, input, SUPPLIER_PORTAL_CAPABILITIES.ORDER_CONFIRM, async (grant) => {
          const order = await tx.getProductionOrderForUpdate(productionOrderNumber);
          invariant(order && order.brandId === grant.brandId && order.supplierCode === grant.supplierCode && order.status !== 'draft',
            'PRODUCTION_ORDER_NOT_FOUND', 'Production Order was not found', { productionOrderNumber });
          return order;
        }),
        async (tx, { grant, aggregate }) => {
          assertProductionOrderVersion(aggregate, expectedVersion);
          const confirmed = confirmProductionOrder(aggregate, {
            supplierCode: grant.supplierCode,
            confirmationReference: input.confirmationReference,
            confirmedBy: grant.contactName,
            notes: input.notes,
            confirmedAt: clock(),
            confirmedVia: 'supplier-portal',
            confirmedByUserId: actorId,
          });
          await tx.saveProductionOrder(confirmed, expectedVersion);
          await appendEvent(tx, 'production-order.confirmed', confirmed, {
            productionOrderNumber: confirmed.productionOrderNumber, rfqCode: confirmed.rfqCode, brandId: confirmed.brandId,
            supplierCode: confirmed.supplierCode, sku: confirmed.sku, quantity: confirmed.quantity, status: confirmed.status, version: confirmed.version,
            ...(confirmed.lineageVersion === 2 ? {
              lineageVersion: 2,
              productionRequirementSnapshotId: confirmed.productionRequirementSnapshotId,
              productionRequirementOrderLineNo: confirmed.productionRequirementOrderLineNo,
              orderId: confirmed.orderId, orderCommitSnapshotId: confirmed.orderCommitSnapshotId,
              supplyCommitmentSnapshotId: confirmed.supplyCommitmentSnapshotId, productSkuId: confirmed.productSkuId,
              styleVersionId: confirmed.styleVersionId, colorwayId: confirmed.colorwayId, sizeValueId: confirmed.sizeValueId,
              sizeCode: confirmed.sizeCode, collectionId: confirmed.collectionId, showroomId: confirmed.showroomId,
              commercialPublicationId: confirmed.commercialPublicationId, buyerCatalogVersionId: confirmed.buyerCatalogVersionId,
            } : {}),
          }, { commandId, actorId, grant });
          return supplierPortalOrderReceipt(confirmed);
        });
    },
  });
}

function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(input, allowed, code) { const fields = Object.keys(input).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'Request contains forbidden fields', { fields }); }
function withoutFields(input, fields) { const excluded = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => !excluded.has(field)))); }
