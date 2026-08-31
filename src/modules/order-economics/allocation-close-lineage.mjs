import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import {
  createMarginActualizationSnapshot,
  createPostCloseAdjustment,
} from './public.mjs';
import {
  createCostCloseReadinessSnapshot,
  createReadinessBoundCostCloseSnapshot,
} from './cost-close-readiness.mjs';

const CURRENT = 'current';
const LEGACY = 'legacy-not-applicable';
const PENDING_POST_CLOSE = 'pending-post-close';

export function resolveOrderEconomicsLineageMode(orderCommit) {
  invariant(Array.isArray(orderCommit?.lines) && orderCommit.lines.length > 0, 'ORDER_COMMIT_LINES_REQUIRED', 'Order commit lines are required to resolve economics lineage');
  const identities = orderCommit.lines.map((line) => ({
    hasOrderLineNo: Number.isInteger(line?.orderLineNo) && line.orderLineNo > 0,
    hasProductSkuId: typeof line?.productSkuId === 'string' && line.productSkuId.trim().length > 0,
  }));
  if (identities.every(({ hasOrderLineNo, hasProductSkuId }) => hasOrderLineNo && hasProductSkuId)) return 'product-sku-v2';
  if (identities.every(({ hasOrderLineNo, hasProductSkuId }) => !hasOrderLineNo && !hasProductSkuId)) return 'legacy';
  invariant(false, 'ORDER_COMMIT_ECONOMICS_LINEAGE_MIXED', 'Order commit cannot mix canonical ProductSku line identity with legacy textual-SKU identity');
}

export function createAllocationAwareMarginActualizationSnapshot({ costAllocation = null, ...input }) {
  const base = createMarginActualizationSnapshot(input);
  const mode = resolveOrderEconomicsLineageMode(input.orderCommit);
  if (mode === 'legacy') return enrich(base, legacyAllocationFields());
  assertCurrentAllocation({ costAllocation, order: input.order, orderCommit: input.orderCommit, landedCost: input.landedCost });
  return enrich(base, currentAllocationFields(costAllocation));
}

export function createPendingPostCloseMarginActualizationSnapshot(input) {
  const base = createMarginActualizationSnapshot(input);
  const mode = resolveOrderEconomicsLineageMode(input.orderCommit);
  return enrich(base, mode === 'legacy' ? legacyAllocationFields() : pendingAllocationFields());
}

export function createAllocationAwareCostCloseReadinessSnapshot(input) {
  const mode = resolveOrderEconomicsLineageMode(input.orderCommit);
  assertMarginAllocationState(input.marginActualization, mode, 'COST_CLOSE_READINESS');
  const base = createCostCloseReadinessSnapshot(input);
  return enrich(base, allocationFieldsFromMargin(input.marginActualization));
}

export function createAllocationAwareReadinessBoundCostCloseSnapshot(input) {
  const mode = resolveOrderEconomicsLineageMode(input.orderCommit);
  assertMarginAllocationState(input.marginActualization, mode, 'COST_CLOSE');
  assertReadinessAllocationBinding(input.readiness, input.marginActualization, mode);
  const base = createReadinessBoundCostCloseSnapshot(input);
  return enrich(base, allocationFieldsFromMargin(input.marginActualization));
}

export function createAllocationAwarePostCloseAdjustment(input) {
  const mode = resolveOrderEconomicsLineageMode(input.orderCommit);
  if (mode === 'product-sku-v2') {
    invariant(input.marginActualization?.allocationStatus === PENDING_POST_CLOSE, 'POST_CLOSE_COST_ALLOCATION_STATE_INVALID', 'Canonical ProductSku post-close margin must remain pending exact reallocation');
    invariant(input.costClose?.allocationStatus === CURRENT, 'POST_CLOSE_CLOSED_ALLOCATION_REQUIRED', 'Canonical ProductSku post-close adjustment requires the exact allocation frozen by cost close');
  } else {
    invariant(input.marginActualization?.allocationStatus === LEGACY, 'POST_CLOSE_LEGACY_ALLOCATION_STATE_INVALID', 'Legacy post-close margin must not invent ProductSku allocation lineage');
  }
  const base = createPostCloseAdjustment(input);
  const fields = Object.freeze({
    previousAllocationStatus: input.priorMarginActualization?.allocationStatus ?? null,
    resultingAllocationStatus: input.marginActualization.allocationStatus,
    closedCostAllocationRunSnapshotId: input.costClose?.costAllocationRunSnapshotId ?? null,
    closedCostAllocationRunContentHash: input.costClose?.costAllocationRunContentHash ?? null,
  });
  return enrich(base, fields);
}

function assertCurrentAllocation({ costAllocation, order, orderCommit, landedCost }) {
  invariant(costAllocation?.id && costAllocation?.contentHash, 'MARGIN_COST_ALLOCATION_REQUIRED', 'Canonical ProductSku margin actualization requires an immutable cost allocation run');
  invariant(costAllocation.orderId === orderCommit.orderId && costAllocation.orderId === order.id, 'MARGIN_COST_ALLOCATION_ORDER_MISMATCH', 'Cost allocation belongs to another order');
  invariant(costAllocation.orderVersion === orderCommit.orderVersion, 'MARGIN_COST_ALLOCATION_ORDER_VERSION_MISMATCH', 'Cost allocation belongs to another order version');
  invariant(costAllocation.orderCommitSnapshotId === orderCommit.id, 'MARGIN_COST_ALLOCATION_COMMIT_MISMATCH', 'Cost allocation belongs to another order commit snapshot');
  invariant(costAllocation.landedCostSnapshotId === landedCost.id, 'MARGIN_COST_ALLOCATION_LANDED_MISMATCH', 'Cost allocation does not reference the exact landed cost snapshot');
  invariant(costAllocation.currency === landedCost.currency && costAllocation.currency === orderCommit.currency, 'MARGIN_COST_ALLOCATION_CURRENCY_MISMATCH', 'Cost allocation currency differs from the immutable economics basis');
  invariant(costAllocation.lineageMode === 'product-sku-v2', 'MARGIN_COST_ALLOCATION_LINEAGE_MODE_INVALID', 'Canonical ProductSku margin requires product-sku-v2 allocation lineage');
  invariant(typeof costAllocation.policyVersionId === 'string' && costAllocation.policyVersionId.length > 0, 'MARGIN_COST_ALLOCATION_POLICY_REQUIRED', 'Cost allocation policy version is required');
  invariant(Number.isFinite(costAllocation.allocatedTotal) && costAllocation.allocatedTotal === landedCost.totalCost, 'MARGIN_COST_ALLOCATION_TOTAL_MISMATCH', 'Cost allocation total must equal exact landed cost total');
  const allocationIds = [...(costAllocation.costEntryIds ?? [])].sort();
  const landedIds = [...(landedCost.costEntryIds ?? [])].sort();
  invariant(canonicalJson(allocationIds) === canonicalJson(landedIds), 'MARGIN_COST_ALLOCATION_COST_SET_MISMATCH', 'Cost allocation must cover the exact landed-cost entry set');
}

function assertMarginAllocationState(margin, mode, prefix) {
  invariant(margin?.id, `${prefix}_MARGIN_REQUIRED`, 'Margin actualization snapshot is required');
  if (mode === 'legacy') {
    invariant(margin.allocationStatus === LEGACY, `${prefix}_LEGACY_ALLOCATION_STATE_INVALID`, 'Legacy economics must remain explicitly outside ProductSku allocation lineage');
    invariant(!margin.costAllocationRunSnapshotId && !margin.costAllocationRunContentHash, `${prefix}_LEGACY_ALLOCATION_INVENTED`, 'Legacy economics cannot invent ProductSku allocation references');
    return;
  }
  invariant(margin.allocationStatus === CURRENT, `${prefix}_COST_ALLOCATION_NOT_CURRENT`, 'Canonical ProductSku economics requires a current exact allocation before cost close');
  invariant(margin.costAllocationRunSnapshotId && margin.costAllocationRunContentHash && margin.costAllocationPolicyVersionId, `${prefix}_COST_ALLOCATION_PIN_REQUIRED`, 'Canonical ProductSku economics requires immutable allocation id, hash and policy pins');
  invariant(margin.costAllocationLineageMode === 'product-sku-v2', `${prefix}_COST_ALLOCATION_LINEAGE_MODE_INVALID`, 'Canonical ProductSku economics requires product-sku-v2 allocation lineage');
}

function assertReadinessAllocationBinding(readiness, margin, mode) {
  invariant(readiness?.id, 'COST_CLOSE_READINESS_REQUIRED', 'Cost close requires an immutable readiness snapshot');
  invariant(readiness.allocationStatus === margin.allocationStatus, 'COST_CLOSE_READINESS_ALLOCATION_STATUS_MISMATCH', 'Readiness allocation status differs from margin basis');
  if (mode === 'legacy') return;
  invariant(readiness.costAllocationRunSnapshotId === margin.costAllocationRunSnapshotId, 'COST_CLOSE_READINESS_ALLOCATION_ID_MISMATCH', 'Readiness does not reference the margin cost allocation run');
  invariant(readiness.costAllocationRunContentHash === margin.costAllocationRunContentHash, 'COST_CLOSE_READINESS_ALLOCATION_HASH_MISMATCH', 'Readiness does not pin the margin cost allocation hash');
  invariant(readiness.costAllocationPolicyVersionId === margin.costAllocationPolicyVersionId, 'COST_CLOSE_READINESS_ALLOCATION_POLICY_MISMATCH', 'Readiness does not pin the margin allocation policy version');
}

function allocationFieldsFromMargin(margin) {
  return Object.freeze({
    allocationStatus: margin.allocationStatus,
    costAllocationRunSnapshotId: margin.costAllocationRunSnapshotId ?? null,
    costAllocationRunContentHash: margin.costAllocationRunContentHash ?? null,
    costAllocationPolicyVersionId: margin.costAllocationPolicyVersionId ?? null,
    costAllocationLineageMode: margin.costAllocationLineageMode ?? null,
  });
}
function currentAllocationFields(costAllocation) {
  return Object.freeze({
    allocationStatus: CURRENT,
    costAllocationRunSnapshotId: costAllocation.id,
    costAllocationRunContentHash: costAllocation.contentHash,
    costAllocationPolicyVersionId: costAllocation.policyVersionId,
    costAllocationLineageMode: costAllocation.lineageMode,
  });
}
function legacyAllocationFields() {
  return Object.freeze({ allocationStatus: LEGACY, costAllocationRunSnapshotId: null, costAllocationRunContentHash: null, costAllocationPolicyVersionId: null, costAllocationLineageMode: null });
}
function pendingAllocationFields() {
  return Object.freeze({ allocationStatus: PENDING_POST_CLOSE, costAllocationRunSnapshotId: null, costAllocationRunContentHash: null, costAllocationPolicyVersionId: null, costAllocationLineageMode: 'product-sku-v2' });
}
function enrich(base, fields) {
  const aggregateContentHash = base.contentHash;
  const basis = Object.freeze({ aggregateContentHash, ...fields });
  return Object.freeze({ ...base, aggregateContentHash, ...fields, contentHash: hashBasis(basis) });
}
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
