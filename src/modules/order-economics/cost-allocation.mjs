import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { calculateMoneyPercentage } from '../../core/money.mjs';
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
  customLineWeightsByCostEntryId = {},
  createdAt,
}) {
  assertExecutionBasis(order, orderCommit);
  invariant(id, 'COST_ALLOCATION_RUN_ID_REQUIRED', 'Cost allocation run id is required');
  invariant(landedCost?.id && landedCost.orderId === order.id && landedCost.orderCommitSnapshotId === orderCommit.id, 'COST_ALLOCATION_LANDED_COST_MISMATCH', 'Cost allocation requires landed cost from the exact order commit');
  invariant(landedCost.currency === orderCommit.currency, 'COST_ALLOCATION_CURRENCY_MISMATCH', 'Landed cost currency must match order currency');
  invariant(policy?.id && policy.brandId === order.brandId && policy.status === 'approved', 'COST_ALLOCATION_POLICY_MISMATCH', 'Cost allocation policy must be an approved version for the order brand');
  invariant(Array.isArray(costEntries) && costEntries.length > 0, 'COST_ALLOCATION_COST_ENTRIES_REQUIRED', 'Cost allocation requires actual cost entries');
  invariant(isPlainObject(customWeightsByCostEntryId), 'COST_ALLOCATION_CUSTOM_WEIGHTS_INVALID', 'Legacy custom allocation weights must be an object');
  invariant(isPlainObject(customLineWeightsByCostEntryId), 'COST_ALLOCATION_CUSTOM_LINE_WEIGHTS_INVALID', 'Exact ProductSku custom allocation weights must be an object');

  const currentEntries = costEntries.filter((entry) => entry?.orderCommitSnapshotId === orderCommit.id);
  const currentIds = currentEntries.map((entry) => entry.id).sort();
  const landedIds = [...(landedCost.costEntryIds ?? [])].sort();
  invariant(canonicalJson(currentIds) === canonicalJson(landedIds), 'COST_ALLOCATION_STALE_LANDED_COST', 'Landed cost snapshot does not represent the supplied cost ledger', {
    landedCostSnapshotId: landedCost.id,
    currentCostEntryIds: currentIds,
    landedCostEntryIds: landedIds,
  });

  const lineBasis = buildLineBasis(orderCommit.lines);
  const ruleMap = new Map(policy.rules.map((rule) => [rule.costType, rule.basis]));
  const allocations = [];

  for (const entry of [...currentEntries].sort((a, b) => a.id.localeCompare(b.id))) {
    invariant(entry.currency === orderCommit.currency, 'COST_ALLOCATION_ENTRY_CURRENCY_MISMATCH', 'Actual cost entry must already be converted to order currency', { costEntryId: entry.id, currency: entry.currency, orderCurrency: orderCommit.currency });
    const exactIdentity = actualCostExactIdentity(entry);
    const configuredBasis = exactIdentity
      ? 'direct'
      : (lineBasis.mode === 'legacy' && entry.sku ? 'direct' : (ruleMap.get(entry.costType) ?? policy.defaultBasis));
    const entryAllocations = allocateEntry(
      entry,
      configuredBasis,
      lineBasis,
      customWeightsByCostEntryId[entry.id],
      customLineWeightsByCostEntryId[entry.id],
    );
    allocations.push(...entryAllocations);
  }

  const allocatedTotal = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0));
  invariant(allocatedTotal === roundMoney(landedCost.totalCost), 'COST_ALLOCATION_TOTAL_MISMATCH', 'Allocated cost total must equal landed cost total', { allocatedTotal, landedCostTotal: landedCost.totalCost });

  const skuEconomics = buildLineEconomics(lineBasis, allocations, orderCommit.currency);
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
    lineageMode: lineBasis.mode,
    costEntryIds: Object.freeze(currentIds),
    allocations: Object.freeze(allocations),
    // Compatibility field name retained; canonical rows now carry exact ProductSku line identity.
    skuEconomics: Object.freeze(skuEconomics),
    allocatedTotal,
    status: 'actual',
    createdAt: timestamp,
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

function allocateEntry(entry, basis, lineBasis, legacyCustomWeights, exactCustomWeights) {
  invariant(BASES.includes(basis), 'COST_ALLOCATION_BASIS_INVALID', 'Cost allocation basis is invalid', { costEntryId: entry.id, basis });
  if (basis === 'direct') return allocateDirect(entry, lineBasis);

  const weights = new Map();
  let exactWeightMap = null;
  if (basis === 'custom') {
    if (lineBasis.mode === 'product-sku-v2') {
      invariant(legacyCustomWeights === undefined, 'COST_ALLOCATION_LEGACY_CUSTOM_WEIGHTS_FORBIDDEN', 'Canonical ProductSku allocation cannot use textual-SKU custom weights', { costEntryId: entry.id });
      exactWeightMap = normalizeExactCustomWeights(entry, exactCustomWeights, lineBasis.lines);
    } else {
      invariant(exactCustomWeights === undefined, 'COST_ALLOCATION_EXACT_CUSTOM_WEIGHTS_FOR_LEGACY_FORBIDDEN', 'Legacy allocation cannot invent ProductSku identity through exact custom weights', { costEntryId: entry.id });
      invariant(isPlainObject(legacyCustomWeights), 'COST_ALLOCATION_CUSTOM_WEIGHTS_REQUIRED', 'Legacy custom basis requires weights by textual SKU', { costEntryId: entry.id });
    }
  } else {
    invariant(legacyCustomWeights === undefined && exactCustomWeights === undefined, 'COST_ALLOCATION_UNUSED_CUSTOM_WEIGHTS_FORBIDDEN', 'Custom weights may only be supplied for a custom allocation basis', { costEntryId: entry.id, basis });
  }

  for (const [key, values] of lineBasis.lines.entries()) {
    let weight;
    if (basis === 'unit') weight = values.quantity;
    else if (basis === 'net_value') weight = values.netValue;
    else if (lineBasis.mode === 'product-sku-v2') weight = exactWeightMap.get(key) ?? 0;
    else weight = Number(legacyCustomWeights?.[values.sku] ?? 0);
    invariant(Number.isFinite(weight) && weight >= 0, 'COST_ALLOCATION_WEIGHT_INVALID', 'Allocation weight must be a non-negative finite number', { costEntryId: entry.id, orderLineNo: values.orderLineNo, productSkuId: values.productSkuId, sku: values.sku, basis, weight });
    weights.set(key, weight);
  }

  if (basis === 'custom' && lineBasis.mode === 'legacy') {
    for (const sku of Object.keys(legacyCustomWeights)) {
      invariant(lineBasis.lines.has(legacyKey(sku)), 'COST_ALLOCATION_CUSTOM_SKU_INVALID', 'Legacy custom allocation contains SKU outside the committed order', { costEntryId: entry.id, sku });
    }
  }

  const totalWeight = [...weights.values()].reduce((sum, value) => sum + value, 0);
  invariant(totalWeight > 0, 'COST_ALLOCATION_WEIGHT_TOTAL_INVALID', 'Allocation weight total must be greater than zero', { costEntryId: entry.id, basis });

  const keys = [...lineBasis.lines.keys()].sort();
  let assigned = 0;
  return keys.map((key, index) => {
    const target = lineBasis.lines.get(key);
    const weight = weights.get(key);
    const share = weight / totalWeight;
    const allocatedAmount = index === keys.length - 1
      ? roundMoney(entry.amount - assigned)
      : roundMoney(entry.amount * share);
    assigned = roundMoney(assigned + allocatedAmount);
    return freezeAllocation(entry, target, basis, weight, share, allocatedAmount);
  });
}

function allocateDirect(entry, lineBasis) {
  const exactIdentity = actualCostExactIdentity(entry);
  if (exactIdentity) {
    invariant(lineBasis.mode === 'product-sku-v2', 'COST_ALLOCATION_EXACT_COST_REQUIRES_PRODUCT_SKU_ORDER', 'Exact physical ActualCost cannot be allocated against a legacy order commit', { costEntryId: entry.id, ...exactIdentity });
    const target = lineBasis.lines.get(canonicalKey(exactIdentity.orderLineNo, exactIdentity.productSkuId));
    invariant(target, 'COST_ALLOCATION_DIRECT_PRODUCT_SKU_REQUIRED', 'Direct physical cost must match the exact committed ProductSku order line', { costEntryId: entry.id, ...exactIdentity, sku: entry.sku ?? null });
    if (entry.sku != null) invariant(entry.sku === target.sku, 'COST_ALLOCATION_DIRECT_SKU_MISMATCH', 'ActualCost display SKU differs from exact committed ProductSku line', { costEntryId: entry.id, expectedSku: target.sku, actualSku: entry.sku });
    return [freezeAllocation(entry, target, 'direct', 1, 1, entry.amount)];
  }

  invariant(lineBasis.mode === 'legacy' && entry.sku, 'COST_ALLOCATION_DIRECT_EXACT_IDENTITY_REQUIRED', 'Canonical direct cost allocation requires orderLineNo + productSkuId; textual SKU direct allocation is legacy-only', { costEntryId: entry.id, sku: entry.sku ?? null });
  const target = lineBasis.lines.get(legacyKey(entry.sku));
  invariant(target, 'COST_ALLOCATION_DIRECT_SKU_REQUIRED', 'Legacy direct cost allocation requires a SKU present in the committed order', { costEntryId: entry.id, sku: entry.sku });
  return [freezeAllocation(entry, target, 'direct', 1, 1, entry.amount)];
}

function freezeAllocation(entry, target, basis, weight, share, allocatedAmount) {
  return Object.freeze({
    costEntryId: entry.id,
    costType: entry.costType,
    orderLineNo: target.orderLineNo,
    productSkuId: target.productSkuId,
    sku: target.sku,
    basis,
    basisWeight: roundMeasure(weight),
    share: roundShare(share),
    allocatedAmount: roundMoney(allocatedAmount),
    currency: entry.currency,
  });
}

function buildLineBasis(lines) {
  invariant(Array.isArray(lines) && lines.length > 0, 'COST_ALLOCATION_ORDER_LINES_REQUIRED', 'Committed order lines are required for cost allocation');
  const normalized = lines.map((line) => normalizeOrderLine(line));
  const canonicalCount = normalized.filter((line) => line.productSkuId !== null).length;
  invariant(canonicalCount === 0 || canonicalCount === normalized.length, 'COST_ALLOCATION_ORDER_LINEAGE_MIXED', 'Cost allocation refuses a mixed legacy/ProductSku order commit');
  const mode = canonicalCount === normalized.length ? 'product-sku-v2' : 'legacy';
  const basis = new Map();

  for (const line of normalized) {
    const key = mode === 'product-sku-v2' ? canonicalKey(line.orderLineNo, line.productSkuId) : legacyKey(line.sku);
    if (mode === 'product-sku-v2') invariant(!basis.has(key), 'COST_ALLOCATION_ORDER_LINE_IDENTITY_DUPLICATE', 'Committed order contains duplicate immutable ProductSku order-line identity', { orderLineNo: line.orderLineNo, productSkuId: line.productSkuId });
    const previous = basis.get(key) ?? { orderLineNo: line.orderLineNo, productSkuId: line.productSkuId, sku: line.sku, quantity: 0, netValue: 0 };
    if (mode === 'legacy') invariant(previous.sku === line.sku, 'COST_ALLOCATION_LEGACY_SKU_MISMATCH', 'Legacy allocation basis must remain keyed by textual SKU');
    previous.quantity += line.quantity;
    previous.netValue = roundMoney(previous.netValue + (line.quantity * line.unitPrice));
    basis.set(key, previous);
  }

  return Object.freeze({ mode, lines: new Map([...basis.entries()].sort(([a], [b]) => a.localeCompare(b))) });
}

function normalizeOrderLine(line) {
  invariant(typeof line?.sku === 'string' && line.sku.length > 0, 'COST_ALLOCATION_SKU_REQUIRED', 'Every committed order line requires SKU');
  invariant(Number.isFinite(line.quantity) && line.quantity > 0, 'COST_ALLOCATION_QUANTITY_INVALID', 'Every committed order line requires positive quantity', { sku: line.sku, quantity: line.quantity });
  invariant(Number.isFinite(line.unitPrice) && line.unitPrice >= 0, 'COST_ALLOCATION_UNIT_PRICE_INVALID', 'Every committed order line requires non-negative unit price', { sku: line.sku, unitPrice: line.unitPrice });
  const hasOrderLineNo = line.orderLineNo != null;
  const hasProductSkuId = line.productSkuId != null;
  invariant(hasOrderLineNo === hasProductSkuId, 'COST_ALLOCATION_ORDER_LINE_IDENTITY_INCOMPLETE', 'Canonical committed order line requires orderLineNo and productSkuId together', { orderLineNo: line.orderLineNo ?? null, productSkuId: line.productSkuId ?? null, sku: line.sku });
  if (!hasOrderLineNo) return Object.freeze({ orderLineNo: null, productSkuId: null, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice });
  invariant(Number.isInteger(line.orderLineNo) && line.orderLineNo > 0, 'COST_ALLOCATION_ORDER_LINE_NO_INVALID', 'Canonical committed order line requires a positive immutable orderLineNo', { orderLineNo: line.orderLineNo });
  invariant(typeof line.productSkuId === 'string' && line.productSkuId.length > 0, 'COST_ALLOCATION_PRODUCT_SKU_ID_INVALID', 'Canonical committed order line requires productSkuId', { productSkuId: line.productSkuId });
  return Object.freeze({ orderLineNo: line.orderLineNo, productSkuId: line.productSkuId, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice });
}

function actualCostExactIdentity(entry) {
  const hasOrderLineNo = entry?.orderLineNo != null;
  const hasProductSkuId = entry?.productSkuId != null;
  invariant(hasOrderLineNo === hasProductSkuId, 'COST_ALLOCATION_ACTUAL_COST_IDENTITY_INCOMPLETE', 'ActualCost exact identity requires orderLineNo and productSkuId together', { costEntryId: entry?.id, orderLineNo: entry?.orderLineNo ?? null, productSkuId: entry?.productSkuId ?? null });
  if (!hasOrderLineNo) return null;
  invariant(Number.isInteger(entry.orderLineNo) && entry.orderLineNo > 0, 'COST_ALLOCATION_ACTUAL_COST_ORDER_LINE_NO_INVALID', 'ActualCost orderLineNo must be a positive integer', { costEntryId: entry.id, orderLineNo: entry.orderLineNo });
  invariant(typeof entry.productSkuId === 'string' && entry.productSkuId.length > 0, 'COST_ALLOCATION_ACTUAL_COST_PRODUCT_SKU_ID_INVALID', 'ActualCost productSkuId must be a non-empty string', { costEntryId: entry.id, productSkuId: entry.productSkuId });
  return Object.freeze({ orderLineNo: entry.orderLineNo, productSkuId: entry.productSkuId });
}

function normalizeExactCustomWeights(entry, rows, lineBasis) {
  invariant(Array.isArray(rows) && rows.length > 0, 'COST_ALLOCATION_CUSTOM_LINE_WEIGHTS_REQUIRED', 'Canonical custom basis requires exact ProductSku line weights', { costEntryId: entry.id });
  const weights = new Map();
  for (const row of rows) {
    invariant(Number.isInteger(row?.orderLineNo) && row.orderLineNo > 0, 'COST_ALLOCATION_CUSTOM_LINE_IDENTITY_INVALID', 'Custom line weight requires a positive orderLineNo', { costEntryId: entry.id, orderLineNo: row?.orderLineNo });
    invariant(typeof row?.productSkuId === 'string' && row.productSkuId.length > 0, 'COST_ALLOCATION_CUSTOM_LINE_IDENTITY_INVALID', 'Custom line weight requires productSkuId', { costEntryId: entry.id, productSkuId: row?.productSkuId });
    invariant(Number.isFinite(row?.weight) && row.weight >= 0, 'COST_ALLOCATION_WEIGHT_INVALID', 'Custom line weight must be a non-negative finite number', { costEntryId: entry.id, orderLineNo: row?.orderLineNo, productSkuId: row?.productSkuId, weight: row?.weight });
    const key = canonicalKey(row.orderLineNo, row.productSkuId);
    invariant(!weights.has(key), 'COST_ALLOCATION_CUSTOM_LINE_DUPLICATE', 'Custom allocation cannot contain duplicate ProductSku line identity', { costEntryId: entry.id, orderLineNo: row.orderLineNo, productSkuId: row.productSkuId });
    const target = lineBasis.get(key);
    invariant(target, 'COST_ALLOCATION_CUSTOM_LINE_INVALID', 'Custom allocation contains ProductSku line outside the committed order', { costEntryId: entry.id, orderLineNo: row.orderLineNo, productSkuId: row.productSkuId });
    if (row.sku != null) invariant(row.sku === target.sku, 'COST_ALLOCATION_CUSTOM_LINE_SKU_MISMATCH', 'Custom line display SKU differs from immutable ProductSku order line', { costEntryId: entry.id, expectedSku: target.sku, actualSku: row.sku });
    weights.set(key, row.weight);
  }
  return weights;
}

function buildLineEconomics(lineBasis, allocations, currency) {
  const costByLine = new Map([...lineBasis.lines.keys()].map((key) => [key, 0]));
  for (const allocation of allocations) {
    const key = allocation.productSkuId === null ? legacyKey(allocation.sku) : canonicalKey(allocation.orderLineNo, allocation.productSkuId);
    costByLine.set(key, roundMoney((costByLine.get(key) ?? 0) + allocation.allocatedAmount));
  }
  return [...lineBasis.lines.entries()].map(([key, values]) => {
    const allocatedLandedCost = costByLine.get(key) ?? 0;
    const contributionMarginAmount = roundMoney(values.netValue - allocatedLandedCost);
    const contributionMarginPercent = values.netValue === 0
      ? null
      : calculateMoneyPercentage(contributionMarginAmount, values.netValue, {
        invalidCode: 'COST_ALLOCATION_MARGIN_PERCENT_INVALID',
        scaleCode: 'COST_ALLOCATION_MARGIN_PERCENT_SCALE_INVALID',
        overflowCode: 'COST_ALLOCATION_MARGIN_PERCENT_TOO_LARGE',
        numeratorLabel: 'ProductSku line contribution margin',
        denominatorLabel: 'ProductSku line net revenue',
      });
    return Object.freeze({
      orderLineNo: values.orderLineNo,
      productSkuId: values.productSkuId,
      sku: values.sku,
      quantity: values.quantity,
      netRevenue: values.netValue,
      allocatedLandedCost,
      contributionMarginAmount,
      contributionMarginPercent,
      currency,
    });
  });
}

function canonicalKey(orderLineNo, productSkuId) { return `v2:${String(orderLineNo).padStart(12, '0')}:${productSkuId}`; }
function legacyKey(sku) { return `legacy:${sku}`; }
function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

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
