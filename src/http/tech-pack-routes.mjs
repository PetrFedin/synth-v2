import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EDITABLE = ['supplierCode', 'supplierName', 'supplierEmail', 'title', 'description', 'constructionNotes', 'qualityNotes', 'packingNotes'];
const CREATE_BODY = bodyContract(['techPackCode', 'sku', ...EDITABLE]);
const UPDATE_BODY = bodyContract(['expectedVersion', ...EDITABLE]);
const VERSION_BODY = bodyContract(['expectedVersion']);
const REVISION_BODY = bodyContract(['expectedVersion', 'techPackCode', ...EDITABLE]);
const WITHDRAW_BODY = bodyContract(['expectedVersion', 'reason']);
const QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'sku']);

export function createTechPackRoutes({ techPacks } = {}) {
  const service = techPacks ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/tech-packs$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/tech-packs\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/tech-packs$/, CREATE_BODY, ({ commandId, actorId, body }) => service.createTechPack(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/tech-packs\/([^/]+)$/, UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateTechPack(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issueTechPack(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/revisions$/, REVISION_BODY, ({ commandId, actorId, params, body }) => service.createRevision(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/withdraw$/, WITHDRAW_BODY, ({ commandId, actorId, params, body }) => service.withdrawTechPack(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'TECH_PACK_SERVICE_REQUIRED', 'Tech pack service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, createTechPack: fail, updateTechPack: fail, issueTechPack: fail, createRevision: fail, withdrawTechPack: fail });
}
