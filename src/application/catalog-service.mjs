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
    await syncAvailabilityMany([sku]);
  }

  async function syncAvailabilityMany(skus) {
    const unique = [...new Map(skus.map((sku) => [sku.sku, sku])).values()];
    await wholesaleStore.transaction(async (tx) => {
      for (const sku of unique) await tx.syncCatalogInventory?.(sku);
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
          await append(tx, 'catalog-sku.updated', skuCode, updatedEventPayload(updated), commandId, actorId);
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
          await append(tx, 'catalog-sku.published', skuCode, publishedEventPayload(published), commandId, actorId);
          return published;
        },
      );
      await syncAvailability(result);
      return result;
    },

    async bulkMutateSkus(commandId, actorId, input) {
      const operations = normalizeBulkOperations(input);
      const result = await execute(
        commandId,
        `bulkMutateCatalogSkus:${actorId}:${canonicalJson(operations)}`,
        actorId,
        async (tx) => {
          const preparedBySku = new Map();
          for (const operation of [...operations].sort((left, right) => left.sku.localeCompare(right.sku))) {
            const locked = requireEntity(await tx.getSku(operation.sku), 'CATALOG_SKU_NOT_FOUND', { sku: operation.sku });
            const collection = await authorisedCollection(tx, locked.collectionId, actorId);
            preparedBySku.set(operation.sku, Object.freeze({ operation, locked, collection }));
          }
          return Object.freeze(operations.map((operation) => preparedBySku.get(operation.sku)));
        },
        async (tx, prepared) => {
          const items = [];
          let changed = 0;
          let unchanged = 0;
          let updated = 0;
          let published = 0;
          for (const { operation, locked, collection } of prepared) {
            assertExpectedVersion(locked, operation.expectedVersion);
            if (operation.type === 'update') {
              const next = updateDraftCatalogSku(locked, collection, operation.input, clock());
              items.push(next);
              if (next === locked) {
                unchanged += 1;
                continue;
              }
              await tx.saveSku(next, operation.expectedVersion);
              await append(tx, 'catalog-sku.updated', next.sku, updatedEventPayload(next), commandId, actorId);
              changed += 1;
              updated += 1;
              continue;
            }
            const next = publishCatalogSku(locked, collection, clock());
            await tx.saveSku(next, operation.expectedVersion);
            await append(tx, 'catalog-sku.published', next.sku, publishedEventPayload(next), commandId, actorId);
            items.push(next);
            changed += 1;
            published += 1;
          }
          return freezeBulkResult(items, { requested: operations.length, changed, unchanged, updated, published });
        },
      );
      await syncAvailabilityMany(result.items);
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
const CATALOG_BULK_MAX_OPERATIONS = 100;
const CATALOG_SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const CATALOG_BULK_UPDATE_FIELDS = Object.freeze(new Set(['type', 'sku', ...CATALOG_UPDATE_FIELDS]));
const CATALOG_BULK_PUBLISH_FIELDS = Object.freeze(new Set(['type', 'sku', 'expectedVersion']));

function normalizeBulkOperations(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'CATALOG_BULK_INVALID', 'Catalog bulk request is invalid');
  assertAllowedFields(input, new Set(['operations']), 'CATALOG_BULK_FIELD_FORBIDDEN', 'Catalog bulk request contains a forbidden field');
  invariant(Array.isArray(input.operations), 'CATALOG_BULK_INVALID', 'Catalog bulk operations must be an array');
  invariant(input.operations.length >= 1 && input.operations.length <= CATALOG_BULK_MAX_OPERATIONS, 'CATALOG_BULK_SIZE_INVALID', 'Catalog bulk request must contain from 1 to 100 operations', {
    min: 1, max: CATALOG_BULK_MAX_OPERATIONS, actual: input.operations.length,
  });
  const seen = new Set();
  return Object.freeze(input.operations.map((operation, index) => {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'CATALOG_BULK_OPERATION_INVALID', 'Catalog bulk operation is invalid', { index });
    invariant(operation.type === 'update' || operation.type === 'publish', 'CATALOG_BULK_OPERATION_TYPE_INVALID', 'Catalog bulk operation type is invalid', { index, type: operation.type });
    invariant(CATALOG_SKU_PATTERN.test(operation.sku ?? ''), 'CATALOG_BULK_SKU_INVALID', 'Catalog bulk operation SKU is invalid', { index, sku: operation.sku });
    invariant(!seen.has(operation.sku), 'CATALOG_BULK_SKU_DUPLICATE', 'Catalog bulk request contains duplicate SKU operations', { index, sku: operation.sku });
    seen.add(operation.sku);
    if (operation.type === 'publish') {
      assertAllowedFields(operation, CATALOG_BULK_PUBLISH_FIELDS, 'CATALOG_BULK_OPERATION_FIELD_FORBIDDEN', 'Catalog bulk publish contains a forbidden field');
      return Object.freeze({
        type: 'publish',
        sku: operation.sku,
        expectedVersion: assertPostgresInteger(operation.expectedVersion, { code: 'CATALOG_EXPECTED_VERSION_INVALID', label: 'Expected catalog version', min: 1 }),
      });
    }
    assertAllowedFields(operation, CATALOG_BULK_UPDATE_FIELDS, 'CATALOG_BULK_OPERATION_FIELD_FORBIDDEN', 'Catalog bulk update contains a forbidden field');
    return Object.freeze({
      type: 'update',
      sku: operation.sku,
      expectedVersion: assertPostgresInteger(operation.expectedVersion, { code: 'CATALOG_EXPECTED_VERSION_INVALID', label: 'Expected catalog version', min: 1 }),
      input: Object.freeze({
        name: operation.name,
        wholesalePrice: operation.wholesalePrice,
        minimumOrderQuantity: operation.minimumOrderQuantity,
        availableQuantity: operation.availableQuantity,
      }),
    });
  }));
}

function updatedEventPayload(updated) {
  return Object.freeze({
    collectionId: updated.collectionId,
    version: updated.version,
    name: updated.name,
    price: updated.wholesalePrice,
    currency: updated.currency,
    minimumOrderQuantity: updated.minimumOrderQuantity,
    availableQuantity: updated.availableQuantity,
    availableToSell: updated.availableToSell,
  });
}

function publishedEventPayload(published) {
  return Object.freeze({
    collectionId: published.collectionId,
    price: published.wholesalePrice,
    currency: published.currency,
    minimumOrderQuantity: published.minimumOrderQuantity,
    availableToSell: published.availableToSell,
    version: published.version,
  });
}

function freezeBulkResult(items, summary) {
  return Object.freeze({
    items: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
    summary: Object.freeze({ ...summary }),
  });
}

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
