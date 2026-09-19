import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  allocateRfq as allocateRfqDomain,
  archiveSupplier as archiveSupplierDomain,
  awardRfq as awardRfqDomain,
  counterRfqQuote as counterRfqQuoteDomain,
  cancelRfq as cancelRfqDomain,
  createRfq as createRfqDomain,
  createSupplier as createSupplierDomain,
  issueRfq as issueRfqDomain,
  qualifySupplier as qualifySupplierDomain,
  suspendSupplier as suspendSupplierDomain,
  updateDraftRfq as updateDraftRfqDomain,
  updateSupplier as updateSupplierDomain,
  upsertRfqQuote as upsertRfqQuoteDomain,
} from '../modules/sourcing/public.mjs';
import {
  createSupplierPortalGrant as createSupplierPortalGrantDomain,
  revokeSupplierPortalGrant as revokeSupplierPortalGrantDomain,
} from '../modules/supplier-portal/public.mjs';

const SUPPLIER_EDITABLE = Object.freeze(['legalName', 'countryCode', 'email', 'currency', 'incoterms', 'categories', 'leadTimeDays', 'minimumOrderQuantity', 'paymentTermsDays', 'auditExpiresAt', 'notes']);
const SUPPLIER_CREATE_FIELDS = Object.freeze(new Set(['supplierCode', 'brandId', ...SUPPLIER_EDITABLE]));
const SUPPLIER_UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...SUPPLIER_EDITABLE]));
const VERSION_FIELDS = Object.freeze(new Set(['expectedVersion']));
const SUSPEND_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));
const RFQ_EDITABLE = Object.freeze(['targetQuantity', 'responseDueAt', 'deliveryDueAt', 'incoterm', 'supplierCodes', 'notes']);
const RFQ_OPTIONAL = Object.freeze(['sampleRequested', 'techPackCode']);
const RFQ_CREATE_FIELDS = Object.freeze(new Set(['rfqCode', 'sku', ...RFQ_EDITABLE, ...RFQ_OPTIONAL]));
const RFQ_UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...RFQ_EDITABLE, ...RFQ_OPTIONAL]));
const QUOTE_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes', 'tiers']));
const COUNTER_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'quantity', 'unitPriceMinor', 'notes']));
const AWARD_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode']));
const ALLOCATION_FIELDS = Object.freeze(new Set(['expectedVersion', 'purchaseOrderNumber', 'quantity', 'productionStartAt', 'deliveryDueAt', 'notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));
const PORTAL_GRANT_FIELDS = Object.freeze(new Set(['email', 'contactName']));
const PORTAL_REVOKE_FIELDS = Object.freeze(new Set(['expectedVersion', 'userId']));

export function createSourcingService({ sourcingStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(sourcingStore && typeof sourcingStore.transaction === 'function', 'SOURCING_STORE_REQUIRED', 'Sourcing store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return sourcingStore.transaction(async (tx) => {
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
    invariant(value.organisationType === 'brand', 'SOURCING_BRAND_MEMBERSHIP_REQUIRED', 'Sourcing operations require a brand membership', { brandId });
    return value;
  }

  async function authorisedSupplier(tx, supplierCode, actorId, capability) {
    const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
    await membership(tx, supplier.brandId, actorId, capability);
    return supplier;
  }

  async function authorisedRfq(tx, rfqCode, actorId, capability) {
    const rfq = requireEntity(await tx.getRfqByCode(rfqCode), 'RFQ_NOT_FOUND', { rfqCode });
    await membership(tx, rfq.brandId, actorId, capability);
    return rfq;
  }

  async function append(tx, type, aggregate, commandId, actorId) {
    const supplier = Object.hasOwn(aggregate, 'supplierCode') && !Object.hasOwn(aggregate, 'rfqCode');
    const payload = supplier
      ? { supplierCode: aggregate.supplierCode, brandId: aggregate.brandId, status: aggregate.status, version: aggregate.version }
      : { rfqCode: aggregate.rfqCode, brandId: aggregate.brandId, sku: aggregate.sku, status: aggregate.status, selectedSupplierCode: aggregate.selectedSupplierCode, version: aggregate.version };
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: aggregate.id,
      occurredAt: clock(),
      payload,
      metadata: { commandId, actorId },
    }));
  }

  async function appendPortalEvent(tx, type, grant, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: grant.id,
      occurredAt: clock(),
      payload: { supplierCode: grant.supplierCode, brandId: grant.brandId, userId: grant.userId, status: grant.status, version: grant.version },
      metadata: { commandId, actorId },
    }));
  }

  async function supplierTransition({ commandName, eventType, commandId, actorId, supplierCode, input, fields, capability = CAPABILITIES.SUPPLIER_MANAGE, transform }) {
    assertObject(input, 'SUPPLIER_COMMAND_INVALID', 'Supplier command input is invalid');
    assertAllowedFields(input, fields, 'SUPPLIER_COMMAND_FIELD_FORBIDDEN');
    const expectedVersion = expectedVersionOf(input, 'SUPPLIER_EXPECTED_VERSION_INVALID', 'Expected supplier version');
    return execute(
      commandId,
      `${commandName}:${actorId}:${supplierCode}:${canonicalJson(input)}`,
      actorId,
      (tx) => authorisedSupplier(tx, supplierCode, actorId, capability),
      async (tx, supplier) => {
        assertExpectedVersion(supplier, expectedVersion, 'SUPPLIER_CONCURRENCY_CONFLICT', { supplierCode });
        const changed = transform(supplier, input);
        if (changed === supplier) return supplier;
        await tx.saveSupplier(changed, expectedVersion);
        await append(tx, eventType, changed, commandId, actorId);
        return changed;
      },
    );
  }

  async function rfqTransition({ commandName, eventType, commandId, actorId, rfqCode, input, fields, capability = CAPABILITIES.SOURCING_MANAGE, prepare, transform }) {
    assertObject(input, 'RFQ_COMMAND_INVALID', 'RFQ command input is invalid');
    assertAllowedFields(input, fields, 'RFQ_COMMAND_FIELD_FORBIDDEN');
    const expectedVersion = expectedVersionOf(input, 'RFQ_EXPECTED_VERSION_INVALID', 'Expected RFQ version');
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
        assertExpectedVersion(context.rfq, expectedVersion, 'RFQ_CONCURRENCY_CONFLICT', { rfqCode });
        const changed = transform(context, withoutExpectedVersion(input));
        if (changed === context.rfq) return context.rfq;
        await tx.saveRfq(changed, expectedVersion);
        await append(tx, eventType(changed), changed, commandId, actorId);
        return changed;
      },
    );
  }

  return Object.freeze({
    createSupplier(commandId, actorId, input) {
      assertComplete(input, ['supplierCode', 'brandId', ...SUPPLIER_EDITABLE], 'SUPPLIER_INPUT_INVALID', 'SUPPLIER_FIELD_REQUIRED');
      assertAllowedFields(input, SUPPLIER_CREATE_FIELDS, 'SUPPLIER_CREATE_FIELD_FORBIDDEN');
      return execute(
        commandId,
        `createSupplier:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          await membership(tx, input.brandId, actorId, CAPABILITIES.SUPPLIER_MANAGE);
          return Object.freeze({ existing: await tx.getSupplierByCode(input.supplierCode) });
        },
        async (tx, { existing }) => {
          invariant(!existing, 'SUPPLIER_ALREADY_EXISTS', 'Supplier code already exists', { supplierCode: input.supplierCode });
          const supplier = createSupplierDomain({ id: nextId('supplier'), brandId: input.brandId, input: withoutFields(input, ['brandId']), createdAt: clock() });
          await tx.insertSupplier(supplier);
          await append(tx, 'supplier.created', supplier, commandId, actorId);
          return supplier;
        },
      );
    },

    updateSupplier(commandId, actorId, supplierCode, input) {
      assertComplete(input, ['expectedVersion', ...SUPPLIER_EDITABLE], 'SUPPLIER_INPUT_INVALID', 'SUPPLIER_FIELD_REQUIRED');
      return supplierTransition({
        commandName: 'updateSupplier', eventType: 'supplier.updated', commandId, actorId, supplierCode, input, fields: SUPPLIER_UPDATE_FIELDS,
        transform: (supplier, value) => updateSupplierDomain(supplier, { input: withoutExpectedVersion(value), updatedAt: clock() }),
      });
    },

    qualifySupplier(commandId, actorId, supplierCode, input) {
      return supplierTransition({
        commandName: 'qualifySupplier', eventType: 'supplier.qualified', commandId, actorId, supplierCode, input, fields: VERSION_FIELDS,
        transform: (supplier) => qualifySupplierDomain(supplier, { qualifiedAt: clock() }),
      });
    },

    suspendSupplier(commandId, actorId, supplierCode, input) {
      return supplierTransition({
        commandName: 'suspendSupplier', eventType: 'supplier.suspended', commandId, actorId, supplierCode, input, fields: SUSPEND_FIELDS,
        transform: (supplier, value) => suspendSupplierDomain(supplier, { reason: value.reason, suspendedAt: clock() }),
      });
    },

    archiveSupplier(commandId, actorId, supplierCode, input) {
      return supplierTransition({
        commandName: 'archiveSupplier', eventType: 'supplier.archived', commandId, actorId, supplierCode, input, fields: VERSION_FIELDS,
        transform: (supplier) => archiveSupplierDomain(supplier, { archivedAt: clock() }),
      });
    },

    // Portal access to a supplier. The capability is SUPPLIER_MANAGE rather than a new one, because
    // letting an outside person read the brand's requests to this factory is the same kind of decision
    // as qualifying the factory in the first place.
    grantPortalAccess(commandId, actorId, supplierCode, input) {
      assertObject(input, 'SUPPLIER_PORTAL_COMMAND_INVALID', 'Portal command input is invalid');
      assertAllowedFields(input, PORTAL_GRANT_FIELDS, 'SUPPLIER_PORTAL_FIELD_FORBIDDEN');
      return execute(
        commandId,
        `grantSupplierPortalAccess:${actorId}:${supplierCode}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
          const granterMembership = await membership(tx, supplier.brandId, actorId, CAPABILITIES.SUPPLIER_MANAGE);
          // Access is granted to somebody who can already sign in. Creating an account on their behalf
          // would mean choosing a password for a person at another company; until invitations exist,
          // the honest answer is to say the account is not there yet.
          const account = await tx.getAccountByEmail(String(input.email ?? '').trim());
          invariant(account, 'SUPPLIER_PORTAL_ACCOUNT_NOT_FOUND', 'That person has no Syntha account yet', { email: input.email });
          return Object.freeze({ supplier, granterMembership, account, existing: await tx.getPortalGrant(supplierCode, account.id) });
        },
        async (tx, { supplier, granterMembership, account, existing }) => {
          // Re-granting access to someone whose access was revoked is a new decision, not an edit of the
          // old one: the record of the revocation stays readable.
          invariant(!existing || existing.status === 'revoked', 'SUPPLIER_PORTAL_GRANT_EXISTS',
            'This person already has portal access to that supplier', { supplierCode, email: input.email });
          const grant = createSupplierPortalGrantDomain({
            id: existing?.id ?? nextId('supplier-portal-grant'),
            supplier, account, contactName: input.contactName,
            grantedBy: actorId, granterMembership, grantedAt: clock(),
          });
          if (existing) await tx.savePortalGrant({ ...grant, version: existing.version + 1 }, existing.version);
          else await tx.insertPortalGrant(grant);
          const stored = existing ? { ...grant, version: existing.version + 1 } : grant;
          await appendPortalEvent(tx, 'supplier.portal-access-granted', stored, commandId, actorId);
          return stored;
        },
      );
    },

    revokePortalAccess(commandId, actorId, supplierCode, input) {
      assertObject(input, 'SUPPLIER_PORTAL_COMMAND_INVALID', 'Portal command input is invalid');
      assertAllowedFields(input, PORTAL_REVOKE_FIELDS, 'SUPPLIER_PORTAL_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input, 'SUPPLIER_PORTAL_EXPECTED_VERSION_INVALID', 'Expected grant version');
      return execute(
        commandId,
        `revokeSupplierPortalAccess:${actorId}:${supplierCode}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const supplier = requireEntity(await tx.getSupplierByCode(supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode });
          await membership(tx, supplier.brandId, actorId, CAPABILITIES.SUPPLIER_MANAGE);
          return Object.freeze({ grant: requireEntity(await tx.getPortalGrant(supplierCode, String(input.userId ?? '').trim()), 'SUPPLIER_PORTAL_GRANT_NOT_FOUND', { supplierCode, userId: input.userId }) });
        },
        async (tx, { grant }) => {
          assertExpectedVersion(grant, expectedVersion, 'SUPPLIER_PORTAL_GRANT_CONFLICT', { supplierCode });
          const revoked = revokeSupplierPortalGrantDomain(grant, { revokedBy: actorId, revokedAt: clock() });
          await tx.savePortalGrant(revoked, expectedVersion);
          await appendPortalEvent(tx, 'supplier.portal-access-revoked', revoked, commandId, actorId);
          return revoked;
        },
      );
    },

    createRfq(commandId, actorId, input) {
      assertComplete(input, ['rfqCode', 'sku', ...RFQ_EDITABLE], 'RFQ_INPUT_INVALID', 'RFQ_FIELD_REQUIRED');
      assertAllowedFields(input, RFQ_CREATE_FIELDS, 'RFQ_CREATE_FIELD_FORBIDDEN');
      return execute(
        commandId,
        `createRfq:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const catalogSku = requireEntity(await tx.getSku(input.sku), 'CATALOG_SKU_NOT_FOUND', { sku: input.sku });
          await membership(tx, catalogSku.brandId, actorId, CAPABILITIES.SOURCING_MANAGE);
          const bom = requireEntity(await tx.getBomBySku(input.sku), 'BOM_NOT_FOUND', { sku: input.sku });
          const suppliers = await tx.getSuppliersByCodes(input.supplierCodes);
          const existing = await tx.getRfqByCode(input.rfqCode);
          return Object.freeze({ catalogSku, bom, suppliers, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'RFQ_ALREADY_EXISTS', 'RFQ code already exists', { rfqCode: input.rfqCode });
          const rfq = createRfqDomain({ id: nextId('rfq'), catalogSku: context.catalogSku, bom: context.bom, suppliers: context.suppliers, input, createdAt: clock() });
          await tx.insertRfq(rfq);
          await append(tx, 'rfq.created', rfq, commandId, actorId);
          return rfq;
        },
      );
    },

    updateRfq(commandId, actorId, rfqCode, input) {
      assertComplete(input, ['expectedVersion', ...RFQ_EDITABLE], 'RFQ_INPUT_INVALID', 'RFQ_FIELD_REQUIRED');
      return rfqTransition({
        commandName: 'updateRfq', eventType: () => 'rfq.updated', commandId, actorId, rfqCode, input, fields: RFQ_UPDATE_FIELDS,
        prepare: async (tx, rfq, value) => ({ catalogSku: await tx.getSku(rfq.sku), bom: await tx.getBomBySku(rfq.sku), suppliers: await tx.getSuppliersByCodes(value.supplierCodes) }),
        transform: (context, value) => updateDraftRfqDomain(context.rfq, { catalogSku: context.catalogSku, bom: context.bom, suppliers: context.suppliers, input: value, updatedAt: clock() }),
      });
    },

    issueRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'issueRfq', eventType: () => 'rfq.issued', commandId, actorId, rfqCode, input, fields: VERSION_FIELDS,
        prepare: async (tx, rfq) => ({ catalogSku: await tx.getSku(rfq.sku), bom: await tx.getBomBySku(rfq.sku), suppliers: await tx.getSuppliersByCodes(rfq.supplierCodes) }),
        transform: (context) => issueRfqDomain(context.rfq, { catalogSku: context.catalogSku, bom: context.bom, suppliers: context.suppliers, issuedAt: clock() }),
      });
    },

    upsertQuote(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'upsertRfqQuote', eventType: () => 'rfq.quote-received', commandId, actorId, rfqCode, input, fields: QUOTE_FIELDS,
        prepare: async (tx, rfq, value) => ({ supplier: requireEntity(await tx.getSupplierByCode(value.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: value.supplierCode }) }),
        transform: (context, value) => upsertRfqQuoteDomain(context.rfq, { supplier: context.supplier, input: value, receivedAt: clock() }),
      });
    },

    // A counter-offer answers a quotation with the quantity and price the buyer is prepared to place.
    counterQuote(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'counterRfqQuote', eventType: () => 'rfq.quote-countered', commandId, actorId, rfqCode, input, fields: COUNTER_FIELDS,
        prepare: async (tx, rfq, value) => ({ supplier: requireEntity(await tx.getSupplierByCode(value.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: value.supplierCode }) }),
        transform: (context, value) => counterRfqQuoteDomain(context.rfq, {
          supplier: context.supplier,
          input: { quantity: value.quantity, unitPriceMinor: value.unitPriceMinor, notes: value.notes },
          offeredAt: clock(),
          offeredBy: actorId,
        }),
      });
    },

    awardRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'awardRfq', eventType: () => 'rfq.awarded', commandId, actorId, rfqCode, input, fields: AWARD_FIELDS, capability: CAPABILITIES.SOURCING_AWARD,
        prepare: async (tx, rfq, value) => ({ supplier: requireEntity(await tx.getSupplierByCode(value.supplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: value.supplierCode }) }),
        transform: (context) => awardRfqDomain(context.rfq, { supplier: context.supplier, awardedAt: clock() }),
      });
    },

    allocateRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'allocateRfq', eventType: () => 'rfq.allocated', commandId, actorId, rfqCode, input, fields: ALLOCATION_FIELDS, capability: CAPABILITIES.PRODUCTION_ALLOCATE,
        prepare: async (tx, rfq) => ({ supplier: requireEntity(await tx.getSupplierByCode(rfq.selectedSupplierCode), 'SUPPLIER_NOT_FOUND', { supplierCode: rfq.selectedSupplierCode }) }),
        transform: (context, value) => allocateRfqDomain(context.rfq, { supplier: context.supplier, input: value, allocatedAt: clock() }),
      });
    },

    cancelRfq(commandId, actorId, rfqCode, input) {
      return rfqTransition({
        commandName: 'cancelRfq', eventType: () => 'rfq.cancelled', commandId, actorId, rfqCode, input, fields: CANCEL_FIELDS,
        transform: (context, value) => cancelRfqDomain(context.rfq, { reason: value.reason, cancelledAt: clock() }),
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
function withoutExpectedVersion(input) { return withoutFields(input, ['expectedVersion']); }
function withoutFields(input, fields) { const excluded = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => !excluded.has(field)))); }
function assertExpectedVersion(entity, expectedVersion, code, details) { invariant(entity.version === expectedVersion, code, 'Aggregate was changed by another operation', { ...details, expectedVersion, actualVersion: entity.version }); }
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
