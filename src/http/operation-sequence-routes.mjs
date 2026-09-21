import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const TEMPLATE_BODY = bodyContract(['brandId', 'templateCode', 'category', 'nameRu', 'nameEn', 'notes']);
const PRODUCT_BODY = bodyContract(['brandId', 'sku', 'templateCode', 'nameRu', 'nameEn', 'notes']);
const OPERATIONS_BODY = bodyContract(['expectedVersion', 'operations'], {}, {
  operations: ['operationCode', 'nameRu', 'nameEn', 'stage', 'constructionNode', 'standardMinutes', 'equipment', 'notes'],
});
const VERDICT_BODY = bodyContract(['expectedVersion', 'reason']);

export function createOperationSequenceRoutes({ operationSequences } = {}) {
  const service = operationSequences ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/operation-sequences$/, ({ actorId }) => service.operationSequencesForActor(actorId)),
    read('GET', /^\/v2\/catalog-skus\/([^/]+)\/operation-sequence$/, ({ actorId, params }) => service.operationSequenceForSku(actorId, params[0])),
    mutate('POST', /^\/v2\/operation-sequence-templates$/, TEMPLATE_BODY, ({ commandId, actorId, body }) => service.createTemplate(commandId, actorId, body)),
    mutate('POST', /^\/v2\/operation-sequences$/, PRODUCT_BODY, ({ commandId, actorId, body }) => service.createForProduct(commandId, actorId, body)),
    mutate('POST', /^\/v2\/operation-sequences\/([^/]+)\/operations$/, OPERATIONS_BODY, ({ commandId, actorId, params, body }) => service.replaceOperations(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/operation-sequences\/([^/]+)\/publish$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.publish(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/operation-sequences\/([^/]+)\/retire$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.retire(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'BOL_SERVICE_REQUIRED', 'Operation sequence service is required');
  return Object.freeze({ operationSequencesForActor: fail, operationSequenceForSku: fail, createTemplate: fail, createForProduct: fail, replaceOperations: fail, publish: fail, retire: fail });
}
