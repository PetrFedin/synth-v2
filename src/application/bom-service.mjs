import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createBom, publishBom, updateDraftBom } from '../modules/bom/public.mjs';

const EDITABLE_FIELDS = Object.freeze(['currency', 'lines', 'laborCost', 'overheadCost', 'logisticsCost', 'otherCost', 'notes']);
const REQUIRED_LINE_FIELDS = Object.freeze(['lineId', 'component', 'materialCode', 'quantity', 'wastePercent']);
const UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...EDITABLE_FIELDS]));
const PUBLISH_FIELDS = Object.freeze(new Set(['expectedVersion']));

export function createBomService({ bomStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(bomStore && typeof bomStore.transaction === 'function', 'BOM_STORE_REQUIRED', 'BOM store is required');

  async function authorisedSku(tx, skuCode, actorId) {
    const catalogSku = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
    const membership = await tx.getMembership(catalogSku.brandId, actorId);
    assertCapability(membership, CAPABILITIES.BOM_MANAGE);
    return catalogSku;
  }

  async function materialsForLines(tx, lines) {
    const codes = [...new Set(lines.map((line) => line.materialCode))].sort();
    return tx.getMaterials(codes);
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return bomStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, bom, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: bom.id,
      occurredAt: clock(),
      payload: {
        sku: bom.sku,
        brandId: bom.brandId,
        currency: bom.currency,
        materialCost: bom.materialCost,
        totalCost: bom.totalCost,
        lineCount: bom.lines.length,
        version: bom.version,
        status: bom.status,
      },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    async createBom(commandId, actorId, input) {
      assertCompleteInput(input, { includeSku: true });
      return execute(
        commandId,
        `createBom:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const catalogSku = await authorisedSku(tx, input.sku, actorId);
          return Object.freeze({
            catalogSku,
            materials: await materialsForLines(tx, input.lines),
            existingBom: await tx.getBomBySku(input.sku),
          });
        },
        async (tx, context) => {
          invariant(!context.existingBom, 'BOM_ALREADY_EXISTS', 'BOM already exists for SKU', { sku: context.catalogSku.sku });
          const bom = createBom({ id: nextId('bom'), catalogSku: context.catalogSku, materials: context.materials, input, createdAt: clock() });
          await tx.insertBom(bom);
          await append(tx, 'bom.created', bom, commandId, actorId);
          return bom;
        },
      );
    },

    async updateBom(commandId, actorId, skuCode, input) {
      assertCompleteInput(input, { includeExpectedVersion: true });
      assertAllowedFields(input, UPDATE_FIELDS, 'BOM_UPDATE_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const editable = Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion')));
      return execute(
        commandId,
        `updateBom:${actorId}:${skuCode}:${canonicalJson({ expectedVersion, ...editable })}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getBomBySku(skuCode), 'BOM_NOT_FOUND', { sku: skuCode });
          const catalogSku = await authorisedSku(tx, skuCode, actorId);
          return Object.freeze({ locked, catalogSku, materials: await materialsForLines(tx, editable.lines) });
        },
        async (tx, context) => {
          assertExpectedVersion(context.locked, expectedVersion);
          const updated = updateDraftBom(context.locked, { catalogSku: context.catalogSku, materials: context.materials, input: editable, updatedAt: clock() });
          if (updated === context.locked) return context.locked;
          await tx.saveBom(updated, expectedVersion);
          await append(tx, 'bom.updated', updated, commandId, actorId);
          return updated;
        },
      );
    },

    async publishBom(commandId, actorId, skuCode, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'BOM_PUBLISH_INVALID', 'BOM publication request is invalid');
      assertAllowedFields(input, PUBLISH_FIELDS, 'BOM_PUBLISH_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      return execute(
        commandId,
        `publishBom:${actorId}:${skuCode}:${expectedVersion}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getBomBySku(skuCode), 'BOM_NOT_FOUND', { sku: skuCode });
          const catalogSku = await authorisedSku(tx, skuCode, actorId);
          return Object.freeze({
            locked,
            catalogSku,
            materials: await tx.getMaterials([...new Set(locked.lines.map((line) => line.materialCode))].sort()),
          });
        },
        async (tx, context) => {
          assertExpectedVersion(context.locked, expectedVersion);
          const published = publishBom(context.locked, { catalogSku: context.catalogSku, materials: context.materials, publishedAt: clock() });
          await tx.saveBom(published, expectedVersion);
          await append(tx, 'bom.published', published, commandId, actorId);
          return published;
        },
      );
    },
  });
}

function assertCompleteInput(input, { includeSku = false, includeExpectedVersion = false } = {}) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'BOM_INPUT_INVALID', 'BOM input is invalid');
  const required = [...(includeSku ? ['sku'] : []), ...(includeExpectedVersion ? ['expectedVersion'] : []), ...EDITABLE_FIELDS];
  const missingFields = required.filter((field) => !Object.hasOwn(input, field)).sort();
  invariant(missingFields.length === 0, 'BOM_FIELD_REQUIRED', 'BOM request is missing required fields', { missingFields });
  invariant(Array.isArray(input.lines), 'BOM_LINES_INVALID', 'BOM lines must be an array');
  input.lines.forEach((line, index) => {
    invariant(line && typeof line === 'object' && !Array.isArray(line), 'BOM_LINE_INVALID', 'BOM line must be an object', { index });
    const missingLineFields = REQUIRED_LINE_FIELDS.filter((field) => !Object.hasOwn(line, field)).sort();
    invariant(missingLineFields.length === 0, 'BOM_LINE_FIELD_REQUIRED', 'BOM line is missing required fields', { index, missingFields: missingLineFields });
  });
}
function expectedVersionOf(input) {
  return assertPostgresInteger(input.expectedVersion, { code: 'BOM_EXPECTED_VERSION_INVALID', label: 'Expected BOM version', min: 1 });
}
function assertAllowedFields(input, allowed, code) {
  const forbidden = Object.keys(input).filter((field) => !allowed.has(field)).sort();
  invariant(forbidden.length === 0, code, 'BOM request contains a forbidden field', { fields: forbidden });
}
function assertExpectedVersion(bom, expectedVersion) {
  invariant(bom.version === expectedVersion, 'BOM_CONCURRENCY_CONFLICT', 'BOM was changed by another operation', { sku: bom.sku, expectedVersion, actualVersion: bom.version });
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
