import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const QUERY_FIELDS = ['limit', 'cursor'];

/** @param {{ history?: any }} [options] */
export function createHistoryRoutes({ history } = {}) {
  const service = history ?? unavailable();
  return Object.freeze([
    {
      method: 'GET',
      pattern: /^\/v2\/history\/([^/]+)$/,
      mutation: false,
      async execute({ actorId, params, query }) {
        assertQueryContract(query ?? {}, QUERY_FIELDS);
        return service.forActor(actorId, decodePathParameter(params[0]), query);
      },
    },
  ]);
}

function unavailable() {
  const fail = () => invariant(false, 'HISTORY_SERVICE_REQUIRED', 'History service is required');
  return Object.freeze({ forActor: fail });
}
