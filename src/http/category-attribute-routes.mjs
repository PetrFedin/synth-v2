import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';
import { decodePathParameter } from './transport-contract.mjs';

/** @param {{ categoryAttributes?: any }} [options] */
export function createCategoryAttributeRoutes({ categoryAttributes } = {}) {
  const service = categoryAttributes ?? unavailable();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/product\/style-versions\/([^/]+)\/category-attributes$/,
      mutation: false,
      async execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.forActor(context.actorId, decodePathParameter(context.params[0]));
      },
    }),
  ]);
}

function unavailable() {
  const fail = () => invariant(false, 'CATEGORY_ATTRIBUTE_SERVICE_REQUIRED', 'Category attribute service is required');
  return Object.freeze({ forActor: fail });
}
