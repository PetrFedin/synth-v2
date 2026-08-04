import { invariant } from '../core/errors.mjs';
import { decodeSourcingCursor, encodeSourcingCursor } from '../core/sourcing-cursor.mjs';
import { RFQ_STATUSES, SUPPLIER_STATUSES } from '../modules/sourcing/public.mjs';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function createSourcingQueryService({ reader, clock = () => new Date().toISOString() } = {}) {
  invariant(reader && typeof reader.supplierPageForActor === 'function' && typeof reader.supplierGetForActor === 'function' && typeof reader.rfqPageForActor === 'function' && typeof reader.rfqGetForActor === 'function', 'SOURCING_READER_REQUIRED', 'Sourcing reader is required');

  return Object.freeze({
    supplierPageForActor(actorId, options = {}) {
      return pageForActor({ kind: 'supplier', actorId, options, statuses: SUPPLIER_STATUSES, read: reader.supplierPageForActor, extraFilters: supplierFilters });
    },
    async supplierGetForActor(actorId, requestedCode) {
      validateActor(actorId);
      const supplierCode = normalizeCode(requestedCode, 'SUPPLIER_CODE_INVALID', 'Supplier code');
      const item = await reader.supplierGetForActor(actorId, supplierCode);
      invariant(item, 'SUPPLIER_NOT_FOUND', 'Supplier not found', { supplierCode });
      return immutableCopy(item);
    },
    rfqPageForActor(actorId, options = {}) {
      return pageForActor({ kind: 'rfq', actorId, options, statuses: RFQ_STATUSES, read: reader.rfqPageForActor, extraFilters: rfqFilters });
    },
    async rfqGetForActor(actorId, requestedCode) {
      validateActor(actorId);
      const rfqCode = normalizeCode(requestedCode, 'RFQ_CODE_INVALID', 'RFQ code');
      const item = await reader.rfqGetForActor(actorId, rfqCode);
      invariant(item, 'RFQ_NOT_FOUND', 'RFQ not found', { rfqCode });
      return immutableCopy(item);
    },
  });

  async function pageForActor({ kind, actorId, options, statuses, read, extraFilters }) {
    validateActor(actorId);
    const limit = pageLimit(options.limit);
    const filters = Object.freeze({
      q: optionalSearch(options.q),
      status: optionalEnum(options.status, statuses, 'SOURCING_STATUS_FILTER_INVALID', 'Sourcing status filter'),
      brandId: optionalIdentifier(options.brandId),
      ...extraFilters(options),
    });
    const scope = JSON.stringify([kind, ...Object.keys(filters).sort().map((key) => [key, filters[key] ?? null])]);
    const decoded = options.cursor === undefined || options.cursor === null || options.cursor === '' ? null : decodeSourcingCursor(options.cursor, { kind, scope });
    const referenceTime = decoded?.asOf ?? normalizedClock(clock());
    const page = await read(actorId, { limit, afterCode: decoded?.code, filters, referenceTime });
    return freezePage(page, { kind, limit, scope, referenceTime });
  }
}

function supplierFilters(options) {
  return Object.freeze({
    countryCode: optionalPattern(options.countryCode, COUNTRY_PATTERN, 'SUPPLIER_COUNTRY_FILTER_INVALID', 'Supplier country filter'),
    category: optionalSearch(options.category, 'SUPPLIER_CATEGORY_FILTER_INVALID', 80),
  });
}
function rfqFilters(options) {
  return Object.freeze({
    sku: optionalCode(options.sku, 'RFQ_SKU_FILTER_INVALID', 'RFQ SKU filter'),
    supplierCode: optionalCode(options.supplierCode, 'RFQ_SUPPLIER_FILTER_INVALID', 'RFQ supplier filter'),
    overdue: optionalBoolean(options.overdue),
  });
}
function freezePage(page, { kind, limit, scope, referenceTime }) {
  invariant(page && typeof page === 'object' && !Array.isArray(page), 'SOURCING_PAGE_RESULT_INVALID', 'Sourcing reader must return a page object');
  invariant(Array.isArray(page.items) && page.items.length <= limit, 'SOURCING_PAGE_RESULT_INVALID', 'Sourcing page items are invalid', { limit });
  invariant(typeof page.hasMore === 'boolean', 'SOURCING_PAGE_RESULT_INVALID', 'Sourcing page hasMore flag is invalid');
  invariant(!page.hasMore || page.items.length > 0, 'SOURCING_PAGE_RESULT_INVALID', 'Sourcing page cannot continue without items');
  const items = Object.freeze(page.items.map(immutableCopy));
  const code = page.nextCode ?? items.at(-1)?.[kind === 'supplier' ? 'supplierCode' : 'rfqCode'];
  invariant(!page.hasMore || CODE_PATTERN.test(code ?? ''), 'SOURCING_PAGE_RESULT_INVALID', 'Sourcing page continuation code is invalid');
  return Object.freeze({ items, referenceTime, nextCursor: page.hasMore ? encodeSourcingCursor({ kind, scope, asOf: referenceTime, code }) : null });
}
function validateActor(actorId) { invariant(typeof actorId === 'string' && actorId.length >= 1 && actorId.length <= 160, 'SOURCING_ACTOR_INVALID', 'Sourcing actor is invalid'); }
function pageLimit(value) { if (value === undefined || value === null || value === '') return DEFAULT_PAGE_LIMIT; const normalized = typeof value === 'number' ? String(value) : value; invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'SOURCING_PAGE_LIMIT_INVALID', `Sourcing page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`); const result = Number(normalized); invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_PAGE_LIMIT, 'SOURCING_PAGE_LIMIT_INVALID', `Sourcing page limit must be an integer from 1 to ${MAX_PAGE_LIMIT}`); return result; }
function normalizedClock(value) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'SOURCING_CLOCK_INVALID', 'Sourcing query clock is invalid'); return new Date(value).toISOString(); }
function normalizeCode(value, code, label) { invariant(typeof value === 'string' && CODE_PATTERN.test(value), code, `${label} is invalid`); return value; }
function optionalCode(value, code, label) { if (value === undefined || value === null || value === '') return undefined; return normalizeCode(value, code, label); }
function optionalIdentifier(value) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && IDENTIFIER_PATTERN.test(value), 'SOURCING_BRAND_FILTER_INVALID', 'Sourcing brand filter is invalid'); return value; }
function optionalPattern(value, regex, code, label) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && regex.test(value), code, `${label} is invalid`); return value; }
function optionalSearch(value, code = 'SOURCING_SEARCH_INVALID', maximum = 80) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string', code, 'Search value must be a string'); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= 1 && normalized.length <= maximum && !/[\u0000-\u001f\u007f]/.test(normalized), code, `Search value must contain 1-${maximum} valid characters`); return normalized; }
function optionalEnum(value, allowed, code, label) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { allowed }); return value; }
function optionalBoolean(value) { if (value === undefined || value === null || value === '') return undefined; if (value === true || value === 'true') return true; if (value === false || value === 'false') return false; invariant(false, 'SOURCING_OVERDUE_FILTER_INVALID', 'Sourcing overdue filter must be true or false'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
