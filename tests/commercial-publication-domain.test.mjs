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

// DEPRECATED V1 payloads below model already-persisted immutable history. They
// are not created through today's buyer-commercial new-write API.
const historicalPublication = createCommercialPublication({ id: 'PUB-1', collection, catalogSkus, publishedAt });
const historicalPriceList = Object.freeze({
  id: 'PRICE-1', publicationId: 'PUB-1', brandId: 'BRAND-1', shopId: 'SHOP-1', currency: 'EUR', status: 'published',
  lines: Object.freeze([
    Object.freeze({ sku: 'SKU-1', catalogVersion: 3, unitPrice: 72.5, currency: 'EUR', minimumOrderQuantity: 2 }),
    Object.freeze({ sku: 'SKU-2', catalogVersion: 1, unitPrice: 55, currency: 'EUR', minimumOrderQuantity: 1 }),
  ]),
  contentHash: 'a'.repeat(64), publishedAt,
});
const historicalBuyerCatalog = Object.freeze({
  ...historicalPriceList,
  id: 'BUYER-CAT-1',
  priceListVersionId: 'PRICE-1',
  showroomId: 'SHOW-1',
  accessGrantId: 'INV-1',
  collectionId: 'COL-1',
  contentHash: 'b'.repeat(64),
});
const showroom = Object.freeze({ id: 'SHOW-1', brandId: 'BRAND-1', collectionId: 'COL-1', status: 'open' });
const invitation = Object.freeze({ id: 'INV-1', showroomId: 'SHOW-1', brandId: 'BRAND-1', shopId: 'SHOP-1', status: 'accepted' });

test('historical flat commercial snapshots remain readable without synthesizing ProductSku identity', () => {
  assert.equal(historicalPublication.lines[0].catalogVersion, 3);
  assert.equal(historicalPublication.lines[0].unitPrice, 80);
  assert.equal(Object.hasOwn(historicalPublication.lines[0], 'productSkuId'), false);
  assert.equal(buyerCatalogLine(historicalBuyerCatalog, 'SKU-1').unitPrice, 72.5);
  assert.equal(buyerCatalogLine(historicalBuyerCatalog, 'SKU-2').unitPrice, 55);
  assert.match(historicalPublication.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(historicalPublication));
  assert.ok(Object.isFrozen(historicalBuyerCatalog));
});

test('historical V1 publication cannot originate a new PriceListVersion', () => {
  for (const priceOverrides of [[], [{ sku: 'SKU-1', unitPrice: 72.5 }]]) {
    assert.throws(
      () => createPriceListVersion({ id: 'PRICE-NEW', publication: historicalPublication, shopId: 'SHOP-1', priceOverrides, publishedAt }),
      (error) => error?.code === 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
    );
  }
});

test('historical V1 publication and price list cannot originate a new BuyerCatalogVersion', () => {
  const before = JSON.stringify({ historicalPublication, historicalPriceList });
  assert.throws(
    () => createBuyerCatalogVersion({ id: 'BUYER-NEW', publication: historicalPublication, priceListVersion: historicalPriceList, showroom, invitation, publishedAt }),
    (error) => error?.code === 'PRICE_LIST_CANONICAL_PUBLICATION_REQUIRED',
  );
  assert.equal(JSON.stringify({ historicalPublication, historicalPriceList }), before);
});
