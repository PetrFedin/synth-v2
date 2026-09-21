import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

/** @param {{ bomSizeLine?: any }} [options] */
export function createBomSizeLineRoutes({ bomSizeLine } = {}) {
  const service = bomSizeLine ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/product\/styles\/([^/]+)\/bom-size-line$/,
      ({ actorId, params }) => service.styleSizeLineForActor(actorId, decodeURIComponent(params[0]))),
  ]);
}

function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'BOM_SIZE_LINE_SERVICE_REQUIRED', 'Size line service is required');
  return Object.freeze({ styleSizeLineForActor: fail });
}
