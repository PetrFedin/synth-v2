import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createCostAllocationPolicyVersion,
  createCostAllocationRun,
} from '../modules/order-economics/cost-allocation.mjs';

export function createCostAllocationService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'COST_ALLOCATION_STORE_REQUIRED', 'Cost allocation store is required');

  function execute(commandId, fingerprint, actorId, authorize, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await authorize(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    createPolicyVersion(commandId, actorId, brandId, input) {
      return execute(
        commandId,
        `createCostAllocationPolicy:${actorId}:${brandId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const membership = await tx.getMembership(brandId, actorId);
          assertCapability(membership, CAPABILITIES.COST_MANAGE);
          return Object.freeze({ brandId });
        },
        async (tx) => {
          const policy = createCostAllocationPolicyVersion({
            id: nextId('cost-allocation-policy'),
            brandId,
            name: input.name,
            version: input.version,
            defaultBasis: input.defaultBasis,
            rules: input.rules ?? [],
            createdAt: clock(),
          });
          await tx.insertPolicyVersion(policy);
          await append(tx, 'cost-allocation.policy-approved', policy.id, {
            brandId: policy.brandId,
            name: policy.name,
            version: policy.version,
            defaultBasis: policy.defaultBasis,
            rules: policy.rules,
            contentHash: policy.contentHash,
          }, commandId, actorId);
          return policy;
        },
      );
    },

    allocateLandedCost(commandId, actorId, orderId, input) {
      return execute(
        commandId,
        `allocateLandedCost:${actorId}:${orderId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          const membership = await tx.getMembership(order.brandId, actorId);
          assertCapability(membership, CAPABILITIES.COST_MANAGE);
          invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Cost allocation requires an immutable order commit snapshot', { orderId });
          const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
          return Object.freeze({ order, orderCommit });
        },
        async (tx, { order, orderCommit }) => {
          const landedCost = requireEntity(await tx.getLandedCostSnapshot(input.landedCostSnapshotId), 'LANDED_COST_SNAPSHOT_NOT_FOUND', { landedCostSnapshotId: input.landedCostSnapshotId });
          const policy = requireEntity(await tx.getPolicyVersion(input.policyVersionId), 'COST_ALLOCATION_POLICY_NOT_FOUND', { policyVersionId: input.policyVersionId });
          const costEntries = await tx.listActualCostEntries(orderId);
          const run = createCostAllocationRun({
            id: nextId('cost-allocation-run'),
            order,
            orderCommit,
            landedCost,
            costEntries,
            policy,
            customWeightsByCostEntryId: input.customWeightsByCostEntryId ?? {},
            createdAt: clock(),
          });
          await tx.insertAllocationRun(run);
          await append(tx, 'cost-allocation.actualized', run.id, {
            orderId: run.orderId,
            orderCommitSnapshotId: run.orderCommitSnapshotId,
            landedCostSnapshotId: run.landedCostSnapshotId,
            policyVersionId: run.policyVersionId,
            allocatedTotal: run.allocatedTotal,
            currency: run.currency,
            skuCount: run.skuEconomics.length,
            costEntryCount: run.costEntryIds.length,
            contentHash: run.contentHash,
          }, commandId, actorId);
          return run;
        },
      );
    },

    async getPolicyVersionForActor(actorId, policyVersionId) {
      return store.transaction(async (tx) => {
        const policy = requireEntity(await tx.getPolicyVersion(policyVersionId), 'COST_ALLOCATION_POLICY_NOT_FOUND', { policyVersionId });
        const membership = await tx.getMembership(policy.brandId, actorId);
        assertCapability(membership, CAPABILITIES.MARGIN_READ);
        return policy;
      });
    },

    async getAllocationRunForActor(actorId, allocationRunId) {
      return store.transaction(async (tx) => {
        const run = requireEntity(await tx.getAllocationRun(allocationRunId), 'COST_ALLOCATION_RUN_NOT_FOUND', { allocationRunId });
        const membership = await tx.getMembership(run.brandId, actorId);
        assertCapability(membership, CAPABILITIES.MARGIN_READ);
        return run;
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
