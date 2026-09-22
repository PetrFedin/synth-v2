import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const PALETTE_BODY = bodyContract(['colourCode', 'position']);

/** @param {{ seasonPalette?: any }} [options] */
export function createSeasonPaletteRoutes({ seasonPalette } = {}) {
  const service = seasonPalette ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/campaigns\/([^/]+)\/palette$/, ({ actorId, params }) => service.getSeasonPaletteForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/campaigns\/([^/]+)\/palette$/, PALETTE_BODY, ({ commandId, actorId, params, body }) => service.addColourToSeason(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'SEASON_PALETTE_SERVICE_REQUIRED', 'Season palette service is required');
  return Object.freeze({ getSeasonPaletteForActor: fail, addColourToSeason: fail });
}
