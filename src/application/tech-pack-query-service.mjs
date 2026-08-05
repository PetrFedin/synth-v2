import { invariant } from '../core/errors.mjs';
import { decodeTechPackCursor, encodeTechPackCursor } from '../core/tech-pack-cursor.mjs';
import { TECH_PACK_STATUSES } from '../modules/tech-packs/public.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createTechPackQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'TECH_PACK_READER_REQUIRED', 'Tech pack reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({ q: optionalSearch(options.q), status: optionalStatus(options.status), brandId: optionalIdentifier(options.brandId), sku: optionalSku(options.sku) });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.sku ?? null]);
      const decoded = options.cursor ? decodeTechPackCursor(options.cursor, { scope }) : null;
      const page = await reader.pageForActor(actorId, { limit, afterTechPackCode: decoded?.techPackCode, filters });
      invariant(page && Array.isArray(page.items) && page.items.length <= limit && typeof page.hasMore === 'boolean', 'TECH_PACK_PAGE_RESULT_INVALID', 'Tech pack page result is invalid');
      const items = Object.freeze(page.items.map(immutableCopy));
      const nextCode = page.nextTechPackCode ?? items.at(-1)?.techPackCode;
      invariant(!page.hasMore || CODE_PATTERN.test(nextCode ?? ''), 'TECH_PACK_PAGE_RESULT_INVALID', 'Tech pack continuation code is invalid');
      return Object.freeze({ items, nextCursor: page.hasMore ? encodeTechPackCursor({ scope, techPackCode: nextCode }) : null });
    },
    async getForActor(actorId, requestedCode) {
      validateActor(actorId);
      invariant(CODE_PATTERN.test(requestedCode ?? ''), 'TECH_PACK_CODE_INVALID', 'Tech pack code is invalid');
      const value = await reader.getForActor(actorId, requestedCode);
      invariant(value, 'TECH_PACK_NOT_FOUND', 'Tech pack not found', { techPackCode: requestedCode });
      return immutableCopy(value);
    },
  });
}

function pageLimit(value) { if (value === undefined || value === null || value === '') return DEFAULT_LIMIT; const normalized = typeof value === 'number' ? String(value) : value; invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'TECH_PACK_PAGE_LIMIT_INVALID', 'Tech pack page limit is invalid'); const result = Number(normalized); invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_LIMIT, 'TECH_PACK_PAGE_LIMIT_INVALID', 'Tech pack page limit is invalid'); return result; }
function optionalStatus(value) { if (value === undefined || value === null || value === '') return undefined; invariant(TECH_PACK_STATUSES.includes(value), 'TECH_PACK_STATUS_FILTER_INVALID', 'Tech pack status filter is invalid'); return value; }
function optionalSku(value) { if (value === undefined || value === null || value === '') return undefined; invariant(SKU_PATTERN.test(value), 'TECH_PACK_SKU_FILTER_INVALID', 'Tech pack SKU filter is invalid'); return value; }
function optionalIdentifier(value) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && ID_PATTERN.test(value), 'TECH_PACK_BRAND_FILTER_INVALID', 'Tech pack brand filter is invalid'); return value; }
function optionalSearch(value) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string', 'TECH_PACK_SEARCH_INVALID', 'Tech pack search is invalid'); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= 1 && normalized.length <= 80 && !/[\u0000-\u001f\u007f]/.test(normalized), 'TECH_PACK_SEARCH_INVALID', 'Tech pack search is invalid'); return normalized; }
function validateActor(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, 'TECH_PACK_ACTOR_INVALID', 'Tech pack actor is invalid'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
