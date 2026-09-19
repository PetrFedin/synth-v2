import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

const PAGE_QUERY_FIELDS = Object.freeze(['limit', 'supplierCode']);

// The counterparty surface. Read-only: a supplier answers a request through the sourcing endpoints the
// brand already owns, and giving the portal its own write path would mean two places deciding what a
// quotation is.
/** @param {{ supplierPortal?: any }} [options] */
export function createSupplierPortalRoutes({ supplierPortal } = {}) {
  const service = supplierPortal ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/supplier-portal\/suppliers$/, [], ({ actorId }) => service.suppliersForActor(actorId)),
    read('GET', /^\/v2\/supplier-portal\/rfqs$/, PAGE_QUERY_FIELDS, ({ actorId, query }) => service.rfqsForActor(actorId, query)),
    read('GET', /^\/v2\/supplier-portal\/orders$/, PAGE_QUERY_FIELDS, ({ actorId, query }) => service.ordersForActor(actorId, query)),
  ]);
}

function read(method, pattern, fields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    async execute(context) {
      assertQueryContract(context.query ?? {}, fields);
      return execute(context);
    },
  });
}

function unavailable() {
  const fail = () => invariant(false, 'SUPPLIER_PORTAL_SERVICE_REQUIRED', 'Supplier portal service is required');
  return Object.freeze({ suppliersForActor: fail, rfqsForActor: fail, ordersForActor: fail });
}
