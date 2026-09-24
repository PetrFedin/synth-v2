import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const LAY_BODY = bodyContract(
  ['materialCode', 'spreadReference', 'markerLength', 'plies', 'fabricWidth', 'fabricWidthUnit', 'marker', 'lots', 'notes'],
  {},
  { marker: ['executionCode', 'garmentsPerPly'], lots: ['lotReference', 'quantity'] },
);
const VERDICT_BODY = bodyContract(['expectedVersion', 'reason']);

export function createCuttingRoutes({ cutting } = {}) {
  const service = cutting ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/cutting-spreads$/, ({ actorId }) => service.cuttingSpreadsForActor(actorId)),
    read('GET', /^\/v2\/production-executions\/([^/]+)\/cutting$/, ({ actorId, params }) => service.cuttingSummaryForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/cutting-spreads$/, LAY_BODY, ({ commandId, actorId, body }) => service.laySpread(commandId, actorId, body)),
    mutate('POST', /^\/v2\/cutting-spreads\/([^/]+)\/cut$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.markCut(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/cutting-spreads\/([^/]+)\/cancel$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'CUTTING_SERVICE_REQUIRED', 'Cutting service is required');
  return Object.freeze({ cuttingSpreadsForActor: fail, cuttingSummaryForActor: fail, laySpread: fail, markCut: fail, cancel: fail });
}
