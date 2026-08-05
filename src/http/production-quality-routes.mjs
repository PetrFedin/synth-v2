import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract();
const VERSION_BODY = bodyContract(['expectedVersion']);
const RECORD_BODY = bodyContract(['expectedVersion', 'inspectedQuantity', 'defects'], {}, { defects: ['defectCode', 'classification', 'quantity', 'description', 'evidenceReference'] });
const REWORK_BODY = bodyContract(['expectedVersion', 'reference', 'notes']);
const QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'brandId', 'supplierCode', 'sku']);

export function createProductionQualityRoutes({ productionQuality } = {}) {
  const service = productionQuality ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/production-quality$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/production-quality\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/production-quality\/from-execution\/([^/]+)$/, EMPTY_BODY, ({ commandId, actorId, params }) => service.createFromExecution(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/production-quality\/([^/]+)\/start$/, VERSION_BODY, ({ commandId, actorId, params, body }) => service.startInspection(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-quality\/([^/]+)\/record$/, RECORD_BODY, ({ commandId, actorId, params, body }) => service.recordInspection(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/production-quality\/([^/]+)\/rework$/, REWORK_BODY, ({ commandId, actorId, params, body }) => service.submitRework(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'PRODUCTION_QUALITY_SERVICE_REQUIRED', 'Production quality service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, createFromExecution: fail, startInspection: fail, recordInspection: fail, submitRework: fail });
}
