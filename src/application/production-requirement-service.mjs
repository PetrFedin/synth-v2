import { randomUUID } from 'node:crypto';
import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createProductionRequirementSnapshot } from '../modules/order-economics/production-requirement.mjs';

export function createProductionRequirementService({
  store,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCTION_REQUIREMENT_STORE_REQUIRED', 'Production requirement store is required');

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim().length > 0, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim().length > 0, 'ACTOR_ID_REQUIRED', 'Production requirement mutation requires actor id');
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
    assertCapability(membership, CAPABILITIES.PRODUCTION_ALLOCATE);
    invariant(membership.organisationType === 'brand', 'PRODUCTION_REQUIREMENT_BRAND_MEMBERSHIP_REQUIRED', 'Production demand access requires a brand membership', { brandId, actorId });
    return membership;
  }

  return Object.freeze({
    createFromSupplyCommitment(commandId, actorId, orderId, supplyCommitmentSnapshotId) {
      invariant(typeof orderId === 'string' && orderId.length > 0, 'PRODUCTION_REQUIREMENT_ORDER_ID_REQUIRED', 'Order id is required');
      invariant(typeof supplyCommitmentSnapshotId === 'string' && supplyCommitmentSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_SUPPLY_ID_REQUIRED', 'Supply commitment snapshot id is required');
      const fingerprint = `createProductionRequirement:${actorId}:${orderId}:${supplyCommitmentSnapshotId}`;
      return execute(
        commandId,
        fingerprint,
        actorId,
        async (tx) => {
          const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          await authorize(tx, order.brandId, actorId);
          invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_ORDER_COMMIT_REQUIRED', 'Order must have an immutable commit snapshot before production demand can be released', { orderId });
          const orderCommit = requireEntity(await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId), 'ORDER_COMMIT_SNAPSHOT_NOT_FOUND', { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId });
          const supplyCommitment = requireEntity(await tx.getSupplyCommitment(supplyCommitmentSnapshotId), 'SUPPLY_COMMITMENT_NOT_FOUND', { supplyCommitmentSnapshotId });
          const existing = await tx.getProductionRequirementBySupplyCommitment(supplyCommitmentSnapshotId);
          return Object.freeze({ order, orderCommit, supplyCommitment, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCTION_REQUIREMENT_FOR_SUPPLY_EXISTS', 'Supply commitment already has an immutable production requirement', {
            supplyCommitmentSnapshotId,
            productionRequirementSnapshotId: context.existing?.id ?? null,
          });
          const snapshot = createProductionRequirementSnapshot({
            id: nextId('production-requirement'),
            order: context.order,
            orderCommit: context.orderCommit,
            supplyCommitment: context.supplyCommitment,
            createdAt: clock(),
          });
          await tx.insertProductionRequirement(snapshot);
          await tx.appendOutbox(domainEvent({
            id: nextId('event'),
            type: 'production-requirement.created',
            aggregateId: snapshot.id,
            occurredAt: clock(),
            payload: {
              orderId: snapshot.orderId,
              orderCommitSnapshotId: snapshot.orderCommitSnapshotId,
              supplyCommitmentSnapshotId: snapshot.supplyCommitmentSnapshotId,
              brandId: snapshot.brandId,
              shopId: snapshot.shopId,
              collectionId: snapshot.collectionId,
              showroomId: snapshot.showroomId,
              commercialPublicationId: snapshot.commercialPublicationId,
              buyerCatalogVersionId: snapshot.buyerCatalogVersionId,
              lineCount: snapshot.lines.length,
              totalProductionQuantity: snapshot.totalProductionQuantity,
              productSkuIds: snapshot.lines.map((line) => line.productSkuId),
              contentHash: snapshot.contentHash,
            },
            metadata: { commandId, actorId },
          }));
          return snapshot;
        },
      );
    },

    async getForActor(actorId, productionRequirementSnapshotId) {
      invariant(typeof actorId === 'string' && actorId.trim().length > 0, 'ACTOR_ID_REQUIRED', 'Production requirement read requires actor id');
      invariant(typeof productionRequirementSnapshotId === 'string' && productionRequirementSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_ID_REQUIRED', 'Production requirement snapshot id is required');
      return store.transaction(async (tx) => {
        const requirement = requireEntity(await tx.getProductionRequirement(productionRequirementSnapshotId), 'PRODUCTION_REQUIREMENT_NOT_FOUND', { productionRequirementSnapshotId });
        await authorize(tx, requirement.brandId, actorId);
        return requirement;
      });
    },

    async getBySupplyCommitmentForActor(actorId, supplyCommitmentSnapshotId) {
      invariant(typeof actorId === 'string' && actorId.trim().length > 0, 'ACTOR_ID_REQUIRED', 'Production requirement read requires actor id');
      invariant(typeof supplyCommitmentSnapshotId === 'string' && supplyCommitmentSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_SUPPLY_ID_REQUIRED', 'Supply commitment snapshot id is required');
      return store.transaction(async (tx) => {
        const requirement = requireEntity(await tx.getProductionRequirementBySupplyCommitment(supplyCommitmentSnapshotId), 'PRODUCTION_REQUIREMENT_NOT_FOUND', { supplyCommitmentSnapshotId });
        await authorize(tx, requirement.brandId, actorId);
        return requirement;
      });
    },

    async get(productionRequirementSnapshotId) {
      invariant(typeof productionRequirementSnapshotId === 'string' && productionRequirementSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_ID_REQUIRED', 'Production requirement snapshot id is required');
      return store.getProductionRequirement(productionRequirementSnapshotId);
    },

    async getBySupplyCommitment(supplyCommitmentSnapshotId) {
      invariant(typeof supplyCommitmentSnapshotId === 'string' && supplyCommitmentSnapshotId.length > 0, 'PRODUCTION_REQUIREMENT_SUPPLY_ID_REQUIRED', 'Supply commitment snapshot id is required');
      return store.getProductionRequirementBySupplyCommitment(supplyCommitmentSnapshotId);
    },
  });
}

function requireEntity(value, code, details) {
  invariant(value, code, 'Entity not found', details);
  return value;
}
function defaultIdGenerator() {
  return (prefix) => `${prefix}_${randomUUID()}`;
}
