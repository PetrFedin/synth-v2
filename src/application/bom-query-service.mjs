import { invariant } from '../core/errors.mjs';
import { decodeBomCursor, encodeBomCursor } from '../core/bom-cursor.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const BOM_STATUSES = Object.freeze(['draft', 'published']);
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createBomQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'BOM_READER_REQUIRED', 'BOM reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = normalizeFilters(options);
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null]);
      const afterSku = options.cursor === undefined || options.cursor === null || options.cursor === ''
        ? undefined
        : decodeBomCursor(options.cursor, { scope }).sku;
      const page = await reader.pageForActor(actorId, { limit, afterSku, filters });
      return freezePage(page, { limit, scope });
    },
    async getForActor(actorId, requestedSku) {
      validateActor(actorId);
      const sku = normalizeSku(requestedSku);
      const item = await reader.getForActor(actorId, sku);
      invariant(item, 'BOM_NOT_FOUND', 'BOM not found', { sku });
      return immutableCopy(item);
    },
  });
}

function normalizeFilters(options) {
  return Object.freeze({
    q: optionalSearch(options.q),
    status: optionalStatus(options.status),
    brandId: optionalIdentifier(options.brandId),
  });
}

function freezePage(page, { limit, scope }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'BOM_PAGE_RESULT_INVALID', 'BOM reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'BOM_PAGE_RESULT_INVALID', 'BOM page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'BOM_PAGE_RESULT_INVALID', 'BOM page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'BOM_PAGE_RESULT_INVALID', 'BOM page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextSku = page.nextSku ?? items.at(-1)?.sku;
  invariant(!page.hasMore || SKU_PATTERN.test(nextSku ?? ''), 'BOM_PAGE_RESULT_INVALID', 'BOM page continuation SKU is invalid');
  return Object.freeze({ items, nextCursor: page.hasMore ? encodeBomCursor({ scope, sku: nextSku }) : null });
}

function validateActor(actorId) {
  invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'BOM_ACTOR_INVALID', 'BOM actor is invalid');
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'BOM_PAGE_LIMIT_INVALID', `BOM page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  const limit = Number(normalized);
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'BOM_PAGE_LIMIT_INVALID', `BOM page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  return limit;
}

function normalizeSku(value) {
  invariant(SKU_PATTERN.test(value ?? ''), 'BOM_SKU_INVALID', 'BOM SKU is invalid');
  return value;
}

function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'BOM_SEARCH_INVALID', 'BOM search must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80, 'BOM_SEARCH_INVALID', 'BOM search must contain 1 to 80 characters');
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), 'BOM_SEARCH_INVALID', 'BOM search contains control characters');
  return normalized;
}

function optionalStatus(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && BOM_STATUSES.includes(value), 'BOM_STATUS_FILTER_INVALID', 'BOM status filter is invalid', { allowed: BOM_STATUSES });
  return value;
}

function optionalIdentifier(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), 'BOM_BRAND_FILTER_INVALID', 'BOM brand filter is invalid');
  return value;
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
