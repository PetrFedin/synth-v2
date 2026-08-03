import { invariant } from '../core/errors.mjs';
import { decodeCatalogCursor, encodeCatalogCursor } from '../core/catalog-cursor.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const CATALOG_STATUSES = Object.freeze(['draft', 'published']);
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createCatalogQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'CATALOG_READER_REQUIRED', 'Catalog reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = normalizeFilters(options);
      const scope = cursorScope(filters);
      const afterSku = options.cursor === undefined || options.cursor === null || options.cursor === ''
        ? undefined
        : decodeCatalogCursor(options.cursor, { scope }).sku;
      const page = await reader.pageForActor(actorId, { limit, afterSku, filters });
      return freezePage(page, { limit, scope });
    },

    async getForActor(actorId, requestedSku) {
      validateActor(actorId);
      const sku = normalizeSku(requestedSku);
      const item = await reader.getForActor(actorId, sku);
      invariant(item, 'CATALOG_SKU_NOT_FOUND', 'Catalog SKU not found', { sku });
      return immutableCopy(item);
    },
  });
}

function normalizeFilters(options) {
  const q = optionalSearch(options.q);
  const status = optionalStatus(options.status);
  const brandId = optionalIdentifier(options.brandId, 'CATALOG_BRAND_FILTER_INVALID', 'Catalog brand filter');
  const collectionId = optionalIdentifier(options.collectionId, 'CATALOG_COLLECTION_FILTER_INVALID', 'Catalog collection filter');
  return Object.freeze({ q, status, brandId, collectionId });
}

function cursorScope(filters) {
  return JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.collectionId ?? null]);
}

function freezePage(page, { limit, scope }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'CATALOG_PAGE_RESULT_INVALID', 'Catalog reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'CATALOG_PAGE_RESULT_INVALID', 'Catalog page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'CATALOG_PAGE_RESULT_INVALID', 'Catalog page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'CATALOG_PAGE_RESULT_INVALID', 'Catalog page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextSku = page.nextSku ?? items.at(-1)?.sku;
  invariant(!page.hasMore || SKU_PATTERN.test(nextSku ?? ''), 'CATALOG_PAGE_RESULT_INVALID', 'Catalog page continuation SKU is invalid');
  return Object.freeze({
    items,
    nextCursor: page.hasMore ? encodeCatalogCursor({ scope, sku: nextSku }) : null,
  });
}

function validateActor(actorId) {
  invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'CATALOG_ACTOR_INVALID', 'Catalog actor is invalid');
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'CATALOG_PAGE_LIMIT_INVALID', `Catalog page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  const limit = Number(normalized);
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'CATALOG_PAGE_LIMIT_INVALID', `Catalog page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`, { min: 1, max: MAX_PAGE_LIMIT });
  return limit;
}

function normalizeSku(value) {
  invariant(SKU_PATTERN.test(value ?? ''), 'CATALOG_SKU_INVALID', 'SKU must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
  return value;
}

function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'CATALOG_SEARCH_INVALID', 'Catalog search must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80, 'CATALOG_SEARCH_INVALID', 'Catalog search must contain 1 to 80 characters');
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), 'CATALOG_SEARCH_INVALID', 'Catalog search contains control characters');
  return normalized;
}

function optionalStatus(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && CATALOG_STATUSES.includes(value), 'CATALOG_STATUS_FILTER_INVALID', 'Catalog status filter is invalid', { allowed: CATALOG_STATUSES });
  return value;
}

function optionalIdentifier(value, code, label) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), code, `${label} is invalid`);
  return value;
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
