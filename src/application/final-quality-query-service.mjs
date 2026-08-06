import { invariant } from '../core/errors.mjs';
import { decodeFinalQualityCursor, encodeFinalQualityCursor } from '../core/final-quality-cursor.mjs';
import { QUALITY_INSPECTION_STATUSES } from '../modules/final-quality/public.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,159}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function createFinalQualityQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function' && typeof reader.getShipmentReleaseForActor === 'function', 'QUALITY_READER_REQUIRED', 'Final Quality reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalStatus(options.status),
        brandId: optionalIdentifier(options.brandId, 'QUALITY_BRAND_FILTER_INVALID'),
        supplierCode: optionalCode(options.supplierCode, 'QUALITY_SUPPLIER_FILTER_INVALID'),
        sku: optionalCode(options.sku, 'QUALITY_SKU_FILTER_INVALID'),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.supplierCode ?? null, filters.sku ?? null]);
      const decoded = options.cursor ? decodeFinalQualityCursor(options.cursor, { scope }) : null;
      const page = await reader.pageForActor(actorId, { limit, afterInspectionCode: decoded?.inspectionCode, filters });
      invariant(page && Array.isArray(page.items) && page.items.length <= limit && typeof page.hasMore === 'boolean', 'QUALITY_PAGE_RESULT_INVALID', 'Final Quality page result is invalid');
      const items = Object.freeze(page.items.map(immutableCopy));
      const nextCode = page.nextInspectionCode ?? items.at(-1)?.inspectionCode;
      invariant(!page.hasMore || CODE_PATTERN.test(nextCode ?? ''), 'QUALITY_PAGE_RESULT_INVALID', 'Final Quality continuation code is invalid');
      return Object.freeze({ items, nextCursor: page.hasMore ? encodeFinalQualityCursor({ scope, inspectionCode: nextCode }) : null });
    },
    async getForActor(actorId, inspectionCode) {
      validateActor(actorId);
      validateCode(inspectionCode, 'QUALITY_INSPECTION_CODE_INVALID');
      const value = await reader.getForActor(actorId, inspectionCode);
      invariant(value, 'QUALITY_INSPECTION_NOT_FOUND', 'Final Quality inspection not found', { inspectionCode });
      return immutableCopy(value);
    },
    async getShipmentReleaseForActor(actorId, releaseCode) {
      validateActor(actorId);
      validateCode(releaseCode, 'QUALITY_RELEASE_CODE_INVALID');
      const value = await reader.getShipmentReleaseForActor(actorId, releaseCode);
      invariant(value, 'QUALITY_SHIPMENT_RELEASE_NOT_FOUND', 'Shipment release not found', { releaseCode });
      return immutableCopy(value);
    },
  });
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'QUALITY_PAGE_LIMIT_INVALID', 'Final Quality page limit is invalid');
  const result = Number(normalized);
  invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_LIMIT, 'QUALITY_PAGE_LIMIT_INVALID', 'Final Quality page limit is invalid');
  return result;
}
function optionalStatus(value) { if (value === undefined || value === null || value === '') return undefined; invariant(QUALITY_INSPECTION_STATUSES.includes(value), 'QUALITY_STATUS_FILTER_INVALID', 'Final Quality status filter is invalid'); return value; }
function optionalIdentifier(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Final Quality identifier filter is invalid'); return value; }
function optionalCode(value, code) { if (value === undefined || value === null || value === '') return undefined; validateCode(value, code); return value; }
function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'QUALITY_SEARCH_INVALID', 'Final Quality search is invalid');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80 && !/[\u0000-\u001f\u007f]/.test(normalized), 'QUALITY_SEARCH_INVALID', 'Final Quality search is invalid');
  return normalized;
}
function validateCode(value, code) { invariant(typeof value === 'string' && CODE_PATTERN.test(value), code, 'Final Quality code is invalid'); }
function validateActor(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 200, 'QUALITY_ACTOR_INVALID', 'Final Quality actor is invalid'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
