import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const COLOUR_BODY = bodyContract(['materialCode', 'colourCode', 'supplierColourReference']);
const REQUEST_BODY = bodyContract(['materialColourId', 'dipReference', 'supplierCode', 'campaignId', 'validFrom', 'validTo', 'notes']);
const SUBMIT_BODY = bodyContract(['expectedVersion', 'notes']);
const DECIDE_BODY = bodyContract(['expectedVersion', 'verdict', 'note']);
const CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);

/** @param {{ materialColours?: any }} [options] */
export function createMaterialColourRoutes({ materialColours } = {}) {
  const service = materialColours ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/materials\/([^/]+)\/palette$/, ({ actorId, params }) => service.materialPaletteForActor(actorId, decodeURIComponent(params[0]))),
    mutate('POST', /^\/v2\/material-colours$/, COLOUR_BODY, ({ commandId, actorId, body }) => service.addMaterialColour(commandId, actorId, body)),
    mutate('POST', /^\/v2\/lab-dips$/, REQUEST_BODY, ({ commandId, actorId, body }) => service.requestLabDip(commandId, actorId, body)),
    mutate('POST', /^\/v2\/lab-dips\/([^/]+)\/submit$/, SUBMIT_BODY, ({ commandId, actorId, params, body }) => service.submitLabDip(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/lab-dips\/([^/]+)\/decide$/, DECIDE_BODY, ({ commandId, actorId, params, body }) => service.decideLabDip(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/lab-dips\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancelLabDip(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'MATERIAL_COLOUR_SERVICE_REQUIRED', 'Material colour service is required');
  return Object.freeze({ materialPaletteForActor: fail, addMaterialColour: fail, requestLabDip: fail, submitLabDip: fail, decideLabDip: fail, cancelLabDip: fail });
}
