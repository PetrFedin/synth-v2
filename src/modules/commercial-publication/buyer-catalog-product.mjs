import { invariant } from '../../core/errors.mjs';

export function isRichBuyerCatalog(catalog) {
  return catalog?.status === 'published' && Array.isArray(catalog.styles) && catalog.styles.length > 0;
}

export function buyerCatalogProductSku(catalog, productSkuId) {
  invariant(catalog?.status === 'published', 'BUYER_CATALOG_NOT_PUBLISHED', 'Buyer catalog must be published');
  invariant(isRichBuyerCatalog(catalog), 'BUYER_CATALOG_RICH_PRODUCT_REQUIRED', 'Buyer catalog does not contain the rich Style/Colorway/Size hierarchy', { buyerCatalogVersionId: catalog?.id });
  invariant(typeof productSkuId === 'string' && productSkuId.trim().length > 0, 'BUYER_CATALOG_PRODUCT_SKU_REQUIRED', 'Product SKU id is required');

  const matches = [];
  for (const style of catalog.styles) {
    for (const colorway of style.colorways ?? []) {
      for (const sku of colorway.skus ?? []) {
        if (sku.productSkuId === productSkuId) matches.push({ style, colorway, sku });
      }
    }
  }

  invariant(matches.length === 1, matches.length === 0 ? 'BUYER_CATALOG_PRODUCT_SKU_NOT_FOUND' : 'BUYER_CATALOG_PRODUCT_SKU_DUPLICATE', matches.length === 0 ? 'Product SKU is not available in buyer catalog' : 'Product SKU is duplicated in buyer catalog hierarchy', { productSkuId, buyerCatalogVersionId: catalog.id });
  const { style, colorway, sku } = matches[0];
  const priceLine = (catalog.lines ?? []).find((line) => line.sku === sku.skuCode);
  invariant(priceLine, 'BUYER_CATALOG_PRICE_LINE_NOT_FOUND', 'Rich Product SKU has no frozen buyer price line', { productSkuId, sku: sku.skuCode });
  invariant(priceLine.productSkuId === sku.productSkuId, 'BUYER_CATALOG_PRODUCT_LINEAGE_MISMATCH', 'Buyer catalog Product SKU lineage does not match its price line', { productSkuId });
  invariant(priceLine.styleVersionId === style.styleVersionId && priceLine.colorwayId === colorway.colorwayId && priceLine.sizeValueId === sku.sizeValueId, 'BUYER_CATALOG_PRODUCT_LINEAGE_MISMATCH', 'Buyer catalog Style/Colorway/Size lineage does not match its price line', { productSkuId });
  invariant(priceLine.currency === catalog.currency, 'BUYER_CATALOG_CURRENCY_MISMATCH', 'Buyer catalog price line currency does not match buyer catalog currency', { productSkuId });
  invariant(Number.isInteger(sku.size?.sortOrder) && sku.size.sortOrder >= 0, 'BUYER_CATALOG_SIZE_ORDER_INVALID', 'Buyer catalog Product SKU requires an ordered size value', { productSkuId });
  invariant(typeof sku.size?.code === 'string' && sku.size.code.length > 0, 'BUYER_CATALOG_SIZE_LABEL_INVALID', 'Buyer catalog Product SKU requires a canonical size label', { productSkuId });

  return Object.freeze({
    sku: priceLine.sku,
    productSkuId: sku.productSkuId,
    styleVersionId: style.styleVersionId,
    colorwayId: colorway.colorwayId,
    sizeValueId: sku.sizeValueId,
    sizeLabel: sku.size.code,
    sizeSortOrder: sku.size.sortOrder,
    unitPrice: priceLine.unitPrice,
    currency: priceLine.currency,
    catalogVersion: priceLine.catalogVersion,
    minimumOrderQuantity: priceLine.minimumOrderQuantity,
    availability: priceLine.availability ?? sku.commercialTerms?.availability ?? null,
  });
}
