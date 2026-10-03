import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const PAGE_QUERY_FIELDS = Object.freeze(['limit', 'supplierCode']);

const QUOTE_BODY = bodyContract(['expectedVersion', 'supplierCode', 'unitPriceMinor', 'fixedCostMinor', 'leadTimeDays', 'minimumOrderQuantity', 'validUntil', 'notes', 'tiers'], {}, { tiers: ['quantity', 'unitPriceMinor'] });
const ACCEPT_COUNTER_BODY = bodyContract(['expectedVersion', 'supplierCode']);
const CONFIRM_ORDER_BODY = bodyContract(['expectedVersion', 'supplierCode', 'confirmationReference', 'notes']);

// The counterparty surface. A supplier answers for itself (S-01) through three commands of its own:
// they call the same domain functions the brand's commands call, so there is still one place deciding
// what a quotation is, but they are gated on the grant instead of on a brand membership and they
// answer with the supplier's own part of the aggregate.
/** @param {{ supplierPortal?: any }} [options] */
export function createSupplierPortalRoutes({ supplierPortal } = {}) {
  const service = supplierPortal ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/supplier-portal\/suppliers$/, [], ({ actorId }) => service.suppliersForActor(actorId)),
    read('GET', /^\/v2\/supplier-portal\/rfqs$/, PAGE_QUERY_FIELDS, ({ actorId, query }) => service.rfqsForActor(actorId, query)),
    read('GET', /^\/v2\/supplier-portal\/orders$/, PAGE_QUERY_FIELDS, ({ actorId, query }) => service.ordersForActor(actorId, query)),
    mutate(/^\/v2\/supplier-portal\/rfqs\/([^/]+)\/quote$/, QUOTE_BODY, ({ commandId, actorId, params, body }) => service.submitQuote(commandId, actorId, params[0], body)),
    mutate(/^\/v2\/supplier-portal\/rfqs\/([^/]+)\/counter-offer\/accept$/, ACCEPT_COUNTER_BODY, ({ commandId, actorId, params, body }) => service.acceptCounterOffer(commandId, actorId, params[0], body)),
    mutate(/^\/v2\/supplier-portal\/orders\/([^/]+)\/confirm$/, CONFIRM_ORDER_BODY, ({ commandId, actorId, params, body }) => service.confirmOrder(commandId, actorId, params[0], body)),
  ]);
}

function mutate(pattern, contract, execute) {
  return Object.freeze({
    method: 'POST',
    pattern,
    mutation: true,
    async execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      return execute(context);
    },
  });
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
  return Object.freeze({ suppliersForActor: fail, rfqsForActor: fail, ordersForActor: fail, submitQuote: fail, acceptCounterOffer: fail, confirmOrder: fail });
}
