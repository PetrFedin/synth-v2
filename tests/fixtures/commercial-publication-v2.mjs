export const publishedAt = '2026-08-12T12:00:00.000Z';
export const projectionHash = 'a'.repeat(64);
export const collection = Object.freeze({ id: 'collection:1', brandId: 'brand:1', currency: 'RUB', status: 'published' });

export function projection() {
  return {
    id: 'projection:1',
    styleVersionId: 'style-version:1',
    brandId: 'brand:1',
    readinessSnapshotId: 'readiness:1',
    versionNo: 1,
    status: 'published',
    contentHash: projectionHash,
    payload: {
      commercialPreparation: {
        brandId: 'brand:1', titleRu: 'Платье', titleEn: 'Dress', descriptionRu: 'Описание', descriptionEn: 'Description',
        compositionRu: 'Хлопок', compositionEn: 'Cotton', countryOfOrigin: 'RU', currency: 'RUB',
        wholesalePriceMinor: 100000, rrpMinor: 200000, minimumOrderQuantity: 1, minimumOrderValueMinor: 0,
        packRatio: [1, 1], deliveryStart: '2026-09-01T00:00:00.000Z', deliveryEnd: '2026-09-30T00:00:00.000Z',
        availability: { mode: 'available_to_sell', quantity: 10 }, mediaIds: ['media:hero', 'media:black'],
      },
      technicalSnapshot: {
        technicalEvidence: [{ productSkuId: 'psku:1', skuCode: 'SKU-1' }],
        product: {
          style: { id: 'style:1', styleCode: 'DRS-001', brandId: 'brand:1' },
          styleVersion: {
            id: 'style-version:1', versionNo: 1, contentHash: projectionHash,
            categoryRef: { entryId: 'category:dress', version: 2 }, productTypeRef: null, genderRef: null,
          },
          styleMedia: [{ id: 'media:hero', mediaType: 'image', mediaRole: 'hero', uri: 'https://cdn.example/hero.jpg', sortOrder: 0, colorwayId: null }],
          styleAttributes: [],
          colorways: [{
            id: 'color:black', colorwayCode: 'BLK', nameRu: 'Черный', nameEn: 'Black',
            colorRef: { entryId: 'color:black', version: 1 }, swatchHex: '#000000',
            media: [{ id: 'media:black', mediaType: 'image', mediaRole: 'gallery', uri: 'https://cdn.example/black.jpg', sortOrder: 0, colorwayId: 'color:black' }],
            attributes: [],
            skus: [{
              id: 'psku:1', skuCode: 'SKU-1', contentHash: projectionHash, gtin: null, sizeValueId: 'size:m', attributes: [],
              size: {
                id: 'size:m', sizeScaleId: 'scale:1', sizeScaleVersionId: 'scale-version:1', sizeScaleVersionNo: 1,
                scaleCode: 'INT', scaleNameRu: 'Международный', scaleNameEn: 'International', code: 'M', labelRu: 'M', labelEn: 'M', sortOrder: 2, mdmRef: null,
              },
            }],
          }],
        },
      },
    },
  };
}
