import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { assertAcceptedShowroomAccess } from '../modules/showroom-invitations/public.mjs';
import {
  createBuyerCatalogVersion,
  createCommercialPublication,
  createPriceListVersion,
} from '../modules/commercial-publication/public.mjs';

export function createCommercialPublicationService({
  commercialStore,
  wholesaleStore,
  catalogReader,
  clock = () => new Date().toISOString(),
  nextId = defaultIdGenerator(),
} = {}) {
  invariant(commercialStore && typeof commercialStore.transaction === 'function', 'COMMERCIAL_PUBLICATION_STORE_REQUIRED', 'Commercial publication store is required');
  invariant(wholesaleStore && typeof wholesaleStore.transaction === 'function', 'WHOLESALE_STORE_REQUIRED', 'Wholesale store is required');
  invariant(catalogReader && typeof catalogReader.getSku === 'function', 'CATALOG_READER_REQUIRED', 'Catalog reader is required');

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return commercialStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      if (previous) return previous.result;
      const result = await action(tx);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: clock() }));
      return result;
    });
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId } }));
  }

  async function publicationContext(actorId, collectionId) {
    return wholesaleStore.transaction(async (tx) => {
      const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
      const membership = await tx.getMembership(collection.brandId, actorId);
      assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
      return collection;
    });
  }

  async function buyerCatalogContext(actorId, publication, showroomId, shopId) {
    return wholesaleStore.transaction(async (tx) => {
      const showroom = requireEntity(await tx.getShowroom(showroomId), 'SHOWROOM_NOT_FOUND', { showroomId });
      invariant(showroom.brandId === publication.brandId && showroom.collectionId === publication.collectionId, 'BUYER_CATALOG_SHOWROOM_MISMATCH', 'Showroom does not match commercial publication');
      const membership = await tx.getMembership(publication.brandId, actorId);
      assertCapability(membership, CAPABILITIES.SHOWROOM_MANAGE);
      const invitation = requireEntity(await tx.getShowroomInvitationByAccess(showroomId, shopId), 'SHOWROOM_INVITATION_NOT_FOUND', { showroomId, shopId });
      assertAcceptedShowroomAccess(invitation, { showroomId, brandId: publication.brandId, shopId, now: clock() });
      return Object.freeze({ showroom, invitation });
    });
  }

  return Object.freeze({
    async publishCommercialPublication(commandId, actorId, input) {
      invariant(input && Array.isArray(input.skuCodes), 'COMMERCIAL_PUBLICATION_SKUS_REQUIRED', 'skuCodes must be an array');
      const fingerprint = `publishCommercialPublication:${actorId}:${canonicalJson(input)}`;
      const collection = await publicationContext(actorId, input.collectionId);
      const catalogSkus = await Promise.all(input.skuCodes.map(async (skuCode) => requireEntity(await catalogReader.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode })));
      return execute(commandId, fingerprint, actorId, async (tx) => {
        const publication = createCommercialPublication({ id: nextId('commercial-publication'), collection, catalogSkus, publishedAt: clock() });
        await tx.insertCommercialPublication(publication);
        await append(tx, 'commercial-publication.published', publication.id, {
          brandId: publication.brandId, collectionId: publication.collectionId, currency: publication.currency,
          lineCount: publication.lines.length, contentHash: publication.contentHash,
        }, commandId, actorId);
        return publication;
      });
    },

    async publishBuyerCatalog(commandId, actorId, publicationId, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'BUYER_CATALOG_PUBLICATION_INVALID', 'Buyer catalog publication request is invalid');
      const fingerprint = `publishBuyerCatalog:${actorId}:${publicationId}:${canonicalJson(input)}`;
      const publication = requireEntity(await commercialStore.getCommercialPublication(publicationId), 'COMMERCIAL_PUBLICATION_NOT_FOUND', { publicationId });
      const context = await buyerCatalogContext(actorId, publication, input.showroomId, input.shopId);
      return execute(commandId, fingerprint, actorId, async (tx) => {
        const publishedAt = clock();
        const priceListVersion = createPriceListVersion({
          id: nextId('price-list-version'), publication, shopId: input.shopId,
          priceOverrides: input.priceOverrides ?? [], publishedAt,
        });
        const buyerCatalogVersion = createBuyerCatalogVersion({
          id: nextId('buyer-catalog-version'), publication, priceListVersion,
          showroom: context.showroom, invitation: context.invitation, publishedAt,
        });
        await tx.insertPriceListVersion(priceListVersion);
        await tx.insertBuyerCatalogVersion(buyerCatalogVersion);
        await append(tx, 'price-list-version.published', priceListVersion.id, {
          publicationId, brandId: publication.brandId, shopId: input.shopId, contentHash: priceListVersion.contentHash,
        }, commandId, actorId);
        await append(tx, 'buyer-catalog-version.published', buyerCatalogVersion.id, {
          publicationId, priceListVersionId: priceListVersion.id, showroomId: input.showroomId,
          shopId: input.shopId, accessGrantId: context.invitation.id, contentHash: buyerCatalogVersion.contentHash,
        }, commandId, actorId);
        return Object.freeze({ priceListVersion, buyerCatalogVersion });
      });
    },

    getCommercialPublication: (id) => commercialStore.getCommercialPublication(id),
    getBuyerCatalogVersion: (id) => commercialStore.getBuyerCatalogVersion(id),
    getBuyerCatalogForAccess: (showroomId, shopId) => commercialStore.getBuyerCatalogForAccess(showroomId, shopId),
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
