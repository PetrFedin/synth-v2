import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const EMPTY_BODY = bodyContract();
const START_BODY = bodyContract(['expectedVersion','inspectorName','sampleSize','allowedMajorDefects','allowedMinorDefects']);
const REINSPECTION_BODY = bodyContract(['expectedVersion','inspectorName','sampleSize','allowedMajorDefects','allowedMinorDefects','reworkReference','resolutionNotes']);
const COMPLETE_BODY = bodyContract(['expectedVersion','inspectedQuantity','defects','measurementFailures','checkpoints','evidenceReferences','notes']);
const REVIEW_BODY = bodyContract(['expectedVersion','decision','releaseCode','notes']);
const CANCEL_BODY = bodyContract(['expectedVersion','reason']);
const QUERY_FIELDS = Object.freeze(['limit','cursor','q','status','brandId','supplierCode','sku']);

export function createFinalQualityRoutes({ finalQuality } = {}) {
  const service = finalQuality ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/final-quality-inspections$/, QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/final-quality-inspections\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    read('GET', /^\/v2\/final-quality-shipment-releases\/([^/]+)$/, [], ({ actorId, params }) => service.getShipmentReleaseForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/final-quality-inspections\/from-execution\/([^/]+)$/, EMPTY_BODY, ({ commandId, actorId, params }) => service.createFromExecution(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/final-quality-inspections\/([^/]+)\/start$/, START_BODY, ({ commandId, actorId, params, body }) => service.start(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/final-quality-inspections\/([^/]+)\/complete-run$/, COMPLETE_BODY, ({ commandId, actorId, params, body }) => service.completeRun(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/final-quality-inspections\/([^/]+)\/review$/, REVIEW_BODY, ({ commandId, actorId, params, body }) => service.review(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/final-quality-inspections\/([^/]+)\/reinspect$/, REINSPECTION_BODY, ({ commandId, actorId, params, body }) => service.startReinspection(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/final-quality-inspections\/([^/]+)\/cancel$/, CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancel(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, fields, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, fields); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'QUALITY_SERVICE_REQUIRED', 'Final Quality service is required');
  return Object.freeze({ pageForActor: fail, getForActor: fail, getShipmentReleaseForActor: fail, createFromExecution: fail, start: fail, completeRun: fail, review: fail, startReinspection: fail, cancel: fail });
}
