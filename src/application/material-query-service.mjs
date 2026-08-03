import { invariant } from '../core/errors.mjs';
import { decodeMaterialCursor, encodeMaterialCursor } from '../core/material-cursor.mjs';
import { MATERIAL_TYPES } from '../modules/materials/public.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const MATERIAL_STATUSES = Object.freeze(['draft', 'published']);
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createMaterialQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'MATERIAL_READER_REQUIRED', 'Material reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = normalizeFilters(options);
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.type ?? null, filters.brandId ?? null]);
      const afterCode = options.cursor === undefined || options.cursor === null || options.cursor === ''
        ? undefined
        : decodeMaterialCursor(options.cursor, { scope }).code;
      const page = await reader.pageForActor(actorId, { limit, afterCode, filters });
      return freezePage(page, { limit, scope });
    },
    async getForActor(actorId, requestedCode) {
      validateActor(actorId);
      const code = normalizeCode(requestedCode);
      const item = await reader.getForActor(actorId, code);
      invariant(item, 'MATERIAL_NOT_FOUND', 'Material not found', { code });
      return immutableCopy(item);
    },
  });
}

function normalizeFilters(options) {
  const q = optionalSearch(options.q);
  const status = optionalEnum(options.status, MATERIAL_STATUSES, 'MATERIAL_STATUS_FILTER_INVALID', 'Material status filter');
  const type = optionalEnum(options.type, MATERIAL_TYPES, 'MATERIAL_TYPE_FILTER_INVALID', 'Material type filter');
  const brandId = optionalIdentifier(options.brandId);
  return Object.freeze({ q, status, type, brandId });
}

function freezePage(page, { limit, scope }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'MATERIAL_PAGE_RESULT_INVALID', 'Material reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'MATERIAL_PAGE_RESULT_INVALID', 'Material page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'MATERIAL_PAGE_RESULT_INVALID', 'Material page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'MATERIAL_PAGE_RESULT_INVALID', 'Material page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextCode = page.nextCode ?? items.at(-1)?.code;
  invariant(!page.hasMore || CODE_PATTERN.test(nextCode ?? ''), 'MATERIAL_PAGE_RESULT_INVALID', 'Material page continuation code is invalid');
  return Object.freeze({ items, nextCursor: page.hasMore ? encodeMaterialCursor({ scope, code: nextCode }) : null });
}

function validateActor(actorId) {
  invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'MATERIAL_ACTOR_INVALID', 'Material actor is invalid');
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'MATERIAL_PAGE_LIMIT_INVALID', `Material page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  const limit = Number(normalized);
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'MATERIAL_PAGE_LIMIT_INVALID', `Material page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  return limit;
}

function normalizeCode(value) {
  invariant(CODE_PATTERN.test(value ?? ''), 'MATERIAL_CODE_INVALID', 'Material code must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
  return value;
}

function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'MATERIAL_SEARCH_INVALID', 'Material search must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80, 'MATERIAL_SEARCH_INVALID', 'Material search must contain 1 to 80 characters');
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), 'MATERIAL_SEARCH_INVALID', 'Material search contains control characters');
  return normalized;
}

function optionalEnum(value, allowed, code, label) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { allowed });
  return value;
}

function optionalIdentifier(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), 'MATERIAL_BRAND_FILTER_INVALID', 'Material brand filter is invalid');
  return value;
}

function immutableCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)])));
  return value;
}
