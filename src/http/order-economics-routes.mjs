import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const SUPPLY_BODY = bodyContract(['allocations'], {}, { allocations: ['sku', 'quantity', 'sourceType', 'sourceRef', 'expectedAvailabilityAt'] });
const FX_BODY = bodyContract(['sourceCurrency', 'rate', 'rateType', 'sourceRef', 'effectiveAt']);
const COST_BODY = bodyContract(['supplyCommitmentSnapshotId', 'costType', 'amount', 'currency', 'fxRateSnapshotId', 'sku', 'sourceRef', 'occurredAt']);
const EMPTY_BODY = bodyContract();
const MARGIN_BODY = bodyContract(['landedCostSnapshotId']);
const FX_RATE_TYPES = new Set(['plan', 'budget', 'po', 'invoice', 'accounting', 'settlement']);

export function createOrderEconomicsRoutes({ orderEconomics } = {}) {
  const service = orderEconomics ?? unavailableOrderEconomics();
  return Object.freeze([
    mutate('POST', /^\/v2\/orders\/([^/]+)\/supply-commitments$/, validateSupplyBody, ({ commandId, actorId, params, body }) => service.createSupplyCommitment(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/fx-rate-snapshots$/, validateFxBody, ({ commandId, actorId, params, body }) => service.createFxRateSnapshot(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/actual-costs$/, validateCostBody, ({ commandId, actorId, params, body }) => service.recordActualCost(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/landed-cost\/actualize$/, (body) => assertBodyContract(body, EMPTY_BODY), ({ commandId, actorId, params }) => service.actualizeLandedCost(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/margin\/actualize$/, validateMarginBody, ({ commandId, actorId, params, body }) => service.actualizeMargin(commandId, actorId, params[0], body.landedCostSnapshotId)),
    read('GET', /^\/v2\/margin-actualizations\/([^/]+)$/, ({ actorId, params }) => service.getMarginForActor(actorId, params[0])),
  ]);
}

function validateSupplyBody(body) {
  assertBodyContract(body, SUPPLY_BODY);
  invariant(Array.isArray(body.allocations) && body.allocations.length > 0, 'HTTP_BODY_FIELD_INVALID', 'allocations must be a non-empty array', { field: 'allocations' });
}
function validateFxBody(body) {
  assertBodyContract(body, FX_BODY);
  invariant(typeof body.sourceCurrency === 'string' && /^[A-Z]{3}$/.test(body.sourceCurrency), 'HTTP_BODY_FIELD_INVALID', 'sourceCurrency must be ISO-4217', { field: 'sourceCurrency' });
  invariant(Number.isFinite(body.rate) && body.rate > 0, 'HTTP_BODY_FIELD_INVALID', 'rate must be a positive number', { field: 'rate' });
  invariant(FX_RATE_TYPES.has(body.rateType), 'HTTP_BODY_FIELD_INVALID', 'rateType is invalid', { field: 'rateType' });
  invariant(typeof body.sourceRef === 'string' && body.sourceRef.length > 0, 'HTTP_BODY_FIELD_INVALID', 'sourceRef is required', { field: 'sourceRef' });
  invariant(typeof body.effectiveAt === 'string' && Number.isFinite(Date.parse(body.effectiveAt)), 'HTTP_BODY_FIELD_INVALID', 'effectiveAt must be a valid date-time', { field: 'effectiveAt' });
}
function validateCostBody(body) {
  assertBodyContract(body, COST_BODY);
  invariant(typeof body.supplyCommitmentSnapshotId === 'string' && body.supplyCommitmentSnapshotId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'supplyCommitmentSnapshotId is required', { field: 'supplyCommitmentSnapshotId' });
  invariant(typeof body.costType === 'string' && body.costType.length > 0, 'HTTP_BODY_FIELD_INVALID', 'costType is required', { field: 'costType' });
  invariant(Number.isFinite(body.amount), 'HTTP_BODY_FIELD_INVALID', 'amount must be numeric', { field: 'amount' });
  invariant(typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency), 'HTTP_BODY_FIELD_INVALID', 'currency must be ISO-4217', { field: 'currency' });
  invariant(body.fxRateSnapshotId === undefined || (typeof body.fxRateSnapshotId === 'string' && body.fxRateSnapshotId.length > 0), 'HTTP_BODY_FIELD_INVALID', 'fxRateSnapshotId must be a non-empty string', { field: 'fxRateSnapshotId' });
  invariant(typeof body.sourceRef === 'string' && body.sourceRef.length > 0, 'HTTP_BODY_FIELD_INVALID', 'sourceRef is required', { field: 'sourceRef' });
}
function validateMarginBody(body) {
  assertBodyContract(body, MARGIN_BODY);
  invariant(typeof body.landedCostSnapshotId === 'string' && body.landedCostSnapshotId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'landedCostSnapshotId is required', { field: 'landedCostSnapshotId' });
}
function mutate(method, pattern, contract, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      contract(context.body);
      return execute(context);
    },
  });
}
function read(method, pattern, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      return execute(context);
    },
  });
}
function unavailableOrderEconomics() {
  const fail = () => invariant(false, 'ORDER_ECONOMICS_SERVICE_REQUIRED', 'Order economics service is required');
  return Object.freeze({ createSupplyCommitment: fail, createFxRateSnapshot: fail, recordActualCost: fail, actualizeLandedCost: fail, actualizeMargin: fail, getMarginForActor: fail });
}
