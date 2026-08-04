import { invariant } from '../core/errors.mjs';
import { decodeSampleCursor, encodeSampleCursor } from '../core/sample-cursor.mjs';
import { SAMPLE_STATUSES, SAMPLE_TYPES } from '../modules/samples/public.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const SAMPLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createSampleQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'SAMPLE_READER_REQUIRED', 'Sample reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalEnum(options.status, SAMPLE_STATUSES, 'SAMPLE_STATUS_FILTER_INVALID', 'Sample status filter'),
        sampleType: optionalEnum(options.sampleType, SAMPLE_TYPES, 'SAMPLE_TYPE_FILTER_INVALID', 'Sample type filter'),
        brandId: optionalIdentifier(options.brandId),
        sku: optionalSku(options.sku),
        overdue: optionalBoolean(options.overdue),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.sampleType ?? null, filters.brandId ?? null, filters.sku ?? null, filters.overdue ?? null]);
      const decoded = options.cursor === undefined || options.cursor === null || options.cursor === '' ? null : decodeSampleCursor(options.cursor, { scope });
      const referenceTime = decoded?.asOf ?? normalizedClock(clock());
      const page = await reader.pageForActor(actorId, { limit, afterSampleCode: decoded?.sampleCode, filters, referenceTime });
      return freezePage(page, { limit, scope, referenceTime });
    },
    async getForActor(actorId, requestedSampleCode) {
      validateActor(actorId);
      const sampleCode = normalizeSampleCode(requestedSampleCode);
      const item = await reader.getForActor(actorId, sampleCode);
      invariant(item, 'SAMPLE_NOT_FOUND', 'Sample not found', { sampleCode });
      return immutableCopy(item);
    },
  });
}

function freezePage(page, { limit, scope, referenceTime }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'SAMPLE_PAGE_RESULT_INVALID', 'Sample reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'SAMPLE_PAGE_RESULT_INVALID', 'Sample page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'SAMPLE_PAGE_RESULT_INVALID', 'Sample page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'SAMPLE_PAGE_RESULT_INVALID', 'Sample page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const nextSampleCode = page.nextSampleCode ?? items.at(-1)?.sampleCode;
  invariant(!page.hasMore || SAMPLE_CODE_PATTERN.test(nextSampleCode ?? ''), 'SAMPLE_PAGE_RESULT_INVALID', 'Sample page continuation code is invalid');
  return Object.freeze({ items, referenceTime, nextCursor: page.hasMore ? encodeSampleCursor({ scope, asOf: referenceTime, sampleCode: nextSampleCode }) : null });
}
function normalizedClock(value) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'SAMPLE_CLOCK_INVALID', 'Sample query clock is invalid'); return new Date(value).toISOString(); }
function validateActor(actorId) { invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'SAMPLE_ACTOR_INVALID', 'Sample actor is invalid'); }
function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'SAMPLE_PAGE_LIMIT_INVALID', `Sample page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  const limit = Number(normalized);
  invariant(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PAGE_LIMIT, 'SAMPLE_PAGE_LIMIT_INVALID', `Sample page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`);
  return limit;
}
function normalizeSampleCode(value) { invariant(SAMPLE_CODE_PATTERN.test(value ?? ''), 'SAMPLE_CODE_INVALID', 'Sample code is invalid'); return value; }
function optionalSku(value) { if (value === undefined || value === null || value === '') return undefined; invariant(SKU_PATTERN.test(value), 'SAMPLE_SKU_FILTER_INVALID', 'Sample SKU filter is invalid'); return value; }
function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'SAMPLE_SEARCH_INVALID', 'Sample search must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80, 'SAMPLE_SEARCH_INVALID', 'Sample search must contain 1 to 80 characters');
  invariant(!/[\u0000-\u001f\u007f]/.test(normalized), 'SAMPLE_SEARCH_INVALID', 'Sample search contains control characters');
  return normalized;
}
function optionalEnum(value, allowed, code, label) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { allowed }); return value; }
function optionalIdentifier(value) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), 'SAMPLE_BRAND_FILTER_INVALID', 'Sample brand filter is invalid'); return value; }
function optionalBoolean(value) { if (value === undefined || value === null || value === '') return undefined; if (value === true || value === 'true') return true; if (value === false || value === 'false') return false; invariant(false, 'SAMPLE_OVERDUE_FILTER_INVALID', 'Sample overdue filter must be true or false'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
