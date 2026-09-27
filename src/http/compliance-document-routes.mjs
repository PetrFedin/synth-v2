import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const CREATE = required(
  bodyContract(['organisationId', 'documentNumber', 'documentType', 'issuerLegalEntityId', 'counterpartyLegalEntityId', 'validFrom', 'validTo']),
  ['organisationId', 'documentNumber', 'documentType', 'issuerLegalEntityId'],
);
const ISSUE = required(bodyContract(['expectedVersion']), ['expectedVersion']);
const RECORD_EDO_STATUS = required(bodyContract(['expectedVersion', 'edoStatus']), ['expectedVersion', 'edoStatus']);
const SUPERSEDE = required(bodyContract(['expectedVersion', 'replacementDocumentNumber']), ['expectedVersion', 'replacementDocumentNumber']);

export function createComplianceDocumentRoutes({ complianceDocuments } = {}) {
  const service = complianceDocuments ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/organisations\/([^/]+)\/compliance-documents$/, [], ({ actorId, params }) => service.listForActor(actorId, decodeURIComponent(params[0]))),
    read('GET', /^\/v2\/compliance-documents\/([^/]+)$/, [], ({ actorId, params }) => service.getForActor(actorId, decodeURIComponent(params[0]))),
    mutate('POST', /^\/v2\/compliance-documents$/, CREATE, ({ commandId, actorId, body }) => service.createComplianceDocument(commandId, actorId, body)),
    mutate('POST', /^\/v2\/compliance-documents\/([^/]+)\/issue$/, ISSUE, ({ commandId, actorId, params, body }) => service.issueComplianceDocument(commandId, actorId, decodeURIComponent(params[0]), body)),
    mutate('POST', /^\/v2\/compliance-documents\/([^/]+)\/edo-status$/, RECORD_EDO_STATUS, ({ commandId, actorId, params, body }) => service.recordEdoStatus(commandId, actorId, decodeURIComponent(params[0]), body)),
    mutate('POST', /^\/v2\/compliance-documents\/([^/]+)\/supersede$/, SUPERSEDE, ({ commandId, actorId, params, body }) => service.supersedeComplianceDocument(commandId, actorId, decodeURIComponent(params[0]), body)),
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
function required(contract, requiredFields) {
  return (body) => {
    assertBodyContract(body, contract);
    for (const field of requiredFields) invariant(Object.hasOwn(body, field) && body[field] !== undefined, 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field });
    return body;
  };
}
function unavailable() {
  const fail = () => invariant(false, 'COMPLIANCE_DOCUMENT_SERVICE_REQUIRED', 'Compliance Document service is required');
  return Object.freeze({ listForActor: fail, getForActor: fail, createComplianceDocument: fail, issueComplianceDocument: fail, recordEdoStatus: fail, supersedeComplianceDocument: fail });
}
