import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertQualityInspectionVersion,
  cancelQualityInspection,
  completeQualityInspectionRun,
  createQualityInspection,
  reviewQualityInspection,
  startQualityInspection,
  startQualityReinspection,
} from '../modules/final-quality/public.mjs';

// A run states the criterion it is judged by. Either it names the standard, the inspection level
// and the two accepted quality limits — and the plan is read off the rows the brand holds — or it
// carries an explicitly agreed sample and limits, which are recorded as agreed rather than dressed
// up as a standard.
const START_FIELDS = Object.freeze(new Set(['expectedVersion','inspectorName','sampleSize','allowedMajorDefects','allowedMinorDefects','standardCode','inspectionLevel','aqlMajor','aqlMinor','samplingNote']));
const REINSPECTION_FIELDS = Object.freeze(new Set([...START_FIELDS,'reworkReference','resolutionNotes']));
const COMPLETE_FIELDS = Object.freeze(new Set(['expectedVersion','inspectedQuantity','defects','measurementFailures','checkpoints','evidenceReferences','notes']));
const REVIEW_FIELDS = Object.freeze(new Set(['expectedVersion','decision','releaseCode','notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion','reason']));

export function createFinalQualityService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'QUALITY_STORE_REQUIRED', 'Final Quality store is required');

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
    invariant(membership.organisationType === 'brand', 'QUALITY_BRAND_MEMBERSHIP_REQUIRED', 'Final Quality requires a brand membership', { brandId, actorId });
  }

  async function contextForInspection(tx, inspectionCode, actorId, capability) {
    const current = requireEntity(await tx.getInspectionByCode(inspectionCode), 'QUALITY_INSPECTION_NOT_FOUND', { inspectionCode });
    await authorize(tx, current.brandId, actorId, capability);
    return current;
  }

  // A run's plan is resolved against the rows the brand actually holds, read inside the same
  // transaction that will write the run. Loading them outside it would let the table change between
  // the criterion being read and the run recording that it was applied.
  async function contextWithSamplingPlans(tx, inspectionCode, actorId, input) {
    const current = await contextForInspection(tx, inspectionCode, actorId, CAPABILITIES.QUALITY_MANAGE);
    const named = typeof input?.standardCode === 'string' && input.standardCode !== '';
    const samplingPlans = named
      ? await tx.listSamplingPlans(current.brandId, input.standardCode, input.inspectionLevel)
      : [];
    return Object.freeze({ current, samplingPlans });
  }

  async function append(tx, type, inspection, commandId, actorId, extra = {}) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'),
      type,
      aggregateId: inspection.id,
      occurredAt: clock(),
      payload: {
        inspectionCode: inspection.inspectionCode,
        executionCode: inspection.executionCode,
        productionOrderNumber: inspection.productionOrderNumber,
        brandId: inspection.brandId,
        supplierCode: inspection.supplierCode,
        sku: inspection.sku,
        status: inspection.status,
        version: inspection.version,
        currentRun: inspection.currentRun,
        ...extra,
      },
      metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createFromExecution(commandId, actorId, executionCode) {
      return execute(commandId, `createFinalQuality:${actorId}:${executionCode}`, actorId,
        async (tx) => {
          const execution = requireEntity(await tx.getExecutionByCode(executionCode), 'QUALITY_EXECUTION_NOT_FOUND', { executionCode });
          await authorize(tx, execution.brandId, actorId, CAPABILITIES.QUALITY_MANAGE);
          const existing = await tx.getInspectionByExecutionCode(executionCode);
          return Object.freeze({ execution, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'QUALITY_INSPECTION_FOR_EXECUTION_EXISTS', 'Production execution already has a Final Quality inspection', { executionCode, inspectionCode: context.existing?.inspectionCode });
          const value = createQualityInspection({ id: nextId('quality-inspection'), execution: context.execution, createdAt: clock() });
          await tx.insertInspection(value);
          await append(tx, 'final-quality.created', value, commandId, actorId);
          return value;
        });
    },

    start(commandId, actorId, inspectionCode, input) {
      validateInput(input, START_FIELDS, 'QUALITY_START_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `startFinalQuality:${actorId}:${inspectionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextWithSamplingPlans(tx, inspectionCode, actorId, input),
        async (tx, { current, samplingPlans }) => {
          assertQualityInspectionVersion(current, expectedVersion);
          const value = startQualityInspection(current, { ...withoutExpectedVersion(input), samplingPlans, actorId, startedAt: clock() });
          await tx.saveInspection(value, expectedVersion);
          await append(tx, 'final-quality.run-started', value, commandId, actorId, { runNumber: value.currentRun });
          return value;
        });
    },

    completeRun(commandId, actorId, inspectionCode, input) {
      validateInput(input, COMPLETE_FIELDS, 'QUALITY_COMPLETE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `completeFinalQualityRun:${actorId}:${inspectionCode}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const current = await contextForInspection(tx, inspectionCode, actorId, CAPABILITIES.QUALITY_MANAGE);
          // Каталог дефектов бренда — тот же, что у пооперационного контроля. Read here so that a
          // code cannot be major at the operation and minor at the gate.
          return Object.freeze({ current, defectCatalogue: await tx.listDefectTypes(current.brandId) });
        },
        async (tx, { current, defectCatalogue }) => {
          assertQualityInspectionVersion(current, expectedVersion);
          const value = completeQualityInspectionRun(current, { ...withoutExpectedVersion(input), defectCatalogue, actorId, completedAt: clock() });
          await tx.saveInspection(value, expectedVersion);
          await append(tx, 'final-quality.run-completed', value, commandId, actorId, { runNumber: value.currentRun, recommendation: value.runs.at(-1).recommendation, defectCounts: value.runs.at(-1).defectCounts });
          return value;
        });
    },

    review(commandId, actorId, inspectionCode, input) {
      validateInput(input, REVIEW_FIELDS, 'QUALITY_REVIEW_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `reviewFinalQuality:${actorId}:${inspectionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForInspection(tx, inspectionCode, actorId, CAPABILITIES.QUALITY_APPROVE),
        async (tx, current) => {
          assertQualityInspectionVersion(current, expectedVersion);
          const currentRun = current.runs.at(-1);
          invariant(
            currentRun?.inspectorId !== actorId && currentRun?.completedBy !== actorId,
            'QUALITY_SELF_APPROVAL_FORBIDDEN',
            'The inspector who executed the run cannot approve its disposition',
            { inspectionCode: current.inspectionCode, runNumber: current.currentRun, actorId },
          );
          const value = reviewQualityInspection(current, { ...withoutExpectedVersion(input), actorId, reviewedAt: clock() });
          await tx.saveInspection(value, expectedVersion);
          if (value.status === 'released') {
            await tx.insertShipmentRelease(Object.freeze({
              id: nextId('quality-release'),
              ...value.shipmentRelease,
              brandId: value.brandId,
              createdAt: value.shipmentRelease.releasedAt,
            }));
          }
          const type = value.status === 'released' ? 'final-quality.shipment-released' : value.status === 'rejected' ? 'final-quality.rejected' : 'final-quality.rework-required';
          await append(tx, type, value, commandId, actorId, { runNumber: value.currentRun, disposition: value.runs.at(-1).disposition, releaseCode: value.shipmentRelease?.releaseCode ?? null });
          return value;
        });
    },

    startReinspection(commandId, actorId, inspectionCode, input) {
      validateInput(input, REINSPECTION_FIELDS, 'QUALITY_REINSPECTION_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `startFinalQualityReinspection:${actorId}:${inspectionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextWithSamplingPlans(tx, inspectionCode, actorId, input),
        async (tx, { current, samplingPlans }) => {
          assertQualityInspectionVersion(current, expectedVersion);
          // A re-inspection states its criterion afresh rather than inheriting the first run's: the
          // lot presented again is not always the lot that failed, and a run that silently reused an
          // older plan would record a criterion nobody chose for it.
          const value = startQualityReinspection(current, { ...withoutExpectedVersion(input), samplingPlans, actorId, startedAt: clock() });
          await tx.saveInspection(value, expectedVersion);
          await append(tx, 'final-quality.reinspection-started', value, commandId, actorId, { runNumber: value.currentRun, reworkReference: value.runs.at(-1).reworkReference });
          return value;
        });
    },

    cancel(commandId, actorId, inspectionCode, input) {
      validateInput(input, CANCEL_FIELDS, 'QUALITY_CANCEL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `cancelFinalQuality:${actorId}:${inspectionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForInspection(tx, inspectionCode, actorId, CAPABILITIES.QUALITY_APPROVE),
        async (tx, current) => {
          assertQualityInspectionVersion(current, expectedVersion);
          const value = cancelQualityInspection(current, { ...withoutExpectedVersion(input), actorId, cancelledAt: clock() });
          await tx.saveInspection(value, expectedVersion);
          await append(tx, 'final-quality.cancelled', value, commandId, actorId);
          return value;
        });
    },
  });
}

function validateInput(value, allowed, code) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Final Quality input is invalid');
  const fields = Object.keys(value).filter((field) => !allowed.has(field));
  invariant(fields.length === 0, 'QUALITY_FIELD_FORBIDDEN', 'Final Quality input contains unsupported fields', { fields });
}
function versionOf(value) { invariant(value && Number.isInteger(value.expectedVersion) && value.expectedVersion >= 1, 'QUALITY_EXPECTED_VERSION_INVALID', 'Expected Final Quality version is invalid'); return value.expectedVersion; }
function withoutExpectedVersion(value) { const { expectedVersion: _expectedVersion, ...rest } = value; return rest; }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }