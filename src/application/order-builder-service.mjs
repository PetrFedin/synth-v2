import { domainEvent } from '../core/events.mjs';
import { DomainError, invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability, assertTradeCapability } from '../modules/access-control/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { createOrderCommitSnapshot } from '../modules/order-commit/public.mjs';
import {
  createOrderDraft,
  reviseOrderTerms,
  acceptOrderTerms,
  attachReadyOrder,
  cancelAttachedOrder,
} from '../modules/orders/public.mjs';
import { assertAcceptedShowroomAccess } from '../modules/showroom-invitations/public.mjs';
import { advanceCommercialCycle, attachOrder, cancelCommercialCycleOrder } from '../modules/commercial-cycle/public.mjs';

const INVENTORY_ERROR_CODES = new Set([
  'CATALOG_SKU_NOT_FOUND',
  'CATALOG_SKU_NOT_PUBLISHED',
  'CATALOG_SKU_LINEAGE_MISMATCH',
  'CATALOG_MOQ_NOT_MET',
  'CATALOG_AVAILABILITY_EXCEEDED',
  'CATALOG_RESERVATION_NOT_FOUND',
  'CATALOG_RELEASE_EXCEEDS_RESERVED',
  'ORDER_COMMIT_SNAPSHOT_NOT_FOUND',
]);

export function createOrderBuilderService({
  store,
  commercialPublicationReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  assertWholesaleStore(store);
  const trustedCommercialReader = commercialPublicationReader && typeof commercialPublicationReader.getBuyerCatalogVersion === 'function'
    ? commercialPublicationReader
    : null;

  function execute(commandId, fingerprint, actorId, authorize, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      }
      const context = await authorize(tx);
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  return Object.freeze({
    createOrderDraft(commandId, actorId, { selectionId, terms }) {
      return execute(
        commandId,
        `createOrderDraft:${actorId}:${selectionId}:${canonicalJson(terms)}`,
        actorId,
        async (tx) => {
          const selection = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
          await assertOrganisationActor(tx, selection.shopId, actorId, CAPABILITIES.ORDER_WRITE);
          return selection;
        },
        async (tx, selection) => {
          const cycle = requireEntity(await tx.getCycle(selection.cycleId), 'CYCLE_NOT_FOUND', { cycleId: selection.cycleId });
          const collection = requireEntity(await tx.getCollection(selection.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: selection.collectionId });
          invariant(cycle.stage === 'order-builder', 'ORDER_BUILDER_STAGE_REQUIRED', 'Cycle must be at order-builder stage', { stage: cycle.stage });
          invariant(!await tx.getOrderByCycle(cycle.id), 'ORDER_FOR_CYCLE_EXISTS', 'Cycle already has an order draft', { cycleId: cycle.id });
          const order = createOrderDraft({ id: nextId('order'), selection, currency: collection.currency, terms, createdAt: clock() });
          await tx.insertOrder(order);
          await append(tx, 'order.draft-created', order.id, { selectionId, totalAmount: order.totalAmount, currency: order.currency }, commandId, actorId);
          return order;
        },
      );
    },

    reviseTerms(commandId, actorId, { orderId, expectedVersion, terms }) {
      return execute(
        commandId,
        versionedFingerprint(`reviseOrderTerms:${actorId}:${orderId}:${canonicalJson(terms)}`, expectedVersion),
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
          authorizeOrderMutation(await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId, cycle);
          return current;
        },
        async (tx, current) => {
          const updated = reviseOrderTerms(current, terms, clock(), expectedVersion ?? current.version);
          if (updated === current) return current;
          await tx.saveOrder(updated, current.version);
          await append(tx, 'order.terms-revised', orderId, {
            expectedVersion: current.version,
            version: updated.version,
            status: updated.status,
            approvalsReset: current.acceptedOrganisationIds.length > 0,
          }, commandId, actorId);
          return updated;
        },
      );
    },

    acceptTerms(commandId, actorId, { orderId, organisationId, expectedVersion }) {
      return execute(
        commandId,
        versionedFingerprint(`acceptOrderTerms:${actorId}:${orderId}:${organisationId}`, expectedVersion),
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          invariant(organisationId === current.brandId || organisationId === current.shopId, 'ORDER_PARTY_INVALID', 'Organisation is not an order party', { organisationId });
          await assertOrganisationActor(tx, organisationId, actorId, CAPABILITIES.ORDER_CONFIRM);
          return current;
        },
        async (tx, current) => {
          const updated = acceptOrderTerms(current, organisationId, clock(), expectedVersion ?? current.version);
          if (updated === current) return current;
          await tx.saveOrder(updated, current.version);
          await append(tx, 'order.terms-accepted', orderId, {
            organisationId,
            status: updated.status,
            expectedVersion: current.version,
            version: updated.version,
          }, commandId, actorId);
          return updated;
        },
      );
    },

    attachOrderToCycle(commandId, actorId, input) {
      const { orderId, expectedVersion } = normalizeOrderVersionInput(input);
      return execute(
        commandId,
        versionedFingerprint(`attachOrderToCycle:${actorId}:${orderId}`, expectedVersion),
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
          authorizeOrderMutation(await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId, cycle);
          const selection = requireEntity(await tx.getSelection(current.selectionId), 'SELECTION_NOT_FOUND', { selectionId: current.selectionId });
          let buyerCatalog = null;
          if (hasPinnedCommercialBasis(current)) {
            invariant(current.commercialPublicationId && current.priceListVersionId && current.buyerCatalogVersionId && current.commercialBasisHash && current.accessGrantId, 'ORDER_COMMERCIAL_BASIS_INCOMPLETE', 'Commercial order lineage is incomplete');
            invariant(trustedCommercialReader, 'COMMERCIAL_PUBLICATION_READER_REQUIRED', 'Commercial publication reader is required to commit a commercially pinned order');
            const relationship = requireEntity(await tx.getRelationshipByTrade(current.brandId, current.shopId), 'RELATIONSHIP_NOT_FOUND', { brandId: current.brandId, shopId: current.shopId });
            assertActiveRelationship(relationship, { brandId: current.brandId, shopId: current.shopId });
            const showroom = requireEntity(await tx.getShowroom(selection.showroomId), 'SHOWROOM_NOT_FOUND', { showroomId: selection.showroomId });
            invariant(showroom.status === 'open', 'ORDER_COMMIT_SHOWROOM_NOT_OPEN', 'Commercial order can be committed only while its showroom is open', { showroomId: showroom.id, status: showroom.status });
            const invitation = requireEntity(await tx.getShowroomInvitation(current.accessGrantId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId: current.accessGrantId });
            assertAcceptedShowroomAccess(invitation, { showroomId: selection.showroomId, brandId: current.brandId, shopId: current.shopId, now: clock() });
            buyerCatalog = requireEntity(await trustedCommercialReader.getBuyerCatalogVersion(current.buyerCatalogVersionId), 'BUYER_CATALOG_NOT_FOUND', { buyerCatalogVersionId: current.buyerCatalogVersionId });
          }
          return Object.freeze({ current, cycle, selection, buyerCatalog });
        },
        async (tx, { current, cycle, selection, buyerCatalog }) => {
          invariant(cycle.stage === 'order-builder', 'ORDER_BUILDER_STAGE_REQUIRED', 'Cycle must be at order-builder stage', { stage: cycle.stage });
          const committedAt = clock();
          const orderCommitSnapshotId = nextId('order-commit');
          const readyOrder = attachReadyOrder(current, committedAt, expectedVersion ?? current.version, orderCommitSnapshotId);
          const orderCommitSnapshot = createOrderCommitSnapshot({
            id: orderCommitSnapshotId,
            order: readyOrder,
            selection,
            buyerCatalog,
            committedAt,
          });
          const orderStage = advanceCommercialCycle(cycle, 'order', committedAt);
          await tx.insertOrderCommitSnapshot(orderCommitSnapshot);
          await tx.saveCycle(orderStage, cycle.version);
          const cycleWithOrder = attachOrder(orderStage, readyOrder, committedAt);
          await tx.saveCycle(cycleWithOrder, orderStage.version);
          await tx.saveOrder(readyOrder, current.version);
          await append(tx, 'order.commit-snapshot-created', orderCommitSnapshot.id, {
            orderId,
            orderVersion: readyOrder.version,
            commercialPublicationId: orderCommitSnapshot.commercialPublicationId,
            priceListVersionId: orderCommitSnapshot.priceListVersionId,
            buyerCatalogVersionId: orderCommitSnapshot.buyerCatalogVersionId,
            accessGrantId: orderCommitSnapshot.accessGrantId,
            contentHash: orderCommitSnapshot.contentHash,
          }, commandId, actorId);
          await append(tx, 'order.attached', orderId, {
            cycleId: cycle.id,
            totalAmount: readyOrder.totalAmount,
            orderCommitSnapshotId: orderCommitSnapshot.id,
            expectedVersion: current.version,
            version: readyOrder.version,
          }, commandId, actorId);
          await append(tx, 'commercial-cycle.advanced', cycle.id, { from: cycle.stage, to: orderStage.stage, version: orderStage.version }, commandId, actorId);
          return Object.freeze({ order: readyOrder, orderCommitSnapshot, cycle: cycleWithOrder });
        },
      ).catch(translateInventoryError);
    },

    cancelOrder(commandId, actorId, { orderId, reason, expectedVersion }) {
      return execute(
        commandId,
        versionedFingerprint(`cancelOrder:${actorId}:${orderId}:${reason}`, expectedVersion),
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getOrder(orderId), 'ORDER_NOT_FOUND', { orderId });
          const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
          authorizeOrderMutation(await tx.listMembershipsForTrade(cycle.brandId, cycle.shopId), actorId, cycle);
          return Object.freeze({ current, cycle });
        },
        async (tx, { current, cycle }) => {
          const cancelled = cancelAttachedOrder(current, reason, clock(), expectedVersion ?? current.version);
          const cancelledCycle = cancelCommercialCycleOrder(cycle, cancelled, clock());
          await tx.saveCycle(cancelledCycle, cycle.version);
          await tx.saveOrder(cancelled, current.version);
          await append(tx, 'order.cancelled', orderId, {
            cycleId: cycle.id,
            reason: cancelled.cancellationReason,
            expectedVersion: current.version,
            version: cancelled.version,
            releasedLines: cancelled.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
          }, commandId, actorId);
          return Object.freeze({ order: cancelled, cycle: cancelledCycle });
        },
      ).catch(translateInventoryError);
    },
  });
}

async function assertOrganisationActor(tx, organisationId, actorId, capability) {
  const membership = await tx.getMembership(organisationId, actorId);
  assertCapability(membership, capability);
}
function authorizeOrderMutation(memberships, actorId, cycle) {
  return assertTradeCapability({
    memberships,
    actorId,
    brandId: cycle.brandId,
    shopId: cycle.shopId,
    capability: CAPABILITIES.ORDER_WRITE,
  });
}
function hasPinnedCommercialBasis(order) {
  return Boolean(order?.commercialPublicationId || order?.priceListVersionId || order?.buyerCatalogVersionId || order?.commercialBasisHash || order?.accessGrantId);
}
function normalizeOrderVersionInput(input) {
  if (typeof input === 'string') return Object.freeze({ orderId: input, expectedVersion: undefined });
  return Object.freeze({ orderId: input?.orderId, expectedVersion: input?.expectedVersion });
}
function versionedFingerprint(base, expectedVersion) {
  return expectedVersion === undefined ? base : `${base}:${expectedVersion}`;
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }

function translateInventoryError(error) {
  if (error?.code === 'P0001' && INVENTORY_ERROR_CODES.has(error.message)) {
    let details = {};
    try { details = error.detail ? JSON.parse(error.detail) : {}; } catch { details = {}; }
    throw new DomainError(error.message, inventoryMessage(error.message), details);
  }
  throw error;
}
function inventoryMessage(code) {
  return ({
    CATALOG_SKU_NOT_FOUND: 'Catalog SKU not found during inventory mutation',
    CATALOG_SKU_NOT_PUBLISHED: 'Legacy order contains an unavailable catalog SKU',
    CATALOG_SKU_LINEAGE_MISMATCH: 'Catalog availability row does not match the pinned commercial order lineage',
    CATALOG_MOQ_NOT_MET: 'Legacy order quantity is below current catalog minimum order quantity',
    CATALOG_AVAILABILITY_EXCEEDED: 'Order quantity exceeds available-to-sell',
    CATALOG_RESERVATION_NOT_FOUND: 'Order inventory reservation is missing',
    CATALOG_RELEASE_EXCEEDS_RESERVED: 'Inventory release exceeds reserved quantity',
    ORDER_COMMIT_SNAPSHOT_NOT_FOUND: 'Pinned order commit snapshot is missing during inventory reservation',
  })[code] ?? 'Inventory mutation failed';
}
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
