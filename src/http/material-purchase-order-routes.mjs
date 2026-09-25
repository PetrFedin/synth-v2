import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract([]);
const VERSION_BODY = bodyContract(['expectedVersion']);
const CONFIRM_BODY = bodyContract(['expectedVersion', 'supplierCode', 'confirmationReference', 'confirmedBy', 'notes']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);

export function createMaterialPurchaseOrderRoutes({ materialPurchaseOrders } = {}) {
  const service = materialPurchaseOrders ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/material-purchase-orders\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/material-rfqs\/([^/]+)\/purchase-order$/, EMPTY_BODY, ({ commandId, actorId, params }) => service.createFromAllocation(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/material-purchase-orders\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issue(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-purchase-orders\/([^/]+)\/confirm$/, CONFIRM_BODY, ({ commandId, actorId, params, body }) => service.confirm(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-purchase-orders\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      return execute(context);
    },
  });
}
function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) { assertQueryContract(context.query ?? {}, queryFields); return execute(context); },
  });
}
function unavailable() {
  const fail = () => invariant(false, 'MATERIAL_PURCHASE_ORDER_SERVICE_REQUIRED', 'Material Purchase Order service is required');
  return Object.freeze({ getForActor: fail, createFromAllocation: fail, issue: fail, confirm: fail, cancel: fail });
}
