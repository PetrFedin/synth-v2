import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EDITABLE = ['supplierCode', 'supplierName', 'supplierEmail', 'title', 'description', 'constructionNotes', 'qualityNotes', 'packingNotes'];
const CREATE_BODY = bodyContract(['techPackCode', 'sku', ...EDITABLE]);
const UPDATE_BODY = bodyContract(['expectedVersion', ...EDITABLE]);
const VERSION_BODY = bodyContract(['expectedVersion']);
const ACK_BODY = bodyContract(['expectedVersion', 'supplierCode', 'acknowledgementReference', 'acknowledgedBy', 'notes']);
const REVISION_BODY = bodyContract(['expectedVersion', 'techPackCode', ...EDITABLE]);
const WITHDRAW_BODY = bodyContract(['expectedVersion', 'reason']);
const QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'sku']);
const TECH_PACK_CODE = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const BY_CODE_FIELDS = ['code'];
const OPERATION_BODY = bodyContract(['sequence', 'operationCode', 'nameRu', 'nameEn', 'equipment', 'machineClass', 'standardMinutes', 'notes']);

export function createTechPackRoutes({ techPacks } = {}) {
  const service = techPacks ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/tech-packs$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    // Query aliases preserve codes containing '/' without weakening path decoding.
    readByCode(/^\/v2\/tech-packs\/by-code$/, (actor, code) => service.getForActor(actor, code)),
    readByCode(/^\/v2\/tech-packs\/by-code\/document$/, (actor, code) => service.getDocumentForActor(actor, code)),
    readByCode(/^\/v2\/tech-packs\/by-code\/canonical-document$/, (actor, code) => service.getCanonicalRenderableDocumentForActor(actor, code)),
    read('GET', /^\/v2\/tech-packs\/by-code\/canonical-preflight$/, ['code'], ({ actorId, query }) => service.canonicalPreflightForActor(actorId, queryCode(query))),
    mutateByCode('PATCH', /^\/v2\/tech-packs\/by-code$/, UPDATE_BODY, ({ commandId, actorId, body }, code) => service.updateTechPack(commandId, actorId, code, body)),
    mutateByCode('POST', /^\/v2\/tech-packs\/by-code\/operations$/, OPERATION_BODY, ({ commandId, actorId, body }, code) => service.addOperation(commandId, actorId, code, body)),
    mutateByCode('POST', /^\/v2\/tech-packs\/by-code\/issue$/, VERSION_BODY, ({ commandId, actorId, body }, code) => service.issueTechPack(commandId, actorId, code, body)),
    mutateByCode('POST', /^\/v2\/tech-packs\/by-code\/acknowledge$/, ACK_BODY, ({ commandId, actorId, body }, code) => service.acknowledgeTechPack(commandId, actorId, code, body)),
    mutateByCode('POST', /^\/v2\/tech-packs\/by-code\/revisions$/, REVISION_BODY, ({ commandId, actorId, body }, code) => service.createRevision(commandId, actorId, code, body)),
    mutateByCode('POST', /^\/v2\/tech-packs\/by-code\/withdraw$/, WITHDRAW_BODY, ({ commandId, actorId, body }, code) => service.withdrawTechPack(commandId, actorId, code, body)),
    read('GET', /^\/v2\/tech-packs\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    read('GET', /^\/v2\/tech-packs\/([^/]+)\/canonical-preflight$/, [], ({ actorId, params }) => service.canonicalPreflightForActor(actorId, params[0])),
    read('GET', /^\/v2\/tech-packs\/([^/]+)\/canonical-document$/, [], ({ actorId, params }) => service.getCanonicalRenderableDocumentForActor(actorId, params[0])),
    // Everything the document is made of, read at one instant.
    read('GET', /^\/v2\/tech-packs\/([^/]+)\/document$/, [], ({ actorId, params }) => service.getDocumentForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/tech-packs$/, CREATE_BODY, ({ commandId, actorId, body }) => service.createTechPack(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/tech-packs\/([^/]+)$/, UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateTechPack(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/operations$/, OPERATION_BODY, ({ commandId, actorId, params, body }) => service.addOperation(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/issue$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.issueTechPack(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/tech-packs\/([^/]+)\/acknowledge$/, ACK_BODY, ({ commandId, actorId, params, body }) => service.acknowledgeTechPack(commandId, actorId, params[0], body)),
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
function queryCode(query) {
  invariant(typeof query?.code === 'string' && TECH_PACK_CODE.test(query.code),
    'TECH_PACK_CODE_INVALID', 'Tech Pack code is invalid');
  return query.code;
}
function readByCode(pattern, action) {
  return read('GET', pattern, BY_CODE_FIELDS, ({ actorId, query }) => action(actorId, queryCode(query)));
}
function mutateByCode(method, pattern, contract, action) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, BY_CODE_FIELDS);
      assertBodyContract(context.body, contract);
      return action(context, queryCode(context.query));
    },
  });
}
function unavailable() {
  const fail = () => invariant(false, 'TECH_PACK_SERVICE_REQUIRED', 'Tech pack service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, getDocumentForActor: fail, getCanonicalRenderableDocumentForActor: fail, canonicalPreflightForActor: fail, addOperation: fail, createTechPack: fail, updateTechPack: fail, issueTechPack: fail, acknowledgeTechPack: fail, createRevision: fail, withdrawTechPack: fail });
}
