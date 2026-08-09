import { invariant } from '../core/errors.mjs';
import { assertQueryContract } from './request-contract.mjs';

export function createOrderMarginBridgeRoutes({ orderMarginBridge } = {}) {
  const service = orderMarginBridge ?? unavailableMarginBridge();
  return Object.freeze([
    Object.freeze({
      method: 'GET',
      pattern: /^\/v2\/orders\/([^/]+)\/margin-bridge$/,
      mutation: false,
      execute(context) {
        assertQueryContract(context.query ?? {}, []);
        return service.getOrderMarginBridgeForActor(context.actorId, context.params[0]);
      },
    }),
  ]);
}

function unavailableMarginBridge() {
  return Object.freeze({
    getOrderMarginBridgeForActor() {
      invariant(false, 'ORDER_MARGIN_BRIDGE_SERVICE_REQUIRED', 'Order margin bridge service is required');
    },
  });
}
