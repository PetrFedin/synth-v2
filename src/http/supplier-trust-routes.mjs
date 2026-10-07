import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const REVOKE_BODY = bodyContract(['envelope','reason']);

export function createSupplierTrustRoutes({ supplierTrust } = {}) {
  const service = supplierTrust ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/suppliers\/([^/]+)\/trust\/checkpoint$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.issueForActor(context.actorId, decodeURIComponent(String(context.params?.[0] ?? '')));
      },
    }),
    Object.freeze({
      method: 'POST',
      pattern: /^\/v2\/supplier-trust\/revoke$/,
      mutation: true,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        assertBodyContract(context.body, REVOKE_BODY);
        invariant(context.body?.envelope && typeof context.body.envelope === 'object', 'HTTP_BODY_FIELD_INVALID', 'envelope is required', { field: 'envelope' });
        invariant(typeof context.body?.reason === 'string', 'HTTP_BODY_FIELD_INVALID', 'reason is required', { field: 'reason' });
        return service.revokeForActor(context.actorId, context.body.envelope, context.body.reason);
      },
    }),
  ]);
}

function unavailable() {
  const fail = () => invariant(false, 'SUPPLIER_TRUST_SERVICE_REQUIRED', 'Supplier trust service is required');
  return Object.freeze({ issueForActor: fail, revokeForActor: fail });
}
