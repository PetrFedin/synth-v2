import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createDefectType,
  dispositionInlineCheck,
  recordInlineCheck,
  retireDefectType,
} from '../modules/inline-quality/public.mjs';

const DEFECT_TYPE_FIELDS = Object.freeze(new Set(['brandId', 'code', 'severity', 'originStage', 'nameRu', 'nameEn']));
const CHECK_FIELDS = Object.freeze(new Set(['milestoneCode', 'checkedQuantity', 'inspectorName', 'defects', 'notes', 'operationId']));
const DISPOSITION_FIELDS = Object.freeze(new Set(['expectedVersion', 'disposition', 'notes']));

export function createInlineQualityService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'INLINE_QC_STORE_REQUIRED', 'Inline quality store is required');

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
    assertCapability(membership, CAPABILITIES.QUALITY_MANAGE);
    invariant(membership.organisationType === 'brand', 'INLINE_QC_BRAND_MEMBERSHIP_REQUIRED', 'Inline quality control requires a brand membership', { brandId, actorId });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    registerDefectType(commandId, actorId, input) {
      validateInput(input, DEFECT_TYPE_FIELDS, 'DEFECT_TYPE_INPUT_INVALID');
      return execute(commandId, `registerDefectType:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => { await authorize(tx, input.brandId, actorId); return tx.getDefectTypeByCode(input.brandId, input.code); },
        async (tx, existing) => {
          // Регистрация кода, который уже есть, — не ошибка ввода, а расхождение в каталоге.
          invariant(!existing, 'DEFECT_TYPE_ALREADY_REGISTERED', 'This defect code is already in the brand catalogue', { code: input.code, severity: existing?.severity });
          const value = createDefectType({ id: nextId('defect-type'), ...input, createdAt: clock(), actorId });
          await tx.insertDefectType(value);
          await append(tx, 'defect-type.registered', value.id, { brandId: value.brandId, code: value.code, severity: value.severity, originStage: value.originStage }, commandId, actorId);
          return value;
        });
    },

    retireDefectType(commandId, actorId, brandId, code) {
      return execute(commandId, `retireDefectType:${actorId}:${brandId}:${code}`, actorId,
        async (tx) => { await authorize(tx, brandId, actorId); return requireEntity(await tx.getDefectTypeByCode(brandId, code), 'DEFECT_TYPE_NOT_FOUND', { code }); },
        async (tx, current) => {
          const value = retireDefectType(current, { actorId, at: clock() });
          await tx.saveDefectType(value, current.version);
          await append(tx, 'defect-type.retired', value.id, { brandId: value.brandId, code: value.code }, commandId, actorId);
          return value;
        });
    },

    recordCheck(commandId, actorId, executionCode, input) {
      validateInput(input, CHECK_FIELDS, 'INLINE_QC_INPUT_INVALID');
      return execute(commandId, `recordInlineCheck:${actorId}:${executionCode}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const execution = requireEntity(await tx.getExecutionByCode(executionCode), 'PRODUCTION_EXECUTION_NOT_FOUND', { executionCode });
          await authorize(tx, execution.brandId, actorId);
          // The catalogue is read in the same transaction that writes the check, so a type retired
          // between the two cannot be recorded against.
          const catalogue = await tx.listDefectTypes(execution.brandId);
          const checkNumber = await tx.nextCheckNumber(execution.id, input.milestoneCode);
          // Операция читается в той же транзакции: она должна принадлежать этому изделию и этой
          // вехе, и проверять это по данным, прочитанным раньше, значило бы проверять прошлое.
          const operation = input.operationId ? await tx.getOperationById(input.operationId) : null;
          return Object.freeze({ execution, catalogue, checkNumber, operation });
        },
        async (tx, { execution, catalogue, checkNumber, operation }) => {
          const value = recordInlineCheck({ id: nextId('inline-check'), execution, catalogue, input: { ...input, checkNumber, operation }, recordedAt: clock(), actorId });
          await tx.insertCheck(value);
          await append(tx, value.status === 'open' ? 'inline-quality.defects-found' : 'inline-quality.check-recorded', value.id, {
            executionCode: value.executionCode, milestoneCode: value.milestoneCode, operationCode: value.operationCode, checkNumber: value.checkNumber,
            brandId: value.brandId, supplierCode: value.supplierCode, sku: value.sku,
            checkedQuantity: value.checkedQuantity, defectiveQuantity: value.defectiveQuantity, defectRate: value.defectRate, status: value.status,
          }, commandId, actorId);
          return value;
        });
    },

    disposition(commandId, actorId, checkId, input) {
      validateInput(input, DISPOSITION_FIELDS, 'INLINE_QC_DISPOSITION_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `dispositionInlineCheck:${actorId}:${checkId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const current = requireEntity(await tx.getCheckById(checkId), 'INLINE_QC_CHECK_NOT_FOUND', { checkId });
          await authorize(tx, current.brandId, actorId);
          return current;
        },
        async (tx, current) => {
          invariant(current.version === expectedVersion, 'INLINE_QC_CONCURRENCY_CONFLICT', 'This inline check was changed by another operation', { checkId, expectedVersion, actualVersion: current.version });
          const value = dispositionInlineCheck(current, { disposition: input.disposition, notes: input.notes, at: clock(), actorId });
          await tx.saveCheck(value, expectedVersion);
          await append(tx, 'inline-quality.dispositioned', value.id, {
            executionCode: value.executionCode, milestoneCode: value.milestoneCode, checkNumber: value.checkNumber,
            brandId: value.brandId, disposition: value.disposition, defectiveQuantity: value.defectiveQuantity,
          }, commandId, actorId);
          return value;
        });
    },
  });
}

function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'INLINE_QC_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
