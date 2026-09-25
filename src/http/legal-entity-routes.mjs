import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const CREATE = required(bodyContract(['organisationId', 'entityCode']), ['organisationId', 'entityCode']);
const TRANSITION = required(bodyContract(['expectedVersion', 'nextStatus']), ['expectedVersion', 'nextStatus']);
const VERSION_CREATE = required(
  bodyContract(['expectedLatestVersionNo', 'jurisdiction', 'nameRu', 'nameEn', 'requisites']),
  ['expectedLatestVersionNo', 'jurisdiction', 'nameRu', 'nameEn', 'requisites'],
  ['requisites'],
);

export function createLegalEntityRoutes({ legalEntities } = {}) {
  const service = legalEntities ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/organisations\/([^/]+)\/legal-entities$/, [], ({ actorId, params }) => service.listForActor(actorId, decodeURIComponent(params[0]))),
    read('GET', /^\/v2\/legal-entities\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, decodeURIComponent(params[0]))),
    mutate('POST', /^\/v2\/legal-entities$/, CREATE, ({ commandId, actorId, body }) => service.createLegalEntity(commandId, actorId, body)),
    mutate('POST', /^\/v2\/legal-entities\/([^/]+)\/transition$/, TRANSITION, ({ commandId, actorId, params, body }) => service.transitionLegalEntity(commandId, actorId, decodeURIComponent(params[0]), body)),
    mutate('POST', /^\/v2\/legal-entities\/([^/]+)\/versions$/, VERSION_CREATE, ({ commandId, actorId, params, body }) => service.createLegalEntityVersion(commandId, actorId, decodeURIComponent(params[0]), body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      contract(context.body);
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
function required(contract, requiredFields, objectFields = []) {
  return (body) => {
    assertBodyContract(body, contract);
    for (const field of requiredFields) invariant(Object.hasOwn(body, field) && body[field] !== undefined, 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field });
    for (const field of objectFields) {
      if (body[field] === undefined) continue;
      invariant(body[field] !== null && typeof body[field] === 'object' && !Array.isArray(body[field]), 'HTTP_BODY_FIELD_INVALID', `${field} must be a JSON object`, { field });
    }
    return body;
  };
}
function unavailable() {
  const fail = () => invariant(false, 'LEGAL_ENTITY_SERVICE_REQUIRED', 'Legal Entity service is required');
  return Object.freeze({ listForActor: fail, getForActor: fail, createLegalEntity: fail, transitionLegalEntity: fail, createLegalEntityVersion: fail });
}
