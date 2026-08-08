import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createActualCostLedgerEntry,
  createActualCostReversalEntry,
  createLandedCostSnapshot,
  createMarginActualizationSnapshot,
  createOrderFxRateSnapshot,
  createSupplyCommitmentSnapshot,
} from '../modules/order-economics/public.mjs';

export function createOrderEconomicsService({
  economicsStore,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(economicsStore && typeof economicsStore.transaction === 'function', 'ORDER_ECONOMICS_STORE_REQUIRED', 'Order economics store is required');

  function execute(commandId, fingerprint, actorId, authorize, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return economicsStore.transaction(async (tx) => {
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

  async function orderForCapability(tx, orderId, actorId, capability) {
    const order = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
    const membership = await tx.getMembership(order.brandId, actorId);
    assertCapability(membership, capability);
    return order;
  }

  async function executionBasisForCapability(tx, orderId, actorId, capability) {
    const order = await orderForCapability(tx, orderId, actorId, capability);
    invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Supply and cost actualization require an immutable order commit snapshot', { orderId });
    const orderCommit = requireEntity(
      await tx.getOrderCommitSnapshot(order.orderCommitSnapshotId),
      'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
      { orderId, orderCommitSnapshotId: order.orderCommitSnapshotId },
    );
    return Object.freeze({ order, orderCommit });
  }

  async function loadCostBasis(tx, input) {
    const supplyCommitment = requireEntity(
      await tx.getSupplyCommitment(input.supplyCommitmentSnapshotId),
      'SUPPLY_COMMITMENT_NOT_FOUND',
      { supplyCommitmentSnapshotId: input.supplyCommitmentSnapshotId },
    );
    const fxRateSnapshot = input.fxRateSnapshotId
      ? requireEntity(await tx.getFxRateSnapshot(input.fxRateSnapshotId), 'FX_RATE_SNAPSHOT_NOT_FOUND', { fxRateSnapshotId: input.fxRateSnapshotId })
      : null;
    return Object.freeze({ supplyCommitment, fxRateSnapshot });
  }

  return Object.freeze({
    createSupplyCommitment(commandId, actorId, orderId, input) {
      return execute(
        commandId,
        `createSupplyCommitment:${actorId}:${orderId}:${canonicalJson(input)}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.SUPPLY_MANAGE),
        async (tx, { order, orderCommit }) => {
          const commitment = createSupplyCommitmentSnapshot({ id: nextId('supply-commitment'), order, orderCommit, allocations: input.allocations, createdAt: clock() });
          await tx.insertSupplyCommitment(commitment);
          await append(tx, 'supply-commitment.created', commitment.id, {
            orderId,
            orderVersion: commitment.orderVersion,
            orderCommitSnapshotId: commitment.orderCommitSnapshotId,
            allocationCount: commitment.allocations.length,
            commercialPublicationId: commitment.commercialPublicationId,
            buyerCatalogVersionId: commitment.buyerCatalogVersionId,
            contentHash: commitment.contentHash,
          }, commandId, actorId);
          return commitment;
        },
      );
    },

    createFxRateSnapshot(commandId, actorId, orderId, input) {
      return execute(
        commandId,
        `createFxRateSnapshot:${actorId}:${orderId}:${canonicalJson(input)}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.COST_MANAGE),
        async (tx, { order, orderCommit }) => {
          const snapshot = createOrderFxRateSnapshot({
            id: nextId('fx-rate'),
            order,
            orderCommit,
            sourceCurrency: input.sourceCurrency,
            rate: input.rate,
            rateType: input.rateType,
            sourceRef: input.sourceRef,
            effectiveAt: input.effectiveAt,
            recordedAt: clock(),
          });
          await tx.insertFxRateSnapshot(snapshot);
          await append(tx, 'fx-rate.snapshot-recorded', snapshot.id, {
            orderId,
            orderCommitSnapshotId: snapshot.orderCommitSnapshotId,
            sourceCurrency: snapshot.sourceCurrency,
            targetCurrency: snapshot.targetCurrency,
            rate: snapshot.rate,
            rateType: snapshot.rateType,
            effectiveAt: snapshot.effectiveAt,
            sourceRef: snapshot.sourceRef,
            contentHash: snapshot.contentHash,
          }, commandId, actorId);
          return snapshot;
        },
      );
    },

    recordActualCost(commandId, actorId, orderId, input) {
      return execute(
        commandId,
        `recordActualCost:${actorId}:${orderId}:${canonicalJson(input)}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.COST_MANAGE),
        async (tx, { order, orderCommit }) => {
          const { supplyCommitment, fxRateSnapshot } = await loadCostBasis(tx, input);
          const entry = createActualCostLedgerEntry({
            id: nextId('actual-cost'),
            order,
            orderCommit,
            supplyCommitment,
            costType: input.costType,
            amount: input.amount,
            currency: input.currency,
            fxRateSnapshot,
            sku: input.sku ?? null,
            sourceRef: input.sourceRef,
            occurredAt: input.occurredAt ?? clock(),
            recordedAt: clock(),
          });
          await tx.insertActualCostEntry(entry);
          await appendActualCostRecorded(tx, entry, commandId, actorId);
          return entry;
        },
      );
    },

    correctActualCost(commandId, actorId, orderId, originalEntryId, input) {
      return execute(
        commandId,
        `correctActualCost:${actorId}:${orderId}:${originalEntryId}:${canonicalJson(input)}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.COST_MANAGE),
        async (tx, { order, orderCommit }) => {
          const originalEntry = requireEntity(await tx.getActualCostEntry(originalEntryId), 'ACTUAL_COST_ENTRY_NOT_FOUND', { originalEntryId });
          invariant(originalEntry.orderId === orderId && originalEntry.orderCommitSnapshotId === orderCommit.id, 'ACTUAL_COST_CORRECTION_LINEAGE_MISMATCH', 'Actual cost entry belongs to another order commit', { originalEntryId, orderId, orderCommitSnapshotId: orderCommit.id });
          const existingReversal = await tx.getActualCostReversal(originalEntryId);
          invariant(!existingReversal, 'ACTUAL_COST_ALREADY_CORRECTED', 'Actual cost entry already has a reversal', { originalEntryId, reversalEntryId: existingReversal?.id });

          const correctionId = nextId('cost-correction');
          const recordedAt = clock();
          const reversal = createActualCostReversalEntry({
            id: nextId('actual-cost-reversal'),
            correctionId,
            reason: input.reason,
            order,
            orderCommit,
            originalEntry,
            recordedAt,
          });
          const { supplyCommitment, fxRateSnapshot } = await loadCostBasis(tx, input);
          const replacement = createActualCostLedgerEntry({
            id: nextId('actual-cost'),
            order,
            orderCommit,
            supplyCommitment,
            costType: input.costType,
            amount: input.amount,
            currency: input.currency,
            fxRateSnapshot,
            sku: input.sku ?? null,
            sourceRef: input.sourceRef,
            occurredAt: input.occurredAt ?? recordedAt,
            recordedAt,
            correctionId,
            correctionReason: input.reason,
          });

          await tx.insertActualCostEntry(reversal);
          await tx.insertActualCostEntry(replacement);
          await append(tx, 'actual-cost.reversed', reversal.id, {
            orderId,
            orderCommitSnapshotId: reversal.orderCommitSnapshotId,
            supplyCommitmentSnapshotId: reversal.supplyCommitmentSnapshotId,
            reversalOfEntryId: reversal.reversalOfEntryId,
            correctionId,
            sourceAmount: reversal.sourceAmount,
            sourceCurrency: reversal.sourceCurrency,
            fxRateSnapshotId: reversal.fxRateSnapshotId,
            amount: reversal.amount,
            currency: reversal.currency,
          }, commandId, actorId);
          await appendActualCostRecorded(tx, replacement, commandId, actorId);
          await append(tx, 'actual-cost.corrected', correctionId, {
            orderId,
            orderCommitSnapshotId: orderCommit.id,
            originalEntryId,
            reversalEntryId: reversal.id,
            replacementEntryId: replacement.id,
            correctionReason: replacement.correctionReason,
          }, commandId, actorId);
          return Object.freeze({ correctionId, originalEntryId, reversal, replacement });
        },
      );
    },

    actualizeLandedCost(commandId, actorId, orderId) {
      return execute(
        commandId,
        `actualizeLandedCost:${actorId}:${orderId}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.COST_MANAGE),
        async (tx, { order, orderCommit }) => {
          const entries = await tx.listActualCostEntries(orderId);
          const currentEntries = entries.filter((entry) => entry.orderCommitSnapshotId === orderCommit.id);
          const snapshot = createLandedCostSnapshot({ id: nextId('landed-cost'), order, orderCommit, costEntries: currentEntries, createdAt: clock() });
          await tx.insertLandedCostSnapshot(snapshot);
          await append(tx, 'landed-cost.actualized', snapshot.id, {
            orderId,
            orderCommitSnapshotId: snapshot.orderCommitSnapshotId,
            supplyCommitmentSnapshotIds: snapshot.supplyCommitmentSnapshotIds,
            supplyLineageComplete: snapshot.supplyLineageComplete,
            totalCost: snapshot.totalCost,
            currency: snapshot.currency,
            costEntryCount: snapshot.costEntryIds.length,
            contentHash: snapshot.contentHash,
          }, commandId, actorId);
          return snapshot;
        },
      );
    },

    actualizeMargin(commandId, actorId, orderId, landedCostSnapshotId) {
      return execute(
        commandId,
        `actualizeMargin:${actorId}:${orderId}:${landedCostSnapshotId}`,
        actorId,
        (tx) => executionBasisForCapability(tx, orderId, actorId, CAPABILITIES.COST_MANAGE),
        async (tx, { order, orderCommit }) => {
          const landedCost = requireEntity(await tx.getLandedCostSnapshot(landedCostSnapshotId), 'LANDED_COST_SNAPSHOT_NOT_FOUND', { landedCostSnapshotId });
          const snapshot = createMarginActualizationSnapshot({ id: nextId('margin-actualization'), order, orderCommit, landedCost, createdAt: clock() });
          await tx.insertMarginActualizationSnapshot(snapshot);
          await append(tx, 'margin.actualized', snapshot.id, {
            orderId,
            orderCommitSnapshotId: snapshot.orderCommitSnapshotId,
            landedCostSnapshotId,
            supplyCommitmentSnapshotIds: snapshot.supplyCommitmentSnapshotIds,
            supplyLineageComplete: snapshot.supplyLineageComplete,
            netRevenue: snapshot.netRevenue,
            landedCost: snapshot.landedCost,
            contributionMarginAmount: snapshot.contributionMarginAmount,
            contributionMarginPercent: snapshot.contributionMarginPercent,
            commercialPublicationId: snapshot.commercialPublicationId,
            buyerCatalogVersionId: snapshot.buyerCatalogVersionId,
            contentHash: snapshot.contentHash,
          }, commandId, actorId);
          return snapshot;
        },
      );
    },

    async getMarginForActor(actorId, marginActualizationId) {
      return economicsStore.transaction(async (tx) => {
        const margin = requireEntity(await tx.getMarginActualizationSnapshot(marginActualizationId), 'MARGIN_ACTUALIZATION_NOT_FOUND', { marginActualizationId });
        const order = await orderForCapability(tx, margin.orderId, actorId, CAPABILITIES.MARGIN_READ);
        return Object.freeze({ margin, orderId: order.id });
      });
    },
  });

  async function appendActualCostRecorded(tx, entry, commandId, actorId) {
    await append(tx, 'actual-cost.recorded', entry.id, {
      orderId: entry.orderId,
      orderCommitSnapshotId: entry.orderCommitSnapshotId,
      supplyCommitmentSnapshotId: entry.supplyCommitmentSnapshotId,
      entryKind: entry.entryKind,
      correctionId: entry.correctionId,
      correctionReason: entry.correctionReason,
      costType: entry.costType,
      sourceAmount: entry.sourceAmount,
      sourceCurrency: entry.sourceCurrency,
      fxRateSnapshotId: entry.fxRateSnapshotId,
      amount: entry.amount,
      currency: entry.currency,
      sku: entry.sku,
      sourceRef: entry.sourceRef,
    }, commandId, actorId);
  }
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
