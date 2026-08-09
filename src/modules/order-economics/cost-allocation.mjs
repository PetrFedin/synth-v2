import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const BASES = Object.freeze(['direct', 'unit', 'net_value', 'custom']);

export function createCostAllocationPolicyVersion({
  id,
  brandId,
  name,
  version,
  defaultBasis,
  rules = [],
  createdAt,
}) {
  invariant(id, 'COST_ALLOCATION_POLICY_ID_REQUIRED', 'Cost allocation policy id is required');
  invariant(brandId, 'COST_ALLOCATION_POLICY_BRAND_REQUIRED', 'Cost allocation policy brand is required');
  invariant(typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 160, 'COST_ALLOCATION_POLICY_NAME_INVALID', 'Cost allocation policy name must contain 1 to 160 characters');
  invariant(Number.isInteger(version) && version > 0, 'COST_ALLOCATION_POLICY_VERSION_INVALID', 'Cost allocation policy version must be a positive integer');
  invariant(BASES.includes(defaultBasis), 'COST_ALLOCATION_DEFAULT_BASIS_INVALID', 'Cost allocation default basis is invalid', { defaultBasis });
  invariant(Array.isArray(rules), 'COST_ALLOCATION_RULES_INVALID', 'Cost allocation rules must be an array');

  const seen = new Set();
  const normalizedRules = rules.map((rule) => {
    invariant(typeof rule?.costType === 'string' && rule.costType.length > 0, 'COST_ALLOCATION_RULE_COST_TYPE_REQUIRED', 'Cost allocation rule costType is required');
    invariant(!seen.has(rule.costType), 'COST_ALLOCATION_RULE_DUPLICATE', 'Cost allocation policy cannot contain duplicate costType rules', { costType: rule.costType });
    invariant(BASES.includes(rule.basis), 'COST_ALLOCATION_RULE_BASIS_INVALID', 'Cost allocation rule basis is invalid', { costType: rule.costType, basis: rule.basis });
    seen.add(rule.costType);
    return Object.freeze({ costType: rule.costType, basis: rule.basis });
  }).sort((a, b) => a.costType.localeCompare(b.costType));

  const timestamp = requiredTimestamp(createdAt, 'COST_ALLOCATION_POLICY_CREATED_AT_INVALID');
  const basis = Object.freeze({
    brandId,
    name: name.trim(),
    version,
    defaultBasis,
    rules: Object.freeze(normalizedRules),
    status: 'approved',
    createdAt: timestamp,
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

export function createCostAllocationRun({
  id,
  order,
  orderCommit,
  landedCost,
  costEntries,
  policy,
  customWeightsByCostEntryId = {},
  createdAt,
}) {
  assertExecutionBasis(order, orderCommit);
  invariant(id, 'COST_ALLOCATION_RUN_ID_REQUIRED', 'Cost allocation run id is required');
  invariant(landedCost?.id && landedCost.orderId === order.id && landedCost.orderCommitSnapshotId === orderCommit.id, 'COST_ALLOCATION_LANDED_COST_MISMATCH', 'Cost allocation requires landed cost from the exact order commit');
  invariant(landedCost.currency === orderCommit.currency, 'COST_ALLOCATION_CURRENCY_MISMATCH', 'Landed cost currency must match order currency');
  invariant(policy?.id && policy.brandId === order.brandId && policy.status === 'approved', 'COST_ALLOCATION_POLICY_MISMATCH', 'Cost allocation policy must be an approved version for the order brand');
  invariant(Array.isArray(costEntries) && costEntries.length > 0, 'COST_ALLOCATION_COST_ENTRIES_REQUIRED', 'Cost allocation requires actual cost entries');
  invariant(customWeightsByCostEntryId && typeof customWeightsByCostEntryId === 'object' && !Array.isArray(customWeightsByCostEntryId), 'COST_ALLOCATION_CUSTOM_WEIGHTS_INVALID', 'Custom allocation weights must be an object');

  const currentEntries = costEntries.filter((entry) => entry?.orderCommitSnapshotId === orderCommit.id);
  const currentIds = currentEntries.map((entry) => entry.id).sort();
  const landedIds = [...(landedCost.costEntryIds ?? [])].sort();
  invariant(canonicalJson(currentIds) === canonicalJson(landedIds), 'COST_ALLOCATION_STALE_LANDED_COST', 'Landed cost snapshot does not represent the supplied cost ledger', {
    landedCostSnapshotId: landedCost.id,
    currentCostEntryIds: currentIds,
    landedCostEntryIds: landedIds,
  });

  const skuBasis = buildSkuBasis(orderCommit.lines);
  const ruleMap = new Map(policy.rules.map((rule) => [rule.costType, rule.basis]));
  const allocations = [];

  for (const entry of [...currentEntries].sort((a, b) => a.id.localeCompare(b.id))) {
    invariant(entry.currency === orderCommit.currency, 'COST_ALLOCATION_ENTRY_CURRENCY_MISMATCH', 'Actual cost entry must already be converted to order currency', { costEntryId: entry.id, currency: entry.currency, orderCurrency: orderCommit.currency });
    const configuredBasis = entry.sku ? 'direct' : (ruleMap.get(entry.costType) ?? policy.defaultBasis);
    const entryAllocations = allocateEntry(entry, configuredBasis, skuBasis, customWeightsByCostEntryId[entry.id]);
    allocations.push(...entryAllocations);
  }

  const allocatedTotal = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0));
  invariant(allocatedTotal === roundMoney(landedCost.totalCost), 'COST_ALLOCATION_TOTAL_MISMATCH', 'Allocated cost total must equal landed cost total', { allocatedTotal, landedCostTotal: landedCost.totalCost });

  const skuEconomics = buildSkuEconomics(skuBasis, allocations, orderCommit.currency);
  const timestamp = requiredTimestamp(createdAt, 'COST_ALLOCATION_RUN_CREATED_AT_INVALID');
  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: order.version,
    orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: landedCost.id,
    policyVersionId: policy.id,
    brandId: order.brandId,
    shopId: order.shopId,
    currency: orderCommit.currency,
    costEntryIds: Object.freeze(currentIds),
    allocations: Object.freeze(allocations),
    skuEconomics: Object.freeze(skuEconomics),
    allocatedTotal,
    status: 'actual',
    createdAt: timestamp,
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

function allocateEntry(entry, basis, skuBasis, customWeights) {
  invariant(BASES.includes(basis), 'COST_ALLOCATION_BASIS_INVALID', 'Cost allocation basis is invalid', { costEntryId: entry.id, basis });
  if (basis === 'direct') {
    invariant(entry.sku && skuBasis.has(entry.sku), 'COST_ALLOCATION_DIRECT_SKU_REQUIRED', 'Direct cost allocation requires a SKU present in the committed order', { costEntryId: entry.id, sku: entry.sku });
    return [freezeAllocation(entry, entry.sku, 'direct', 1, 1, entry.amount)];
  }

  const weights = new Map();
  if (basis === 'custom') {
    invariant(customWeights && typeof customWeights === 'object' && !Array.isArray(customWeights), 'COST_ALLOCATION_CUSTOM_WEIGHTS_REQUIRED', 'Custom basis requires weights by SKU', { costEntryId: entry.id });
  }

  for (const [sku, values] of skuBasis.entries()) {
    let weight;
    if (basis === 'unit') weight = values.quantity;
    else if (basis === 'net_value') weight = values.netValue;
    else weight = Number(customWeights?.[sku] ?? 0);
    invariant(Number.isFinite(weight) && weight >= 0, 'COST_ALLOCATION_WEIGHT_INVALID', 'Allocation weight must be a non-negative finite number', { costEntryId: entry.id, sku, basis, weight });
    weights.set(sku, weight);
  }

  if (basis === 'custom') {
    for (const sku of Object.keys(customWeights)) {
      invariant(skuBasis.has(sku), 'COST_ALLOCATION_CUSTOM_SKU_INVALID', 'Custom allocation contains SKU outside the committed order', { costEntryId: entry.id, sku });
    }
  }

  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0);
  invariant(totalWeight > 0, 'COST_ALLOCATION_WEIGHT_TOTAL_INVALID', 'Allocation weight total must be greater than zero', { costEntryId: entry.id, basis });

  const skus = [...skuBasis.keys()].sort();
  let assigned = 0;
  return skus.map((sku, index) => {
    const weight = weights.get(sku);
    const share = weight / totalWeight;
    const allocatedAmount = index === skus.length - 1
      ? roundMoney(entry.amount - assigned)
      : roundMoney(entry.amount * share);
    assigned = roundMoney(assigned + allocatedAmount);
    return freezeAllocation(entry, sku, basis, weight, share, allocatedAmount);
  });
}

function freezeAllocation(entry, sku, basis, weight, share, allocatedAmount) {
  return Object.freeze({
    costEntryId: entry.id,
    costType: entry.costType,
    sku,
    basis,
    basisWeight: roundMeasure(weight),
    share: roundShare(share),
    allocatedAmount: roundMoney(allocatedAmount),
    currency: entry.currency,
  });
}

function buildSkuBasis(lines) {
  invariant(Array.isArray(lines) && lines.length > 0, 'COST_ALLOCATION_ORDER_LINES_REQUIRED', 'Committed order lines are required for cost allocation');
  const basis = new Map();
  for (const line of lines) {
    invariant(typeof line?.sku === 'string' && line.sku.length > 0, 'COST_ALLOCATION_SKU_REQUIRED', 'Every committed order line requires SKU');
    invariant(Number.isFinite(line.quantity) && line.quantity > 0, 'COST_ALLOCATION_QUANTITY_INVALID', 'Every committed order line requires positive quantity', { sku: line.sku, quantity: line.quantity });
    invariant(Number.isFinite(line.unitPrice) && line.unitPrice >= 0, 'COST_ALLOCATION_UNIT_PRICE_INVALID', 'Every committed order line requires non-negative unit price', { sku: line.sku, unitPrice: line.unitPrice });
    const previous = basis.get(line.sku) ?? { quantity: 0, netValue: 0 };
    previous.quantity += line.quantity;
    previous.netValue = roundMoney(previous.netValue + (line.quantity * line.unitPrice));
    basis.set(line.sku, previous);
  }
  return new Map([...basis.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildSkuEconomics(skuBasis, allocations, currency) {
  const costBySku = new Map([...skuBasis.keys()].map((sku) => [sku, 0]));
  for (const allocation of allocations) {
    costBySku.set(allocation.sku, roundMoney((costBySku.get(allocation.sku) ?? 0) + allocation.allocatedAmount));
  }
  return [...skuBasis.entries()].map(([sku, values]) => {
    const allocatedLandedCost = costBySku.get(sku) ?? 0;
    const contributionMarginAmount = roundMoney(values.netValue - allocatedLandedCost);
    const contributionMarginPercent = values.netValue === 0 ? null : roundPercent((contributionMarginAmount / values.netValue) * 100);
    return Object.freeze({
      sku,
      quantity: values.quantity,
      netRevenue: values.netValue,
      allocatedLandedCost,
      contributionMarginAmount,
      contributionMarginPercent,
      currency,
    });
  });
}

function assertExecutionBasis(order, orderCommit) {
  invariant(order?.id && order.status === 'attached', 'ORDER_NOT_COMMITTED_FOR_EXECUTION', 'Cost allocation requires an attached wholesale order', { orderId: order?.id, status: order?.status });
  invariant(order.orderCommitSnapshotId === orderCommit?.id && orderCommit?.status === 'committed' && orderCommit.orderId === order.id, 'ORDER_COMMIT_SNAPSHOT_MISMATCH_FOR_EXECUTION', 'Cost allocation requires the exact immutable order commit snapshot');
  invariant(orderCommit.orderVersion === order.version && orderCommit.brandId === order.brandId && orderCommit.shopId === order.shopId && orderCommit.currency === order.currency, 'ORDER_COMMIT_TRADE_MISMATCH_FOR_EXECUTION', 'Order and immutable commit differ on execution identity');
}

function requiredTimestamp(value, code) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time');
  return new Date(parsed).toISOString();
}
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function roundMoney(value) { return Math.round((value + Number.EPSILON) * 10_000) / 10_000; }
function roundMeasure(value) { return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000; }
function roundShare(value) { return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000; }
function roundPercent(value) { return Math.round((value + Number.EPSILON) * 10_000) / 10_000; }
