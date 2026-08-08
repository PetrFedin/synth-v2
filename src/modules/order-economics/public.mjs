import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { assertPostgresInteger, normalizeMoney } from '../../core/money.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const SUPPLY_SOURCES = Object.freeze(['inventory', 'inbound', 'production', 'drop-ship']);
const COST_TYPES = Object.freeze(['factory', 'material', 'labor', 'freight', 'insurance', 'duty', 'brokerage', 'warehouse', 'quality', 'rework', 'packaging', 'commission', 'other']);
const MONEY_FACTOR = 10_000;

export function createSupplyCommitmentSnapshot({ id, order, allocations, createdAt }) {
  assertCommittedOrder(order);
  invariant(id, 'SUPPLY_COMMITMENT_ID_REQUIRED', 'Supply commitment id is required');
  invariant(Array.isArray(allocations) && allocations.length > 0, 'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'Supply commitment requires allocations');
  const orderedBySku = new Map(order.lines.map((line) => [line.sku, line.quantity]));
  const committedBySku = new Map();
  const normalized = allocations.map((allocation) => {
    invariant(orderedBySku.has(allocation?.sku), 'SUPPLY_COMMITMENT_SKU_UNKNOWN', 'Supply commitment SKU is not in order', { sku: allocation?.sku });
    const quantity = assertPostgresInteger(allocation.quantity, { code: 'SUPPLY_COMMITMENT_QUANTITY_INVALID', label: 'Supply commitment quantity', min: 1 });
    invariant(SUPPLY_SOURCES.includes(allocation.sourceType), 'SUPPLY_COMMITMENT_SOURCE_INVALID', 'Supply source type is invalid', { sourceType: allocation.sourceType });
    invariant(typeof allocation.sourceRef === 'string' && allocation.sourceRef.trim().length > 0, 'SUPPLY_COMMITMENT_SOURCE_REF_REQUIRED', 'Supply source reference is required');
    const expectedAvailabilityAt = optionalTimestamp(allocation.expectedAvailabilityAt, 'SUPPLY_COMMITMENT_AVAILABILITY_INVALID');
    const nextCommitted = (committedBySku.get(allocation.sku) ?? 0) + quantity;
    invariant(nextCommitted <= orderedBySku.get(allocation.sku), 'SUPPLY_COMMITMENT_EXCEEDS_ORDER', 'Supply commitment cannot exceed ordered quantity', { sku: allocation.sku, orderedQuantity: orderedBySku.get(allocation.sku), committedQuantity: nextCommitted });
    committedBySku.set(allocation.sku, nextCommitted);
    return Object.freeze({ sku: allocation.sku, quantity, sourceType: allocation.sourceType, sourceRef: allocation.sourceRef.trim(), expectedAvailabilityAt });
  });
  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: order.version,
    brandId: order.brandId,
    shopId: order.shopId,
    commercialPublicationId: order.commercialPublicationId ?? null,
    priceListVersionId: order.priceListVersionId ?? null,
    buyerCatalogVersionId: order.buyerCatalogVersionId ?? null,
    currency: order.currency,
    allocations: Object.freeze(normalized),
  });
  return Object.freeze({ id, ...basis, status: 'committed', contentHash: hashBasis(basis), createdAt });
}

export function createActualCostLedgerEntry({ id, order, costType, amount, currency, sku = null, sourceRef, occurredAt, recordedAt }) {
  assertCommittedOrder(order);
  invariant(id, 'ACTUAL_COST_ENTRY_ID_REQUIRED', 'Actual cost entry id is required');
  invariant(COST_TYPES.includes(costType), 'ACTUAL_COST_TYPE_INVALID', 'Actual cost type is invalid', { costType });
  invariant(currency === order.currency, 'ACTUAL_COST_CURRENCY_MISMATCH', 'Actual cost currency must match order currency until FX actualization is enabled', { orderCurrency: order.currency, currency });
  const normalizedAmount = normalizeSignedMoney(amount);
  if (sku !== null) invariant(order.lines.some((line) => line.sku === sku), 'ACTUAL_COST_SKU_UNKNOWN', 'Actual cost SKU is not in order', { sku });
  invariant(typeof sourceRef === 'string' && sourceRef.trim().length > 0, 'ACTUAL_COST_SOURCE_REF_REQUIRED', 'Actual cost source reference is required');
  return Object.freeze({
    id,
    orderId: order.id,
    orderVersion: order.version,
    brandId: order.brandId,
    shopId: order.shopId,
    costType,
    amount: normalizedAmount,
    currency,
    sku,
    sourceRef: sourceRef.trim(),
    occurredAt: requiredTimestamp(occurredAt, 'ACTUAL_COST_OCCURRED_AT_INVALID'),
    recordedAt: requiredTimestamp(recordedAt, 'ACTUAL_COST_RECORDED_AT_INVALID'),
  });
}

export function createLandedCostSnapshot({ id, order, costEntries, createdAt }) {
  assertCommittedOrder(order);
  invariant(id, 'LANDED_COST_SNAPSHOT_ID_REQUIRED', 'Landed cost snapshot id is required');
  invariant(Array.isArray(costEntries) && costEntries.length > 0, 'LANDED_COST_ENTRIES_REQUIRED', 'Landed cost requires actual cost entries');
  const componentTotals = {};
  let scaledTotal = 0;
  for (const entry of costEntries) {
    invariant(entry.orderId === order.id, 'LANDED_COST_ORDER_MISMATCH', 'Cost entry belongs to another order', { entryId: entry.id });
    invariant(entry.currency === order.currency, 'LANDED_COST_CURRENCY_MISMATCH', 'Cost entry currency does not match order currency', { entryId: entry.id });
    scaledTotal += Math.round(entry.amount * MONEY_FACTOR);
    componentTotals[entry.costType] = roundMoney((componentTotals[entry.costType] ?? 0) + entry.amount);
  }
  const totalCost = scaledTotal / MONEY_FACTOR;
  invariant(Number.isSafeInteger(scaledTotal) && totalCost > 0, 'LANDED_COST_TOTAL_INVALID', 'Landed cost total must be positive and safe');
  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: order.version,
    currency: order.currency,
    costEntryIds: Object.freeze(costEntries.map((entry) => entry.id).sort()),
    componentTotals: Object.freeze(Object.fromEntries(Object.entries(componentTotals).sort(([a], [b]) => a.localeCompare(b)))),
    totalCost,
  });
  return Object.freeze({ id, ...basis, status: 'actual', contentHash: hashBasis(basis), createdAt });
}

export function createMarginActualizationSnapshot({ id, order, landedCost, createdAt }) {
  assertCommittedOrder(order);
  invariant(id && landedCost?.id, 'MARGIN_ACTUALIZATION_IDENTITY_REQUIRED', 'Margin actualization identity is required');
  invariant(landedCost.orderId === order.id, 'MARGIN_ACTUALIZATION_ORDER_MISMATCH', 'Landed cost belongs to another order');
  invariant(landedCost.currency === order.currency, 'MARGIN_ACTUALIZATION_CURRENCY_MISMATCH', 'Landed cost currency does not match order currency');
  const netRevenue = normalizeMoney(order.totalAmount, { label: 'Order revenue' });
  const contributionMarginAmount = roundMoney(netRevenue - landedCost.totalCost);
  const contributionMarginPercent = roundMetric((contributionMarginAmount / netRevenue) * 100);
  const basis = Object.freeze({
    orderId: order.id,
    orderVersion: order.version,
    landedCostSnapshotId: landedCost.id,
    commercialPublicationId: order.commercialPublicationId ?? null,
    buyerCatalogVersionId: order.buyerCatalogVersionId ?? null,
    currency: order.currency,
    netRevenue,
    landedCost: landedCost.totalCost,
    contributionMarginAmount,
    contributionMarginPercent,
  });
  return Object.freeze({ id, ...basis, status: 'actual', contentHash: hashBasis(basis), createdAt });
}

function assertCommittedOrder(order) {
  invariant(order?.id && order.status === 'attached', 'ORDER_NOT_COMMITTED_FOR_EXECUTION', 'Supply and cost actualization require an attached wholesale order', { orderId: order?.id, status: order?.status });
}
function normalizeSignedMoney(value) {
  invariant(Number.isFinite(value) && value !== 0, 'ACTUAL_COST_AMOUNT_INVALID', 'Actual cost amount must be non-zero');
  const scaled = Math.round(value * MONEY_FACTOR);
  invariant(Number.isSafeInteger(scaled), 'ACTUAL_COST_AMOUNT_TOO_LARGE', 'Actual cost amount exceeds safe fixed-point range');
  const normalized = scaled / MONEY_FACTOR;
  invariant(Math.abs(value - normalized) <= 1e-10, 'ACTUAL_COST_AMOUNT_SCALE_INVALID', 'Actual cost amount must use at most 4 decimal places');
  return normalized;
}
function roundMoney(value) { return Math.round(value * MONEY_FACTOR) / MONEY_FACTOR; }
function roundMetric(value) { return Math.round(value * 10_000) / 10_000; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function optionalTimestamp(value, code) { return value === null || value === undefined || value === '' ? null : requiredTimestamp(value, code); }
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
