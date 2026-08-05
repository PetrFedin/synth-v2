import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  acknowledgeTechPack as acknowledgeTechPackDomain,
  createTechPack as createTechPackDomain,
  createTechPackRevision as createRevisionDomain,
  issueTechPack as issueTechPackDomain,
  supersedeTechPack,
  updateDraftTechPack,
  withdrawTechPack as withdrawTechPackDomain,
} from '../modules/tech-packs/public.mjs';

const ACK_FIELDS = Object.freeze(new Set(['expectedVersion', 'supplierCode', 'acknowledgementReference', 'acknowledgedBy', 'notes']));

export function createTechPackService({ techPackStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(techPackStore && typeof techPackStore.transaction === 'function', 'TECH_PACK_STORE_REQUIRED', 'Tech pack store is required');

  async function contextForSku(tx, sku, actorId) {
    const catalogSku = requireEntity(await tx.getSku(sku), 'CATALOG_SKU_NOT_FOUND', { sku });
    assertCapability(await tx.getMembership(catalogSku.brandId, actorId), CAPABILITIES.TECH_PACK_MANAGE);
    return catalogSku;
  }

  async function contextForPack(tx, code, actorId, capability = CAPABILITIES.TECH_PACK_MANAGE) {
    const techPack = requireEntity(await tx.getTechPackByCode(code), 'TECH_PACK_NOT_FOUND', { techPackCode: code });
    assertCapability(await tx.getMembership(techPack.brandId, actorId), capability);
    const catalogSku = requireEntity(await tx.getSku(techPack.sku), 'CATALOG_SKU_NOT_FOUND', { sku: techPack.sku });
    return Object.freeze({ techPack, catalogSku });
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return techPackStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, value, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(),
      payload: { techPackCode: value.techPackCode, sku: value.sku, brandId: value.brandId, supplierCode: value.supplierCode, revision: value.revision, status: value.status, version: value.version, sourceTechPackCode: value.sourceTechPackCode },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createTechPack(commandId, actorId, input) {
      return execute(commandId, `createTechPack:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => Object.freeze({ catalogSku: await contextForSku(tx, input?.sku, actorId), existing: await tx.getTechPackByCode(input?.techPackCode) }),
        async (tx, context) => {
          invariant(!context.existing, 'TECH_PACK_ALREADY_EXISTS', 'Tech pack already exists', { techPackCode: input?.techPackCode });
          const value = createTechPackDomain({ id: nextId('tech-pack'), catalogSku: context.catalogSku, input, createdAt: clock() });
          await tx.insertTechPack(value); await append(tx, 'tech-pack.created', value, commandId, actorId); return value;
        });
    },

    updateTechPack(commandId, actorId, code, input) {
      return execute(commandId, `updateTechPack:${actorId}:${code}:${canonicalJson(input)}`, actorId,
        (tx) => contextForPack(tx, code, actorId),
        async (tx, context) => {
          assertVersion(context.techPack, input?.expectedVersion);
          const editable = without(input, ['expectedVersion']);
          const value = updateDraftTechPack(context.techPack, { catalogSku: context.catalogSku, input: editable, updatedAt: clock() });
          if (value === context.techPack) return value;
          await tx.saveTechPack(value, input.expectedVersion); await append(tx, 'tech-pack.updated', value, commandId, actorId); return value;
        });
    },

    issueTechPack(commandId, actorId, code, input) {
      return execute(commandId, `issueTechPack:${actorId}:${code}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const context = await contextForPack(tx, code, actorId);
          return Object.freeze({
            ...context,
            bom: await tx.getBomBySku(context.techPack.sku),
            measurementChart: await tx.getMeasurementBySku(context.techPack.sku),
            approvedSample: await tx.getApprovedPpsBySkuAndSupplier(context.techPack.sku, context.techPack.supplierCode),
            currentActive: await tx.getActiveTechPackBySku(context.techPack.sku),
          });
        },
        async (tx, context) => {
          assertVersion(context.techPack, input?.expectedVersion);
          invariant(context.techPack.supplierCode, 'TECH_PACK_SUPPLIER_REQUIRED', 'Supplier code, name and email are required before issue');
          invariant(context.approvedSample, 'TECH_PACK_APPROVED_PPS_NOT_FOUND', 'An approved pre-production sample from the Tech Pack supplier is required before issue', { sku: context.techPack.sku, supplierCode: context.techPack.supplierCode });
          invariant(!context.currentActive || context.currentActive.id === context.techPack.id || context.techPack.sourceTechPackCode === context.currentActive.techPackCode, 'TECH_PACK_ACTIVE_ISSUE_EXISTS', 'A different issued or acknowledged tech pack is already active for this SKU');
          const issued = issueTechPackDomain(context.techPack, { catalogSku: context.catalogSku, bom: context.bom, measurementChart: context.measurementChart, approvedSample: context.approvedSample, actorId, issuedAt: clock() });
          const value = Object.freeze({ ...issued, dependencySnapshot: Object.freeze({ skuVersion: context.catalogSku.version, bomId: context.bom.id, bomVersion: context.bom.version, measurementChartId: context.measurementChart.id, measurementChartVersion: context.measurementChart.version, sampleCode: context.approvedSample.sampleCode, sampleVersion: context.approvedSample.version }) });
          if (context.currentActive && context.currentActive.id !== context.techPack.id) {
            const replaced = supersedeTechPack(context.currentActive, { supersededAt: value.issuedAt });
            await tx.saveTechPack(replaced, context.currentActive.version);
            await append(tx, 'tech-pack.superseded', replaced, commandId, actorId);
          }
          await tx.saveTechPack(value, input.expectedVersion); await append(tx, 'tech-pack.issued', value, commandId, actorId); return value;
        });
    },

    acknowledgeTechPack(commandId, actorId, code, input) {
      assertObject(input, 'TECH_PACK_ACK_INPUT_INVALID', 'Tech pack acknowledgement input is invalid');
      assertAllowedFields(input, ACK_FIELDS, 'TECH_PACK_ACK_FIELD_FORBIDDEN');
      return execute(commandId, `acknowledgeTechPack:${actorId}:${code}:${canonicalJson(input)}`, actorId,
        (tx) => contextForPack(tx, code, actorId, CAPABILITIES.TECH_PACK_ACKNOWLEDGE),
        async (tx, context) => {
          assertVersion(context.techPack, input.expectedVersion);
          const value = acknowledgeTechPackDomain(context.techPack, { supplierCode: input.supplierCode, acknowledgementReference: input.acknowledgementReference, acknowledgedBy: input.acknowledgedBy, notes: input.notes, acknowledgedAt: clock() });
          await tx.saveTechPack(value, input.expectedVersion); await append(tx, 'tech-pack.acknowledged', value, commandId, actorId); return value;
        });
    },

    createRevision(commandId, actorId, code, input) {
      return execute(commandId, `createTechPackRevision:${actorId}:${code}:${canonicalJson(input)}`, actorId,
        async (tx) => { const context = await contextForPack(tx, code, actorId); return Object.freeze({ ...context, existing: await tx.getTechPackBySource(code) }); },
        async (tx, context) => {
          assertVersion(context.techPack, input?.expectedVersion);
          invariant(!context.existing, 'TECH_PACK_REVISION_EXISTS', 'A revision already exists for this tech pack');
          const value = createRevisionDomain({ id: nextId('tech-pack'), issuedTechPack: context.techPack, catalogSku: context.catalogSku, input: without(input, ['expectedVersion']), createdAt: clock() });
          await tx.insertTechPack(value); await append(tx, 'tech-pack.revision-created', value, commandId, actorId); return value;
        });
    },

    withdrawTechPack(commandId, actorId, code, input) {
      return execute(commandId, `withdrawTechPack:${actorId}:${code}:${canonicalJson(input)}`, actorId,
        (tx) => contextForPack(tx, code, actorId),
        async (tx, context) => {
          assertVersion(context.techPack, input?.expectedVersion);
          const value = withdrawTechPackDomain(context.techPack, { reason: input?.reason, withdrawnAt: clock() });
          await tx.saveTechPack(value, input.expectedVersion); await append(tx, 'tech-pack.withdrawn', value, commandId, actorId); return value;
        });
    },
  });
}

function assertVersion(value, expectedVersion) { invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'TECH_PACK_EXPECTED_VERSION_INVALID', 'Expected tech pack version is invalid'); invariant(value.version === expectedVersion, 'TECH_PACK_CONCURRENCY_CONFLICT', 'Tech pack was changed by another operation', { techPackCode: value.techPackCode, expectedVersion, actualVersion: value.version }); }
function without(value, fields) { const blocked = new Set(fields); return Object.freeze(Object.fromEntries(Object.entries(value || {}).filter(([key]) => !blocked.has(key)))); }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(value, allowed, code) { const fields = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(fields.length === 0, code, 'Tech pack acknowledgement contains unsupported fields', { fields }); }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
