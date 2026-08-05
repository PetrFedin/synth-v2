import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract();
const VERSION_BODY = bodyContract(['expectedVersion']);
const CONFIRM_BODY = bodyContract(['expectedVersion', 'supplierCode', 'confirmationReference', 'confirmedBy', 'notes']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);
const QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'supplierCode', 'sku']);

export function createProductionOrderRoutes({ productionOrders } = {}) {
  const service = productionOrders ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/production-orders$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/production-orders\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/production-orders\/from-allocation\/([^/]+)$/, EMPTY_BODY, ({ commandId, actorId, params }) => service.createFromAllocation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/production-orders\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issue(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-orders\/([^/]+)\/confirm$/, CONFIRM_BODY, ({ commandId, actorId, params, body }) => service.confirm(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-orders\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'PRODUCTION_ORDER_SERVICE_REQUIRED', 'Production Order service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, createFromAllocation: fail, issue: fail, confirm: fail, cancel: fail });
}
