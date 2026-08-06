import { invariant } from '../core/errors.mjs';
import { decodeOutboundShipmentCursor, encodeOutboundShipmentCursor } from '../core/outbound-shipment-cursor.mjs';
import { OUTBOUND_SHIPMENT_STATUSES } from '../modules/outbound-shipment/public.mjs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,159}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function createOutboundShipmentQueryService({ reader } = {}) {
  invariant(reader && typeof reader.pageForActor === 'function' && typeof reader.getForActor === 'function', 'SHIPMENT_READER_REQUIRED', 'Outbound Shipment reader is required');
  return Object.freeze({
    async pageForActor(actorId, options = {}) {
      validateActor(actorId);
      const limit = pageLimit(options.limit);
      const filters = Object.freeze({
        q: optionalSearch(options.q),
        status: optionalStatus(options.status),
        brandId: optionalIdentifier(options.brandId, 'SHIPMENT_BRAND_FILTER_INVALID'),
        supplierCode: optionalCode(options.supplierCode, 'SHIPMENT_SUPPLIER_FILTER_INVALID'),
        sku: optionalCode(options.sku, 'SHIPMENT_SKU_FILTER_INVALID'),
        carrierCode: optionalCode(options.carrierCode, 'SHIPMENT_CARRIER_FILTER_INVALID'),
      });
      const scope = JSON.stringify([filters.q ?? null, filters.status ?? null, filters.brandId ?? null, filters.supplierCode ?? null, filters.sku ?? null, filters.carrierCode ?? null]);
      const decoded = options.cursor ? decodeOutboundShipmentCursor(options.cursor, { scope }) : null;
      const page = await reader.pageForActor(actorId, { limit, afterShipmentCode: decoded?.shipmentCode, filters });
      invariant(page && Array.isArray(page.items) && page.items.length <= limit && typeof page.hasMore === 'boolean', 'SHIPMENT_PAGE_RESULT_INVALID', 'Outbound Shipment page result is invalid');
      const items = Object.freeze(page.items.map(immutableCopy));
      const nextCode = page.nextShipmentCode ?? items.at(-1)?.shipmentCode;
      invariant(!page.hasMore || CODE_PATTERN.test(nextCode ?? ''), 'SHIPMENT_PAGE_RESULT_INVALID', 'Outbound Shipment continuation code is invalid');
      return Object.freeze({ items, nextCursor: page.hasMore ? encodeOutboundShipmentCursor({ scope, shipmentCode: nextCode }) : null });
    },
    async getForActor(actorId, shipmentCode) {
      validateActor(actorId);
      validateCode(shipmentCode, 'SHIPMENT_CODE_INVALID');
      const value = await reader.getForActor(actorId, shipmentCode);
      invariant(value, 'SHIPMENT_NOT_FOUND', 'Outbound Shipment not found', { shipmentCode });
      return immutableCopy(value);
    },
  });
}

function pageLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  const normalized = typeof value === 'number' ? String(value) : value;
  invariant(typeof normalized === 'string' && /^\d+$/.test(normalized), 'SHIPMENT_PAGE_LIMIT_INVALID', 'Outbound Shipment page limit is invalid');
  const result = Number(normalized);
  invariant(Number.isSafeInteger(result) && result >= 1 && result <= MAX_LIMIT, 'SHIPMENT_PAGE_LIMIT_INVALID', 'Outbound Shipment page limit is invalid');
  return result;
}
function optionalStatus(value) { if (value === undefined || value === null || value === '') return undefined; invariant(OUTBOUND_SHIPMENT_STATUSES.includes(value), 'SHIPMENT_STATUS_FILTER_INVALID', 'Outbound Shipment status filter is invalid'); return value; }
function optionalIdentifier(value, code) { if (value === undefined || value === null || value === '') return undefined; invariant(typeof value === 'string' && ID_PATTERN.test(value), code, 'Outbound Shipment identifier filter is invalid'); return value; }
function optionalCode(value, code) { if (value === undefined || value === null || value === '') return undefined; validateCode(value, code); return value; }
function optionalSearch(value) {
  if (value === undefined || value === null || value === '') return undefined;
  invariant(typeof value === 'string', 'SHIPMENT_SEARCH_INVALID', 'Outbound Shipment search is invalid');
  const normalized = value.trim().replace(/\s+/g, ' ');
  invariant(normalized.length >= 1 && normalized.length <= 80 && !/[\u0000-\u001f\u007f]/.test(normalized), 'SHIPMENT_SEARCH_INVALID', 'Outbound Shipment search is invalid');
  return normalized;
}
function validateCode(value, code) { invariant(typeof value === 'string' && CODE_PATTERN.test(value), code, 'Outbound Shipment code is invalid'); }
function validateActor(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 200, 'SHIPMENT_ACTOR_INVALID', 'Outbound Shipment actor is invalid'); }
function immutableCopy(value) { if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy)); if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, immutableCopy(nested)]))); return value; }
