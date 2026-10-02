import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

const QUERY_FIELDS = ['type', 'group', 'limit'];

// Read-only. The list does not mutate anything and offers no "mark as done": a move leaves the list
// by being made, through the endpoint that owns it.
/** @param {{ awaitingActions?: any }} [options] */
export function createAwaitingActionRoutes({ awaitingActions } = {}) {
  const service = awaitingActions ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/inbox\/awaiting-action$/,
      mutation: false,
      async execute(context) {
        assertQueryContract(context.query ?? {}, QUERY_FIELDS);
        return service.forActor(context.actorId, context.query ?? {});
      },
    }),
  ]);
}

function unavailable() {
  const fail = () => invariant(false, 'AWAITING_ACTION_SERVICE_REQUIRED', 'Awaiting action service is required');
  return Object.freeze({ forActor: fail });
}
