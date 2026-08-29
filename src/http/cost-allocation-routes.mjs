import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';

const POLICY_BODY = bodyContract(['name', 'version', 'defaultBasis', 'rules'], {}, { rules: ['costType', 'basis'] });
const RUN_BODY = bodyContract(['landedCostSnapshotId', 'policyVersionId', 'customWeightsByCostEntryId', 'customLineWeightsByCostEntryId']);
const BASES = new Set(['direct', 'unit', 'net_value', 'custom']);
const LINE_WEIGHT_FIELDS = new Set(['orderLineNo', 'productSkuId', 'sku', 'weight']);

export function createCostAllocationRoutes({ costAllocation } = {}) {
  const service = costAllocation ?? unavailableCostAllocation();
  return Object.freeze([
    mutate('POST', /^\/v2\/brands\/([^/]+)\/cost-allocation-policies$/, validatePolicyBody,
      ({ commandId, actorId, params, body }) => service.createPolicyVersion(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/orders\/([^/]+)\/cost-allocation-runs$/, validateRunBody,
      ({ commandId, actorId, params, body }) => service.allocateLandedCost(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/cost-allocation-policies\/([^/]+)$/, ({ actorId, params }) => service.getPolicyVersionForActor(actorId, params[0])),
    read('GET', /^\/v2\/cost-allocation-runs\/([^/]+)$/, ({ actorId, params }) => service.getAllocationRunForActor(actorId, params[0])),
  ]);
}

function validatePolicyBody(body) {
  assertBodyContract(body, POLICY_BODY);
  invariant(typeof body.name === 'string' && body.name.trim().length > 0 && body.name.trim().length <= 160, 'HTTP_BODY_FIELD_INVALID', 'name must contain 1 to 160 characters', { field: 'name' });
  invariant(Number.isInteger(body.version) && body.version > 0, 'HTTP_BODY_FIELD_INVALID', 'version must be a positive integer', { field: 'version' });
  invariant(BASES.has(body.defaultBasis), 'HTTP_BODY_FIELD_INVALID', 'defaultBasis is invalid', { field: 'defaultBasis' });
  invariant(Array.isArray(body.rules), 'HTTP_BODY_FIELD_INVALID', 'rules must be an array', { field: 'rules' });
  const seen = new Set();
  for (const rule of body.rules) {
    invariant(typeof rule?.costType === 'string' && rule.costType.length > 0 && !seen.has(rule.costType), 'HTTP_BODY_FIELD_INVALID', 'rules require unique costType values', { field: 'rules.costType', value: rule?.costType });
    invariant(BASES.has(rule.basis), 'HTTP_BODY_FIELD_INVALID', 'rule basis is invalid', { field: 'rules.basis', value: rule?.basis });
    seen.add(rule.costType);
  }
}

function validateRunBody(body) {
  assertBodyContract(body, RUN_BODY);
  invariant(typeof body.landedCostSnapshotId === 'string' && body.landedCostSnapshotId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'landedCostSnapshotId is required', { field: 'landedCostSnapshotId' });
  invariant(typeof body.policyVersionId === 'string' && body.policyVersionId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'policyVersionId is required', { field: 'policyVersionId' });
  validateLegacyCustomWeights(body.customWeightsByCostEntryId);
  validateExactCustomWeights(body.customLineWeightsByCostEntryId);
}

function validateLegacyCustomWeights(value) {
  invariant(value === undefined || isPlainObject(value), 'HTTP_BODY_FIELD_INVALID', 'customWeightsByCostEntryId must be an object', { field: 'customWeightsByCostEntryId' });
  for (const [costEntryId, weights] of Object.entries(value ?? {})) {
    invariant(costEntryId.length > 0 && isPlainObject(weights), 'HTTP_BODY_FIELD_INVALID', 'legacy custom allocation weights must be objects keyed by cost entry and textual SKU', { field: 'customWeightsByCostEntryId' });
    for (const [sku, weight] of Object.entries(weights)) {
      invariant(sku.length > 0 && Number.isFinite(weight) && weight >= 0, 'HTTP_BODY_FIELD_INVALID', 'legacy custom allocation weight must be a non-negative number', { field: `customWeightsByCostEntryId.${costEntryId}.${sku}` });
    }
  }
}

function validateExactCustomWeights(value) {
  invariant(value === undefined || isPlainObject(value), 'HTTP_BODY_FIELD_INVALID', 'customLineWeightsByCostEntryId must be an object', { field: 'customLineWeightsByCostEntryId' });
  for (const [costEntryId, rows] of Object.entries(value ?? {})) {
    invariant(costEntryId.length > 0 && Array.isArray(rows) && rows.length > 0, 'HTTP_BODY_FIELD_INVALID', 'exact custom allocation weights must be non-empty arrays keyed by cost entry', { field: `customLineWeightsByCostEntryId.${costEntryId}` });
    const seen = new Set();
    for (const row of rows) {
      invariant(isPlainObject(row), 'HTTP_BODY_FIELD_INVALID', 'custom line weight must be an object', { field: `customLineWeightsByCostEntryId.${costEntryId}` });
      const unknownFields = Object.keys(row).filter((field) => !LINE_WEIGHT_FIELDS.has(field));
      invariant(unknownFields.length === 0, 'HTTP_BODY_FIELD_UNKNOWN', 'Unknown custom line weight field', { field: `customLineWeightsByCostEntryId.${costEntryId}`, unknownFields });
      invariant(Number.isInteger(row.orderLineNo) && row.orderLineNo > 0, 'HTTP_BODY_FIELD_INVALID', 'custom line weight orderLineNo must be a positive integer', { field: 'orderLineNo', value: row.orderLineNo });
      invariant(typeof row.productSkuId === 'string' && row.productSkuId.length > 0, 'HTTP_BODY_FIELD_INVALID', 'custom line weight productSkuId is required', { field: 'productSkuId' });
      invariant(row.sku === undefined || (typeof row.sku === 'string' && row.sku.length > 0), 'HTTP_BODY_FIELD_INVALID', 'custom line weight sku must be a non-empty display string when supplied', { field: 'sku' });
      invariant(Number.isFinite(row.weight) && row.weight >= 0, 'HTTP_BODY_FIELD_INVALID', 'custom line weight must be a non-negative number', { field: 'weight', value: row.weight });
      const key = `${row.orderLineNo}\u001f${row.productSkuId}`;
      invariant(!seen.has(key), 'HTTP_BODY_FIELD_INVALID', 'custom line weights cannot repeat the same immutable ProductSku order line', { field: `customLineWeightsByCostEntryId.${costEntryId}`, orderLineNo: row.orderLineNo, productSkuId: row.productSkuId });
      seen.add(key);
    }
  }
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
function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function unavailableCostAllocation() {
  const fail = () => invariant(false, 'COST_ALLOCATION_SERVICE_REQUIRED', 'Cost allocation service is required');
  return Object.freeze({ createPolicyVersion: fail, allocateLandedCost: fail, getPolicyVersionForActor: fail, getAllocationRunForActor: fail });
}
