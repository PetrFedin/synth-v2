import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const INVITE = required(bodyContract(['email', 'displayName', 'role']), ['email', 'role']);
const CHANGE_ROLE = required(bodyContract(['role', 'expectedVersion']), ['role', 'expectedVersion']);
const VERSIONED = required(bodyContract(['expectedVersion']), ['expectedVersion']);

/** @param {{ team?: any }} [options] */
export function createTeamRoutes({ team } = {}) {
  const service = team ?? unavailable();
  const base = '\\/v2\\/organisations\\/([^/]+)\\/team';
  return Object.freeze([
    read('GET', new RegExp(`^${base}$`), ({ actorId, params }) => service.listForActor(actorId, params[0])),
    mutate('POST', new RegExp(`^${base}\\/invitations$`), INVITE, ({ commandId, actorId, params, body }) => service.invite(commandId, actorId, params[0], body)),
    mutate('POST', new RegExp(`^${base}\\/([^/]+)\\/role$`), CHANGE_ROLE, ({ commandId, actorId, params, body }) => service.changeRole(commandId, actorId, params[0], params[1], body)),
    mutate('POST', new RegExp(`^${base}\\/([^/]+)\\/deactivate$`), VERSIONED, ({ commandId, actorId, params, body }) => service.deactivate(commandId, actorId, params[0], params[1], body)),
    mutate('POST', new RegExp(`^${base}\\/([^/]+)\\/reactivate$`), VERSIONED, ({ commandId, actorId, params, body }) => service.reactivate(commandId, actorId, params[0], params[1], body)),
    mutate('POST', new RegExp(`^${base}\\/([^/]+)\\/reissue-invite$`), VERSIONED, ({ commandId, actorId, params, body }) => service.reissueInvite(commandId, actorId, params[0], params[1], body)),
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
function read(method, pattern, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
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
  const fail = () => invariant(false, 'TEAM_SERVICE_REQUIRED', 'Team service is required');
  return Object.freeze({ listForActor: fail, invite: fail, changeRole: fail, deactivate: fail, reactivate: fail, reissueInvite: fail });
}
