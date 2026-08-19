import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertWholesaleStore } from './store-contract.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { assertCatalogAvailableToSell, assertCatalogQuantity, assertPublishedCatalogSku } from '../modules/catalog/public.mjs';
import { assertBuyerCatalogQuantity, buyerCatalogLine, buyerCatalogProductSku, isRichBuyerCatalog } from '../modules/commercial-publication/public.mjs';
import { assertActiveRelationship } from '../modules/counterparty-relationships/public.mjs';
import { createBuyerCommercialSnapshot } from '../modules/retail-doors/public.mjs';
import { assertAcceptedShowroomAccess } from '../modules/showroom-invitations/public.mjs';
import { createShowroom, openShowroom } from '../modules/showrooms/public.mjs';
import { createSelection, replaceSelectionLines, submitSelection, upsertSelectionLine } from '../modules/selections/public.mjs';
import { advanceCommercialCycle } from '../modules/commercial-cycle/public.mjs';

const MATRIX_MAX_LINES = 5_000;

export function createShowroomSelectionService({
  store,
  catalogReader,
  commercialPublicationReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  assertWholesaleStore(store);
  const trustedCatalogReader = catalogReader && typeof catalogReader.getSku === 'function'
    ? catalogReader
    : Object.freeze({ getSku: async () => undefined });
  const trustedCommercialReader = commercialPublicationReader && typeof commercialPublicationReader.getBuyerCatalogVersion === 'function'
    && typeof commercialPublicationReader.getBuyerCatalogForAccess === 'function'
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
    const event = domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } });
    await tx.appendOutbox(event);
  }

  async function assertOrganisationActor(tx, organisationId, actorId, capability) {
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
  }

  function assertClientControlledLine(line) {
    invariant(line && typeof line === 'object' && !Array.isArray(line), 'SELECTION_LINE_INPUT_INVALID', 'Selection line input is invalid');
    invariant(line.unitPrice === undefined && line.currency === undefined && line.catalogVersion === undefined, 'SELECTION_CLIENT_PRICE_FORBIDDEN', 'Selection price and currency are controlled by the published commercial basis');
  }

  async function richBuyerCatalogForSelection(current) {
    invariant(current.buyerCatalogVersionId, 'SELECTION_MATRIX_BUYER_CATALOG_REQUIRED', 'Selection matrix requires a pinned BuyerCatalogVersion');
    invariant(trustedCommercialReader, 'COMMERCIAL_PUBLICATION_READER_REQUIRED', 'Commercial publication reader is required for a pinned selection');
    const buyerCatalog = requireEntity(await trustedCommercialReader.getBuyerCatalogVersion(current.buyerCatalogVersionId), 'BUYER_CATALOG_NOT_FOUND', { buyerCatalogVersionId: current.buyerCatalogVersionId });
    invariant(buyerCatalog.contentHash === current.commercialBasisHash, 'SELECTION_COMMERCIAL_BASIS_CHANGED', 'Pinned buyer catalog does not match selection commercial basis');
    invariant(isRichBuyerCatalog(buyerCatalog), 'SELECTION_MATRIX_RICH_CATALOG_REQUIRED', 'Color and size matrix requires a rich BuyerCatalogVersion');
    return buyerCatalog;
  }

  function richTrustedLine(buyerCatalog, line) {
    const product = buyerCatalogProductSku(buyerCatalog, { skuCode: line.sku });
    const quantity = assertBuyerCatalogQuantity(product, line.quantity);
    return Object.freeze({
      sku: product.sku,
      quantity,
      unitPrice: product.unitPrice,
      currency: product.currency,
      catalogVersion: product.catalogVersion,
      productSkuId: product.productSkuId,
      gtin: product.gtin,
      styleId: product.styleId,
      styleVersionId: product.styleVersionId,
      colorwayId: product.colorwayId,
      sizeValueId: product.sizeValueId,
      sizeCode: product.sizeCode,
      sizeLabelRu: product.sizeLabelRu,
      sizeLabelEn: product.sizeLabelEn,
      sizeSortOrder: product.sizeSortOrder,
      note: line.note,
    });
  }

  async function trustedLineForUpsert(current, line) {
    if (current.buyerCatalogVersionId) {
      invariant(trustedCommercialReader, 'COMMERCIAL_PUBLICATION_READER_REQUIRED', 'Commercial publication reader is required for a pinned selection');
      const buyerCatalog = requireEntity(await trustedCommercialReader.getBuyerCatalogVersion(current.buyerCatalogVersionId), 'BUYER_CATALOG_NOT_FOUND', { buyerCatalogVersionId: current.buyerCatalogVersionId });
      invariant(buyerCatalog.contentHash === current.commercialBasisHash, 'SELECTION_COMMERCIAL_BASIS_CHANGED', 'Pinned buyer catalog does not match selection commercial basis');

      if (isRichBuyerCatalog(buyerCatalog)) return richTrustedLine(buyerCatalog, line);

      const liveSku = await trustedCatalogReader.getSku(line.sku);
      const commercialLine = buyerCatalogLine(buyerCatalog, line.sku);
      invariant(line.quantity >= commercialLine.minimumOrderQuantity, 'BUYER_CATALOG_MOQ_NOT_MET', 'Selection quantity is below buyer catalog MOQ', { sku: line.sku, minimumOrderQuantity: commercialLine.minimumOrderQuantity });
      assertCatalogAvailableToSell(liveSku, line.quantity, { sku: line.sku, collectionId: current.collectionId, brandId: current.brandId });
      return Object.freeze({
        sku: commercialLine.sku,
        quantity: line.quantity,
        unitPrice: commercialLine.unitPrice,
        currency: commercialLine.currency,
        catalogVersion: commercialLine.catalogVersion,
        note: line.note,
      });
    }

    const liveSku = await trustedCatalogReader.getSku(line.sku);
    const publishedSku = assertPublishedCatalogSku(liveSku, { collectionId: current.collectionId, brandId: current.brandId });
    const catalogSku = assertCatalogQuantity(publishedSku, line.quantity);
    return Object.freeze({
      sku: catalogSku.sku,
      quantity: line.quantity,
      unitPrice: catalogSku.wholesalePrice,
      currency: catalogSku.currency,
      catalogVersion: catalogSku.version,
      note: line.note,
    });
  }

  return Object.freeze({
    createShowroom(commandId, actorId, input) {
      return execute(
        commandId,
        `createShowroom:${actorId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const collection = requireEntity(await tx.getCollection(input.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: input.collectionId });
          await assertOrganisationActor(tx, collection.brandId, actorId, CAPABILITIES.SHOWROOM_MANAGE);
          return collection;
        },
        async (tx, collection) => {
          const showroom = createShowroom({ id: nextId('showroom'), collection, ...input, createdAt: clock() });
          await tx.insertShowroom(showroom);
          await append(tx, 'showroom.created', showroom.id, { collectionId: collection.id }, commandId, actorId);
          return showroom;
        },
      );
    },

    openShowroom(commandId, actorId, showroomId) {
      return execute(
        commandId,
        `openShowroom:${actorId}:${showroomId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
          await assertOrganisationActor(tx, current.brandId, actorId, CAPABILITIES.SHOWROOM_MANAGE);
          return current;
        },
        async (tx, current) => {
          const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
          const updated = openShowroom(current, collection, clock());
          await tx.saveShowroom(updated, current.version);
          await append(tx, 'showroom.opened', showroomId, { version: updated.version }, commandId, actorId);
          return updated;
        },
      );
    },

    createSelection(commandId, actorId, { cycleId, showroomId, retailDoorId = null }) {
      const normalizedRetailDoorId = typeof retailDoorId === 'string' && retailDoorId.trim().length > 0 ? retailDoorId.trim() : null;
      return execute(
        commandId,
        `createSelection:${actorId}:${cycleId}:${showroomId}:${normalizedRetailDoorId ?? 'legacy'}`,
        actorId,
        async (tx) => {
          const cycle = requireEntity(await tx.getCycle(cycleId), 'CYCLE_NOT_FOUND', { cycleId });
          const showroom = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
          await assertOrganisationActor(tx, cycle.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
          const relationship = await tx.getRelationshipByTrade(cycle.brandId, cycle.shopId);
          assertActiveRelationship(relationship, { brandId: cycle.brandId, shopId: cycle.shopId });
          const invitation = await tx.getShowroomInvitationByAccess(showroomId, cycle.shopId);
          assertAcceptedShowroomAccess(invitation, { showroomId, brandId: cycle.brandId, shopId: cycle.shopId, now: clock() });
          const buyerCatalog = trustedCommercialReader
            ? requireEntity(await trustedCommercialReader.getBuyerCatalogForAccess(showroomId, cycle.shopId), 'BUYER_CATALOG_REQUIRED', { showroomId, shopId: cycle.shopId })
            : null;
          let buyerCommercialSnapshot = null;
          if (buyerCatalog) {
            invariant(normalizedRetailDoorId, 'SELECTION_RETAIL_DOOR_REQUIRED', 'Buyer Catalog selection requires a Retail Door');
            const buyer = requireEntity(await tx.getOrganisation(cycle.shopId), 'SHOP_NOT_FOUND', { shopId: cycle.shopId });
            const door = requireEntity(await tx.getRetailDoor(normalizedRetailDoorId), 'RETAIL_DOOR_NOT_FOUND', { retailDoorId: normalizedRetailDoorId });
            buyerCommercialSnapshot = createBuyerCommercialSnapshot({ buyer, door });
          } else {
            invariant(normalizedRetailDoorId === null, 'SELECTION_RETAIL_DOOR_REQUIRES_BUYER_CATALOG', 'Retail Door can be pinned only to a Buyer Catalog selection');
          }
          return Object.freeze({ cycle, showroom, invitation, buyerCatalog, buyerCommercialSnapshot });
        },
        async (tx, { cycle, showroom, invitation, buyerCatalog, buyerCommercialSnapshot }) => {
          invariant(!await tx.getSelectionByCycle(cycleId), 'SELECTION_FOR_CYCLE_EXISTS', 'Cycle already has a selection', { cycleId });
          const selection = createSelection({
            id: nextId('selection'),
            cycle,
            showroom,
            commercialBasis: buyerCatalog,
            buyerCommercialSnapshot,
            createdAt: clock(),
          });
          const advanced = advanceCommercialCycle(cycle, 'selection', clock());
          await tx.insertSelection(selection);
          await tx.saveCycle(advanced, cycle.version);
          await append(tx, 'selection.created', selection.id, {
            cycleId, showroomId, invitationId: invitation.id,
            commercialPublicationId: selection.commercialPublicationId,
            priceListVersionId: selection.priceListVersionId,
            buyerCatalogVersionId: selection.buyerCatalogVersionId,
            commercialBasisHash: selection.commercialBasisHash,
            retailDoorId: selection.retailDoorId,
            retailDoorVersion: selection.retailDoorVersion,
          }, commandId, actorId);
          await append(tx, 'commercial-cycle.advanced', cycleId, { from: cycle.stage, to: advanced.stage, version: advanced.version }, commandId, actorId);
          return Object.freeze({ selection, cycle: advanced });
        },
      );
    },

    upsertSelectionLine(commandId, actorId, selectionId, line) {
      assertClientControlledLine(line);
      return execute(
        commandId,
        `upsertSelectionLine:${actorId}:${selectionId}:${canonicalJson(line)}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
          await assertOrganisationActor(tx, current.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
          return current;
        },
        async (tx, current) => {
          const trustedLine = await trustedLineForUpsert(current, line);
          const updated = upsertSelectionLine(current, trustedLine, actorId, clock());
          await tx.saveSelection(updated, current.version);
          await append(tx, 'selection.line-upserted', selectionId, {
            sku: trustedLine.sku, quantity: trustedLine.quantity, catalogVersion: trustedLine.catalogVersion,
            productSkuId: trustedLine.productSkuId ?? null,
            styleVersionId: trustedLine.styleVersionId ?? null,
            colorwayId: trustedLine.colorwayId ?? null,
            sizeValueId: trustedLine.sizeValueId ?? null,
            buyerCatalogVersionId: current.buyerCatalogVersionId, priceListVersionId: current.priceListVersionId,
          }, commandId, actorId);
          return updated;
        },
      );
    },

    replaceSelectionMatrix(commandId, actorId, selectionId, input) {
      invariant(input && Array.isArray(input.lines), 'SELECTION_MATRIX_INPUT_INVALID', 'Selection matrix requires a lines array');
      invariant(input.lines.length <= MATRIX_MAX_LINES, 'SELECTION_MATRIX_TOO_LARGE', `Selection matrix must not exceed ${MATRIX_MAX_LINES} lines`, { lineCount: input.lines.length });
      input.lines.forEach(assertClientControlledLine);
      return execute(
        commandId,
        `replaceSelectionMatrix:${actorId}:${selectionId}:${canonicalJson(input)}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
          await assertOrganisationActor(tx, current.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
          return current;
        },
        async (tx, current) => {
          const buyerCatalog = await richBuyerCatalogForSelection(current);
          const trustedLines = input.lines.map((line) => richTrustedLine(buyerCatalog, line));
          const updated = replaceSelectionLines(current, trustedLines, actorId, clock());
          await tx.saveSelection(updated, current.version);
          await append(tx, 'selection.matrix-replaced', selectionId, {
            lineCount: updated.lines.length,
            version: updated.version,
            buyerCatalogVersionId: current.buyerCatalogVersionId,
            priceListVersionId: current.priceListVersionId,
          }, commandId, actorId);
          return updated;
        },
      );
    },

    submitSelection(commandId, actorId, selectionId) {
      return execute(
        commandId,
        `submitSelection:${actorId}:${selectionId}`,
        actorId,
        async (tx) => {
          const current = requireEntity(await tx.getSelection(selectionId), 'SELECTION_NOT_FOUND', { selectionId });
          await assertOrganisationActor(tx, current.shopId, actorId, CAPABILITIES.SELECTION_WRITE);
          if (current.accessGrantId) {
            const invitation = requireEntity(await tx.getShowroomInvitation(current.accessGrantId), 'SHOWROOM_INVITATION_NOT_FOUND', { invitationId: current.accessGrantId });
            assertAcceptedShowroomAccess(invitation, { showroomId: current.showroomId, brandId: current.brandId, shopId: current.shopId, now: clock() });
          }
          return current;
        },
        async (tx, current) => {
          const cycle = requireEntity(await tx.getCycle(current.cycleId), 'CYCLE_NOT_FOUND', { cycleId: current.cycleId });
          const collection = requireEntity(await tx.getCollection(current.collectionId), 'COLLECTION_NOT_FOUND', { collectionId: current.collectionId });
          invariant(cycle.stage === 'selection', 'SELECTION_CYCLE_STAGE_INVALID', 'Cycle must be at selection stage before submission', { stage: cycle.stage });
          invariant(current.lines.every((line) => line.currency === collection.currency), 'SELECTION_CURRENCY_MISMATCH', 'Selection line currency must match collection currency');
          const submitted = submitSelection(current, clock());
          const advanced = advanceCommercialCycle(cycle, 'order-builder', clock());
          await tx.saveSelection(submitted, current.version);
          await tx.saveCycle(advanced, cycle.version);
          await append(tx, 'selection.submitted', selectionId, {
            lineCount: submitted.lines.length,
            commercialPublicationId: submitted.commercialPublicationId,
            priceListVersionId: submitted.priceListVersionId,
            buyerCatalogVersionId: submitted.buyerCatalogVersionId,
            retailDoorId: submitted.retailDoorId,
            retailDoorVersion: submitted.retailDoorVersion,
          }, commandId, actorId);
          await append(tx, 'commercial-cycle.advanced', cycle.id, { from: cycle.stage, to: advanced.stage, version: advanced.version }, commandId, actorId);
          return Object.freeze({ selection: submitted, cycle: advanced });
        },
      );
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
