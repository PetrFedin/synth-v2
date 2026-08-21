import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuyerCatalogVersion, createPriceListVersion, createProjectionBackedCommercialPublication } from '../src/modules/commercial-publication/public.mjs';

const at = '2026-08-12T12:00:00.000Z';
const hash = 'a'.repeat(64);
const collection = { id: 'collection:1', brandId: 'brand:1', currency: 'RUB', status: 'published' };

function projection() {
  return {
    id: 'projection:1', styleVersionId: 'style-version:1', brandId: 'brand:1', readinessSnapshotId: 'readiness:1', versionNo: 1, status: 'published', contentHash: hash,
    payload: {
      commercialPreparation: { brandId: 'brand:1', titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description', compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU', currency: 'RUB', wholesalePriceMinor: 100000, rrpMinor: 200000, minimumOrderQuantity: 1, minimumOrderValueMinor: 0, packRatio: [1,1], deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z', availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media:hero','media:black'] },
      technicalSnapshot: {
        technicalEvidence: [{ productSkuId: 'psku:1', skuCode: 'SKU-1' }],
        product: {
          style: { id: 'style:1', styleCode: 'DRS-001', brandId: 'brand:1' },
          styleVersion: { id: 'style-version:1', versionNo: 1, contentHash: hash, categoryRef: { entryId: 'category:dress', version: 2 }, productTypeRef: null, genderRef: null },
          styleMedia: [{ id: 'media:hero', mediaType: 'image', mediaRole: 'hero', uri: 'https://cdn.example/hero.jpg', sortOrder: 0, colorwayId: null }], styleAttributes: [],
          colorways: [{ id: 'color:black', colorwayCode: 'BLK', nameRu: 'Черный', nameEn: 'Black', colorRef: { entryId: 'color:black', version: 1 }, swatchHex: '#000000', media: [{ id: 'media:black', mediaType: 'image', mediaRole: 'gallery', uri: 'https://cdn.example/black.jpg', sortOrder: 0, colorwayId: 'color:black' }], attributes: [], skus: [{ id: 'psku:1', skuCode: 'SKU-1', contentHash: hash, gtin: null, sizeValueId: 'size:m', attributes: [], size: { id: 'size:m', sizeScaleId: 'scale:1', sizeScaleVersionId: 'scale-version:1', sizeScaleVersionNo: 1, scaleCode: 'INT', scaleNameRu: 'Международный', scaleNameEn: 'International', code: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 2, mdmRef: null } }] }],
        },
      },
    },
  };
}

test('V2 publication derives Style -> Colorway -> ordered Size/SKU and price only from immutable projection payload', () => {
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: projection(), publishedAt: at });
  assert.equal(publication.formatVersion, 2);
  assert.equal(publication.commercialProjectionId, 'projection:1');
  assert.equal(publication.commercialProjectionVersionNo, 1);
  assert.equal(publication.styles[0].styleVersionId, 'style-version:1');
  assert.equal(publication.styles[0].colorways[0].skus[0].size.code, 'M');
  assert.equal(publication.lines[0].productSkuId, 'psku:1');
  assert.equal(publication.lines[0].catalogVersion, 1);
  assert.equal(publication.lines[0].unitPrice, 1000);
  assert.equal(publication.lines[0].currency, 'RUB');
  assert.equal(publication.lines[0].minimumOrderQuantity, 1);
  assert.equal(Object.hasOwn(publication.styles[0].colorways[0].skus[0], 'legacyCatalogSnapshot'), false);
});

test('V2 publication does not depend on legacyEvidence or flat catalog compatibility snapshots', () => {
  const value = projection();
  value.payload.technicalSnapshot.technicalEvidence = [];
  value.payload.technicalSnapshot.legacyEvidence = [{ productSkuId: 'psku:1', catalog: { status: 'draft', wholesalePrice: 1, currency: 'USD', version: 999 } }];
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: value, publishedAt: at });
  assert.equal(publication.lines[0].unitPrice, 1000);
  assert.equal(publication.lines[0].currency, 'RUB');
  assert.equal(publication.lines[0].catalogVersion, 1);
});

test('projection-backed publication fails closed when canonical commercial wholesale price is invalid', () => {
  const value = projection();
  value.payload.commercialPreparation.wholesalePriceMinor = 0;
  assert.throws(() => createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: value, publishedAt: at }), (error) => error?.code === 'COMMERCIAL_PUBLICATION_PRICE_INVALID');
});

test('rich Style hierarchy and exact projection lineage survive PriceList and BuyerCatalog snapshots', () => {
  const publication = createProjectionBackedCommercialPublication({ id: 'publication:1', collection, commercialProjection: projection(), publishedAt: at });
  const priceList = createPriceListVersion({ id: 'price:1', publication, shopId: 'shop:1', priceOverrides: [{ sku: 'SKU-1', unitPrice: 950 }], publishedAt: at });
  assert.equal(priceList.styles[0].colorways[0].skus[0].buyerUnitPrice, 950);
  assert.equal(priceList.commercialProjectionId, 'projection:1');
  assert.equal(priceList.commercialProjectionVersionNo, 1);
  assert.equal(priceList.commercialProjectionContentHash, hash);
  assert.equal(priceList.readinessSnapshotId, 'readiness:1');
  assert.equal(priceList.styleVersionId, 'style-version:1');

  const buyer = createBuyerCatalogVersion({ id: 'buyer:1', publication, priceListVersion: priceList, showroom: { id: 'showroom:1', brandId: 'brand:1', collectionId: 'collection:1', status: 'open' }, invitation: { id: 'invite:1', showroomId: 'showroom:1', brandId: 'brand:1', shopId: 'shop:1', status: 'accepted' }, publishedAt: at });
  assert.equal(buyer.styles[0].colorways[0].skus[0].buyerUnitPrice, 950);
  assert.equal(buyer.commercialProjectionId, 'projection:1');
  assert.equal(buyer.commercialProjectionVersionNo, 1);
  assert.equal(buyer.commercialProjectionContentHash, hash);
  assert.equal(buyer.readinessSnapshotId, 'readiness:1');
  assert.equal(buyer.styleVersionId, 'style-version:1');
});
