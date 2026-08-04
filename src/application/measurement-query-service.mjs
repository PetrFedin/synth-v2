import { invariant } from '../core/errors.mjs';
import { decodeMeasurementCursor, encodeMeasurementCursor } from '../core/measurement-cursor.mjs';
import { MEASUREMENT_STATUSES, MEASUREMENT_UNITS } from '../modules/measurements/public.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createMeasurementQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'MEASUREMENT_READER_REQUIRED', 'Measurement chart reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalEnum(options.status, MEASUREMENT_STATUSES, 'MEASUREMENT_STATUS_FILTER_INVALID', 'Measurement chart status filter'),
        unit: optionalEnum(options.unit, MEASUREMENT_UNITS, 'MEASUREMENT_UNIT_FILTER_INVALID', 'Measurement chart unit filter'),
        brandId: optionalIdentifier(options.brandId),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.unit ?? null, filters.brandId ?? null]);
      const afterSku = options.cursor === undefined || options.cursor === null || options.cursor === ''
        ? undefined
        : decodeMeasurementCursor(options.cursor, { scope }).sku;
      const page = await reader.pageForActor(actorId, { limit, afterSku, filters });
      return freezePage(page, { limit, scope });
    },
    async getForActor(actorId, requestedSku) {
      validateActor(actorId);
      const sku = normalizeSku(requestedSku);
      const item = await reader.getForActor(actorId, sku);
      invariant(item, 'MEASUREMENT_NOT_FOUND', 'Measurement chart not found', { sku });
      return immutableCopy(item);
    },
  });
}

function freezePage(page, { limit, scope }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'MEASUREMENT_PAGE_RESULT_INVALID', 'Measurement reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'MEASUREMENT_PAGE_RESULT_INVALID', 'Measurement chart page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'MEASUREMENT_PAGE_RESULT_INVALID', 'Measurement chart page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'MEASUREMENT_PAGE_RESULT_INVALID', 'Measurement chart page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextSku = page.nextSku ?? items.at(-1)?.sku;
  invariant(!page.hasMore || SKU_PATTERN.test(nextSku ?? ''), 'MEASUREMENT_PAGE_RESULT_INVALID', 'Measurement chart page continuation SKU is invalid');
  return Object.freeze({ items, nextCursor: page.hasMore ? encodeMeasurementCursor({ scope, sku: nextSku }) : null });
}
function validateActor(actorId) {
  invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'MEASUREMENT_ACTOR_INVALID', 'Measurement chart actor is invalid');
}
function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'MEASUREMENT_PAGE_LIMIT_INVALID', `Measurement chart page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  const limit = Number(normalized);
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'MEASUREMENT_PAGE_LIMIT_INVALID', `Measurement chart page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  return limit;
}
function normalizeSku(value) {
  invariant(SKU_PATTERN.test(value ?? ''), 'MEASUREMENT_SKU_INVALID', 'Measurement chart SKU is invalid');
  return value;
}
function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'MEASUREMENT_SEARCH_INVALID', 'Measurement chart search must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80, 'MEASUREMENT_SEARCH_INVALID', 'Measurement chart search must contain 1 to 80 characters');
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), 'MEASUREMENT_SEARCH_INVALID', 'Measurement chart search contains control characters');
  return normalized;
}
function optionalEnum(value, allowed, code, label) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { allowed });
  return value;
}
function optionalIdentifier(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), 'MEASUREMENT_BRAND_FILTER_INVALID', 'Measurement chart brand filter is invalid');
  return value;
}
function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
