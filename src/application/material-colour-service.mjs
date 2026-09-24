import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  cancelLabDip,
  decideLabDip,
  effectiveLabDip,
  labDipPerformance,
  materialColour,
  requestLabDip,
  submitLabDip,
} from '../modules/material-colours/public.mjs';

const COLOUR_FIELDS = Object.freeze(new Set(['materialCode', 'colourCode', 'supplierColourReference']));
const REQUEST_FIELDS = Object.freeze(new Set(['materialColourId', 'dipReference', 'supplierCode', 'campaignId', 'validFrom', 'validTo', 'notes']));
const SUBMIT_FIELDS = Object.freeze(new Set(['expectedVersion', 'notes']));
const DECIDE_FIELDS = Object.freeze(new Set(['expectedVersion', 'verdict', 'note']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

/**
 * Цвет материала и его утверждение.
 *
 * Права разведены по смыслу, а не по удобству: палитру ведёт тот, кто отвечает за материалы, а
 * решение по образцу выносит контроль качества — это решение о том, годится ли оттенок, и оно
 * той же природы, что и выпуск партии из карантина.
 */
/** @param {{ store?: any, clock?: () => string, nextId?: (prefix: string) => string }} [options] */
export function createMaterialColourService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'MATERIAL_COLOUR_STORE_REQUIRED', 'Material colour store is required');

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
    invariant(membership.organisationType === 'brand', 'MATERIAL_COLOUR_BRAND_MEMBERSHIP_REQUIRED', 'A brand membership is required', { brandId, actorId });
  }

  async function dipContext(tx, dipId, actorId) {
    const dip = requireEntity(await tx.getLabDipById(dipId), 'LAB_DIP_NOT_FOUND', { dipId });
    await authorize(tx, dip.brandId, actorId, CAPABILITIES.QUALITY_MANAGE);
    return dip;
  }

  async function saveDip(tx, value, expectedVersion, type, commandId, actorId) {
    await tx.saveLabDip(value, expectedVersion);
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(),
      payload: { brandId: value.brandId, materialCode: value.materialCode, colourCode: value.colourCode, status: value.status, submissionRound: value.submissionRound },
      metadata: { commandId, actorId },
    }));
    return value;
  }

  return Object.freeze({
    addMaterialColour(commandId, actorId, input) {
      validateInput(input, COLOUR_FIELDS, 'MATERIAL_COLOUR_INPUT_INVALID');
      return execute(commandId, `addMaterialColour:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const material = requireEntity(await tx.getMaterialByCode(input.materialCode), 'MATERIAL_NOT_FOUND', { materialCode: input.materialCode });
          await authorize(tx, material.brandId, actorId, CAPABILITIES.CATALOG_MANAGE);
          const colour = requireEntity(await tx.resolveGovernedColour(input.colourCode), 'MATERIAL_COLOUR_NOT_IN_DICTIONARY', { colourCode: input.colourCode });
          return Object.freeze({ material, colour, position: await tx.nextColourPosition(material.code) });
        },
        async (tx, { material, colour, position }) => {
          const value = materialColour({
            id: nextId('material-colour'), material, colour,
            supplierColourReference: input.supplierColourReference ?? null,
            position, createdAt: clock(), actorId,
          });
          await tx.insertMaterialColour(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'material-colour.added', aggregateId: value.id, occurredAt: clock(),
            payload: { brandId: value.brandId, materialCode: value.materialCode, colourCode: value.colourCode },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    requestLabDip(commandId, actorId, input) {
      validateInput(input, REQUEST_FIELDS, 'LAB_DIP_INPUT_INVALID');
      return execute(commandId, `requestLabDip:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const colour = requireEntity(await tx.getMaterialColourById(input.materialColourId), 'MATERIAL_COLOUR_NOT_FOUND', { materialColourId: input.materialColourId });
          await authorize(tx, colour.brandId, actorId, CAPABILITIES.CATALOG_MANAGE);
          return colour;
        },
        async (tx, colour) => {
          const value = requestLabDip({
            id: nextId('lab-dip'), materialColour: colour,
            dipReference: input.dipReference, supplierCode: input.supplierCode,
            campaignId: input.campaignId ?? null, validFrom: input.validFrom ?? null, validTo: input.validTo ?? null,
            notes: input.notes ?? null, at: clock(), actorId,
          });
          await tx.insertLabDip(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'lab-dip.requested', aggregateId: value.id, occurredAt: clock(),
            payload: { brandId: value.brandId, materialCode: value.materialCode, colourCode: value.colourCode, supplierCode: value.supplierCode },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    submitLabDip(commandId, actorId, dipId, input) {
      validateInput(input, SUBMIT_FIELDS, 'LAB_DIP_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `submitLabDip:${actorId}:${dipId}:${canonicalJson(input)}`, actorId,
        (tx) => dipContext(tx, dipId, actorId),
        (tx, dip) => {
          assertVersion(dip, expectedVersion);
          return saveDip(tx, submitLabDip(dip, { at: clock(), actorId, notes: input.notes ?? null }), expectedVersion, 'lab-dip.submitted', commandId, actorId);
        });
    },

    decideLabDip(commandId, actorId, dipId, input) {
      validateInput(input, DECIDE_FIELDS, 'LAB_DIP_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `decideLabDip:${actorId}:${dipId}:${canonicalJson(input)}`, actorId,
        (tx) => dipContext(tx, dipId, actorId),
        (tx, dip) => {
          assertVersion(dip, expectedVersion);
          return saveDip(tx, decideLabDip(dip, { verdict: input.verdict, note: input.note ?? null, at: clock(), actorId }), expectedVersion, 'lab-dip.decided', commandId, actorId);
        });
    },

    cancelLabDip(commandId, actorId, dipId, input) {
      validateInput(input, CANCEL_FIELDS, 'LAB_DIP_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `cancelLabDip:${actorId}:${dipId}:${canonicalJson(input)}`, actorId,
        (tx) => dipContext(tx, dipId, actorId),
        (tx, dip) => {
          assertVersion(dip, expectedVersion);
          return saveDip(tx, cancelLabDip(dip, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'lab-dip.cancelled', commandId, actorId);
        });
    },
  });
}

/**
 * Чтение: палитра полотна, её образцы и то, какой оттенок сейчас эталон.
 *
 * «Действующий эталон» вычисляется при чтении, а не хранится флагом: флаг пришлось бы снимать
 * вручную в день окончания срока, и однажды его бы не сняли.
 */
/** @param {{ reader?: any, clock?: () => string }} [options] */
export function createMaterialColourQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.paletteForActor === 'function', 'MATERIAL_COLOUR_READER_REQUIRED', 'Material colour reader is required');
  return Object.freeze({
    async materialPaletteForActor(actorId, materialCode) {
      const rows = await reader.paletteForActor(actorId, materialCode);
      invariant(Array.isArray(rows), 'MATERIAL_COLOUR_LISTING_INVALID', 'Palette listing is invalid');
      const at = clock();
      return Object.freeze(rows.map((row) => {
        // Неоднозначный эталон — это отказ домена, а не поломка экрана: палитра показывает его
        // как требующий решения, иначе страница материала перестала бы открываться целиком.
        let standard = null;
        let ambiguous = false;
        try {
          standard = effectiveLabDip(row.labDips, { materialCode: row.colour.materialCode, colourCode: row.colour.colourCode, at });
        } catch (error) {
          if (error?.code !== 'LAB_DIP_STANDARD_AMBIGUOUS') throw error;
          ambiguous = true;
        }
        return Object.freeze({
          ...row.colour,
          labDips: Object.freeze(row.labDips),
          effectiveStandard: standard,
          standardAmbiguous: ambiguous,
          approvedForBulk: standard !== null,
          performance: labDipPerformance(row.labDips),
        });
      }));
    },
  });
}

function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'LAB_DIP_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function assertVersion(dip, expectedVersion) {
  invariant(dip.version === expectedVersion, 'LAB_DIP_CONCURRENCY_CONFLICT', 'This lab dip was changed by another operation', { dipReference: dip.dipReference, expectedVersion, actualVersion: dip.version });
}
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
