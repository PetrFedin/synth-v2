import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

/** @param {{ seasonEconomics?: any }} [options] */
export function createSeasonEconomicsRoutes({ seasonEconomics } = {}) {
  const service = seasonEconomics ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/campaigns\/([^/]+)\/season-economics$/,
      ({ actorId, params }) => service.seasonEconomicsForCampaign(actorId, params[0])),
  ]);
}

function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'SEASON_SERVICE_REQUIRED', 'Season economics service is required');
  return Object.freeze({ seasonEconomicsForCampaign: fail });
}
