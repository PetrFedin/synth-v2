import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

/** @param {{ organisationMembers?: any }} [options] */
export function createOrganisationMemberRoutes({ organisationMembers } = {}) {
  const service = organisationMembers ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/organisations\/([^/]+)\/members$/,
      mutation: false,
      async execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.forActor(context.actorId, decodePathParameter(context.params[0]));
      },
    }),
  ]);
}

function unavailable() {
  const fail = () => invariant(false, 'ORGANISATION_MEMBER_SERVICE_REQUIRED', 'Organisation member service is required');
  return Object.freeze({ forActor: fail });
}
