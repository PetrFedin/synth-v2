import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const RATE_BODY = bodyContract(['brandId', 'campaignId', 'fromCurrency', 'toCurrency', 'rate', 'effectiveOn', 'sourceNote']);
const PLAN_BODY = bodyContract(['brandId', 'sku', 'targetRrpMinor', 'rrpCurrency', 'retailMarkup', 'sourcingCountryCode', 'countryCoefficient', 'categoryCoefficient', 'fobCurrency', 'asOf', 'notes']);
const VERDICT_BODY = bodyContract(['expectedVersion', 'reason']);

export function createTargetPricingRoutes({ targetPricing } = {}) {
  const service = targetPricing ?? unavailable();
  return Object.freeze([
    read('GET', /^\/v2\/target-prices$/, ({ actorId }) => service.targetPricePlansForActor(actorId)),
    read('GET', /^\/v2\/catalog-skus\/([^/]+)\/target-price$/, ({ actorId, params }) => service.targetPricePlanForSku(actorId, params[0])),
    mutate('POST', /^\/v2\/season-fx-rates$/, RATE_BODY, ({ commandId, actorId, body }) => service.recordSeasonRate(commandId, actorId, body)),
    mutate('POST', /^\/v2\/target-prices$/, PLAN_BODY, ({ commandId, actorId, body }) => service.createPlan(commandId, actorId, body)),
    mutate('POST', /^\/v2\/target-prices\/([^/]+)\/publish$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.publish(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/target-prices\/([^/]+)\/supersede$/, VERDICT_BODY, ({ commandId, actorId, params, body }) => service.supersede(commandId, actorId, params[0], body)),
  ]);
}

function mutate(method, pattern, contract, execute) {
  return Object.freeze({ method, pattern, mutation: true, execute(context) { assertQueryContract(context.query ?? {}, []); assertBodyContract(context.body, contract); return execute(context); } });
}
function read(method, pattern, execute) {
  return Object.freeze({ method, pattern, mutation: false, execute(context) { assertQueryContract(context.query ?? {}, []); return execute(context); } });
}
function unavailable() {
  const fail = () => invariant(false, 'TARGET_PRICE_SERVICE_REQUIRED', 'Target pricing service is required');
  return Object.freeze({ targetPricePlansForActor: fail, targetPricePlanForSku: fail, recordSeasonRate: fail, createPlan: fail, publish: fail, supersede: fail });
}
