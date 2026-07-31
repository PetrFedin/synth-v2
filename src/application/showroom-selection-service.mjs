import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { assertCatalogQuantity, assertPublishedCatalogSku } from '../modules/catalog/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { assertAcceptedShowroomAccess } from '../modules/showroom-invitations/public.mjs';
import { createShowroom, openShowroom } from '../modules/showrooms/public.mjs';
import { createSelection, submitSelection, upsertSelectionLine } from '../modules/selections/public.mjs';
import { advanceCommercialCycle } from '../modules/commercial-cycle/public.mjs';

export function createShowroomSelectionService({
  store,
  catalogReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  assertWholesaleStore(store);
  const trustedCatalogReader = catalogReader && typeof catalogReader.getSku === 'function'
    ? catalogReader
    : Object.freeze({ getSku: async () => undefined });

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(previous.fingerprint === fingerprint, 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
        return previous.result;
      }
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    const event = domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } });
    await tx.appendOutbox(event);
  }

  async function assertOrganisationActor(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
  }

  return Object.freeze({
    createShowroom(commandId, actorId, input) {
      return execute(commandId, `createShowroom:${actorId}:${JSON.stringify(input)}`, actorId, async (tx) => {
        const collection = requireEntity(await tx.getCollection(input.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: input.collectionId });
        await assertOrganisationActor(tx, collection.brandId, actorId, CAPABILITIES.SHOWROOM_MANAGE);
        const showroom = createShowroom({ id: nextId('showroom'), collection, ...input, createdAt: clock() });
        await tx.insertShowroom(showroom);
        await append(tx, 'showroom.created', showroom.id, { collectionId: collection.id }, commandId, actorId);
        return showroom;
      });
    },

    openShowroom(commandId, actorId, showroomId) {
      return execute(commandId, `openShowroom:${actorId}:${showroomId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
        const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
        await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.SHOWROOM_MANAGE);
        const updated = openShowroom(current, collection, clock());
        await tx.saveShowroom(updated, current.version);
        await append(tx, 'showroom.opened', showroomId, { version: updated.version }, commandId, actorId);
        return updated;
      });
    },

    createSelection(commandId, actorId, { cycleId, showroomId }) {
      return execute(commandId, `createSelection:${actorId}:${cycleId}:${showroomId}`, actorId, async (tx) => {
        const cycle = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
        const showroom = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
        await assertOrganisationActor(tx, cycle.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
        const relationship = await tx.getRelationshipByTrade(cycle.brandId, cycle.shopId);
        assertActiveRelationship(relationship, { brandId: cycle.brandId, shopId: cycle.shopId });
        const invitation = await tx.getShowroomInvitationByAccess(showroomId, cycle.shopId);
        assertAcceptedShowroomAccess(invitation, { showroomId, brandId: cycle.brandId, shopId: cycle.shopId, now: clock() });
        invariant(!await tx.getSelectionByCycle(cycleId), 'SELECTION_FOR_CYCLE_EXISTS', 'Cycle already has a selection', { cycleId });
        const selection = createSelection({ id: nextId('selection'), cycle, showroom, createdAt: clock() });
        const advanced = advanceCommercialCycle(cycle, 'selection', clock());
        await tx.insertSelection(selection);
        await tx.saveCycle(advanced, cycle.version);
        await append(tx, 'selection.created', selection.id, { cycleId, showroomId, invitationId: invitation.id }, commandId, actorId);
        await append(tx, 'commercial-cycle.advanced', cycleId, { from: cycle.stage, to: advanced.stage, version: advanced.version }, commandId, actorId);
        return Object.freeze({ selection, cycle: advanced });
      });
    },

    upsertSelectionLine(commandId, actorId, selectionId, line) {
      invariant(line?.unitPrice === undefined && line?.currency === undefined && line?.catalogVersion === undefined, 'SELECTION_CLIENT_PRICE_FORBIDDEN', 'Selection price and currency are controlled by the catalog');
      return execute(commandId, `upsertSelectionLine:${actorId}:${selectionId}:${JSON.stringify(line)}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
        await assertOrganisationActor(tx, current.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
        const publishedSku = assertPublishedCatalogSku(await trustedCatalogReader.getSku(line.sku), { collectionId: current.collectionId, brandId: current.brandId });
        const catalogSku = assertCatalogQuantity(publishedSku, line.quantity);
        const trustedLine = Object.freeze({
          sku: catalogSku.sku,
          quantity: line.quantity,
          unitPrice: catalogSku.wholesalePrice,
          currency: catalogSku.currency,
          catalogVersion: catalogSku.version,
          note: line.note,
        });
        const updated = upsertSelectionLine(current, trustedLine, actorId, clock());
        await tx.saveSelection(updated, current.version);
        await append(tx, 'selection.line-upserted', selectionId, { sku: trustedLine.sku, quantity: trustedLine.quantity, catalogVersion: trustedLine.catalogVersion }, commandId, actorId);
        return updated;
      });
    },

    submitSelection(commandId, actorId, selectionId) {
      return execute(commandId, `submitSelection:${actorId}:${selectionId}`, actorId, async (tx) => {
        const current = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
        await assertOrganisationActor(tx, current.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
        const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
        const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
        invariant(cycle.stage === 'selection', 'SELECTION_CYCLE_STAGE_INVALID', 'Cycle must be at selection stage before submission', { stage: cycle.stage });
        invariant(current.lines.every((line) => line.currency === collection.currency), 'SELECTION_CURRENCY_MISMATCH', 'Selection line currency must match collection currency');
        const submitted = submitSelection(current, clock());
        const advanced = advanceCommercialCycle(cycle, 'order-builder', clock());
        await tx.saveSelection(submitted, current.version);
        await tx.saveCycle(advanced, cycle.version);
        await append(tx, 'selection.submitted', selectionId, { lineCount: submitted.lines.length }, commandId, actorId);
        await append(tx, 'commercial-cycle.advanced', cycle.id, { from: cycle.stage, to: advanced.stage, version: advanced.version }, commandId, actorId);
        return Object.freeze({ selection: submitted, cycle: advanced });
      });
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
