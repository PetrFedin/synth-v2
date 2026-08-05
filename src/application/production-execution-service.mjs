import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  assertProductionExecutionVersion,
  blockProductionMilestone,
  cancelProductionExecution,
  completeProductionMilestone,
  createProductionExecution,
  resolveProductionMilestoneBlock,
  startProductionExecution,
} from '../modules/production-execution/public.mjs';

const COMPLETE_FIELDS = Object.freeze(new Set(['expectedVersion','milestoneCode','notes']));
const BLOCK_FIELDS = Object.freeze(new Set(['expectedVersion','milestoneCode','reason']));
const RESOLVE_FIELDS = Object.freeze(new Set(['expectedVersion','milestoneCode','notes']));
const CANCEL_FIELDS = Object.freeze(new Set(['expectedVersion','reason']));

export function createProductionExecutionService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCTION_EXECUTION_STORE_REQUIRED', 'Production execution store is required');

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
    invariant(membership.organisationType === 'brand', 'PRODUCTION_EXECUTION_BRAND_MEMBERSHIP_REQUIRED', 'Production execution requires a brand membership', { brandId, actorId });
  }

  async function append(tx, type, execution, commandId, actorId, extra = {}) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId: execution.id, occurredAt: clock(),
      payload: {
        executionCode: execution.executionCode,
        productionOrderNumber: execution.productionOrderNumber,
        brandId: execution.brandId,
        supplierCode: execution.supplierCode,
        sku: execution.sku,
        status: execution.status,
        version: execution.version,
        ...extra,
      },
      metadata: { commandId, actorId },
    }));
  }

  async function contextForExecution(tx, executionCode, actorId) {
    const current = requireEntity(await tx.getExecutionByCode(executionCode), 'PRODUCTION_EXECUTION_NOT_FOUND', { executionCode });
    await authorize(tx, current.brandId, actorId, CAPABILITIES.PRODUCTION_EXECUTION_MANAGE);
    return current;
  }

  return Object.freeze({
    createFromProductionOrder(commandId, actorId, productionOrderNumber) {
      return execute(commandId, `createProductionExecution:${actorId}:${productionOrderNumber}`, actorId,
        async (tx) => {
          const productionOrder = requireEntity(await tx.getProductionOrderByNumber(productionOrderNumber), 'PRODUCTION_ORDER_NOT_FOUND', { productionOrderNumber });
          await authorize(tx, productionOrder.brandId, actorId, CAPABILITIES.PRODUCTION_EXECUTION_MANAGE);
          const existing = await tx.getExecutionByProductionOrderNumber(productionOrderNumber);
          return Object.freeze({ productionOrder, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCTION_EXECUTION_FOR_PO_EXISTS', 'Production Order already has a production execution calendar', { productionOrderNumber, executionCode: context.existing?.executionCode });
          const value = createProductionExecution({ id: nextId('production-execution'), productionOrder: context.productionOrder, createdAt: clock() });
          await tx.insertExecution(value);
          await append(tx, 'production-execution.created', value, commandId, actorId);
          return value;
        });
    },

    start(commandId, actorId, executionCode, input) {
      const expectedVersion = versionOf(input);
      return execute(commandId, `startProductionExecution:${actorId}:${executionCode}:${expectedVersion}`, actorId,
        (tx) => contextForExecution(tx, executionCode, actorId),
        async (tx, current) => {
          assertProductionExecutionVersion(current, expectedVersion);
          const value = startProductionExecution(current, { actorId, startedAt: clock() });
          await tx.saveExecution(value, expectedVersion);
          await append(tx, 'production-execution.started', value, commandId, actorId);
          return value;
        });
    },

    completeMilestone(commandId, actorId, executionCode, input) {
      validateInput(input, COMPLETE_FIELDS, 'PRODUCTION_MILESTONE_COMPLETE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `completeProductionMilestone:${actorId}:${executionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForExecution(tx, executionCode, actorId),
        async (tx, current) => {
          assertProductionExecutionVersion(current, expectedVersion);
          const value = completeProductionMilestone(current, { milestoneCode: input.milestoneCode, actorId, notes: input.notes, completedAt: clock() });
          await tx.saveExecution(value, expectedVersion);
          await append(tx, value.status === 'ready-for-qc' ? 'production-execution.ready-for-qc' : 'production-milestone.completed', value, commandId, actorId, { milestoneCode: input.milestoneCode });
          return value;
        });
    },

    blockMilestone(commandId, actorId, executionCode, input) {
      validateInput(input, BLOCK_FIELDS, 'PRODUCTION_MILESTONE_BLOCK_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `blockProductionMilestone:${actorId}:${executionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForExecution(tx, executionCode, actorId),
        async (tx, current) => {
          assertProductionExecutionVersion(current, expectedVersion);
          const value = blockProductionMilestone(current, { milestoneCode: input.milestoneCode, actorId, reason: input.reason, blockedAt: clock() });
          await tx.saveExecution(value, expectedVersion);
          await append(tx, 'production-milestone.blocked', value, commandId, actorId, { milestoneCode: input.milestoneCode });
          return value;
        });
    },

    resolveMilestone(commandId, actorId, executionCode, input) {
      validateInput(input, RESOLVE_FIELDS, 'PRODUCTION_MILESTONE_RESOLVE_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `resolveProductionMilestone:${actorId}:${executionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForExecution(tx, executionCode, actorId),
        async (tx, current) => {
          assertProductionExecutionVersion(current, expectedVersion);
          const value = resolveProductionMilestoneBlock(current, { milestoneCode: input.milestoneCode, actorId, notes: input.notes, resolvedAt: clock() });
          await tx.saveExecution(value, expectedVersion);
          await append(tx, 'production-milestone.unblocked', value, commandId, actorId, { milestoneCode: input.milestoneCode });
          return value;
        });
    },

    cancel(commandId, actorId, executionCode, input) {
      validateInput(input, CANCEL_FIELDS, 'PRODUCTION_EXECUTION_CANCEL_INPUT_INVALID');
      const expectedVersion = versionOf(input);
      return execute(commandId, `cancelProductionExecution:${actorId}:${executionCode}:${canonicalJson(input)}`, actorId,
        (tx) => contextForExecution(tx, executionCode, actorId),
        async (tx, current) => {
          assertProductionExecutionVersion(current, expectedVersion);
          const value = cancelProductionExecution(current, { reason: input.reason, cancelledAt: clock() });
          await tx.saveExecution(value, expectedVersion);
          await append(tx, 'production-execution.cancelled', value, commandId, actorId);
          return value;
        });
    },
  });
}

function validateInput(value, allowed, code) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, 'Production execution input is invalid'); const fields = Object.keys(value).filter((field) => !allowed.has(field)); invariant(fields.length === 0, 'PRODUCTION_EXECUTION_FIELD_FORBIDDEN', 'Production execution input contains unsupported fields', { fields }); }
function versionOf(value) { invariant(value && Number.isInteger(value.expectedVersion) && value.expectedVersion >= 1, 'PRODUCTION_EXECUTION_EXPECTED_VERSION_INVALID', 'Expected production execution version is invalid'); return value.expectedVersion; }
function requireEntity(value, code, details) { invariant(value, code, 'Entity not found', details); return value; }
function defaultIdGenerator() { return (prefix) => `${prefix}_${randomUUID()}`; }
