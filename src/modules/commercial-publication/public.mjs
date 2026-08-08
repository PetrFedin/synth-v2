import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { normalizeMoney } from '../../core/money.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export function createCommercialPublication({ id, collection, catalogSkus, publishedAt }) {
  invariant(id && collection?.id, 'COMMERCIAL_PUBLICATION_IDENTITY_REQUIRED', 'Publication id and collection are required');
  invariant(collection.status === 'published', 'COMMERCIAL_PUBLICATION_COLLECTION_NOT_PUBLISHED', 'Commercial publication requires a published collection');
  invariant(Array.isArray(catalogSkus) && catalogSkus.length > 0, 'COMMERCIAL_PUBLICATION_LINES_REQUIRED', 'Commercial publication requires at least one SKU');

  const seen = new Set();
  const lines = catalogSkus.map((sku) => {
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
      unitPrice: normalizeMoney(sku.wholesalePrice, {
        invalidCode: 'COMMERCIAL_PUBLICATION_PRICE_INVALID', scaleCode: 'COMMERCIAL_PUBLICATION_PRICE_SCALE_INVALID',
        overflowCode: 'COMMERCIAL_PUBLICATION_PRICE_TOO_LARGE', label: 'Commercial publication unit price',
      }),
      currency: sku.currency,
      minimumOrderQuantity: sku.minimumOrderQuantity,
    });
  }).sort((left, right) => left.sku.localeCompare(right.sku));

  const basis = Object.freeze({
    brandId: collection.brandId,
    collectionId: collection.id,
    currency: collection.currency,
    lines: Object.freeze(lines),
  });
  return Object.freeze({
    id,
    ...basis,
    status: 'published',
    contentHash: hashBasis(basis),
    publishedAt,
  });
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
  const lines = publication.lines.map((line) => Object.freeze({
    sku: line.sku,
    catalogVersion: line.catalogVersion,
    unitPrice: overrides.get(line.sku) ?? line.unitPrice,
    currency: line.currency,
    minimumOrderQuantity: line.minimumOrderQuantity,
  }));
  const basis = Object.freeze({ publicationId: publication.id, brandId: publication.brandId, shopId, currency: publication.currency, lines: Object.freeze(lines) });
  return Object.freeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function createBuyerCatalogVersion({ id, publication, priceListVersion, showroom, invitation, publishedAt }) {
  invariant(id && publication?.id && priceListVersion?.id && showroom?.id && invitation?.id, 'BUYER_CATALOG_VERSION_IDENTITY_REQUIRED', 'Buyer catalog version identity is required');
  invariant(showroom.status === 'open', 'BUYER_CATALOG_SHOWROOM_NOT_OPEN', 'Buyer catalog requires an open showroom');
  invariant(showroom.brandId === publication.brandId && showroom.collectionId === publication.collectionId, 'BUYER_CATALOG_SHOWROOM_MISMATCH', 'Showroom does not match publication');
  invariant(invitation.status === 'accepted', 'BUYER_CATALOG_ACCESS_NOT_ACCEPTED', 'Buyer catalog requires accepted showroom access');
  invariant(invitation.showroomId === showroom.id && invitation.brandId === publication.brandId && invitation.shopId === priceListVersion.shopId, 'BUYER_CATALOG_ACCESS_MISMATCH', 'Showroom invitation does not match buyer catalog');
  invariant(priceListVersion.publicationId === publication.id, 'BUYER_CATALOG_PRICE_LIST_MISMATCH', 'Price list does not belong to publication');

  const basis = Object.freeze({
    publicationId: publication.id,
    priceListVersionId: priceListVersion.id,
    brandId: publication.brandId,
    shopId: priceListVersion.shopId,
    showroomId: showroom.id,
    accessGrantId: invitation.id,
    collectionId: publication.collectionId,
    currency: publication.currency,
    lines: priceListVersion.lines,
  });
  return Object.freeze({ id, ...basis, status: 'published', contentHash: hashBasis(basis), publishedAt });
}

export function buyerCatalogLine(catalog, sku) {
  invariant(catalog?.status === 'published', 'BUYER_CATALOG_NOT_PUBLISHED', 'Buyer catalog must be published');
  const line = catalog.lines.find((candidate) => candidate.sku === sku);
  invariant(line, 'BUYER_CATALOG_SKU_NOT_FOUND', 'SKU is not available in buyer catalog', { sku, buyerCatalogVersionId: catalog.id });
  return line;
}

function hashBasis(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
