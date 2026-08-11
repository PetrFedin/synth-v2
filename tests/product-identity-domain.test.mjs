import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STYLE_LIFECYCLE,
  createProductAttributeValue,
  createProductCatalogSkuLink,
  createProductColorway,
  createProductMedia,
  createProductSizeScale,
  createProductSizeScaleVersion,
  createProductSizeValue,
  createProductSku,
  createProductStyle,
  createProductStyleVersion,
  hashProductIdentitySnapshot,
  transitionProductStyle,
} from '../src/modules/product-identity/public.mjs';

const at = '2026-08-12T09:00:00.000Z';
const actor = 'user:product-owner';

function fixture() {
  const style = createProductStyle({ id: 'style:001', brandId: 'brand:1', styleCode: 'DRS-001', createdAt: at, createdBy: actor });
  const styleVersion = createProductStyleVersion({
    id: 'style-version:001:v1',
    style,
    versionNo: 1,
    titleRu: 'Платье миди',
    titleEn: 'Midi dress',
    categoryRef: { entryId: 'mdm:category:dress', version: 3 },
    productTypeRef: { entryId: 'mdm:product-type:dress', version: 2 },
    technicalPayload: { construction: 'woven', season: 'SS27' },
    createdAt: at,
    createdBy: actor,
  });
  const colorway = createProductColorway({
    id: 'colorway:001:black',
    styleVersion,
    colorwayCode: 'BLK',
    nameRu: 'Чёрный',
    nameEn: 'Black',
    colorRef: { entryId: 'mdm:color:black', version: 1 },
    swatchHex: '#000000',
    createdAt: at,
    createdBy: actor,
  });
  const sizeScale = createProductSizeScale({
    id: 'size-scale:w-int',
    brandId: style.brandId,
    scaleCode: 'WOMENS-INT',
    nameRu: 'Женская международная',
    nameEn: 'Women international',
    createdAt: at,
    createdBy: actor,
  });
  const sizeScaleVersion = createProductSizeScaleVersion({
    id: 'size-scale-version:w-int:v1',
    sizeScale,
    versionNo: 1,
    sizeSystemRef: { entryId: 'mdm:size-system:int', version: 1 },
    createdAt: at,
    createdBy: actor,
  });
  const sizeValue = createProductSizeValue({
    id: 'size-value:w-int:v1:m',
    sizeScaleVersion,
    sizeCode: 'M',
    labelRu: 'M',
    labelEn: 'M',
    sortOrder: 30,
    sizeRef: { entryId: 'mdm:size:m', version: 1 },
    createdAt: at,
    createdBy: actor,
  });
  const sku = createProductSku({
    id: 'product-sku:DRS-001-BLK-M',
    skuCode: 'DRS-001-BLK-M',
    styleVersion,
    colorway,
    sizeValue,
    payload: { supplierArticle: 'SUP-991' },
    createdAt: at,
    createdBy: actor,
  });
  return { style, styleVersion, colorway, sizeScale, sizeScaleVersion, sizeValue, sku };
}

test('Product Style lifecycle follows the governed PLM progression and increments the head version', () => {
  const style = createProductStyle({ id: 'style:001', brandId: 'brand:1', styleCode: 'DRS-001', createdAt: at, createdBy: actor });
  const developing = transitionProductStyle(style, STYLE_LIFECYCLE.IN_DEVELOPMENT, { updatedAt: '2026-08-12T10:00:00.000Z', updatedBy: actor });
  const review = transitionProductStyle(developing, STYLE_LIFECYCLE.SAMPLE_REVIEW, { updatedAt: '2026-08-12T11:00:00.000Z', updatedBy: actor });
  assert.equal(style.lifecycleStatus, STYLE_LIFECYCLE.DRAFT);
  assert.equal(review.lifecycleStatus, STYLE_LIFECYCLE.SAMPLE_REVIEW);
  assert.equal(review.version, 3);
  assert.throws(
    () => transitionProductStyle(style, STYLE_LIFECYCLE.COMMERCIAL_READY, { updatedAt: at, updatedBy: actor }),
    (error) => error?.code === 'PRODUCT_STYLE_TRANSITION_INVALID',
  );
});

test('Style Version is immutable-by-construction and requires a contiguous predecessor chain', () => {
  const { style, styleVersion } = fixture();
  const v2 = createProductStyleVersion({
    id: 'style-version:001:v2',
    style,
    versionNo: 2,
    sourceStyleVersion: styleVersion,
    titleRu: 'Платье миди обновлённое',
    titleEn: 'Updated midi dress',
    technicalPayload: { construction: 'woven', revisionReason: 'fit' },
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: actor,
  });
  assert.equal(v2.sourceStyleVersionId, styleVersion.id);
  assert.equal(v2.versionNo, 2);
  assert.match(v2.contentHash, /^[0-9a-f]{64}$/);
  assert.throws(
    () => createProductStyleVersion({
      id: 'style-version:001:v3',
      style,
      versionNo: 3,
      sourceStyleVersion: styleVersion,
      titleRu: 'Версия три',
      titleEn: 'Version three',
      createdAt: at,
      createdBy: actor,
    }),
    (error) => error?.code === 'PRODUCT_STYLE_VERSION_SEQUENCE_INVALID',
  );
});

test('canonical SKU lineage is exact StyleVersion + Colorway + ordered SizeValue', () => {
  const { styleVersion, colorway, sizeValue, sku } = fixture();
  assert.equal(sku.brandId, styleVersion.brandId);
  assert.equal(sku.styleVersionId, styleVersion.id);
  assert.equal(sku.colorwayId, colorway.id);
  assert.equal(sku.sizeValueId, sizeValue.id);
  assert.match(sku.contentHash, /^[0-9a-f]{64}$/);

  const wrongColorway = { ...colorway, styleVersionId: 'style-version:other:v1' };
  assert.throws(
    () => createProductSku({
      id: 'product-sku:bad',
      skuCode: 'DRS-001-BAD-M',
      styleVersion,
      colorway: wrongColorway,
      sizeValue,
      createdAt: at,
      createdBy: actor,
    }),
    (error) => error?.code === 'PRODUCT_SKU_COLORWAY_LINEAGE_MISMATCH',
  );
});

test('Size Scale versions are contiguous and Size Values retain explicit buyer ordering', () => {
  const { sizeScale, sizeScaleVersion, sizeValue } = fixture();
  const v2 = createProductSizeScaleVersion({
    id: 'size-scale-version:w-int:v2',
    sizeScale,
    versionNo: 2,
    sourceSizeScaleVersion: sizeScaleVersion,
    payload: { reason: 'add XXL' },
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: actor,
  });
  assert.equal(v2.sourceSizeScaleVersionId, sizeScaleVersion.id);
  assert.equal(sizeValue.sortOrder, 30);
  assert.throws(
    () => createProductSizeScaleVersion({
      id: 'size-scale-version:w-int:v4',
      sizeScale,
      versionNo: 4,
      sourceSizeScaleVersion: sizeScaleVersion,
      createdAt: at,
      createdBy: actor,
    }),
    (error) => error?.code === 'PRODUCT_SIZE_SCALE_VERSION_SEQUENCE_INVALID',
  );
});

test('Media and attributes preserve exact variant/MDM context without becoming commercial price truth', () => {
  const { styleVersion, colorway, sku } = fixture();
  const media = createProductMedia({
    id: 'media:001',
    styleVersion,
    colorway,
    mediaType: 'image',
    mediaRole: 'hero',
    uri: 's3://product-media/DRS-001/black/hero.jpg',
    sortOrder: 0,
    createdAt: at,
    createdBy: actor,
  });
  const attribute = createProductAttributeValue({
    id: 'attribute-value:001',
    ownerType: 'sku',
    owner: sku,
    attributeCode: 'apparel.fit',
    attributeCatalogVersion: '0.1.0',
    value: 'regular',
    mdmRef: { entryId: 'mdm:fit:regular', version: 2 },
    createdAt: at,
    createdBy: actor,
  });
  assert.equal(media.colorwayId, colorway.id);
  assert.deepEqual(attribute.mdmRef, { entryId: 'mdm:fit:regular', version: 2 });
});

test('legacy catalog SKU bridge is one explicit compatibility edge, not a second Product Master', () => {
  const { sku } = fixture();
  const link = createProductCatalogSkuLink({
    id: 'product-catalog-link:001',
    productSku: sku,
    catalogSku: { sku: sku.skuCode, brandId: sku.brandId },
    brandId: sku.brandId,
    linkedAt: at,
    linkedBy: actor,
  });
  assert.equal(link.productSkuId, sku.id);
  assert.equal(link.catalogSku, sku.skuCode);
  assert.throws(
    () => createProductCatalogSkuLink({
      id: 'product-catalog-link:bad',
      productSku: sku,
      catalogSku: { sku: 'OTHER-SKU', brandId: sku.brandId },
      brandId: sku.brandId,
      linkedAt: at,
      linkedBy: actor,
    }),
    (error) => error?.code === 'PRODUCT_CATALOG_SKU_LINK_CODE_MISMATCH',
  );
});

test('Product Identity snapshot hash is key-order stable', () => {
  assert.equal(
    hashProductIdentitySnapshot({ b: 2, a: { y: 2, x: 1 } }),
    hashProductIdentitySnapshot({ a: { x: 1, y: 2 }, b: 2 }),
  );
});
