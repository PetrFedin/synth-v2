import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const CREATE = required(
  bodyContract(['styleId', 'certificationType', 'certificateNumber', 'issuingBody', 'validFrom', 'validTo']),
  ['styleId', 'certificationType', 'certificateNumber', 'issuingBody'],
);
const ISSUE = required(bodyContract(['expectedVersion']), ['expectedVersion']);
const SUPERSEDE = required(
  bodyContract(['expectedVersion', 'replacementCertificateNumber', 'issuingBody', 'validFrom', 'validTo']),
  ['expectedVersion', 'replacementCertificateNumber'],
);

export function createProductCertificationRoutes({ productCertifications } = {}) {
  const service = productCertifications ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/product\/styles\/([^/]+)\/certifications$/, [], ({ actorId, params }) => service.listForActor(actorId, decodeURIComponent(params[0]))),
    mutate('POST', /^\/v2\/product-certifications$/, CREATE, ({ commandId, actorId, body }) => service.createProductCertification(commandId, actorId, body)),
    mutate('POST', /^\/v2\/product-certifications\/([^/]+)\/issue$/, ISSUE, ({ commandId, actorId, params, body }) => service.issueProductCertification(commandId, actorId, decodeURIComponent(params[0]), body)),
    mutate('POST', /^\/v2\/product-certifications\/([^/]+)\/supersede$/, SUPERSEDE, ({ commandId, actorId, params, body }) => service.supersedeProductCertification(commandId, actorId, decodeURIComponent(params[0]), body)),
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
  const fail = () => invariant(false, 'PRODUCT_CERTIFICATION_SERVICE_REQUIRED', 'Product Certification service is required');
  return Object.freeze({ listForActor: fail, createProductCertification: fail, issueProductCertification: fail, supersedeProductCertification: fail });
}
