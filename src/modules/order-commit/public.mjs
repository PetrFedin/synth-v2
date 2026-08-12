import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { normalizeMoney } from '../../core/money.mjs';
import { buyerCatalogProductSku, isRichBuyerCatalog } from '../commercial-publication/buyer-catalog-product.mjs';

const RICH_LINEAGE_KEYS = Object.freeze(['productSkuId', 'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode', 'sizeSortOrder']);

export function createOrderCommitSnapshot({ id, order, selection, buyerCatalog = null, committedAt }) {
  invariant(id && order?.id && selection?.id, 'ORDER_COMMIT_IDENTITY_REQUIRED', 'Order commit snapshot identity is required');
  invariant(order.status === 'attached', 'ORDER_COMMIT_ORDER_NOT_ATTACHED', 'Order commit snapshot requires an attached order');
  invariant(selection.status === 'submitted', 'ORDER_COMMIT_SELECTION_NOT_SUBMITTED', 'Order commit snapshot requires the submitted buyer selection');
  invariant(selection.id === order.selectionId && selection.cycleId === order.cycleId, 'ORDER_COMMIT_SELECTION_MISMATCH', 'Order and selection lineage do not match');
  invariant(selection.brandId === order.brandId && selection.shopId === order.shopId, 'ORDER_COMMIT_TRADE_MISMATCH', 'Order and selection trade parties do not match');
  invariant(order.acceptedOrganisationIds?.includes(order.brandId) && order.acceptedOrganisationIds?.includes(order.shopId), 'ORDER_COMMIT_TERMS_NOT_ACCEPTED', 'Both order parties must accept the committed terms');
  invariant(order.orderCommitSnapshotId === id, 'ORDER_COMMIT_SNAPSHOT_ID_MISMATCH', 'Attached order must point to the order commit snapshot');

  const hasCommercialBasis = Boolean(order.buyerCatalogVersionId || order.commercialPublicationId || order.priceListVersionId || order.commercialBasisHash || order.accessGrantId);
  invariant(!hasCommercialBasis || buyerCatalog, 'ORDER_COMMIT_BUYER_CATALOG_REQUIRED', 'Commercial order commit requires its pinned buyer catalog');
  invariant(hasCommercialBasis || buyerCatalog === null, 'ORDER_COMMIT_UNEXPECTED_BUYER_CATALOG', 'Legacy order without a commercial basis cannot attach an unrelated buyer catalog');

  const committedLines = hasCommercialBasis
    ? validateCommercialLines(order, selection, buyerCatalog)
    : Object.freeze(order.lines.map((line) => Object.freeze({
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: normalizeMoney(line.unitPrice, { label: 'Committed order line price' }),
      catalogVersion: line.catalogVersion,
      ...copyExistingLineage(line),
    })));

  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: order.version,
    selectionId: selection.id,
    cycleId: order.cycleId,
    brandId: order.brandId,
    shopId: order.shopId,
    collectionId: selection.collectionId ?? null,
    showroomId: selection.showroomId ?? null,
    commercialPublicationId: order.commercialPublicationId ?? null,
    priceListVersionId: order.priceListVersionId ?? null,
    buyerCatalogVersionId: order.buyerCatalogVersionId ?? null,
    commercialBasisHash: order.commercialBasisHash ?? null,
    accessGrantId: order.accessGrantId ?? null,
    currency: order.currency,
    totalAmount: normalizeMoney(order.totalAmount, { label: 'Committed order total' }),
    terms: order.terms,
    acceptedOrganisationIds: Object.freeze([...order.acceptedOrganisationIds].sort()),
    lines: committedLines,
  });

  return Object.freeze({
    id,
    ...basis,
    status: 'committed',
    contentHash: createHash('sha256').update(canonicalJson(basis)).digest('hex'),
    committedAt: requiredTimestamp(committedAt),
  });
}

function validateCommercialLines(order, selection, buyerCatalog) {
  invariant(buyerCatalog.status === 'published', 'ORDER_COMMIT_BUYER_CATALOG_NOT_PUBLISHED', 'Pinned buyer catalog must be published');
  invariant(buyerCatalog.id === order.buyerCatalogVersionId, 'ORDER_COMMIT_BUYER_CATALOG_MISMATCH', 'Order buyer catalog version does not match the pinned catalog');
  invariant(buyerCatalog.publicationId === order.commercialPublicationId, 'ORDER_COMMIT_PUBLICATION_MISMATCH', 'Order commercial publication does not match the pinned catalog');
  invariant(buyerCatalog.priceListVersionId === order.priceListVersionId, 'ORDER_COMMIT_PRICE_LIST_MISMATCH', 'Order price list does not match the pinned catalog');
  invariant(buyerCatalog.contentHash === order.commercialBasisHash, 'ORDER_COMMIT_COMMERCIAL_BASIS_CHANGED', 'Pinned buyer catalog hash does not match the order commercial basis');
  invariant(buyerCatalog.accessGrantId === order.accessGrantId, 'ORDER_COMMIT_ACCESS_GRANT_MISMATCH', 'Order access grant does not match the pinned catalog');
  invariant(buyerCatalog.brandId === order.brandId && buyerCatalog.shopId === order.shopId, 'ORDER_COMMIT_BUYER_CATALOG_TRADE_MISMATCH', 'Pinned buyer catalog belongs to another trade relationship');
  invariant(buyerCatalog.showroomId === selection.showroomId, 'ORDER_COMMIT_SHOWROOM_MISMATCH', 'Pinned buyer catalog belongs to another showroom');
  invariant((selection.collectionId ?? buyerCatalog.collectionId) === buyerCatalog.collectionId, 'ORDER_COMMIT_COLLECTION_MISMATCH', 'Pinned buyer catalog belongs to another collection');
  invariant(buyerCatalog.currency === order.currency, 'ORDER_COMMIT_CURRENCY_MISMATCH', 'Pinned buyer catalog currency does not match the order');
  invariant(order.lines.length === selection.lines.length, 'ORDER_COMMIT_LINE_COUNT_MISMATCH', 'Order and submitted selection line counts differ');
  const richCatalog = isRichBuyerCatalog(buyerCatalog);

  return Object.freeze(order.lines.map((orderLine) => {
    const selectionLine = selection.lines.find((line) => line.sku === orderLine.sku);
    const catalogLine = buyerCatalog.lines.find((line) => line.sku === orderLine.sku);
    invariant(selectionLine && catalogLine, 'ORDER_COMMIT_SKU_MISSING', 'Committed SKU is missing from the submitted selection or buyer catalog', { sku: orderLine.sku });
    invariant(orderLine.quantity === selectionLine.quantity, 'ORDER_COMMIT_QUANTITY_MISMATCH', 'Order quantity differs from submitted buyer intent', { sku: orderLine.sku });
    invariant(orderLine.quantity >= catalogLine.minimumOrderQuantity, 'ORDER_COMMIT_MOQ_NOT_MET', 'Committed quantity is below buyer catalog MOQ', { sku: orderLine.sku, minimumOrderQuantity: catalogLine.minimumOrderQuantity });
    invariant(orderLine.catalogVersion === catalogLine.catalogVersion && selectionLine.catalogVersion === catalogLine.catalogVersion, 'ORDER_COMMIT_CATALOG_VERSION_MISMATCH', 'Committed catalog version differs from the pinned buyer catalog', { sku: orderLine.sku });
    const committedPrice = normalizeMoney(orderLine.unitPrice, { label: 'Committed order line price' });
    const selectionPrice = normalizeMoney(selectionLine.unitPrice, { label: 'Submitted selection line price' });
    const catalogPrice = normalizeMoney(catalogLine.unitPrice, { label: 'Pinned buyer catalog price' });
    invariant(committedPrice === selectionPrice && committedPrice === catalogPrice, 'ORDER_COMMIT_PRICE_MISMATCH', 'Committed price differs from the submitted selection or pinned buyer catalog', { sku: orderLine.sku });

    if (!richCatalog) {
      return Object.freeze({ sku: orderLine.sku, quantity: orderLine.quantity, unitPrice: committedPrice, catalogVersion: orderLine.catalogVersion });
    }

    const product = buyerCatalogProductSku(buyerCatalog, { skuCode: orderLine.sku });
    assertRichLineage(orderLine, product, 'ORDER_COMMIT_ORDER_LINEAGE_MISMATCH');
    assertRichLineage(selectionLine, product, 'ORDER_COMMIT_SELECTION_LINEAGE_MISMATCH');
    return Object.freeze({
      sku: orderLine.sku,
      quantity: orderLine.quantity,
      unitPrice: committedPrice,
      catalogVersion: orderLine.catalogVersion,
      productSkuId: product.productSkuId,
      gtin: product.gtin,
      styleId: product.styleId,
      styleVersionId: product.styleVersionId,
      colorwayId: product.colorwayId,
      sizeValueId: product.sizeValueId,
      sizeCode: product.sizeCode,
      sizeLabelRu: product.sizeLabelRu,
      sizeLabelEn: product.sizeLabelEn,
      sizeSortOrder: product.sizeSortOrder,
    });
  }));
}

function assertRichLineage(line, product, code) {
  const expected = {
    productSkuId: product.productSkuId,
    styleId: product.styleId,
    styleVersionId: product.styleVersionId,
    colorwayId: product.colorwayId,
    sizeValueId: product.sizeValueId,
    sizeCode: product.sizeCode,
    sizeSortOrder: product.sizeSortOrder,
  };
  for (const key of RICH_LINEAGE_KEYS) {
    invariant(line?.[key] === expected[key], code, 'Committed Product/Style/Colorway/Size lineage differs from the pinned buyer catalog', { sku: product.sku, key, expected: expected[key], actual: line?.[key] });
  }
  invariant((line.gtin ?? null) === (product.gtin ?? null), code, 'Committed GTIN differs from the pinned buyer catalog', { sku: product.sku });
  invariant((line.sizeLabelRu ?? product.sizeCode) === product.sizeLabelRu && (line.sizeLabelEn ?? product.sizeCode) === product.sizeLabelEn, code, 'Committed localized size labels differ from the pinned buyer catalog', { sku: product.sku });
}

function copyExistingLineage(line) {
  if (!line?.productSkuId) return {};
  return {
    productSkuId: line.productSkuId,
    gtin: line.gtin ?? null,
    styleId: line.styleId,
    styleVersionId: line.styleVersionId,
    colorwayId: line.colorwayId,
    sizeValueId: line.sizeValueId,
    sizeCode: line.sizeCode,
    sizeLabelRu: line.sizeLabelRu ?? line.sizeCode,
    sizeLabelEn: line.sizeLabelEn ?? line.sizeCode,
    sizeSortOrder: line.sizeSortOrder,
  };
}

function requiredTimestamp(value) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), 'ORDER_COMMIT_TIMESTAMP_INVALID', 'Commit timestamp must be a valid ISO date-time');
  return new Date(parsed).toISOString();
}
