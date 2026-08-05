import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract();
const VERSION_BODY = bodyContract(['expectedVersion']);
const COMPLETE_BODY = bodyContract(['expectedVersion', 'milestoneCode', 'notes']);
const BLOCK_BODY = bodyContract(['expectedVersion', 'milestoneCode', 'reason']);
const RESOLVE_BODY = bodyContract(['expectedVersion', 'milestoneCode', 'notes']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);
const QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'supplierCode', 'sku']);

export function createProductionExecutionRoutes({ productionExecutions } = {}) {
  const service = productionExecutions ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/production-executions$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/production-executions\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/production-executions\/from-production-order\/([^/]+)$/, EMPTY_BODY, ({ commandId, actorId, params }) => service.createFromProductionOrder(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/start$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.start(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/milestones\/complete$/, COMPLETE_BODY, ({ commandId, actorId, params, body }) => service.completeMilestone(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/milestones\/block$/, BLOCK_BODY, ({ commandId, actorId, params, body }) => service.blockMilestone(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/milestones\/resolve$/, RESOLVE_BODY, ({ commandId, actorId, params, body }) => service.resolveMilestone(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-executions\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'PRODUCTION_EXECUTION_SERVICE_REQUIRED', 'Production execution service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, createFromProductionOrder: fail, start: fail, completeMilestone: fail, blockMilestone: fail, resolveMilestone: fail, cancel: fail });
}
