import { domainEvent } from '../core/events.mjs';
import { invariant } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { assertPostgresInteger } from '../core/money.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import { createCatalogSku, publishCatalogSku, updateDraftCatalogSku } from '../modules/catalog/public.mjs';

export function createCatalogService({ wholesaleStore, catalogStore, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(wholesaleStore && typeof wholesaleStore.transaction === 'function', 'WHOLESALE_STORE_REQUIRED', 'Wholesale store is required');
  invariant(catalogStore && typeof catalogStore.transaction === 'function', 'CATALOG_STORE_REQUIRED', 'Catalog store is required');

  async function fallbackContext(collectionId, actorId) {
    return wholesaleStore.transaction(async (tx) => {
      const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
      const membership = await tx.getMembership(collection.brandId, actorId);
      assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
      return collection;
    });
  }

  async function authorisedCollection(tx, collectionId, actorId) {
    if (typeof tx.getCollection !== 'function' || typeof tx.getMembership !== 'function') {
      return fallbackContext(collectionId, actorId);
    }
    const collection = requireEntity(await tx.getCollection(collectionId), 'COLLECTION_NOT_FOUND', { collectionId });
    const membership = await tx.getMembership(collection.brandId, actorId);
    assertCapability(membership, CAPABILITIES.CATALOG_MANAGE);
    return collection;
  }

  function execute(commandId, fingerprint, actorId, prepare, action) {
    invariant(commandId, 'COMMAND_ID_REQUIRED', 'Every mutation requires commandId');
    return catalogStore.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) {
        invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      }
      const prepared = await prepare(tx);
      if (previous) return previous.result;
      const result = await action(tx, prepared);
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
      const result = await execute(
        commandId,
        `createCatalogSku:${actorId}:${canonicalJson(input)}`,
        actorId,
        (tx) => authorisedCollection(tx, input.collectionId, actorId),
        async (tx, collection) => {
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
        },
      );
      await syncAvailability(result);
      return result;
    },

    async updateSku(commandId, actorId, skuCode, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'CATALOG_UPDATE_INVALID', 'Catalog SKU update is invalid');
      assertAllowedFields(input, CATALOG_UPDATE_FIELDS, 'CATALOG_UPDATE_FIELD_FORBIDDEN', 'Catalog SKU update contains a forbidden field');
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'CATALOG_EXPECTED_VERSION_INVALID', label: 'Expected catalog version', min: 1 });
      const editable = Object.freeze({
        name: input.name,
        wholesalePrice: input.wholesalePrice,
        minimumOrderQuantity: input.minimumOrderQuantity,
        availableQuantity: input.availableQuantity,
      });
      const result = await execute(
        commandId,
        `updateCatalogSku:${actorId}:${skuCode}:${canonicalJson({ expectedVersion, ...editable })}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
          const collection = await authorisedCollection(tx, locked.collectionId, actorId);
          return Object.freeze({ locked, collection });
        },
        async (tx, { locked, collection }) => {
          assertExpectedVersion(locked, expectedVersion);
          const updated = updateDraftCatalogSku(locked, collection, editable, clock());
          if (updated === locked) return locked;
          await tx.saveSku(updated, expectedVersion);
          await append(tx, 'catalog-sku.updated', skuCode, {
            collectionId: updated.collectionId,
            version: updated.version,
            name: updated.name,
            price: updated.wholesalePrice,
            currency: updated.currency,
            minimumOrderQuantity: updated.minimumOrderQuantity,
            availableQuantity: updated.availableQuantity,
            availableToSell: updated.availableToSell,
          }, commandId, actorId);
          return updated;
        },
      );
      await syncAvailability(result);
      return result;
    },

    async publishSku(commandId, actorId, skuCode, input) {
      invariant(input && typeof input === 'object' && !Array.isArray(input), 'CATALOG_PUBLISH_INVALID', 'Catalog SKU publication request is invalid');
      const expectedVersion = assertPostgresInteger(input.expectedVersion, { code: 'CATALOG_EXPECTED_VERSION_INVALID', label: 'Expected catalog version', min: 1 });
      const result = await execute(
        commandId,
        `publishCatalogSku:${actorId}:${skuCode}:${expectedVersion}`,
        actorId,
        async (tx) => {
          const locked = requireEntity(await tx.getSku(skuCode), 'CATALOG_SKU_NOT_FOUND', { sku: skuCode });
          const collection = await authorisedCollection(tx, locked.collectionId, actorId);
          return Object.freeze({ locked, collection });
        },
        async (tx, { locked, collection }) => {
          assertExpectedVersion(locked, expectedVersion);
          const published = publishCatalogSku(locked, collection, clock());
          await tx.saveSku(published, expectedVersion);
          await append(tx, 'catalog-sku.published', skuCode, {
            collectionId: published.collectionId,
            price: published.wholesalePrice,
            currency: published.currency,
            minimumOrderQuantity: published.minimumOrderQuantity,
            availableToSell: published.availableToSell,
            version: published.version,
          }, commandId, actorId);
          return published;
        },
      );
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

const CATALOG_UPDATE_FIELDS = Object.freeze(new Set(['expectedVersion', 'name', 'wholesalePrice', 'minimumOrderQuantity', 'availableQuantity']));

function assertAllowedFields(input, allowed, code, message) {
  const forbidden = Object.keys(input).filter((field) => !allowed.has(field));
  invariant(forbidden.length === 0, code, message, { fields: forbidden.sort() });
}

function assertExpectedVersion(sku, expectedVersion) {
  invariant(sku.version === expectedVersion, 'CATALOG_SKU_CONCURRENCY_CONFLICT', 'Catalog SKU was changed by another operation', {
    sku: sku.sku, expectedVersion, actualVersion: sku.version,
  });
}
function requireEntity(entity, code, details) { invariant(entity, code, 'Entity not found', details); return entity; }
function defaultIdGenerator() { let sequence = 0; return (prefix) => `${prefix}_${++sequence}`; }
