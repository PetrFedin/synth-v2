import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const RECEIVE_BODY = bodyContract(['materialCode', 'lotReference', 'dyeLot', 'supplierCode', 'receivedQuantity', 'certificateReference', 'notes', 'colourCode']);
const VERDICT_BODY = bodyContract(['expectedVersion', 'reason', 'certificateReference', 'notes']);
const ISSUE_BODY = bodyContract(['expectedVersion', 'executionCode', 'quantity', 'notes']);

export function createMaterialLotRoutes({ materialLots } = {}) {
  const service = materialLots ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/material-lots$/, ({ actorId }) => service.materialLotsForActor(actorId)),
    read('GET', /^\/v2\/production-executions\/([^/]+)\/material-traceability$/, ({ actorId, params }) => service.executionTraceabilityForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/material-lots$/, RECEIVE_BODY, ({ commandId, actorId, body }) => service.receiveLot(commandId, actorId, body)),
    mutate('POST', /^\/v2\/material-lots\/([^/]+)\/release$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.releaseLot(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-lots\/([^/]+)\/quarantine$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.quarantineLot(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-lots\/([^/]+)\/reject$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.rejectLot(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/material-lots\/([^/]+)\/issue$/, ISSUE_BODY, ({ commandId, actorId, params, body }) => service.issueLot(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'MATERIAL_LOT_SERVICE_REQUIRED', 'Material lot service is required');
  return Object.freeze({ materialLotsForActor: fail, executionTraceabilityForActor: fail, receiveLot: fail, releaseLot: fail, quarantineLot: fail, rejectLot: fail, issueLot: fail });
}
