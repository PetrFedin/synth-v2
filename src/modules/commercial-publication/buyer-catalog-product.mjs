import { invariant } from '../../core/errors.mjs';
import { assertPostgresInteger } from '../../core/money.mjs';

export function isRichBuyerCatalog(catalog) {
  return catalog?.status === 'published' && Array.isArray(catalog.styles) && catalog.styles.length > 0;
}

export function buyerCatalogProductSku(catalog, selector = {}) {
  invariant(catalog?.status === 'published', 'BUYER_CATALOG_NOT_PUBLISHED', 'Buyer catalog must be published');
  invariant(isRichBuyerCatalog(catalog), 'BUYER_CATALOG_RICH_PRODUCT_REQUIRED', 'Buyer catalog does not contain the rich Style/Colorway/Size hierarchy', { buyerCatalogVersionId: catalog?.id });

  const productSkuId = normalizeSelector(selector, 'productSkuId');
  const skuCode = normalizeSelector(selector, 'skuCode');
  invariant(productSkuId || skuCode, 'BUYER_CATALOG_PRODUCT_SELECTOR_REQUIRED', 'Product SKU id or SKU code is required');

  const matches = [];
  for (const style of catalog.styles) {
    for (const colorway of style.colorways ?? []) {
      for (const sku of colorway.skus ?? []) {
        if (productSkuId && sku.productSkuId !== productSkuId) continue;
        if (skuCode && sku.skuCode !== skuCode) continue;
        matches.push({ style, colorway, sku });
      }
    }
  }

  invariant(matches.length === 1, matches.length === 0 ? 'BUYER_CATALOG_PRODUCT_SKU_NOT_FOUND' : 'BUYER_CATALOG_PRODUCT_SKU_DUPLICATE', matches.length === 0 ? 'Product SKU is not available in buyer catalog' : 'Product SKU is duplicated in buyer catalog hierarchy', { productSkuId, skuCode, buyerCatalogVersionId: catalog.id });
  const { style, colorway, sku } = matches[0];
  const priceLines = (catalog.lines ?? []).filter((line) => line.sku === sku.skuCode && (!line.productSkuId || line.productSkuId === sku.productSkuId));
  invariant(priceLines.length === 1, priceLines.length === 0 ? 'BUYER_CATALOG_PRICE_LINE_NOT_FOUND' : 'BUYER_CATALOG_PRICE_LINE_DUPLICATE', priceLines.length === 0 ? 'Rich Product SKU has no frozen buyer price line' : 'Rich Product SKU has duplicate frozen buyer price lines', { productSkuId: sku.productSkuId, sku: sku.skuCode });
  const priceLine = priceLines[0];

  invariant(priceLine.productSkuId === sku.productSkuId, 'BUYER_CATALOG_PRODUCT_LINEAGE_MISMATCH', 'Buyer catalog Product SKU lineage does not match its price line', { productSkuId: sku.productSkuId });
  invariant(priceLine.styleVersionId === style.styleVersionId && priceLine.colorwayId === colorway.colorwayId && priceLine.sizeValueId === sku.sizeValueId, 'BUYER_CATALOG_PRODUCT_LINEAGE_MISMATCH', 'Buyer catalog Style/Colorway/Size lineage does not match its price line', { productSkuId: sku.productSkuId });
  invariant(priceLine.currency === catalog.currency, 'BUYER_CATALOG_CURRENCY_MISMATCH', 'Buyer catalog price line currency does not match buyer catalog currency', { productSkuId: sku.productSkuId });
  invariant(sku.size && typeof sku.size === 'object', 'BUYER_CATALOG_SIZE_REQUIRED', 'Buyer catalog Product SKU requires a frozen size value', { productSkuId: sku.productSkuId });
  invariant(sku.size.id === sku.sizeValueId, 'BUYER_CATALOG_SIZE_LINEAGE_MISMATCH', 'Buyer catalog Product SKU size payload does not match sizeValueId', { productSkuId: sku.productSkuId });
  invariant(Number.isInteger(sku.size.sortOrder) && sku.size.sortOrder >= 0, 'BUYER_CATALOG_SIZE_ORDER_INVALID', 'Buyer catalog Product SKU requires an ordered size value', { productSkuId: sku.productSkuId });
  invariant(typeof sku.size.code === 'string' && sku.size.code.length > 0, 'BUYER_CATALOG_SIZE_CODE_INVALID', 'Buyer catalog Product SKU requires a canonical size code', { productSkuId: sku.productSkuId });

  return Object.freeze({
    sku: priceLine.sku,
    productSkuId: sku.productSkuId,
    gtin: sku.gtin ?? null,
    styleId: style.styleId,
    styleVersionId: style.styleVersionId,
    colorwayId: colorway.colorwayId,
    sizeValueId: sku.sizeValueId,
    sizeCode: sku.size.code,
    sizeLabelRu: sku.size.labelRu ?? sku.size.code,
    sizeLabelEn: sku.size.labelEn ?? sku.size.code,
    sizeSortOrder: sku.size.sortOrder,
    unitPrice: priceLine.unitPrice,
    currency: priceLine.currency,
    catalogVersion: priceLine.catalogVersion,
    minimumOrderQuantity: priceLine.minimumOrderQuantity,
    availability: priceLine.availability ?? sku.commercialTerms?.availability ?? null,
  });
}

export function assertBuyerCatalogQuantity(product, quantity) {
  const normalizedQuantity = assertPostgresInteger(quantity, { code: 'SELECTION_LINE_QUANTITY_INVALID', label: 'Selection quantity', min: 1 });
  const minimumOrderQuantity = assertPostgresInteger(product?.minimumOrderQuantity, { code: 'BUYER_CATALOG_MOQ_INVALID', label: 'Buyer catalog MOQ', min: 1 });
  invariant(normalizedQuantity >= minimumOrderQuantity, 'BUYER_CATALOG_MOQ_NOT_MET', 'Selection quantity is below buyer catalog MOQ', {
    sku: product?.sku,
    quantity: normalizedQuantity,
    minimumOrderQuantity,
  });

  const availability = product?.availability;
  if (availability?.mode === 'available_to_sell') {
    const availableQuantity = assertPostgresInteger(availability.quantity, { code: 'BUYER_CATALOG_AVAILABILITY_INVALID', label: 'Frozen buyer catalog available-to-sell', min: 0 });
    invariant(normalizedQuantity <= availableQuantity, 'BUYER_CATALOG_AVAILABILITY_EXCEEDED', 'Selection quantity exceeds frozen buyer catalog available-to-sell', {
      sku: product?.sku,
      quantity: normalizedQuantity,
      availableToSell: availableQuantity,
    });
  }
  return normalizedQuantity;
}

function normalizeSelector(selector, key) {
  const value = selector && typeof selector === 'object' ? selector[key] : null;
  if (value === undefined || value === null || value === '') return null;
  invariant(typeof value === 'string' && value.trim().length > 0, 'BUYER_CATALOG_PRODUCT_SELECTOR_INVALID', 'Buyer catalog Product SKU selector must be a non-empty string', { key });
  return value.trim();
}
