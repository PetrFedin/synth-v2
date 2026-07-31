import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createCatalogSku, publishCatalogSku } from '../modules/catalog/public.mjs';

export function createCatalogService({ wholesaleStore, catalogStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(wholesaleStore && typeof wholesaleStore.transaction === 'function', 'WHOLESALE_STORE_REQUIRED', 'Wholesale store is required');
  invariant(catalogStore && typeof catalogStore.transaction === 'function', 'CATALOG_STORE_REQUIRED', 'Catalog store is required');

  async function context(collectionId, actorId) {
    return wholesaleStore.transaction(async (tx) => {
      const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
      const membership = await tx.getMembership(collection.brandId, actorId);
      assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
      return collection;
    });
  }

  function execute(commandId, fingerprint, actorId, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return catalogStore.transaction(async (tx) => {
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
    await tx.appendOutbox(domainEvent({
      id: nextId('event'), type, aggregateId, occurredAt: clock(), payload, metadata: { commandId, actorId },
    }));
  }

  async function syncAvailability(sku) {
    await wholesaleStore.transaction(async (tx) => {
      await tx.syncCatalogInventory?.(sku);
    });
  }

  return Object.freeze({
    async createSku(commandId, actorId, input) {
      const collection = await context(input.collectionId, actorId);
      const result = await execute(commandId, `createCatalogSku:${actorId}:${JSON.stringify(input)}`, actorId, async (tx) => {
        invariant(!await tx.getSku(input.sku), 'CATALOG_SKU_ALREADY_EXISTS', 'Catalog SKU already exists', { sku: input.sku });
        const sku = createCatalogSku({ ...input, collection, createdAt: clock() });
        await tx.insertSku(sku);
        await append(tx, 'catalog-sku.created', sku.sku, {
          collectionId: sku.collectionId,
          brandId: sku.brandId,
          minimumOrderQuantity: sku.minimumOrderQuantity,
          availableQuantity: sku.availableQuantity,
        }, commandId, actorId);
        return sku;
      });
      await syncAvailability(result);
      return result;
    },

    async publishSku(commandId, actorId, skuCode) {
      const current = requireEntity(await catalogStore.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
      const collection = await context(current.collectionId, actorId);
      const result = await execute(commandId, `publishCatalogSku:${actorId}:${skuCode}`, actorId, async (tx) => {
        const locked = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
        const published = publishCatalogSku(locked, collection, clock());
        await tx.saveSku(published, locked.version);
        await append(tx, 'catalog-sku.published', skuCode, {
          collectionId: published.collectionId,
          price: published.wholesalePrice,
          currency: published.currency,
          minimumOrderQuantity: published.minimumOrderQuantity,
          availableToSell: published.availableToSell,
        }, commandId, actorId);
        return published;
      });
      await syncAvailability(result);
      return result;
    },

    getSku(skuCode) { return catalogStore.getSku(skuCode); },
    async getPublishedSku(skuCode) {
      const sku = await catalogStore.getSku(skuCode);
      return sku?.status === 'published' ? sku : undefined;
    },
  });
}

function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
