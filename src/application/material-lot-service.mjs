import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  executionTraceability,
  issueMaterialLot,
  quarantineMaterialLot,
  receiveMaterialLot,
  rejectMaterialLot,
  releaseMaterialLot,
} from '../modules/material-lots/public.mjs';

const RECEIVE_FIELDS = Object.freeze(new Set(['materialCode', 'lotReference', 'dyeLot', 'supplierCode', 'receivedQuantity', 'certificateReference', 'notes']));
const VERDICT_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason', 'certificateReference', 'notes']));
const ISSUE_FIELDS = Object.freeze(new Set(['expectedVersion', 'executionCode', 'quantity', 'notes']));

export function createMaterialLotService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'MATERIAL_LOT_STORE_REQUIRED', 'Material lot store is required');

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
    invariant(membership.organisationType === 'brand', 'MATERIAL_LOT_BRAND_MEMBERSHIP_REQUIRED', 'Material lots require a brand membership', { brandId, actorId });
  }

  // Приёмка и выдача — движение склада; выпуск из карантина, возврат и отклонение — входной контроль.
  // Это разные люди, и права разные, потому что решение «годится» принимает не тот, кто принял груз.
  async function lotContext(tx, lotId, actorId, capability) {
    const lot = requireEntity(await tx.getLotById(lotId), 'MATERIAL_LOT_NOT_FOUND', { lotId });
    await authorize(tx, lot.brandId, actorId, capability);
    return lot;
  }

  async function saveVerdict(tx, value, expectedVersion, type, commandId, actorId, extra = {}) {
    await tx.saveLot(value, expectedVersion);
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(),
      payload: { brandId: value.brandId, materialCode: value.materialCode, lotReference: value.lotReference, status: value.status, ...extra },
      metadata: { commandId, actorId },
    }));
    return value;
  }

  return Object.freeze({
    receiveLot(commandId, actorId, input) {
      validateInput(input, RECEIVE_FIELDS, 'MATERIAL_LOT_INPUT_INVALID');
      return execute(commandId, `receiveMaterialLot:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const material = requireEntity(await tx.getMaterialByCode(input.materialCode), 'MATERIAL_NOT_FOUND', { materialCode: input.materialCode });
          await authorize(tx, material.brandId, actorId, CAPABILITIES.INVENTORY_MANAGE);
          return material;
        },
        async (tx, material) => {
          const value = receiveMaterialLot({ id: nextId('material-lot'), material, input, receivedAt: clock(), actorId });
          await tx.insertLot(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'material-lot.received', aggregateId: value.id, occurredAt: clock(),
            payload: { brandId: value.brandId, materialCode: value.materialCode, lotReference: value.lotReference, dyeLot: value.dyeLot, receivedQuantity: value.receivedQuantity, unit: value.unit },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    releaseLot(commandId, actorId, lotId, input) {
      validateInput(input, VERDICT_FIELDS, 'MATERIAL_LOT_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `releaseMaterialLot:${actorId}:${lotId}:${canonicalJson(input)}`, actorId,
        (tx) => lotContext(tx, lotId, actorId, CAPABILITIES.QUALITY_MANAGE),
        (tx, lot) => {
          assertVersion(lot, expectedVersion);
          return saveVerdict(tx, releaseMaterialLot(lot, { certificateReference: input.certificateReference, notes: input.notes, at: clock(), actorId }), expectedVersion, 'material-lot.released', commandId, actorId);
        });
    },

    quarantineLot(commandId, actorId, lotId, input) {
      validateInput(input, VERDICT_FIELDS, 'MATERIAL_LOT_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `quarantineMaterialLot:${actorId}:${lotId}:${canonicalJson(input)}`, actorId,
        (tx) => lotContext(tx, lotId, actorId, CAPABILITIES.QUALITY_MANAGE),
        (tx, lot) => {
          assertVersion(lot, expectedVersion);
          return saveVerdict(tx, quarantineMaterialLot(lot, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'material-lot.quarantined', commandId, actorId, { reason: input.reason });
        });
    },

    rejectLot(commandId, actorId, lotId, input) {
      validateInput(input, VERDICT_FIELDS, 'MATERIAL_LOT_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `rejectMaterialLot:${actorId}:${lotId}:${canonicalJson(input)}`, actorId,
        (tx) => lotContext(tx, lotId, actorId, CAPABILITIES.QUALITY_MANAGE),
        (tx, lot) => {
          assertVersion(lot, expectedVersion);
          return saveVerdict(tx, rejectMaterialLot(lot, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'material-lot.rejected', commandId, actorId, { reason: input.reason });
        });
    },

    issueLot(commandId, actorId, lotId, input) {
      validateInput(input, ISSUE_FIELDS, 'MATERIAL_LOT_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `issueMaterialLot:${actorId}:${lotId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const lot = await lotContext(tx, lotId, actorId, CAPABILITIES.INVENTORY_MANAGE);
          const execution = requireEntity(await tx.getExecutionByCode(input.executionCode), 'PRODUCTION_EXECUTION_NOT_FOUND', { executionCode: input.executionCode });
          // Уже выданное в эту же партию читается здесь, чтобы правка выдачи считала остаток без
          // самой себя — иначе исправить однажды выданное было бы нельзя.
          const existing = await tx.getIssue(lot.id, execution.id);
          return Object.freeze({ lot, execution, alreadyIssuedToExecution: existing ? Number(existing.quantity) : 0 });
        },
        async (tx, { lot, execution, alreadyIssuedToExecution }) => {
          assertVersion(lot, expectedVersion);
          const { lot: value, issue } = issueMaterialLot(lot, { execution, quantity: input.quantity, notes: input.notes, issuedAt: clock(), actorId, alreadyIssuedToExecution });
          await tx.upsertIssue(nextId('material-issue'), issue);
          await tx.saveLot(value, expectedVersion);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'material-lot.issued', aggregateId: value.id, occurredAt: clock(),
            payload: { brandId: value.brandId, materialCode: value.materialCode, lotReference: value.lotReference, dyeLot: value.dyeLot, executionCode: issue.executionCode, quantity: issue.quantity, unit: value.unit },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },
  });
}

export function createMaterialLotQueryService({ reader } = {}) {
  invariant(reader && typeof reader.lotsForActor === 'function' && typeof reader.traceabilityInputs === 'function', 'MATERIAL_LOT_READER_REQUIRED', 'Material lot reader is required');
  return Object.freeze({
    async materialLotsForActor(actorId) {
      const lots = await reader.lotsForActor(actorId);
      invariant(Array.isArray(lots), 'MATERIAL_LOT_LISTING_INVALID', 'Material lot listing is invalid');
      // Куда ушёл рулон — это и есть ответ на отзыв партии, поэтому выдачи едут вместе со списком.
      return Object.freeze(lots.map((row) => Object.freeze({ ...row.lot, remainingQuantity: round4(row.lot.receivedQuantity - row.lot.issuedQuantity), issues: Object.freeze(row.issues) })));
    },
    async executionTraceabilityForActor(actorId, executionCode) {
      const found = await reader.traceabilityInputs(actorId, executionCode);
      invariant(found, 'PRODUCTION_EXECUTION_NOT_FOUND', 'Production execution not found', { executionCode });
      return executionTraceability({ execution: found.execution, bom: found.bom, issues: found.issues });
    },
  });
}

function round4(value) { return Math.round(value * 10_000) / 10_000; }
function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'MATERIAL_LOT_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function assertVersion(lot, expectedVersion) {
  invariant(lot.version === expectedVersion, 'MATERIAL_LOT_CONCURRENCY_CONFLICT', 'This material lot was changed by another operation', { lotReference: lot.lotReference, expectedVersion, actualVersion: lot.version });
}
function requireEntity(value, code, details) { invariant(value, code, code.replace(/_/g, ' ').toLowerCase(), details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
