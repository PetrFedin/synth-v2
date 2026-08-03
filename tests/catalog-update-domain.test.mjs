import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogSku, publishCatalogSku, updateDraftCatalogSku } from '../src/modules/catalog/public.mjs';

const collection = Object.freeze({ id: 'collection-1', brandId: 'brand-1', currency: 'EUR', status: 'published' });

function draft() {
  return createCatalogSku({
    sku: 'SKU-1',
    collection,
    brandId: 'brand-1',
    name: 'Jacket',
    wholesalePrice: 80,
    currency: 'EUR',
    minimumOrderQuantity: 2,
    availableQuantity: 10,
    createdAt: '2026-08-03T10:00:00.000Z',
  });
}

test('draft catalog update changes only mutable commercial fields and increments version once', () => {
  const original = draft();
  const updated = updateDraftCatalogSku(original, collection, {
    name: '  Jacket Updated  ',
    wholesalePrice: 82.5,
    minimumOrderQuantity: 3,
    availableQuantity: 12,
  }, '2026-08-03T11:00:00.000Z');

  assert.deepEqual({
    sku: updated.sku,
    collectionId: updated.collectionId,
    brandId: updated.brandId,
    currency: updated.currency,
    status: updated.status,
    createdAt: updated.createdAt,
    publishedAt: updated.publishedAt,
  }, {
    sku: original.sku,
    collectionId: original.collectionId,
    brandId: original.brandId,
    currency: original.currency,
    status: 'draft',
    createdAt: original.createdAt,
    publishedAt: null,
  });
  assert.equal(updated.name, 'Jacket Updated');
  assert.equal(updated.wholesalePrice, 82.5);
  assert.equal(updated.minimumOrderQuantity, 3);
  assert.equal(updated.availableQuantity, 12);
  assert.equal(updated.availableToSell, 12);
  assert.equal(updated.version, original.version + 1);
  assert.equal(updated.updatedAt, '2026-08-03T11:00:00.000Z');
  assert.equal(Object.isFrozen(updated), true);
});

test('identical normalized draft update is a no-op without timestamp or version churn', () => {
  const original = draft();
  const result = updateDraftCatalogSku(original, collection, {
    name: ' Jacket ',
    wholesalePrice: 80,
    minimumOrderQuantity: 2,
    availableQuantity: 10,
  }, '2026-08-03T12:00:00.000Z');
  assert.equal(result, original);
});

test('published catalog SKU cannot be edited and draft availability cannot fall below reserved quantity', () => {
  const original = draft();
  const published = publishCatalogSku(original, collection, '2026-08-03T11:00:00.000Z');
  assert.throws(
    () => updateDraftCatalogSku(published, collection, {
      name: published.name,
      wholesalePrice: published.wholesalePrice,
      minimumOrderQuantity: published.minimumOrderQuantity,
      availableQuantity: published.availableQuantity,
    }, '2026-08-03T12:00:00.000Z'),
    (error) => error?.code === 'CATALOG_SKU_NOT_DRAFT',
  );

  const reservedDraft = Object.freeze({ ...original, reservedQuantity: 4, availableToSell: 6 });
  assert.throws(
    () => updateDraftCatalogSku(reservedDraft, collection, {
      name: original.name,
      wholesalePrice: original.wholesalePrice,
      minimumOrderQuantity: original.minimumOrderQuantity,
      availableQuantity: 3,
    }, '2026-08-03T12:00:00.000Z'),
    (error) => error?.code === 'CATALOG_RESERVED_QUANTITY_INVALID',
  );
});
