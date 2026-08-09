import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buyerCatalogLine,
  createBuyerCatalogVersion,
  createCommercialPublication,
  createPriceListVersion,
} from '../src/modules/commercial-publication/public.mjs';

const publishedAt = '2026-08-08T00:00:00.000Z';
const collection = Object.freeze({ id: 'COL-1', brandId: 'BRAND-1', currency: 'EUR', status: 'published' });
const catalogSkus = Object.freeze([
  Object.freeze({ sku: 'SKU-1', name: 'Jacket', status: 'published', collectionId: 'COL-1', brandId: 'BRAND-1', currency: 'EUR', wholesalePrice: 80, minimumOrderQuantity: 2, version: 3 }),
  Object.freeze({ sku: 'SKU-2', name: 'Trouser', status: 'published', collectionId: 'COL-1', brandId: 'BRAND-1', currency: 'EUR', wholesalePrice: 55, minimumOrderQuantity: 1, version: 1 }),
]);

test('commercial publication freezes source catalog versions and buyer-specific prices', () => {
  const publication = createCommercialPublication({ id: 'PUB-1', collection, catalogSkus, publishedAt });
  const priceListVersion = createPriceListVersion({
    id: 'PRICE-1', publication, shopId: 'SHOP-1', priceOverrides: [{ sku: 'SKU-1', unitPrice: 72.5 }], publishedAt,
  });
  const showroom = Object.freeze({ id: 'SHOW-1', brandId: 'BRAND-1', collectionId: 'COL-1', status: 'open' });
  const invitation = Object.freeze({ id: 'INV-1', showroomId: 'SHOW-1', brandId: 'BRAND-1', shopId: 'SHOP-1', status: 'accepted' });
  const buyerCatalog = createBuyerCatalogVersion({ id: 'BUYER-CAT-1', publication, priceListVersion, showroom, invitation, publishedAt });

  assert.equal(publication.lines[0].catalogVersion, 3);
  assert.equal(buyerCatalogLine(buyerCatalog, 'SKU-1').unitPrice, 72.5);
  assert.equal(buyerCatalogLine(buyerCatalog, 'SKU-2').unitPrice, 55);
  assert.equal(buyerCatalog.priceListVersionId, 'PRICE-1');
  assert.equal(buyerCatalog.accessGrantId, 'INV-1');
  assert.match(publication.contentHash, /^[a-f0-9]{64}$/);
  assert.match(buyerCatalog.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(publication));
  assert.ok(Object.isFrozen(buyerCatalog));
});

test('buyer price list rejects unknown SKU overrides', () => {
  const publication = createCommercialPublication({ id: 'PUB-2', collection, catalogSkus, publishedAt });
  assert.throws(
    () => createPriceListVersion({ id: 'PRICE-2', publication, shopId: 'SHOP-1', priceOverrides: [{ sku: 'UNKNOWN', unitPrice: 10 }], publishedAt }),
    (error) => error?.code === 'PRICE_LIST_OVERRIDE_SKU_UNKNOWN',
  );
});
