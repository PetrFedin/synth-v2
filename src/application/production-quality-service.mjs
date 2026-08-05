import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertProductionQualityVersion,
  createProductionQualityCase,
  recordQualityInspection,
  startQualityInspection,
  submitQualityRework,
} from '../modules/production-quality/public.mjs';

const RECORD_FIELDS = Object.freeze(new Set(['expectedVersion', 'inspectedQuantity', 'defects']));
const REWORK_FIELDS = Object.freeze(new Set(['expectedVersion', 'reference', 'notes']));

export function createProductionQualityService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCTION_QUALITY_STORE_REQUIRED', 'Production quality store is required');

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
    invariant(membership.organisationType === 'brand', 'PRODUCTION_QUALITY_BRAND_MEMBERSHIP_REQUIRED', 'Production quality requires a brand membership', { brandId, actorId });
  }

  async function append(tx, type, qualityCase, commandId, actorId, extra = {}) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: qualityCase.id, occurredAt: clock(),
      payload: {
        qualityCaseCode: qualityCase.qualityCaseCode,
        executionCode: qualityCase.executionCode,
        productionOrderNumber: qualityCase.productionOrderNumber,
        brandId: qualityCase.brandId,
        supplierCode: qualityCase.supplierCode,
        sku: qualityCase.sku,
        status: qualityCase.status,
        version: qualityCase.version,
        round: qualityCase.rounds.at(-1).round,
        shippingReleased: Boolean(qualityCase.shippingReleaseAt),
        ...extra,
      },
      metadata: { commandId, actorId },
    }));
  }

  async function contextForCase(tx, qualityCaseCode, actorId) {
    const current = requireEntity(await tx.getQualityCaseByCode(qualityCaseCode), 'PRODUCTION_QUALITY_NOT_FOUND', { qualityCaseCode });
    await authorize(tx, current.brandId, actorId, CAPABILITIES.PRODUCTION_QUALITY_MANAGE);
    return current;
  }

  return Object.freeze({
    createFromExecution(commandId, actorId, executionCode) {
      return execute(commandId, `createProductionQuality:${actorId}:${executionCode}`, actorId,
        async (tx) => {
          const execution = requireEntity(await tx.getExecutionByCode(executionCode), 'PRODUCTION_EXECUTION_NOT_FOUND', { executionCode });
          await authorize(tx, execution.brandId, actorId, CAPABILITIES.PRODUCTION_QUALITY_MANAGE);
          const existing = await tx.getQualityCaseByExecutionCode(executionCode);
          return Object.freeze({ execution, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCTION_QUALITY_FOR_EXECUTION_EXISTS', 'Production execution already has a quality case', { executionCode, qualityCaseCode: context.existing?.qualityCaseCode });
          const value = createProductionQualityCase({ id: nextId('production-quality'), execution: context.execution, createdAt: clock() });
          await tx.insertQualityCase(value);
          await append(tx, 'production-quality.created', value, commandId, actorId, { sampleSize: value.rounds[0].sampleSize });
          return value;
        });
    },

    startInspection(commandId, actorId, qualityCaseCode, input) {
      const expectedVersion = versionOf(input);
      return execute(commandId, `startProductionQuality:${actorId}:${qualityCaseCode}:${expectedVersion}`, actorId,
        (tx) => contextForCase(tx, qualityCaseCode, actorId),
        async (tx, current) => {
          assertProductionQualityVersion(current, expectedVersion);
          const value = startQualityInspection(current, { actorId, startedAt: clock() });
          await tx.saveQualityCase(value, expectedVersion);
          await append(tx, 'production-quality.inspection-started', value, commandId, actorId);
          return value;
        });
    },

    recordInspection(commandId, actorId, qualityCaseCode, input) {
      validateInput(input, RECORD_FIELDS, 'PRODUCTION_QUALITY_RECORD_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `recordProductionQuality:${actorId}:${qualityCaseCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForCase(tx, qualityCaseCode, actorId),
        async (tx, current) => {
          assertProductionQualityVersion(current, expectedVersion);
          const value = recordQualityInspection(current, { actorId, inspectedQuantity: input.inspectedQuantity, defects: input.defects, completedAt: clock() });
          await tx.saveQualityCase(value, expectedVersion);
          const eventType = value.status === 'passed' ? 'production-quality.passed' : value.status === 'rejected' ? 'production-quality.rejected' : 'production-quality.rework-required';
          const round = value.rounds.at(-1);
          await append(tx, eventType, value, commandId, actorId, { decision: round.decision, totals: round.totals, limits: round.limits });
          return value;
        });
    },

    submitRework(commandId, actorId, qualityCaseCode, input) {
      validateInput(input, REWORK_FIELDS, 'PRODUCTION_QUALITY_REWORK_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `submitProductionQualityRework:${actorId}:${qualityCaseCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForCase(tx, qualityCaseCode, actorId),
        async (tx, current) => {
          assertProductionQualityVersion(current, expectedVersion);
          const value = submitQualityRework(current, { actorId, reference: input.reference, notes: input.notes, submittedAt: clock() });
          await tx.saveQualityCase(value, expectedVersion);
          await append(tx, 'production-quality.rework-submitted', value, commandId, actorId, { sampleSize: value.rounds.at(-1).sampleSize });
          return value;
        });
    },
  });
}

function validateInput(value, allowed, code) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Production quality input is invalid'); const fields = Object.keys(value).filter((field) => !allowed.has(field)); invariant(fields.length === 0, 'PRODUCTION_QUALITY_FIELD_FORBIDDEN', 'Production quality input contains unsupported fields', { fields }); }
function versionOf(value) { invariant(value && Number.isInteger(value.expectedVersion) && value.expectedVersion >= 1, 'PRODUCTION_QUALITY_EXPECTED_VERSION_INVALID', 'Expected production quality version is invalid'); return value.expectedVersion; }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
