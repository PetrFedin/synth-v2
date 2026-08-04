import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createTechPack as createTechPackDomain,
  createTechPackRevision as createRevisionDomain,
  issueTechPack as issueTechPackDomain,
  supersedeTechPack,
  updateDraftTechPack,
  withdrawTechPack as withdrawTechPackDomain,
} from '../modules/tech-packs/public.mjs';

export function createTechPackService({ techPackStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(techPackStore && typeof techPackStore.transaction === 'function', 'TECH_PACK_STORE_REQUIRED', 'Tech pack store is required');

  async function contextForSku(tx, sku, actorId) {
    const catalogSku = requireEntity(await tx.getSku(sku), 'CATALOG_SKU_NOT_FOUND', { sku });
    assertCapability(await tx.getMembership(catalogSku.brandId, actorId), CAPABILITIES.TECH_PACK_MANAGE);
    return catalogSku;
  }

  async function contextForPack(tx, code, actorId) {
    const techPack = requireEntity(await tx.getTechPackByCode(code), 'TECH_PACK_NOT_FOUND', { techPackCode: code });
    assertCapability(await tx.getMembership(techPack.brandId, actorId), CAPABILITIES.TECH_PACK_MANAGE);
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
      payload: { techPackCode: value.techPackCode, sku: value.sku, brandId: value.brandId, revision: value.revision, status: value.status, version: value.version, sourceTechPackCode: value.sourceTechPackCode },
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
          return Object.freeze({ ...context, bom: await tx.getBomBySku(context.techPack.sku), measurementChart: await tx.getMeasurementBySku(context.techPack.sku), approvedSample: await tx.getApprovedSampleBySku(context.techPack.sku), currentIssued: await tx.getIssuedTechPackBySku(context.techPack.sku) });
        },
        async (tx, context) => {
          assertVersion(context.techPack, input?.expectedVersion);
          invariant(!context.currentIssued || context.currentIssued.id === context.techPack.id || context.techPack.sourceTechPackCode === context.currentIssued.techPackCode, 'TECH_PACK_ACTIVE_ISSUE_EXISTS', 'A different issued tech pack is already active for this SKU');
          const issued = issueTechPackDomain(context.techPack, { catalogSku: context.catalogSku, bom: context.bom, measurementChart: context.measurementChart, approvedSample: context.approvedSample, actorId, issuedAt: clock() });
          const value = Object.freeze({ ...issued, dependencySnapshot: Object.freeze({ skuVersion: context.catalogSku.version, bomId: context.bom.id, bomVersion: context.bom.version, measurementChartId: context.measurementChart.id, measurementChartVersion: context.measurementChart.version, sampleCode: context.approvedSample.sampleCode, sampleVersion: context.approvedSample.version }) });
          if (context.currentIssued && context.currentIssued.id !== context.techPack.id) {
            const replaced = supersedeTechPack(context.currentIssued, { supersededAt: value.issuedAt });
            await tx.saveTechPack(replaced, context.currentIssued.version);
            await append(tx, 'tech-pack.superseded', replaced, commandId, actorId);
          }
          await tx.saveTechPack(value, input.expectedVersion); await append(tx, 'tech-pack.issued', value, commandId, actorId); return value;
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
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
