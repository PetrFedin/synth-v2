import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { normalizeMoney } from '../../core/money.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
export { assertBuyerCatalogQuantity, buyerCatalogProductSku, isRichBuyerCatalog } from './buyer-catalog-product.mjs';

// Historical V1 constructor is preserved only for old immutable snapshots/tests.
// New application writes use createProjectionBackedCommercialPublication.
export function createCommercialPublication({ id, collection, catalogSkus, publishedAt }) {
  invariant(id && collection?.id, 'COMMERCIAL_PUBLICATION_IDENTITY_REQUIRED', 'Publication id and collection are required');
  invariant(collection.status === 'published', 'COMMERCIAL_PUBLICATION_COLLECTION_NOT_PUBLISHED', 'Commercial publication requires a published collection');
  invariant(Array.isArray(catalogSkus) && catalogSkus.length > 0, 'COMMERCIAL_PUBLICATION_LINES_REQUIRED', 'Commercial publication requires at least one SKU');

  const seen = new Set();
  const lines = catalogSkus.map((sku) => legacyLine(sku, collection, seen)).sort((left, right) => left.sku.localeCompare(right.sku));
  const basis = Object.freeze({ brandId: collection.brandId, collectionId: collection.id, currency: collection.currency, lines: Object.freeze(lines) });
  return Object.freeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function createProjectionBackedCommercialPublication({ id, collection, commercialProjection, publishedAt }) {
  invariant(id && collection?.id && commercialProjection?.id, 'COMMERCIAL_PUBLICATION_IDENTITY_REQUIRED', 'Publication, collection and Commercial Product Projection identities are required');
  invariant(collection.status === 'published', 'COMMERCIAL_PUBLICATION_COLLECTION_NOT_PUBLISHED', 'Commercial publication requires a published collection');
  invariant(commercialProjection.status === 'published', 'COMMERCIAL_PUBLICATION_PROJECTION_NOT_PUBLISHED', 'Commercial publication requires a published Commercial Product Projection');
  invariant(commercialProjection.brandId === collection.brandId, 'COMMERCIAL_PUBLICATION_BRAND_MISMATCH', 'Commercial projection brand does not match collection brand');
  invariant(commercialProjection.payload?.commercialPreparation && commercialProjection.payload?.technicalSnapshot, 'COMMERCIAL_PUBLICATION_PROJECTION_PAYLOAD_INVALID', 'Commercial projection payload is incomplete');

  const preparation = commercialProjection.payload.commercialPreparation;
  const technical = commercialProjection.payload.technicalSnapshot;
  const product = technical.product;
  invariant(product?.styleVersion?.id === commercialProjection.styleVersionId, 'COMMERCIAL_PUBLICATION_STYLE_VERSION_MISMATCH', 'Commercial projection does not contain its exact StyleVersion');
  invariant(preparation.brandId === collection.brandId, 'COMMERCIAL_PUBLICATION_BRAND_MISMATCH', 'Commercial preparation brand does not match collection brand');
  invariant(preparation.currency === collection.currency, 'COMMERCIAL_PUBLICATION_CURRENCY_MISMATCH', 'Commercial preparation currency does not match collection currency');

  const colorways = Array.isArray(product.colorways) ? product.colorways : [];
  invariant(colorways.length > 0, 'COMMERCIAL_PUBLICATION_COLORWAYS_REQUIRED', 'Projection-backed publication requires at least one Colorway');
  const selectedMediaIds = new Set(Array.isArray(preparation.mediaIds) ? preparation.mediaIds : []);
  const styleMedia = selectMedia(product.styleMedia, selectedMediaIds);
  const legacyByProductSku = new Map((technical.legacyEvidence ?? []).map((row) => [row.productSkuId, row]));
  const seenSku = new Set();

  const projectedColorways = colorways
    .map((colorway) => projectColorway(colorway, {
      preparation,
      selectedMediaIds,
      legacyByProductSku,
      seenSku,
      collection,
      styleVersion: product.styleVersion,
    }))
    .sort((left, right) => left.colorwayCode.localeCompare(right.colorwayCode));

  const lines = projectedColorways
    .flatMap((colorway) => colorway.skus.map((sku) => compatibilityLine(sku, colorway, product.styleVersion, preparation)))
    .sort((left, right) => left.sku.localeCompare(right.sku));
  invariant(lines.length > 0, 'COMMERCIAL_PUBLICATION_LINES_REQUIRED', 'Projection-backed publication requires at least one Product SKU');

  const style = deepFreeze({
    styleId: product.style?.id,
    styleCode: product.style?.styleCode,
    styleVersionId: product.styleVersion.id,
    styleVersionNo: product.styleVersion.versionNo,
    styleVersionHash: product.styleVersion.contentHash,
    titleRu: preparation.titleRu,
    titleEn: preparation.titleEn,
    descriptionRu: preparation.descriptionRu,
    descriptionEn: preparation.descriptionEn,
    compositionRu: preparation.compositionRu,
    compositionEn: preparation.compositionEn,
    countryOfOrigin: preparation.countryOfOrigin,
    categoryRef: product.styleVersion.categoryRef ?? null,
    productTypeRef: product.styleVersion.productTypeRef ?? null,
    genderRef: product.styleVersion.genderRef ?? null,
    media: styleMedia,
    attributes: deepCopy(product.styleAttributes ?? []),
    commercialTerms: commercialTerms(preparation),
    colorways: projectedColorways,
  });

  const basis = deepFreeze({
    formatVersion: 2,
    commercialProjectionId: commercialProjection.id,
    commercialProjectionVersionNo: commercialProjection.versionNo,
    commercialProjectionContentHash: commercialProjection.contentHash,
    readinessSnapshotId: commercialProjection.readinessSnapshotId,
    styleVersionId: commercialProjection.styleVersionId,
    brandId: collection.brandId,
    collectionId: collection.id,
    currency: collection.currency,
    styles: [style],
    lines,
  });
  return deepFreeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function createPriceListVersion({ id, publication, shopId, priceOverrides = [], publishedAt }) {
  invariant(id && publication?.id && shopId, 'PRICE_LIST_VERSION_IDENTITY_REQUIRED', 'Price list version identity is required');
  invariant(publication.status === 'published', 'PRICE_LIST_PUBLICATION_NOT_PUBLISHED', 'Price list requires a published commercial publication');
  invariant(Array.isArray(priceOverrides), 'PRICE_LIST_OVERRIDES_INVALID', 'Price overrides must be an array');
  const overrides = new Map();
  for (const override of priceOverrides) {
    invariant(override && typeof override.sku === 'string', 'PRICE_LIST_OVERRIDE_SKU_REQUIRED', 'Price override SKU is required');
    invariant(!overrides.has(override.sku), 'PRICE_LIST_OVERRIDE_DUPLICATE', 'Price override SKU is duplicated', { sku: override.sku });
    invariant(publication.lines.some((line) => line.sku === override.sku), 'PRICE_LIST_OVERRIDE_SKU_UNKNOWN', 'Price override SKU is not in publication', { sku: override.sku });
    overrides.set(override.sku, normalizeMoney(override.unitPrice, {
      invalidCode: 'PRICE_LIST_OVERRIDE_PRICE_INVALID', scaleCode: 'PRICE_LIST_OVERRIDE_PRICE_SCALE_INVALID',
      overflowCode: 'PRICE_LIST_OVERRIDE_PRICE_TOO_LARGE', label: 'Price override',
    }));
  }

  const projectionBacked = publication.formatVersion === 2 && Array.isArray(publication.styles);
  const lines = publication.lines.map((line) => {
    const unitPrice = overrides.get(line.sku) ?? line.unitPrice;
    if (projectionBacked) return Object.freeze({ ...line, unitPrice });
    // Preserve the exact V1 immutable snapshot shape and therefore its hash basis.
    return Object.freeze({
      sku: line.sku,
      catalogVersion: line.catalogVersion,
      unitPrice,
      currency: line.currency,
      minimumOrderQuantity: line.minimumOrderQuantity,
    });
  });

  if (!projectionBacked) {
    const basis = Object.freeze({
      publicationId: publication.id,
      brandId: publication.brandId,
      shopId,
      currency: publication.currency,
      lines: Object.freeze(lines),
    });
    return Object.freeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
  }

  const basis = deepFreeze({
    publicationId: publication.id,
    brandId: publication.brandId,
    shopId,
    currency: publication.currency,
    lines,
    styles: applyBuyerPrices(publication.styles, lines),
  });
  return deepFreeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function createBuyerCatalogVersion({ id, publication, priceListVersion, showroom, invitation, publishedAt }) {
  invariant(id && publication?.id && priceListVersion?.id && showroom?.id && invitation?.id, 'BUYER_CATALOG_VERSION_IDENTITY_REQUIRED', 'Buyer catalog version identity is required');
  invariant(showroom.status === 'open', 'BUYER_CATALOG_SHOWROOM_NOT_OPEN', 'Buyer catalog requires an open showroom');
  invariant(showroom.brandId === publication.brandId && showroom.collectionId === publication.collectionId, 'BUYER_CATALOG_SHOWROOM_MISMATCH', 'Showroom does not match publication');
  invariant(invitation.status === 'accepted', 'BUYER_CATALOG_ACCESS_NOT_ACCEPTED', 'Buyer catalog requires accepted showroom access');
  invariant(invitation.showroomId === showroom.id && invitation.brandId === publication.brandId && invitation.shopId === priceListVersion.shopId, 'BUYER_CATALOG_ACCESS_MISMATCH', 'Showroom invitation does not match buyer catalog');
  invariant(priceListVersion.publicationId === publication.id, 'BUYER_CATALOG_PRICE_LIST_MISMATCH', 'Price list does not belong to publication');

  const basis = deepFreeze({
    publicationId: publication.id,
    priceListVersionId: priceListVersion.id,
    brandId: publication.brandId,
    shopId: priceListVersion.shopId,
    showroomId: showroom.id,
    accessGrantId: invitation.id,
    collectionId: publication.collectionId,
    currency: publication.currency,
    lines: priceListVersion.lines,
    ...(priceListVersion.styles ? { styles: priceListVersion.styles } : {}),
  });
  return deepFreeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function buyerCatalogLine(catalog, sku) {
  invariant(catalog?.status === 'published', 'BUYER_CATALOG_NOT_PUBLISHED', 'Buyer catalog must be published');
  const line = catalog.lines.find((candidate) => candidate.sku === sku);
  invariant(line, 'BUYER_CATALOG_SKU_NOT_FOUND', 'SKU is not available in buyer catalog', { sku, buyerCatalogVersionId: catalog.id });
  return line;
}

function legacyLine(sku, collection, seen) {
  invariant(sku?.status === 'published', 'COMMERCIAL_PUBLICATION_SKU_NOT_PUBLISHED', 'Only published SKUs can be commercially published', { sku: sku?.sku });
  invariant(sku.collectionId === collection.id, 'COMMERCIAL_PUBLICATION_COLLECTION_MISMATCH', 'SKU collection does not match publication collection', { sku: sku.sku, collectionId: collection.id });
  invariant(sku.brandId === collection.brandId, 'COMMERCIAL_PUBLICATION_BRAND_MISMATCH', 'SKU brand does not match publication brand', { sku: sku.sku, brandId: collection.brandId });
  invariant(sku.currency === collection.currency, 'COMMERCIAL_PUBLICATION_CURRENCY_MISMATCH', 'SKU currency does not match publication currency', { sku: sku.sku, currency: sku.currency });
  invariant(!seen.has(sku.sku), 'COMMERCIAL_PUBLICATION_SKU_DUPLICATE', 'Commercial publication contains duplicate SKU', { sku: sku.sku });
  seen.add(sku.sku);
  return Object.freeze({
    sku: sku.sku,
    name: sku.name,
    catalogVersion: sku.version,
    unitPrice: normalizeMoney(sku.wholesalePrice, moneyOptions('Commercial publication unit price')),
    currency: sku.currency,
    minimumOrderQuantity: sku.minimumOrderQuantity,
  });
}

function projectColorway(colorway, context) {
  invariant(colorway?.id && colorway?.colorwayCode, 'COMMERCIAL_PUBLICATION_COLORWAY_INVALID', 'Projected Colorway is invalid');
  const skus = Array.isArray(colorway.skus) ? colorway.skus : [];
  invariant(skus.length > 0, 'COMMERCIAL_PUBLICATION_COLORWAY_SKUS_REQUIRED', 'Every published Colorway requires at least one Product SKU', { colorwayId: colorway.id });
  return deepFreeze({
    colorwayId: colorway.id,
    colorwayCode: colorway.colorwayCode,
    nameRu: colorway.nameRu,
    nameEn: colorway.nameEn,
    colorRef: colorway.colorRef ?? null,
    swatchHex: colorway.swatchHex ?? null,
    media: selectMedia(colorway.media, context.selectedMediaIds),
    attributes: deepCopy(colorway.attributes ?? []),
    skus: skus.map((sku) => projectSku(sku, colorway, context)).sort(compareSkuBySize),
  });
}

function projectSku(sku, colorway, context) {
  invariant(sku?.id && sku?.skuCode && sku?.size?.id, 'COMMERCIAL_PUBLICATION_PRODUCT_SKU_INVALID', 'Projected Product SKU is invalid', { productSkuId: sku?.id });
  invariant(!context.seenSku.has(sku.skuCode), 'COMMERCIAL_PUBLICATION_SKU_DUPLICATE', 'Commercial publication contains duplicate SKU', { sku: sku.skuCode });
  context.seenSku.add(sku.skuCode);
  const legacy = context.legacyByProductSku.get(sku.id);
  invariant(legacy?.catalog?.status === 'published', 'COMMERCIAL_PUBLICATION_LEGACY_PRICE_SNAPSHOT_REQUIRED', 'Projection must contain the frozen published compatibility catalog snapshot for the Product SKU', { productSkuId: sku.id, sku: sku.skuCode });
  invariant(legacy.catalog.currency === context.collection.currency, 'COMMERCIAL_PUBLICATION_CURRENCY_MISMATCH', 'Frozen compatibility price currency does not match collection currency', { sku: sku.skuCode });
  return deepFreeze({
    productSkuId: sku.id,
    skuCode: sku.skuCode,
    contentHash: sku.contentHash,
    gtin: sku.gtin ?? null,
    sizeValueId: sku.sizeValueId,
    size: deepCopy(sku.size),
    attributes: deepCopy(sku.attributes ?? []),
    legacyCatalogSnapshot: deepCopy(legacy.catalog),
    commercialTerms: commercialTerms(context.preparation),
  });
}

function compatibilityLine(sku, colorway, styleVersion, preparation) {
  const legacy = sku.legacyCatalogSnapshot;
  return deepFreeze({
    sku: sku.skuCode,
    productSkuId: sku.productSkuId,
    styleVersionId: styleVersion.id,
    colorwayId: colorway.colorwayId,
    sizeValueId: sku.sizeValueId,
    name: preparation.titleEn,
    catalogVersion: legacy.version,
    unitPrice: normalizeMoney(legacy.wholesalePrice, moneyOptions('Frozen compatibility wholesale price')),
    currency: legacy.currency,
    minimumOrderQuantity: legacy.minimumOrderQuantity,
    rrpMinor: preparation.rrpMinor,
    wholesalePriceMinor: preparation.wholesalePriceMinor,
    deliveryStart: preparation.deliveryStart,
    deliveryEnd: preparation.deliveryEnd,
    availability: deepCopy(preparation.availability),
  });
}

function commercialTerms(preparation) {
  return deepFreeze({
    currency: preparation.currency,
    wholesalePriceMinor: preparation.wholesalePriceMinor,
    rrpMinor: preparation.rrpMinor,
    minimumOrderQuantity: preparation.minimumOrderQuantity,
    minimumOrderValueMinor: preparation.minimumOrderValueMinor ?? null,
    packRatio: deepCopy(preparation.packRatio ?? null),
    deliveryStart: preparation.deliveryStart,
    deliveryEnd: preparation.deliveryEnd,
    availability: deepCopy(preparation.availability),
  });
}

function selectMedia(media, selectedIds) {
  return deepFreeze((Array.isArray(media) ? media : [])
    .filter((item) => selectedIds.has(item.id))
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0) || left.id.localeCompare(right.id))
    .map(deepCopy));
}

function applyBuyerPrices(styles, lines) {
  const priceBySku = new Map(lines.map((line) => [line.sku, line]));
  return deepFreeze(styles.map((style) => ({
    ...deepCopy(style),
    colorways: style.colorways.map((colorway) => ({
      ...deepCopy(colorway),
      skus: colorway.skus.map((sku) => {
        const price = priceBySku.get(sku.skuCode);
        invariant(price, 'PRICE_LIST_STYLE_SKU_MISSING', 'Rich publication SKU is missing from price list lines', { sku: sku.skuCode });
        return { ...deepCopy(sku), buyerUnitPrice: price.unitPrice, buyerCurrency: price.currency, buyerMinimumOrderQuantity: price.minimumOrderQuantity };
      }),
    })),
  })));
}

function compareSkuBySize(left, right) {
  return (left.size?.sortOrder ?? 0) - (right.size?.sortOrder ?? 0) || left.skuCode.localeCompare(right.skuCode);
}

function moneyOptions(label) {
  return { invalidCode: 'COMMERCIAL_PUBLICATION_PRICE_INVALID', scaleCode: 'COMMERCIAL_PUBLICATION_PRICE_SCALE_INVALID', overflowCode: 'COMMERCIAL_PUBLICATION_PRICE_TOO_LARGE', label };
}

function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function deepCopy(value) { return value === undefined ? undefined : structuredClone(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) deepFreeze(nested); return value; }
