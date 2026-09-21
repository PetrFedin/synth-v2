import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { amendMaterialSpecification, createMaterial, materialComposition, publishMaterial, updateDraftMaterial } from '../modules/materials/public.mjs';


export function createMaterialService({ materialStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(materialStore && typeof materialStore.transaction === 'function', 'MATERIAL_STORE_REQUIRED', 'Material store is required');

  async function authorisedBrand(tx, brandId, actorId) {
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
    return brandId;
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return materialStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    async createMaterial(commandId, actorId, input) {
      return execute(
        commandId,
        `createMaterial:${actorId}:${canonicalJson(input)}`,
        actorId,
        (tx) => authorisedBrand(tx, input.brandId, actorId),
        async (tx) => {
          invariant(!await tx.getMaterial(input.code), 'MATERIAL_ALREADY_EXISTS', 'Material already exists', { code: input.code });
          const material = createMaterial({ ...input, createdAt: clock() });
          await tx.insertMaterial(material);
          await append(tx, 'material.created', material.code, { brandId: material.brandId, type: material.type, unit: material.unit }, commandId, actorId);
          return material;
        },
      );
    },

    async updateMaterial(commandId, actorId, code, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_UPDATE_INVALID', 'Material update is invalid');
      assertAllowedFields(input, MATERIAL_UPDATE_FIELDS);
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'MATERIAL_EXPECTED_VERSION_INVALID', label: 'Expected material version', min: 1 });
      const editable = Object.freeze(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expectedVersion')));
      return execute(
        commandId,
        `updateMaterial:${actorId}:${code}:${canonicalJson({ expectedVersion, ...editable })}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getMaterial(code), 'MATERIAL_NOT_FOUND', { code });
          await authorisedBrand(tx, locked.brandId, actorId);
          return locked;
        },
        async (tx, locked) => {
          assertExpectedVersion(locked, expectedVersion);
          const updated = updateDraftMaterial(locked, editable, clock());
          if (updated === locked) return locked;
          await tx.saveMaterial(updated, expectedVersion);
          await append(tx, 'material.updated', code, { brandId: updated.brandId, version: updated.version, type: updated.type, unit: updated.unit, unitCost: updated.unitCost, availableToUse: updated.availableToUse }, commandId, actorId);
          return updated;
        },
      );
    },

    async amendMaterialSpecification(commandId, actorId, code, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_SPECIFICATION_INVALID', 'Specification request is invalid');
      assertAllowedFields(input, MATERIAL_SPECIFICATION_FIELDS);
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'MATERIAL_EXPECTED_VERSION_INVALID', label: 'Expected material version', min: 1 });
      const specification = Object.freeze(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'expectedVersion')));
      return execute(
        commandId,
        `amendMaterialSpecification:${actorId}:${code}:${canonicalJson({ expectedVersion, ...specification })}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getMaterial(code), 'MATERIAL_NOT_FOUND', { code });
          await authorisedBrand(tx, locked.brandId, actorId);
          return locked;
        },
        async (tx, locked) => {
          assertExpectedVersion(locked, expectedVersion);
          const amended = amendMaterialSpecification(locked, specification, clock());
          if (amended === locked) return locked;
          await tx.saveMaterial(amended, expectedVersion);
          await append(tx, 'material.specification-amended', code, {
            brandId: amended.brandId, version: amended.version,
            cuttableWidth: amended.specification?.cuttableWidth ?? null,
            cuttableWidthUnit: amended.specification?.cuttableWidthUnit ?? null,
            weightGsm: amended.specification?.weightGsm ?? null,
          }, commandId, actorId);
          return amended;
        },
      );
    },

    /**
     * Состав материала — целиком, а не построчно.
     *
     * Состав правят набором: заменить 100 % хлопка на 60/40 нельзя, не пройдя через промежуточную
     * сумму, которая ни во что не складывается. Поэтому команда принимает весь состав и заменяет
     * прежний; база держит сумму отложенной проверкой ровно по той же причине.
     */
    async setMaterialComposition(commandId, actorId, code, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_COMPOSITION_INVALID', 'Composition request is invalid');
      assertAllowedFields(input, MATERIAL_COMPOSITION_FIELDS);
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'MATERIAL_EXPECTED_VERSION_INVALID', label: 'Expected material version', min: 1 });
      return execute(
        commandId,
        `setMaterialComposition:${actorId}:${code}:${canonicalJson({ expectedVersion, lines: input.lines })}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getMaterial(code), 'MATERIAL_NOT_FOUND', { code });
          await authorisedBrand(tx, locked.brandId, actorId);
          return locked;
        },
        async (tx, locked) => {
          assertExpectedVersion(locked, expectedVersion);
          // Волокна разрешаются в governed-справочнике до записи: строка состава ссылается на
          // запись с её версией, поэтому переименование волокна не переписывает задним числом то,
          // что уже напечатано на этикетке.
          const resolved = await tx.resolveFibres((input.lines ?? []).map((line) => line?.fibreCode));
          const lines = materialComposition((input.lines ?? []).map((line) => ({
            fibreCode: line?.fibreCode,
            percentage: line?.percentage,
            fibreRef: resolved.get(String(line?.fibreCode ?? '').trim().toUpperCase()) ?? null,
          })));
          await tx.replaceMaterialComposition(locked, lines, { at: clock(), actorId, nextId });
          await append(tx, 'material.composition-set', code, {
            brandId: locked.brandId,
            fibres: lines.map((line) => ({ fibreCode: line.fibreCode, percentage: line.percentage })),
          }, commandId, actorId);
          return Object.freeze({ code, brandId: locked.brandId, lines });
        },
      );
    },

    async publishMaterial(commandId, actorId, code, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'MATERIAL_PUBLISH_INVALID', 'Material publication request is invalid');
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'MATERIAL_EXPECTED_VERSION_INVALID', label: 'Expected material version', min: 1 });
      return execute(
        commandId,
        `publishMaterial:${actorId}:${code}:${expectedVersion}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getMaterial(code), 'MATERIAL_NOT_FOUND', { code });
          await authorisedBrand(tx, locked.brandId, actorId);
          return locked;
        },
        async (tx, locked) => {
          assertExpectedVersion(locked, expectedVersion);
          const published = publishMaterial(locked, clock());
          await tx.saveMaterial(published, expectedVersion);
          await append(tx, 'material.published', code, { brandId: published.brandId, version: published.version, type: published.type, unit: published.unit }, commandId, actorId);
          return published;
        },
      );
    },
  });
}

const MATERIAL_COMPOSITION_FIELDS = Object.freeze(new Set(['expectedVersion', 'lines']));
const MATERIAL_SPECIFICATION_FIELDS = Object.freeze(new Set([
  'expectedVersion', 'weightGsm', 'cuttableWidth', 'cuttableWidthUnit', 'countryOfOrigin',
  'purchaseUnit', 'conversionFactor', 'materialSubtype',
]));
const MATERIAL_UPDATE_FIELDS = Object.freeze(new Set([
  'expectedVersion', 'name', 'type', 'unit', 'supplierName', 'supplierReference',
  'composition', 'color', 'currency', 'unitCost', 'minimumOrderQuantity', 'availableQuantity',
  'weightGsm', 'cuttableWidth', 'cuttableWidthUnit', 'countryOfOrigin', 'purchaseUnit', 'conversionFactor', 'materialSubtype',
]));

function assertAllowedFields(input, allowed = MATERIAL_UPDATE_FIELDS) {
  const forbidden = Object.keys(input).filter((field) => !allowed.has(field));
  invariant(forbidden.length === 0, 'MATERIAL_UPDATE_FIELD_FORBIDDEN', 'Material update contains a forbidden field', { fields: forbidden.sort() });
}

function assertExpectedVersion(material, expectedVersion) {
  invariant(material.version === expectedVersion, 'MATERIAL_CONCURRENCY_CONFLICT', 'Material was changed by another operation', {
    code: material.code, expectedVersion, actualVersion: material.version,
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
