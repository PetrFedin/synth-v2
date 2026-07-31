import { invariant } from '../../core/errors.mjs';

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;

export function createCatalogSku({
  sku,
  collection,
  brandId,
  name,
  wholesalePrice,
  currency,
  minimumOrderQuantity,
  availableQuantity,
  createdAt,
}) {
  invariant(SKU_PATTERN.test(sku ?? ''), 'CATALOG_SKU_INVALID', 'SKU must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
  invariant(collection?.id, 'CATALOG_COLLECTION_REQUIRED', 'Catalog SKU collection is required');
  invariant(collection.brandId === brandId, 'CATALOG_BRAND_MISMATCH', 'Catalog SKU brand must match collection brand');
  invariant(typeof name === 'string' && name.trim().length > 1, 'CATALOG_NAME_REQUIRED', 'Catalog SKU name is required');
  invariant(Number.isFinite(wholesalePrice) && wholesalePrice > 0, 'CATALOG_PRICE_INVALID', 'Wholesale price must be positive');
  invariant(currency === collection.currency, 'CATALOG_CURRENCY_MISMATCH', 'Catalog currency must match collection currency');
  invariant(Number.isInteger(minimumOrderQuantity) && minimumOrderQuantity > 0, 'CATALOG_MOQ_INVALID', 'Minimum order quantity must be a positive integer');
  invariant(Number.isInteger(availableQuantity) && availableQuantity >= 0, 'CATALOG_AVAILABLE_QUANTITY_INVALID', 'Available quantity must be a non-negative integer');
  return freezeAvailability({
    id: sku,
    sku,
    collectionId: collection.id,
    brandId,
    name: name.trim(),
    wholesalePrice,
    currency,
    minimumOrderQuantity,
    availableQuantity,
    reservedQuantity: 0,
    status: 'draft',
    version: 1,
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function publishCatalogSku(catalogSku, collection, publishedAt) {
  invariant(catalogSku.status === 'draft', 'CATALOG_SKU_NOT_DRAFT', 'Only a draft SKU can be published');
  invariant(collection.id === catalogSku.collectionId, 'CATALOG_COLLECTION_MISMATCH', 'SKU does not belong to collection');
  invariant(collection.status === 'published', 'COLLECTION_NOT_PUBLISHED', 'Collection must be published before SKU publication');
  invariant(collection.currency === catalogSku.currency, 'CATALOG_CURRENCY_MISMATCH', 'Catalog currency must match collection currency');
  return freezeAvailability({ ...catalogSku, status: 'published', version: catalogSku.version + 1, publishedAt, updatedAt: publishedAt });
}

export function assertPublishedCatalogSku(catalogSku, { collectionId, brandId } = {}) {
  invariant(catalogSku, 'CATALOG_SKU_NOT_FOUND', 'Catalog SKU not found');
  invariant(catalogSku.status === 'published', 'CATALOG_SKU_NOT_PUBLISHED', 'Selection requires a published catalog SKU', { sku: catalogSku.sku });
  invariant(!collectionId || catalogSku.collectionId === collectionId, 'CATALOG_SKU_COLLECTION_MISMATCH', 'SKU belongs to another collection', { sku: catalogSku.sku, collectionId });
  invariant(!brandId || catalogSku.brandId === brandId, 'CATALOG_SKU_BRAND_MISMATCH', 'SKU belongs to another brand', { sku: catalogSku.sku, brandId });
  return normalizeAvailability(catalogSku);
}

export function assertCatalogQuantity(catalogSku, quantity) {
  const normalized = normalizeAvailability(catalogSku);
  invariant(Number.isInteger(quantity) && quantity > 0, 'SELECTION_LINE_QUANTITY_INVALID', 'Selection quantity must be a positive integer');
  invariant(quantity >= normalized.minimumOrderQuantity, 'CATALOG_MOQ_NOT_MET', 'Selection quantity is below minimum order quantity', {
    sku: normalized.sku,
    quantity,
    minimumOrderQuantity: normalized.minimumOrderQuantity,
  });
  invariant(quantity <= normalized.availableToSell, 'CATALOG_AVAILABILITY_EXCEEDED', 'Selection quantity exceeds available-to-sell', {
    sku: normalized.sku,
    quantity,
    availableToSell: normalized.availableToSell,
  });
  return normalized;
}

export function reserveCatalogQuantity(catalogSku, quantity, updatedAt) {
  const normalized = assertCatalogQuantity(assertPublishedCatalogSku(catalogSku), quantity);
  return freezeAvailability({
    ...normalized,
    reservedQuantity: normalized.reservedQuantity + quantity,
    updatedAt,
  });
}

export function releaseCatalogQuantity(catalogSku, quantity, updatedAt) {
  const normalized = normalizeAvailability(catalogSku);
  invariant(Number.isInteger(quantity) && quantity > 0, 'CATALOG_RELEASE_QUANTITY_INVALID', 'Release quantity must be a positive integer');
  invariant(quantity <= normalized.reservedQuantity, 'CATALOG_RELEASE_EXCEEDS_RESERVED', 'Release quantity exceeds reserved quantity', {
    sku: normalized.sku,
    quantity,
    reservedQuantity: normalized.reservedQuantity,
  });
  return freezeAvailability({ ...normalized, reservedQuantity: normalized.reservedQuantity - quantity, updatedAt });
}

export function normalizeAvailability(catalogSku) {
  const minimumOrderQuantity = Number.isInteger(catalogSku.minimumOrderQuantity) ? catalogSku.minimumOrderQuantity : 1;
  const availableQuantity = Number.isInteger(catalogSku.availableQuantity) ? catalogSku.availableQuantity : 0;
  const reservedQuantity = Number.isInteger(catalogSku.reservedQuantity) ? catalogSku.reservedQuantity : 0;
  return freezeAvailability({ ...catalogSku, minimumOrderQuantity, availableQuantity, reservedQuantity });
}

function freezeAvailability(value) {
  invariant(value.reservedQuantity <= value.availableQuantity, 'CATALOG_RESERVED_QUANTITY_INVALID', 'Reserved quantity cannot exceed available quantity', {
    sku: value.sku,
    availableQuantity: value.availableQuantity,
    reservedQuantity: value.reservedQuantity,
  });
  return Object.freeze({ ...value, availableToSell: value.availableQuantity - value.reservedQuantity });
}
