import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const SUBMIT_BODY = bodyContract(['claimReference', 'reason', 'requestedRemedy']);
const RESOLVE_BODY = bodyContract(['resolutionType', 'resolutionReason']);
const REMEDIES = new Set(['replacement', 'return', 'credit', 'investigation']);
const RESOLUTIONS = new Set(['accepted-for-replacement', 'accepted-for-return', 'accepted-for-credit', 'accepted-as-is', 'rejected']);

export function createReceiptClaimsRoutes({ receiptClaims } = {}) {
  const service = receiptClaims ?? unavailable();
  return Object.freeze([
    mutate('POST', /^\/v2\/receipt-discrepancies\/([^/]+)\/claims$/, validateSubmit,
      ({ commandId, actorId, params, body }) => service.submitClaim(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/receipt-claims\/([^/]+)$/, ({ actorId, params }) => service.getClaimForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/receipt-claims\/([^/]+)\/resolutions$/, validateResolve,
      ({ commandId, actorId, params, body }) => service.resolveClaim(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/receipt-claim-resolutions\/([^/]+)$/, ({ actorId, params }) => service.getResolutionForActor(actorId, params[0])),
  ]);
}

function validateSubmit(body) {
  assertBodyContract(body, SUBMIT_BODY);
  text(body.claimReference, 'claimReference', 2, 160);
  text(body.reason, 'reason', 2, 2000);
  invariant(REMEDIES.has(body.requestedRemedy), 'HTTP_BODY_FIELD_INVALID', 'requestedRemedy is invalid', { field: 'requestedRemedy' });
}
function validateResolve(body) {
  assertBodyContract(body, RESOLVE_BODY);
  invariant(RESOLUTIONS.has(body.resolutionType), 'HTTP_BODY_FIELD_INVALID', 'resolutionType is invalid', { field: 'resolutionType' });
  text(body.resolutionReason, 'resolutionReason', 2, 2000);
}
function mutate(method, pattern, contract, execute) { return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); contract(context.body); return execute(context); } }); }
function read(method, pattern, execute) { return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } }); }
function text(value, field, min, max) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, 'HTTP_BODY_FIELD_INVALID', `${field} must contain ${min} to ${max} characters`, { field }); }
function unavailable() { const fail = () => invariant(false, 'RECEIPT_CLAIMS_SERVICE_REQUIRED', 'Receipt claims service is required'); return Object.freeze({ submitClaim: fail, resolveClaim: fail, getClaimForActor: fail, getResolutionForActor: fail }); }
