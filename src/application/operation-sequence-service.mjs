import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createProductSequence,
  createSequenceTemplate,
  publishSequence,
  replaceOperations,
  retireSequence,
  sequenceWorkload,
} from '../modules/operation-sequences/public.mjs';

const TEMPLATE_FIELDS = Object.freeze(new Set(['brandId', 'templateCode', 'category', 'nameRu', 'nameEn', 'notes']));
const PRODUCT_FIELDS = Object.freeze(new Set(['brandId', 'sku', 'templateCode', 'nameRu', 'nameEn', 'notes']));
const OPERATIONS_FIELDS = Object.freeze(new Set(['expectedVersion', 'operations']));
const VERDICT_FIELDS = Object.freeze(new Set(['expectedVersion', 'reason']));

export function createOperationSequenceService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'BOL_STORE_REQUIRED', 'Operation sequence store is required');

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
    assertCapability(membership, CAPABILITIES.TECH_PACK_MANAGE);
    invariant(membership.organisationType === 'brand', 'BOL_BRAND_MEMBERSHIP_REQUIRED', 'Operation sequences require a brand membership', { brandId, actorId });
  }

  async function sequenceContext(tx, sequenceId, actorId) {
    const sequence = requireEntity(await tx.getSequenceById(sequenceId), 'BOL_SEQUENCE_NOT_FOUND', { sequenceId });
    await authorize(tx, sequence.brandId, actorId);
    return sequence;
  }

  async function saveVerdict(tx, value, expectedVersion, type, commandId, actorId) {
    await tx.saveSequence(value, expectedVersion);
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: value.id, occurredAt: clock(),
      payload: { brandId: value.brandId, kind: value.kind, templateCode: value.templateCode, sku: value.sku, status: value.status, operations: value.operations.length },
      metadata: { commandId, actorId },
    }));
    return value;
  }

  return Object.freeze({
    createTemplate(commandId, actorId, input) {
      validateInput(input, TEMPLATE_FIELDS, 'BOL_INPUT_INVALID');
      return execute(commandId, `createSequenceTemplate:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => { await authorize(tx, input.brandId, actorId); return tx.getTemplateByCode(input.brandId, input.templateCode); },
        async (tx, existing) => {
          invariant(!existing, 'BOL_TEMPLATE_EXISTS', 'This template code is already in use', { templateCode: input.templateCode });
          const value = createSequenceTemplate({ id: nextId('bol-sequence'), brandId: input.brandId, input, createdAt: clock(), actorId });
          await tx.insertSequence(value);
          await tx.appendOutbox(domainEvent({ id: nextId('event'), type: 'operation-sequence.template-created', aggregateId: value.id, occurredAt: clock(), payload: { brandId: value.brandId, templateCode: value.templateCode, category: value.category }, metadata: { commandId, actorId } }));
          return value;
        });
    },

    createForProduct(commandId, actorId, input) {
      validateInput(input, PRODUCT_FIELDS, 'BOL_INPUT_INVALID');
      return execute(commandId, `createProductSequence:${actorId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          await authorize(tx, input.brandId, actorId);
          const sku = requireEntity(await tx.getCatalogSkuByCode(input.sku), 'CATALOG_SKU_NOT_FOUND', { sku: input.sku });
          invariant(sku.brandId === input.brandId, 'BOL_SKU_FOREIGN', 'This SKU belongs to another brand', { sku: input.sku });
          const template = input.templateCode ? requireEntity(await tx.getTemplateByCode(input.brandId, input.templateCode), 'BOL_TEMPLATE_NOT_FOUND', { templateCode: input.templateCode }) : null;
          return Object.freeze({ template, existing: await tx.getProductSequenceBySku(input.brandId, input.sku) });
        },
        async (tx, { template, existing }) => {
          // Одна действующая последовательность на изделие: вторая означала бы, что по одному
          // артикулу шьют двумя разными способами и никто не знает, каким.
          invariant(!existing, 'BOL_PRODUCT_SEQUENCE_EXISTS', 'This product already has an operation sequence', { sku: input.sku });
          const value = createProductSequence({ id: nextId('bol-sequence'), brandId: input.brandId, sku: input.sku, template, input, createdAt: clock(), actorId });
          await tx.insertSequence(value);
          await tx.appendOutbox(domainEvent({ id: nextId('event'), type: 'operation-sequence.created', aggregateId: value.id, occurredAt: clock(), payload: { brandId: value.brandId, sku: value.sku, sourceTemplateCode: value.sourceTemplateCode, operations: value.operations.length }, metadata: { commandId, actorId } }));
          return value;
        });
    },

    replaceOperations(commandId, actorId, sequenceId, input) {
      validateInput(input, OPERATIONS_FIELDS, 'BOL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `replaceOperations:${actorId}:${sequenceId}:${canonicalJson(input)}`, actorId,
        async (tx) => {
          const sequence = await sequenceContext(tx, sequenceId, actorId);
          // Справочник узлов читается в той же транзакции: узел, выведенный между чтением и
          // записью, не должен попасть в опубликованную последовательность.
          return Object.freeze({ sequence, catalogue: await tx.listConstructionNodes() });
        },
        (tx, { sequence, catalogue }) => {
          assertVersion(sequence, expectedVersion);
          return saveVerdict(tx, replaceOperations(sequence, { operations: input.operations, catalogue, at: clock(), actorId }), expectedVersion, 'operation-sequence.operations-replaced', commandId, actorId);
        });
    },

    publish(commandId, actorId, sequenceId, input) {
      validateInput(input, VERDICT_FIELDS, 'BOL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `publishOperationSequence:${actorId}:${sequenceId}:${expectedVersion}`, actorId,
        (tx) => sequenceContext(tx, sequenceId, actorId),
        (tx, sequence) => {
          assertVersion(sequence, expectedVersion);
          return saveVerdict(tx, publishSequence(sequence, { at: clock(), actorId }), expectedVersion, 'operation-sequence.published', commandId, actorId);
        });
    },

    retire(commandId, actorId, sequenceId, input) {
      validateInput(input, VERDICT_FIELDS, 'BOL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `retireOperationSequence:${actorId}:${sequenceId}:${canonicalJson(input)}`, actorId,
        (tx) => sequenceContext(tx, sequenceId, actorId),
        (tx, sequence) => {
          assertVersion(sequence, expectedVersion);
          return saveVerdict(tx, retireSequence(sequence, { reason: input.reason, at: clock(), actorId }), expectedVersion, 'operation-sequence.retired', commandId, actorId);
        });
    },
  });
}

export function createOperationSequenceQueryService({ reader } = {}) {
  invariant(reader && typeof reader.sequencesForActor === 'function' && typeof reader.sequenceForSku === 'function', 'BOL_READER_REQUIRED', 'Operation sequence reader is required');
  return Object.freeze({
    // Трудоёмкость едет вместе с последовательностью, чтобы её не складывали заново в каждом месте,
    // где показывают операции.
    async operationSequencesForActor(actorId) {
      const rows = await reader.sequencesForActor(actorId);
      invariant(Array.isArray(rows), 'BOL_LISTING_INVALID', 'Operation sequence listing is invalid');
      return Object.freeze(rows.map((sequence) => Object.freeze({ ...structuredClone(sequence), workload: sequenceWorkload(sequence) })));
    },
    async operationSequenceForSku(actorId, sku) {
      const sequence = await reader.sequenceForSku(actorId, sku);
      invariant(sequence, 'BOL_SEQUENCE_NOT_FOUND', 'This product has no operation sequence', { sku });
      return Object.freeze({ ...structuredClone(sequence), workload: sequenceWorkload(sequence) });
    },
  });
}

function validateInput(input, allowed, code) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), code, 'Input must be an object');
  for (const key of Object.keys(input)) invariant(allowed.has(key), code, `Unexpected field ${key}`, { field: key });
}
function versionOf(input) {
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1, 'BOL_EXPECTED_VERSION_INVALID', 'Expected version is invalid');
  return input.expectedVersion;
}
function assertVersion(sequence, expectedVersion) {
  invariant(sequence.version === expectedVersion, 'BOL_CONCURRENCY_CONFLICT', 'This operation sequence was changed by another operation', { sequenceId: sequence.id, expectedVersion, actualVersion: sequence.version });
}
function requireEntity(value, code, details) { invariant(value, code, code.replace(/_/g, ' ').toLowerCase(), details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
