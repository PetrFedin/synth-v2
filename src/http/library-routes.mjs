import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

const ENTRY_QUERY_FIELDS = Object.freeze(['limit', 'cursor', 'q']);

// The governed libraries the platform holds itself to, made readable. They are global reference data,
// so there is nothing to scope by brand and nothing to mutate here: a library changes through the MDM
// bootstrap, under review, not through a screen.
/** @param {{ libraries?: any }} [options] */
export function createLibraryRoutes({ libraries } = {}) {
  const service = libraries ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/libraries$/, [], ({ actorId }) => service.listForActor(actorId)),
    read('GET', /^\/v2\/libraries\/([^/]+)\/entries$/, ENTRY_QUERY_FIELDS,
      ({ actorId, params, query }) => service.entriesForActor(actorId, decodePathParameter(params[0]), query)),
  ]);
}

function read(method, pattern, fields, execute) {
  return Object.freeze({
    method,
    pattern,
    mutation: false,
    async execute(context) {
      assertQueryContract(context.query ?? {}, fields);
      return execute(context);
    },
  });
}

function unavailable() {
  const fail = () => invariant(false, 'LIBRARY_SERVICE_REQUIRED', 'Library service is required');
  return Object.freeze({ listForActor: fail, entriesForActor: fail });
}
