import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  cancelSample as cancelSampleDomain,
  createNextSampleRound as createNextSampleRoundDomain,
  createSample as createSampleDomain,
  decideSample as decideSampleDomain,
  receiveSample as receiveSampleDomain,
  requestSample as requestSampleDomain,
  startSampleProduction as startSampleProductionDomain,
  updateDraftSample as updateDraftSampleDomain,
} from '../modules/samples/public.mjs';

const EDITABLE_FIELDS = Object.freeze(['supplierCode', 'supplierName', 'dueAt', 'quantity', 'sizeCodes', 'colourway', 'notes']);
const CREATE_FIELDS = Object.freeze(new Set(['sampleCode', 'sku', 'sampleType', 'round', ...EDITABLE_FIELDS]));
const UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', ...EDITABLE_FIELDS]));
const VERSION_FIELDS = Object.freeze(new Set(['expectedVersion']));
const RECEIPT_FIELDS = Object.freeze(new Set(['expectedVersion', 'receivedQuantity', 'condition', 'trackingReference', 'notes']));
const DECISION_FIELDS = Object.freeze(new Set(['expectedVersion', 'decision', 'notes']));
const CANCELLATION_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));
const NEXT_ROUND_FIELDS = Object.freeze(new Set(['expectedVersion', 'sampleCode', 'dueAt', 'notes']));

export function createSampleService({ sampleStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(sampleStore && typeof sampleStore.transaction === 'function', 'SAMPLE_STORE_REQUIRED', 'Sample store is required');

  async function authorisedSku(tx, skuCode, actorId) {
    const catalogSku = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
    const membership = await tx.getMembership(catalogSku.brandId, actorId);
    assertCapability(membership, CAPABILITIES.SAMPLE_MANAGE);
    return catalogSku;
  }

  async function authorisedSample(tx, sampleCode, actorId) {
    const sample = requireEntity(await tx.getSampleByCode(sampleCode), 'SAMPLE_NOT_FOUND', { sampleCode });
    const membership = await tx.getMembership(sample.brandId, actorId);
    assertCapability(membership, CAPABILITIES.SAMPLE_MANAGE);
    const catalogSku = requireEntity(await tx.getSku(sample.sku), 'CATALOG_SKU_NOT_FOUND', { sku: sample.sku });
    return Object.freeze({ sample, catalogSku });
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return sampleStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, sample, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: sample.id, occurredAt: clock(),
      payload: {
        sampleCode: sample.sampleCode, sku: sample.sku, brandId: sample.brandId, skuVersion: sample.skuVersion,
        sampleType: sample.sampleType, round: sample.round, status: sample.status, dueAt: sample.dueAt,
        supplierCode: sample.supplierCode, sourceSampleCode: sample.sourceSampleCode, version: sample.version,
      },
      metadata: { commandId, actorId },
    }));
  }

  async function transition(commandName, eventType, commandId, actorId, sampleCode, input, allowedFields, transform) {
    assertObject(input, 'SAMPLE_COMMAND_INVALID', 'Sample command input is invalid');
    assertAllowedFields(input, allowedFields, 'SAMPLE_COMMAND_FIELD_FORBIDDEN');
    const expectedVersion = expectedVersionOf(input);
    return execute(
      commandId,
      `${commandName}:${actorId}:${sampleCode}:${canonicalJson(input)}`,
      actorId,
      (tx) => authorisedSample(tx, sampleCode, actorId),
      async (tx, context) => {
        assertExpectedVersion(context.sample, expectedVersion);
        const changed = transform(context, input);
        await tx.saveSample(changed, expectedVersion);
        await append(tx, eventType(changed), changed, commandId, actorId);
        return changed;
      },
    );
  }

  return Object.freeze({
    async createSample(commandId, actorId, input) {
      assertCompleteCreate(input);
      assertAllowedFields(input, CREATE_FIELDS, 'SAMPLE_CREATE_FIELD_FORBIDDEN');
      return execute(
        commandId,
        `createSample:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => Object.freeze({ catalogSku: await authorisedSku(tx, input.sku, actorId), existing: await tx.getSampleByCode(input.sampleCode) }),
        async (tx, context) => {
          invariant(!context.existing, 'SAMPLE_ALREADY_EXISTS', 'Sample already exists', { sampleCode: input.sampleCode });
          const sample = createSampleDomain({ id: nextId('sample'), catalogSku: context.catalogSku, input, createdAt: clock() });
          await tx.insertSample(sample);
          await append(tx, 'sample.created', sample, commandId, actorId);
          return sample;
        },
      );
    },

    async updateSample(commandId, actorId, sampleCode, input) {
      assertCompleteUpdate(input);
      assertAllowedFields(input, UPDATE_FIELDS, 'SAMPLE_UPDATE_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      const editable = Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion')));
      return execute(
        commandId,
        `updateSample:${actorId}:${sampleCode}:${canonicalJson(input)}`,
        actorId,
        (tx) => authorisedSample(tx, sampleCode, actorId),
        async (tx, context) => {
          assertExpectedVersion(context.sample, expectedVersion);
          const updated = updateDraftSampleDomain(context.sample, { catalogSku: context.catalogSku, input: editable, updatedAt: clock() });
          if (updated === context.sample) return context.sample;
          await tx.saveSample(updated, expectedVersion);
          await append(tx, 'sample.updated', updated, commandId, actorId);
          return updated;
        },
      );
    },

    requestSample(commandId, actorId, sampleCode, input) {
      return transition('requestSample', () => 'sample.requested', commandId, actorId, sampleCode, input, VERSION_FIELDS,
        (context) => requestSampleDomain(context.sample, { catalogSku: context.catalogSku, requestedAt: clock() }));
    },

    startProduction(commandId, actorId, sampleCode, input) {
      return transition('startSampleProduction', () => 'sample.production-started', commandId, actorId, sampleCode, input, VERSION_FIELDS,
        (context) => startSampleProductionDomain(context.sample, { startedAt: clock() }));
    },

    receiveSample(commandId, actorId, sampleCode, input) {
      return transition('receiveSample', () => 'sample.received', commandId, actorId, sampleCode, input, RECEIPT_FIELDS,
        (context, value) => receiveSampleDomain(context.sample, { input: withoutExpectedVersion(value), receivedAt: clock() }));
    },

    decideSample(commandId, actorId, sampleCode, input) {
      return transition('decideSample', (changed) => `sample.${changed.status}`, commandId, actorId, sampleCode, input, DECISION_FIELDS,
        (context, value) => decideSampleDomain(context.sample, { input: withoutExpectedVersion(value), actorId, decidedAt: clock() }));
    },

    cancelSample(commandId, actorId, sampleCode, input) {
      return transition('cancelSample', () => 'sample.cancelled', commandId, actorId, sampleCode, input, CANCELLATION_FIELDS,
        (context, value) => cancelSampleDomain(context.sample, { reason: value.reason, cancelledAt: clock() }));
    },

    async createNextRound(commandId, actorId, sampleCode, input) {
      assertObject(input, 'SAMPLE_NEXT_ROUND_INVALID', 'Next sample round input is invalid');
      assertAllowedFields(input, NEXT_ROUND_FIELDS, 'SAMPLE_NEXT_ROUND_FIELD_FORBIDDEN');
      const expectedVersion = expectedVersionOf(input);
      return execute(
        commandId,
        `createNextSampleRound:${actorId}:${sampleCode}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const context = await authorisedSample(tx, sampleCode, actorId);
          return Object.freeze({ ...context, existingNext: await tx.getSampleBySource(sampleCode) });
        },
        async (tx, context) => {
          assertExpectedVersion(context.sample, expectedVersion);
          invariant(!context.existingNext, 'SAMPLE_NEXT_ROUND_EXISTS', 'Next sample round already exists', { sampleCode, nextSampleCode: context.existingNext?.sampleCode });
          const next = createNextSampleRoundDomain({
            id: nextId('sample'), rejectedSample: context.sample, catalogSku: context.catalogSku,
            input: { sampleCode: input.sampleCode, dueAt: input.dueAt, ...(Object.hasOwn(input, 'notes') ? { notes: input.notes } : {}) },
            createdAt: clock(),
          });
          await tx.insertSample(next);
          await append(tx, 'sample.next-round-created', next, commandId, actorId);
          return next;
        },
      );
    },
  });
}

function assertCompleteCreate(input) {
  assertObject(input, 'SAMPLE_INPUT_INVALID', 'Sample input is invalid');
  const missingFields = ['sampleCode', 'sku', 'sampleType', 'round', ...EDITABLE_FIELDS].filter((field) => !Object.hasOwn(input, field));
  invariant(missingFields.length === 0, 'SAMPLE_FIELD_REQUIRED', 'Sample request is missing required fields', { missingFields });
}
function assertCompleteUpdate(input) {
  assertObject(input, 'SAMPLE_INPUT_INVALID', 'Sample input is invalid');
  const missingFields = ['expectedVersion', ...EDITABLE_FIELDS].filter((field) => !Object.hasOwn(input, field));
  invariant(missingFields.length === 0, 'SAMPLE_FIELD_REQUIRED', 'Sample update is missing required fields', { missingFields });
}
function assertObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); }
function assertAllowedFields(input, allowed, code) { const forbidden = Object.keys(input).filter((field) => !allowed.has(field)).sort(); invariant(forbidden.length === 0, code, 'Sample request contains a forbidden field', { fields: forbidden }); }
function expectedVersionOf(input) { return assertPostgresInteger(input.expectedVersion, { code: 'SAMPLE_EXPECTED_VERSION_INVALID', label: 'Expected sample version', min: 1 }); }
function withoutExpectedVersion(input) { return Object.freeze(Object.fromEntries(Object.entries(input).filter(([field]) => field !== 'expectedVersion'))); }
function assertExpectedVersion(sample, expectedVersion) { invariant(sample.version === expectedVersion, 'SAMPLE_CONCURRENCY_CONFLICT', 'Sample was changed by another operation', { sampleCode: sample.sampleCode, expectedVersion, actualVersion: sample.version }); }
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
