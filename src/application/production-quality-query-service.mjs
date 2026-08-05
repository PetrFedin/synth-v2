import { invariant } from '../core/errors.mjs';
import { decodeProductionQualityCursor, encodeProductionQualityCursor } from '../core/production-quality-cursor.mjs';
import { PRODUCTION_QUALITY_STATUSES } from '../modules/production-quality/public.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,159}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createProductionQualityQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'PRODUCTION_QUALITY_READER_REQUIRED', 'Production quality reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalStatus(options.status),
        brandId: optionalIdentifier(options.brandId, 'PRODUCTION_QUALITY_BRAND_FILTER_INVALID'),
        supplierCode: optionalCode(options.supplierCode, 'PRODUCTION_QUALITY_SUPPLIER_FILTER_INVALID'),
        sku: optionalCode(options.sku, 'PRODUCTION_QUALITY_SKU_FILTER_INVALID'),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.supplierCode ?? null, filters.sku ?? null]);
      const decoded = options.cursor ? decodeProductionQualityCursor(options.cursor, { scope }) : null;
      const page = await reader.pageForActor(actorId, { limit, afterQualityCaseCode: decoded?.qualityCaseCode, filters });
      invariant(page && Array.isArray(page.items) && page.items.length <= limit && typeof page.hasMore === 'boolean', 'PRODUCTION_QUALITY_PAGE_RESULT_INVALID', 'Production quality page result is invalid');
      const items = Object.freeze(page.items.map(immutableCopy));
      const nextCode = page.nextQualityCaseCode ?? items.at(-1)?.qualityCaseCode;
      invariant(!page.hasMore || CODE_PATTERN.test(nextCode ?? ''), 'PRODUCTION_QUALITY_PAGE_RESULT_INVALID', 'Production quality continuation code is invalid');
      return Object.freeze({ items, nextCursor: page.hasMore ? encodeProductionQualityCursor({ scope, qualityCaseCode: nextCode }) : null });
    },
    async getForActor(actorId, qualityCaseCode) {
      validateActor(actorId);
      invariant(CODE_PATTERN.test(qualityCaseCode ?? ''), 'PRODUCTION_QUALITY_CODE_INVALID', 'Production quality case code is invalid');
      const value = await reader.getForActor(actorId, qualityCaseCode);
      invariant(value, 'PRODUCTION_QUALITY_NOT_FOUND', 'Production quality case not found', { qualityCaseCode });
      return immutableCopy(value);
    },
  });
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'PRODUCTION_QUALITY_PAGE_LIMIT_INVALID', 'Production quality page limit is invalid');
  const result = Number(normalized);
  invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_LIMIT, 'PRODUCTION_QUALITY_PAGE_LIMIT_INVALID', 'Production quality page limit is invalid');
  return result;
}
function optionalStatus(value) { if (value === undefined || value === null || value === '') return undefined; invariant(PRODUCTION_QUALITY_STATUSES.includes(value), 'PRODUCTION_QUALITY_STATUS_FILTER_INVALID', 'Production quality status filter is invalid'); return value; }
function optionalIdentifier(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Production quality identifier filter is invalid'); return value; }
function optionalCode(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && CODE_PATTERN.test(value), code, 'Production quality code filter is invalid'); return value; }
function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'PRODUCTION_QUALITY_SEARCH_INVALID', 'Production quality search is invalid');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80 && !/[\u0000-\u001f\u007f]/.test(normalized), 'PRODUCTION_QUALITY_SEARCH_INVALID', 'Production quality search is invalid');
  return normalized;
}
function validateActor(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, 'PRODUCTION_QUALITY_ACTOR_INVALID', 'Production quality actor is invalid'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
