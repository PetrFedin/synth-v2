import { invariant } from '../core/errors.mjs';
import { decodeProductionOrderCursor, encodeProductionOrderCursor } from '../core/production-order-cursor.mjs';
import { PRODUCTION_ORDER_STATUSES } from '../modules/production-orders/public.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function createProductionOrderQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'PRODUCTION_ORDER_READER_REQUIRED', 'Production Order reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalStatus(options.status),
        brandId: optionalIdentifier(options.brandId, 'PRODUCTION_ORDER_BRAND_FILTER_INVALID'),
        supplierCode: optionalCode(options.supplierCode, 'PRODUCTION_ORDER_SUPPLIER_FILTER_INVALID'),
        sku: optionalCode(options.sku, 'PRODUCTION_ORDER_SKU_FILTER_INVALID'),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.supplierCode ?? null, filters.sku ?? null]);
      const decoded = options.cursor ? decodeProductionOrderCursor(options.cursor, { scope }) : null;
      const page = await reader.pageForActor(actorId, { limit, afterProductionOrderNumber: decoded?.productionOrderNumber, filters });
      invariant(page && Array.isArray(page.items) && page.items.length <= limit && typeof page.hasMore === 'boolean', 'PRODUCTION_ORDER_PAGE_RESULT_INVALID', 'Production Order page result is invalid');
      const items = Object.freeze(page.items.map(immutableCopy));
      const nextNumber = page.nextProductionOrderNumber ?? items.at(-1)?.productionOrderNumber;
      invariant(!page.hasMore || CODE_PATTERN.test(nextNumber ?? ''), 'PRODUCTION_ORDER_PAGE_RESULT_INVALID', 'Production Order continuation number is invalid');
      return Object.freeze({ items, nextCursor: page.hasMore ? encodeProductionOrderCursor({ scope, productionOrderNumber: nextNumber }) : null });
    },
    async getForActor(actorId, productionOrderNumber) {
      validateActor(actorId);
      invariant(CODE_PATTERN.test(productionOrderNumber ?? ''), 'PRODUCTION_ORDER_NUMBER_INVALID', 'Production Order number is invalid');
      const value = await reader.getForActor(actorId, productionOrderNumber);
      invariant(value, 'PRODUCTION_ORDER_NOT_FOUND', 'Production Order not found', { productionOrderNumber });
      return immutableCopy(value);
    },
  });
}

function pageLimit(value) { if (value === undefined || value === null || value === '') return DEFAULT_LIMIT; const normalized = typeof value === 'number' ? String(value) : value; invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'PRODUCTION_ORDER_PAGE_LIMIT_INVALID', 'Production Order page limit is invalid'); const result = Number(normalized); invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_LIMIT, 'PRODUCTION_ORDER_PAGE_LIMIT_INVALID', 'Production Order page limit is invalid'); return result; }
function optionalStatus(value) { if (value === undefined || value === null || value === '') return undefined; invariant(PRODUCTION_ORDER_STATUSES.includes(value), 'PRODUCTION_ORDER_STATUS_FILTER_INVALID', 'Production Order status filter is invalid'); return value; }
function optionalIdentifier(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Production Order identifier filter is invalid'); return value; }
function optionalCode(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && CODE_PATTERN.test(value), code, 'Production Order code filter is invalid'); return value; }
function optionalSearch(value) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string', 'PRODUCTION_ORDER_SEARCH_INVALID', 'Production Order search is invalid'); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= 1 && normalized.length <= 80 && !/[\u0000-\u001f\u007f]/.test(normalized), 'PRODUCTION_ORDER_SEARCH_INVALID', 'Production Order search is invalid'); return normalized; }
function validateActor(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, 'PRODUCTION_ORDER_ACTOR_INVALID', 'Production Order actor is invalid'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
