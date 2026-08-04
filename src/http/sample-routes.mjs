import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const SAMPLE_EDITABLE_FIELDS = ['supplierCode', 'supplierName', 'dueAt', 'quantity', 'sizeCodes', 'colourway', 'notes'];
const SAMPLE_BODY = sampleBody(bodyContract(['sampleCode', 'sku', 'sampleType', 'round', ...SAMPLE_EDITABLE_FIELDS]));
const SAMPLE_UPDATE_BODY = sampleBody(bodyContract(['expectedVersion', ...SAMPLE_EDITABLE_FIELDS]));
const SAMPLE_VERSION_BODY = bodyContract(['expectedVersion']);
const SAMPLE_RECEIPT_BODY = bodyContract(['expectedVersion', 'receivedQuantity', 'condition', 'trackingReference', 'notes']);
const SAMPLE_DECISION_BODY = bodyContract(['expectedVersion', 'decision', 'notes']);
const SAMPLE_CANCEL_BODY = bodyContract(['expectedVersion', 'reason']);
const SAMPLE_NEXT_ROUND_BODY = bodyContract(['expectedVersion', 'sampleCode', 'dueAt', 'notes']);
const SAMPLE_QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q', 'status', 'sampleType', 'brandId', 'sku', 'overdue']);

export function createSampleRoutes({ samples } = {}) {
  const service = samples ?? unavailableSamples();
  return Object.freeze([
    read('GET', /^\/v2\/samples$/, SAMPLE_QUERY_FIELDS, ({ actorId, query }) => service.pageForActor(actorId, query)),
    read('GET', /^\/v2\/samples\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/samples$/, SAMPLE_BODY, ({ commandId, actorId, body }) => service.createSample(commandId, actorId, body)),
    mutate('PATCH', /^\/v2\/samples\/([^/]+)$/, SAMPLE_UPDATE_BODY, ({ commandId, actorId, params, body }) => service.updateSample(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/request$/, SAMPLE_VERSION_BODY, ({ commandId, actorId, params, body }) => service.requestSample(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/start-production$/, SAMPLE_VERSION_BODY, ({ commandId, actorId, params, body }) => service.startProduction(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/receive$/, SAMPLE_RECEIPT_BODY, ({ commandId, actorId, params, body }) => service.receiveSample(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/decision$/, SAMPLE_DECISION_BODY, ({ commandId, actorId, params, body }) => service.decideSample(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/cancel$/, SAMPLE_CANCEL_BODY, ({ commandId, actorId, params, body }) => service.cancelSample(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/samples\/([^/]+)\/next-round$/, SAMPLE_NEXT_ROUND_BODY, ({ commandId, actorId, params, body }) => service.createNextRound(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      if (typeof contract === 'function') contract(context.body);
      else assertBodyContract(context.body, contract);
      return execute(context);
    },
  });
}

function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  });
}

function sampleBody(contract) {
  return (body) => {
    assertBodyContract(body, contract);
    if (body.sizeCodes === undefined) return body;
    invariant(Array.isArray(body.sizeCodes), 'HTTP_BODY_FIELD_INVALID', 'sizeCodes must be a JSON array', { field: 'sizeCodes' });
    body.sizeCodes.forEach((sizeCode, index) => invariant(typeof sizeCode === 'string', 'HTTP_BODY_FIELD_INVALID', `sizeCodes[${index}] must be a string`, { field: 'sizeCodes', index }));
    return body;
  };
}

function unavailableSamples() {
  const fail = () => invariant(false, 'SAMPLE_SERVICE_REQUIRED', 'Sample service is required');
  return Object.freeze({
    pageForActor: fail,
    getForActor: fail,
    createSample: fail,
    updateSample: fail,
    requestSample: fail,
    startProduction: fail,
    receiveSample: fail,
    decideSample: fail,
    cancelSample: fail,
    createNextRound: fail,
  });
}
