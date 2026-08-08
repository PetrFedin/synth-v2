import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { assertPostgresInteger, normalizeMoney } from '../../core/money.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

const SUPPLY_SOURCES = Object.freeze(['inventory', 'inbound', 'production', 'drop-ship']);
const COST_TYPES = Object.freeze(['factory', 'material', 'labor', 'freight', 'insurance', 'duty', 'brokerage', 'warehouse', 'quality', 'rework', 'packaging', 'commission', 'other']);
const FX_RATE_TYPES = Object.freeze(['plan', 'budget', 'po', 'invoice', 'accounting', 'settlement']);
const MONEY_FACTOR = 10_000;
const FX_RATE_FACTOR = 100_000_000;
const FX_RATE_FACTOR_BIGINT = BigInt(FX_RATE_FACTOR);

export function createSupplyCommitmentSnapshot({ id, order, orderCommit, allocations, createdAt }) {
  assertExecutionLineage(order, orderCommit);
  invariant(id, 'SUPPLY_COMMITMENT_ID_REQUIRED', 'Supply commitment id is required');
  invariant(Array.isArray(allocations) && allocations.length > 0, 'SUPPLY_COMMITMENT_ALLOCATIONS_REQUIRED', 'Supply commitment requires allocations');
  const orderedBySku = new Map(orderCommit.lines.map((line) => [line.sku, line.quantity]));
  const committedBySku = new Map();
  const normalized = allocations.map((allocation) => {
    invariant(orderedBySku.has(allocation?.sku), 'SUPPLY_COMMITMENT_SKU_UNKNOWN', 'Supply commitment SKU is not in committed order', { sku: allocation?.sku });
    const quantity = assertPostgresInteger(allocation.quantity, { code: 'SUPPLY_COMMITMENT_QUANTITY_INVALID', label: 'Supply commitment quantity', min: 1 });
    invariant(SUPPLY_SOURCES.includes(allocation.sourceType), 'SUPPLY_COMMITMENT_SOURCE_INVALID', 'Supply source type is invalid', { sourceType: allocation.sourceType });
    invariant(typeof allocation.sourceRef === 'string' && allocation.sourceRef.trim().length > 0, 'SUPPLY_COMMITMENT_SOURCE_REF_REQUIRED', 'Supply source reference is required');
    const expectedAvailabilityAt = optionalTimestamp(allocation.expectedAvailabilityAt, 'SUPPLY_COMMITMENT_AVAILABILITY_INVALID');
    const nextCommitted = (committedBySku.get(allocation.sku) ?? 0) + quantity;
    invariant(nextCommitted <= orderedBySku.get(allocation.sku), 'SUPPLY_COMMITMENT_EXCEEDS_ORDER', 'Supply commitment cannot exceed committed ordered quantity', { sku: allocation.sku, orderedQuantity: orderedBySku.get(allocation.sku), committedQuantity: nextCommitted });
    committedBySku.set(allocation.sku, nextCommitted);
    return Object.freeze({ sku: allocation.sku, quantity, sourceType: allocation.sourceType, sourceRef: allocation.sourceRef.trim(), expectedAvailabilityAt });
  });
  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    commercialPublicationId: orderCommit.commercialPublicationId ?? null,
    priceListVersionId: orderCommit.priceListVersionId ?? null,
    buyerCatalogVersionId: orderCommit.buyerCatalogVersionId ?? null,
    currency: orderCommit.currency,
    allocations: Object.freeze(normalized),
  });
  return Object.freeze({ id, ...basis, status: 'committed', contentHash: hashBasis(basis), createdAt });
}

export function createOrderFxRateSnapshot({
  id,
  order,
  orderCommit,
  sourceCurrency,
  rate,
  rateType,
  sourceRef,
  effectiveAt,
  recordedAt,
}) {
  assertExecutionLineage(order, orderCommit);
  invariant(id, 'FX_RATE_SNAPSHOT_ID_REQUIRED', 'FX rate snapshot id is required');
  invariant(isCurrency(sourceCurrency), 'FX_RATE_SOURCE_CURRENCY_INVALID', 'FX source currency must be an ISO-4217 code', { sourceCurrency });
  invariant(sourceCurrency !== orderCommit.currency, 'FX_RATE_CURRENCY_PAIR_INVALID', 'FX source and target currencies must differ', { sourceCurrency, targetCurrency: orderCommit.currency });
  invariant(FX_RATE_TYPES.includes(rateType), 'FX_RATE_TYPE_INVALID', 'FX rate type is invalid', { rateType });
  invariant(typeof sourceRef === 'string' && sourceRef.trim().length > 0, 'FX_RATE_SOURCE_REF_REQUIRED', 'FX source reference is required');
  const normalizedRate = normalizeFxRate(rate);
  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    sourceCurrency,
    targetCurrency: orderCommit.currency,
    rate: normalizedRate,
    rateType,
    sourceRef: sourceRef.trim(),
    effectiveAt: requiredTimestamp(effectiveAt, 'FX_RATE_EFFECTIVE_AT_INVALID'),
  });
  return Object.freeze({
    id,
    ...basis,
    status: 'recorded',
    contentHash: hashBasis(basis),
    recordedAt: requiredTimestamp(recordedAt, 'FX_RATE_RECORDED_AT_INVALID'),
  });
}

export function createActualCostLedgerEntry({
  id,
  order,
  orderCommit,
  supplyCommitment,
  costType,
  amount,
  currency,
  fxRateSnapshot = null,
  sku = null,
  sourceRef,
  occurredAt,
  recordedAt,
  correctionId = null,
  correctionReason = null,
}) {
  assertExecutionLineage(order, orderCommit);
  assertSupplyCostBasis(supplyCommitment, orderCommit);
  invariant(id, 'ACTUAL_COST_ENTRY_ID_REQUIRED', 'Actual cost entry id is required');
  invariant(COST_TYPES.includes(costType), 'ACTUAL_COST_TYPE_INVALID', 'Actual cost type is invalid', { costType });
  invariant(isCurrency(currency), 'ACTUAL_COST_CURRENCY_INVALID', 'Actual cost currency must be an ISO-4217 code', { currency });
  const correction = normalizeCorrectionMetadata(correctionId, correctionReason);
  const sourceAmount = normalizeSignedMoney(amount);
  const sourceCurrency = currency;
  const converted = normalizeActualCostCurrency({ sourceAmount, sourceCurrency, orderCommit, fxRateSnapshot });
  if (sku !== null) invariant(orderCommit.lines.some((line) => line.sku === sku), 'ACTUAL_COST_SKU_UNKNOWN', 'Actual cost SKU is not in committed order', { sku });
  invariant(typeof sourceRef === 'string' && sourceRef.trim().length > 0, 'ACTUAL_COST_SOURCE_REF_REQUIRED', 'Actual cost source reference is required');
  return Object.freeze({
    id,
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    supplyCommitmentSnapshotId: supplyCommitment.id,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    entryKind: 'actual',
    reversalOfEntryId: null,
    correctionId: correction.correctionId,
    correctionReason: correction.correctionReason,
    costType,
    sourceAmount,
    sourceCurrency,
    fxRateSnapshotId: converted.fxRateSnapshotId,
    amount: converted.amount,
    currency: orderCommit.currency,
    sku,
    sourceRef: sourceRef.trim(),
    occurredAt: requiredTimestamp(occurredAt, 'ACTUAL_COST_OCCURRED_AT_INVALID'),
    recordedAt: requiredTimestamp(recordedAt, 'ACTUAL_COST_RECORDED_AT_INVALID'),
  });
}

export function createActualCostReversalEntry({
  id,
  correctionId,
  reason,
  order,
  orderCommit,
  originalEntry,
  recordedAt,
}) {
  assertExecutionLineage(order, orderCommit);
  invariant(id, 'ACTUAL_COST_REVERSAL_ID_REQUIRED', 'Actual cost reversal id is required');
  invariant(originalEntry?.id, 'ACTUAL_COST_ORIGINAL_REQUIRED', 'Actual cost correction requires an original ledger entry');
  invariant((originalEntry.entryKind ?? 'actual') !== 'reversal', 'ACTUAL_COST_REVERSAL_OF_REVERSAL_FORBIDDEN', 'A reversal entry cannot itself be reversed', { originalEntryId: originalEntry.id });
  invariant(originalEntry.orderId === orderCommit.orderId && originalEntry.orderCommitSnapshotId === orderCommit.id, 'ACTUAL_COST_REVERSAL_LINEAGE_MISMATCH', 'Original actual cost belongs to another order commit', { originalEntryId: originalEntry.id });
  invariant(typeof originalEntry.supplyCommitmentSnapshotId === 'string' && originalEntry.supplyCommitmentSnapshotId.length > 0, 'ACTUAL_COST_REVERSAL_SUPPLY_REQUIRED', 'Only supply-linked actual costs can be corrected', { originalEntryId: originalEntry.id });
  invariant(originalEntry.currency === orderCommit.currency, 'ACTUAL_COST_REVERSAL_CURRENCY_MISMATCH', 'Original actual cost currency differs from the committed order currency', { originalEntryId: originalEntry.id });
  invariant(COST_TYPES.includes(originalEntry.costType), 'ACTUAL_COST_TYPE_INVALID', 'Original actual cost type is invalid', { costType: originalEntry.costType });
  invariant(isCurrency(originalEntry.sourceCurrency), 'ACTUAL_COST_CURRENCY_INVALID', 'Original source currency is invalid', { sourceCurrency: originalEntry.sourceCurrency });
  const correction = normalizeCorrectionMetadata(correctionId, reason, { required: true });
  const reversedSourceAmount = normalizeSignedMoney(-originalEntry.sourceAmount);
  const reversedAmount = normalizeSignedMoney(-originalEntry.amount);
  const timestamp = requiredTimestamp(recordedAt, 'ACTUAL_COST_RECORDED_AT_INVALID');
  return Object.freeze({
    id,
    orderId: originalEntry.orderId,
    orderVersion: originalEntry.orderVersion,
    orderCommitSnapshotId: originalEntry.orderCommitSnapshotId,
    supplyCommitmentSnapshotId: originalEntry.supplyCommitmentSnapshotId,
    brandId: originalEntry.brandId,
    shopId: originalEntry.shopId,
    entryKind: 'reversal',
    reversalOfEntryId: originalEntry.id,
    correctionId: correction.correctionId,
    correctionReason: correction.correctionReason,
    costType: originalEntry.costType,
    sourceAmount: reversedSourceAmount,
    sourceCurrency: originalEntry.sourceCurrency,
    fxRateSnapshotId: originalEntry.fxRateSnapshotId ?? null,
    amount: reversedAmount,
    currency: originalEntry.currency,
    sku: originalEntry.sku ?? null,
    sourceRef: originalEntry.sourceRef,
    occurredAt: timestamp,
    recordedAt: timestamp,
  });
}

export function createLandedCostSnapshot({ id, order, orderCommit, costEntries, createdAt }) {
  assertExecutionLineage(order, orderCommit);
  invariant(id, 'LANDED_COST_SNAPSHOT_ID_REQUIRED', 'Landed cost snapshot id is required');
  invariant(Array.isArray(costEntries) && costEntries.length > 0, 'LANDED_COST_ENTRIES_REQUIRED', 'Landed cost requires actual cost entries');
  const componentTotals = {};
  const supplyCommitmentSnapshotIds = new Set();
  let supplyLineageComplete = true;
  let scaledTotal = 0;
  for (const entry of costEntries) {
    invariant(entry.orderId === orderCommit.orderId, 'LANDED_COST_ORDER_MISMATCH', 'Cost entry belongs to another order', { entryId: entry.id });
    invariant(entry.orderCommitSnapshotId === orderCommit.id, 'LANDED_COST_COMMIT_MISMATCH', 'Cost entry belongs to another order commit snapshot', { entryId: entry.id, expectedOrderCommitSnapshotId: orderCommit.id, actualOrderCommitSnapshotId: entry.orderCommitSnapshotId });
    invariant(entry.currency === orderCommit.currency, 'LANDED_COST_CURRENCY_MISMATCH', 'Cost entry currency does not match committed order currency', { entryId: entry.id });
    if (entry.supplyCommitmentSnapshotId) supplyCommitmentSnapshotIds.add(entry.supplyCommitmentSnapshotId);
    else supplyLineageComplete = false;
    scaledTotal += Math.round(entry.amount * MONEY_FACTOR);
    componentTotals[entry.costType] = roundMoney((componentTotals[entry.costType] ?? 0) + entry.amount);
  }
  const totalCost = scaledTotal / MONEY_FACTOR;
  invariant(Number.isSafeInteger(scaledTotal) && totalCost > 0, 'LANDED_COST_TOTAL_INVALID', 'Landed cost total must be positive and safe');
  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    supplyCommitmentSnapshotIds: Object.freeze([...supplyCommitmentSnapshotIds].sort()),
    supplyLineageComplete,
    currency: orderCommit.currency,
    costEntryIds: Object.freeze(costEntries.map((entry) => entry.id).sort()),
    componentTotals: Object.freeze(Object.fromEntries(Object.entries(componentTotals).sort(([a], [b]) => a.localeCompare(b)))),
    totalCost,
  });
  return Object.freeze({ id, ...basis, status: 'actual', contentHash: hashBasis(basis), createdAt });
}

export function createMarginActualizationSnapshot({ id, order, orderCommit, landedCost, createdAt }) {
  assertExecutionLineage(order, orderCommit);
  invariant(id && landedCost?.id, 'MARGIN_ACTUALIZATION_IDENTITY_REQUIRED', 'Margin actualization identity is required');
  invariant(landedCost.orderId === orderCommit.orderId, 'MARGIN_ACTUALIZATION_ORDER_MISMATCH', 'Landed cost belongs to another order');
  invariant(landedCost.orderCommitSnapshotId === orderCommit.id, 'MARGIN_ACTUALIZATION_COMMIT_MISMATCH', 'Landed cost belongs to another order commit snapshot');
  invariant(landedCost.currency === orderCommit.currency, 'MARGIN_ACTUALIZATION_CURRENCY_MISMATCH', 'Landed cost currency does not match committed order currency');
  const netRevenue = normalizeMoney(orderCommit.totalAmount, { label: 'Committed order revenue' });
  const contributionMarginAmount = roundMoney(netRevenue - landedCost.totalCost);
  const contributionMarginPercent = roundMetric((contributionMarginAmount / netRevenue) * 100);
  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    landedCostSnapshotId: landedCost.id,
    supplyCommitmentSnapshotIds: Object.freeze([...(landedCost.supplyCommitmentSnapshotIds ?? [])]),
    supplyLineageComplete: landedCost.supplyLineageComplete ?? false,
    commercialPublicationId: orderCommit.commercialPublicationId ?? null,
    priceListVersionId: orderCommit.priceListVersionId ?? null,
    buyerCatalogVersionId: orderCommit.buyerCatalogVersionId ?? null,
    currency: orderCommit.currency,
    netRevenue,
    landedCost: landedCost.totalCost,
    contributionMarginAmount,
    contributionMarginPercent,
  });
  return Object.freeze({ id, ...basis, status: 'actual', contentHash: hashBasis(basis), createdAt });
}

function assertSupplyCostBasis(supplyCommitment, orderCommit) {
  invariant(supplyCommitment?.id, 'ACTUAL_COST_SUPPLY_COMMITMENT_REQUIRED', 'Actual cost requires an immutable supply commitment snapshot');
  invariant(supplyCommitment.status === 'committed', 'ACTUAL_COST_SUPPLY_COMMITMENT_STATUS_INVALID', 'Supply commitment snapshot must be committed', { supplyCommitmentSnapshotId: supplyCommitment.id, status: supplyCommitment.status });
  invariant(supplyCommitment.orderId === orderCommit.orderId && supplyCommitment.orderCommitSnapshotId === orderCommit.id, 'ACTUAL_COST_SUPPLY_LINEAGE_MISMATCH', 'Supply commitment belongs to another order commit', {
    supplyCommitmentSnapshotId: supplyCommitment.id,
    orderId: orderCommit.orderId,
    orderCommitSnapshotId: orderCommit.id,
  });
  invariant(supplyCommitment.currency === orderCommit.currency, 'ACTUAL_COST_SUPPLY_CURRENCY_MISMATCH', 'Supply commitment currency differs from the committed order currency', { supplyCommitmentSnapshotId: supplyCommitment.id });
}

function normalizeCorrectionMetadata(correctionId, correctionReason, { required = false } = {}) {
  const hasId = typeof correctionId === 'string' && correctionId.trim().length > 0;
  const hasReason = typeof correctionReason === 'string' && correctionReason.trim().length > 0;
  invariant(hasId === hasReason, 'ACTUAL_COST_CORRECTION_METADATA_INCOMPLETE', 'Correction id and reason must be supplied together');
  invariant(!required || hasId, 'ACTUAL_COST_CORRECTION_METADATA_REQUIRED', 'Correction id and reason are required');
  return Object.freeze({ correctionId: hasId ? correctionId.trim() : null, correctionReason: hasReason ? correctionReason.trim() : null });
}

function normalizeActualCostCurrency({ sourceAmount, sourceCurrency, orderCommit, fxRateSnapshot }) {
  if (sourceCurrency === orderCommit.currency) {
    invariant(fxRateSnapshot === null || fxRateSnapshot === undefined, 'ACTUAL_COST_FX_NOT_REQUIRED', 'Same-currency actual cost must not reference an FX rate snapshot');
    return Object.freeze({ amount: sourceAmount, fxRateSnapshotId: null });
  }
  invariant(fxRateSnapshot?.id, 'ACTUAL_COST_FX_REQUIRED', 'Cross-currency actual cost requires an immutable FX rate snapshot', { sourceCurrency, targetCurrency: orderCommit.currency });
  invariant(fxRateSnapshot.status === 'recorded', 'ACTUAL_COST_FX_STATUS_INVALID', 'FX rate snapshot must be recorded', { fxRateSnapshotId: fxRateSnapshot.id, status: fxRateSnapshot.status });
  invariant(fxRateSnapshot.orderId === orderCommit.orderId && fxRateSnapshot.orderCommitSnapshotId === orderCommit.id, 'ACTUAL_COST_FX_LINEAGE_MISMATCH', 'FX rate snapshot belongs to another order commit', { fxRateSnapshotId: fxRateSnapshot.id });
  invariant(fxRateSnapshot.sourceCurrency === sourceCurrency && fxRateSnapshot.targetCurrency === orderCommit.currency, 'ACTUAL_COST_FX_PAIR_MISMATCH', 'FX rate snapshot currency pair does not match the actual cost', {
    fxRateSnapshotId: fxRateSnapshot.id,
    sourceCurrency,
    targetCurrency: orderCommit.currency,
  });
  return Object.freeze({ amount: convertSignedMoney(sourceAmount, fxRateSnapshot.rate), fxRateSnapshotId: fxRateSnapshot.id });
}

function assertExecutionLineage(order, orderCommit) {
  invariant(order?.id && order.status === 'attached', 'ORDER_NOT_COMMITTED_FOR_EXECUTION', 'Supply and cost actualization require an attached wholesale order', { orderId: order?.id, status: order?.status });
  invariant(typeof order.orderCommitSnapshotId === 'string' && order.orderCommitSnapshotId.length > 0, 'ORDER_COMMIT_SNAPSHOT_REQUIRED_FOR_EXECUTION', 'Supply and cost actualization require an immutable order commit snapshot', { orderId: order.id });
  invariant(orderCommit?.id === order.orderCommitSnapshotId, 'ORDER_COMMIT_SNAPSHOT_MISMATCH_FOR_EXECUTION', 'Execution basis does not match the order commit snapshot', { orderId: order.id, orderCommitSnapshotId: order.orderCommitSnapshotId, providedOrderCommitSnapshotId: orderCommit?.id });
  invariant(orderCommit.status === 'committed' && orderCommit.orderId === order.id, 'ORDER_COMMIT_SNAPSHOT_INVALID_FOR_EXECUTION', 'Execution requires a committed snapshot for the same order', { orderId: order.id, orderCommitOrderId: orderCommit?.orderId, orderCommitStatus: orderCommit?.status });
  invariant(orderCommit.orderVersion === order.version, 'ORDER_COMMIT_ORDER_VERSION_MISMATCH', 'Order version changed after the execution commit snapshot was created', { orderId: order.id, orderVersion: order.version, committedOrderVersion: orderCommit.orderVersion });
  invariant(orderCommit.brandId === order.brandId && orderCommit.shopId === order.shopId, 'ORDER_COMMIT_TRADE_MISMATCH_FOR_EXECUTION', 'Order commit snapshot belongs to another trade relationship', { orderId: order.id });
  invariant(orderCommit.currency === order.currency, 'ORDER_COMMIT_CURRENCY_MISMATCH_FOR_EXECUTION', 'Order commit snapshot currency differs from the order', { orderId: order.id, orderCurrency: order.currency, committedCurrency: orderCommit.currency });
}
function normalizeSignedMoney(value) {
  invariant(Number.isFinite(value) && value !== 0, 'ACTUAL_COST_AMOUNT_INVALID', 'Actual cost amount must be non-zero');
  const scaled = Math.round(value * MONEY_FACTOR);
  invariant(Number.isSafeInteger(scaled), 'ACTUAL_COST_AMOUNT_TOO_LARGE', 'Actual cost amount exceeds safe fixed-point range');
  const normalized = scaled / MONEY_FACTOR;
  const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  invariant(Math.abs(value - normalized) <= tolerance, 'ACTUAL_COST_AMOUNT_SCALE_INVALID', 'Actual cost amount must use at most 4 decimal places');
  return normalized;
}
function normalizeFxRate(value) {
  invariant(Number.isFinite(value) && value > 0, 'FX_RATE_INVALID', 'FX rate must be positive');
  const scaled = Math.round(value * FX_RATE_FACTOR);
  invariant(Number.isSafeInteger(scaled), 'FX_RATE_TOO_LARGE', 'FX rate exceeds safe fixed-point range');
  const normalized = scaled / FX_RATE_FACTOR;
  const tolerance = Math.max(1e-12, Number.EPSILON * Math.max(1, Math.abs(value)) * 4);
  invariant(Math.abs(value - normalized) <= tolerance, 'FX_RATE_SCALE_INVALID', 'FX rate must use at most 8 decimal places');
  return normalized;
}
function convertSignedMoney(amount, rate) {
  const amountScaled = BigInt(Math.round(amount * MONEY_FACTOR));
  const rateScaled = BigInt(Math.round(normalizeFxRate(rate) * FX_RATE_FACTOR));
  const product = amountScaled * rateScaled;
  const half = FX_RATE_FACTOR_BIGINT / 2n;
  const convertedScaled = product >= 0n
    ? (product + half) / FX_RATE_FACTOR_BIGINT
    : -((-product + half) / FX_RATE_FACTOR_BIGINT);
  invariant(convertedScaled <= BigInt(Number.MAX_SAFE_INTEGER) && convertedScaled >= BigInt(Number.MIN_SAFE_INTEGER), 'ACTUAL_COST_AMOUNT_TOO_LARGE', 'Converted actual cost exceeds safe fixed-point range');
  const converted = Number(convertedScaled) / MONEY_FACTOR;
  invariant(converted !== 0, 'ACTUAL_COST_CONVERTED_ZERO', 'Converted actual cost cannot round to zero');
  return converted;
}
function isCurrency(value) { return typeof value === 'string' && /^[A-Z]{3}$/.test(value); }
function roundMoney(value) { return Math.round(value * MONEY_FACTOR) / MONEY_FACTOR; }
function roundMetric(value) { return Math.round(value * 10_000) / 10_000; }
function requiredTimestamp(value, code) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time'); return new Date(parsed).toISOString(); }
function optionalTimestamp(value, code) { return value === null || value === undefined || value === '' ? null : requiredTimestamp(value, code); }
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
