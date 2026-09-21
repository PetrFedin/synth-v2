import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { cancelSpread, cuttingSummary, laySpread, markSpreadCut } from '../modules/cutting/public.mjs';

const LAY_FIELDS = Object.freeze(new Set(['materialCode', 'spreadReference', 'markerLength', 'plies', 'fabricWidth', 'marker', 'lots', 'notes']));
const VERDICT_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createCuttingService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'CUTTING_STORE_REQUIRED', 'Cutting store is required');

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

  async function authorize(tx, brandId, actorId) {
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, CAPABILITIES.PRODUCTION_EXECUTION_MANAGE);
    invariant(membership.organisationType === 'brand', 'CUTTING_BRAND_MEMBERSHIP_REQUIRED', 'Cutting requires a brand membership', { brandId, actorId });
  }

  async function spreadContext(tx, spreadId, actorId) {
    const spread = requireEntity(await tx.getSpreadById(spreadId), 'CUTTING_SPREAD_NOT_FOUND', { spreadId });
    await authorize(tx, spread.brandId, actorId);
    return spread;
  }

  async function saveVerdict(tx, value, expectedVersion, type, commandId, actorId, extra = {}) {
    await tx.saveSpread(value, expectedVersion);
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(),
      payload: { brandId: value.brandId, spreadReference: value.spreadReference, materialCode: value.materialCode, status: value.status, ...extra },
      metadata: { commandId, actorId },
    }));
    return value;
  }

  return Object.freeze({
    laySpread(commandId, actorId, input) {
      validateInput(input, LAY_FIELDS, 'CUTTING_INPUT_INVALID');
      return execute(commandId, `laySpread:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const material = requireEntity(await tx.getMaterialByCode(input.materialCode), 'MATERIAL_NOT_FOUND', { materialCode: input.materialCode });
          await authorize(tx, material.brandId, actorId);
          const codes = [...new Set(list(input.marker).map((entry) => entry?.executionCode).filter((code) => typeof code === 'string'))];
          const executions = await tx.getExecutionsByCodes(codes);
          // Выдачи читаются в той же транзакции, что и запись настила: рулон, выданный между
          // чтением и записью, не должен проскочить, а отозванный — не должен попасть на стол.
          const issues = await tx.listIssuesForExecutions(executions.map((execution) => execution.id));
          return Object.freeze({ material, executions, issues });
        },
        async (tx, { material, executions, issues }) => {
          const value = laySpread({ id: nextId('cutting-spread'), material, executions, issues, input, laidAt: clock(), actorId });
          await tx.insertSpread(value);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'), type: 'cutting.spread-laid', aggregateId: value.id, occurredAt: clock(),
            payload: {
              brandId: value.brandId, spreadReference: value.spreadReference, materialCode: value.materialCode,
              plies: value.plies, markerLength: value.markerLength, clothLaid: value.clothLaid,
              consumptionPerGarment: value.consumptionPerGarment,
              executions: value.marker.map((output) => output.executionCode),
            },
            metadata: { commandId, actorId },
          }));
          return value;
        });
    },

    markCut(commandId, actorId, spreadId, input) {
      validateInput(input, VERDICT_FIELDS, 'CUTTING_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `markSpreadCut:${actorId}:${spreadId}:${expectedVersion}`, actorId,
        (tx) => spreadContext(tx, spreadId, actorId),
        (tx, spread) => {
          assertVersion(spread, expectedVersion);
          return saveVerdict(tx, markSpreadCut(spread, { at: clock(), actorId }), expectedVersion, 'cutting.spread-cut', commandId, actorId);
        });
    },

    cancel(commandId, actorId, spreadId, input) {
      validateInput(input, VERDICT_FIELDS, 'CUTTING_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `cancelSpread:${actorId}:${spreadId}:${canonicalJson(input)}`, actorId,
        (tx) => spreadContext(tx, spreadId, actorId),
        (tx, spread) => {
          assertVersion(spread, expectedVersion);
          return saveVerdict(tx, cancelSpread(spread, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'cutting.spread-cancelled', commandId, actorId, { reason: input.reason });
        });
    },
  });
}

export function createCuttingQueryService({ reader } = {}) {
  invariant(reader && typeof reader.spreadsForActor === 'function' && typeof reader.cuttingInputs === 'function', 'CUTTING_READER_REQUIRED', 'Cutting reader is required');
  return Object.freeze({
    async cuttingSpreadsForActor(actorId) {
      const spreads = await reader.spreadsForActor(actorId);
      invariant(Array.isArray(spreads), 'CUTTING_LISTING_INVALID', 'Spread listing is invalid');
      return Object.freeze(spreads.map((spread) => Object.freeze(structuredClone(spread))));
    },
    async cuttingSummaryForActor(actorId, executionCode) {
      const found = await reader.cuttingInputs(actorId, executionCode);
      invariant(found, 'PRODUCTION_EXECUTION_NOT_FOUND', 'Production execution not found', { executionCode });
      return cuttingSummary({ execution: found.execution, bom: found.bom, spreads: found.spreads });
    },
  });
}

function list(value) { return Array.isArray(value) ? value : []; }
function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'CUTTING_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function assertVersion(spread, expectedVersion) {
  invariant(spread.version === expectedVersion, 'CUTTING_CONCURRENCY_CONFLICT', 'This spread was changed by another operation', { spreadReference: spread.spreadReference, expectedVersion, actualVersion: spread.version });
}
function requireEntity(value, code, details) { invariant(value, code, code.replace(/_/g, ' ').toLowerCase(), details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
