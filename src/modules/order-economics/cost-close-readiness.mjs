import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { createCostCloseSnapshot } from './public.mjs';

const REQUIREMENT_ORDER = Object.freeze(['factory', 'freight', 'duty', 'credits']);
const REQUIREMENT_STATUSES = Object.freeze(['pending', 'complete', 'waived']);
const EVIDENCE_COST_TYPES = Object.freeze({
  factory: Object.freeze(['factory', 'material', 'labor', 'packaging']),
  freight: Object.freeze(['freight', 'insurance', 'brokerage', 'warehouse']),
  duty: Object.freeze(['duty']),
});

export function createCostCloseReadinessSnapshot({
  id,
  order,
  orderCommit,
  landedCost,
  marginActualization,
  costEntries,
  requirements,
  evaluatedAt,
}) {
  assertExecutionBasis(order, orderCommit);
  invariant(id, 'COST_CLOSE_READINESS_ID_REQUIRED', 'Cost close readiness id is required');
  assertEconomicsBasis(landedCost, marginActualization, orderCommit);
  invariant(landedCost.supplyLineageComplete === true && marginActualization.supplyLineageComplete === true, 'COST_CLOSE_READINESS_SUPPLY_LINEAGE_INCOMPLETE', 'Cost close readiness requires complete supply lineage');
  invariant(Array.isArray(costEntries) && costEntries.length > 0, 'COST_CLOSE_READINESS_COST_LEDGER_REQUIRED', 'Cost close readiness requires the current actual-cost ledger');

  const currentEntries = costEntries.filter((entry) => entry?.orderCommitSnapshotId === orderCommit.id);
  const currentIds = currentEntries.map((entry) => entry.id).sort();
  const landedIds = [...(landedCost.costEntryIds ?? [])].sort();
  invariant(canonicalJson(currentIds) === canonicalJson(landedIds), 'COST_CLOSE_READINESS_STALE_LANDED_COST', 'Landed cost snapshot does not represent the current order cost ledger', {
    landedCostSnapshotId: landedCost.id,
    currentCostEntryIds: currentIds,
    landedCostEntryIds: landedIds,
  });

  invariant(Array.isArray(requirements) && requirements.length === REQUIREMENT_ORDER.length, 'COST_CLOSE_READINESS_REQUIREMENTS_INCOMPLETE', 'Cost close readiness requires factory, freight, duty and credits reconciliation');
  const byType = new Map();
  for (const requirement of requirements) {
    invariant(REQUIREMENT_ORDER.includes(requirement?.type), 'COST_CLOSE_READINESS_REQUIREMENT_TYPE_INVALID', 'Cost close readiness requirement type is invalid', { type: requirement?.type });
    invariant(!byType.has(requirement.type), 'COST_CLOSE_READINESS_REQUIREMENT_DUPLICATE', 'Cost close readiness requirement type must be unique', { type: requirement.type });
    byType.set(requirement.type, requirement);
  }
  invariant(REQUIREMENT_ORDER.every((type) => byType.has(type)), 'COST_CLOSE_READINESS_REQUIREMENTS_INCOMPLETE', 'Cost close readiness requires factory, freight, duty and credits reconciliation');

  const entriesById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  const reversedEntryIds = new Set(currentEntries.filter((entry) => entry?.entryKind === 'reversal' && entry.reversalOfEntryId).map((entry) => entry.reversalOfEntryId));
  const normalizedRequirements = REQUIREMENT_ORDER.map((type) => normalizeRequirement({
    requirement: byType.get(type),
    type,
    entriesById,
    reversedEntryIds,
    landedIds: new Set(landedIds),
    orderCommit,
  }));
  const blockingReasons = normalizedRequirements.filter((requirement) => requirement.status === 'pending').map((requirement) => requirement.type);
  const status = deriveReadinessStatus(normalizedRequirements);
  const timestamp = requiredTimestamp(evaluatedAt, 'COST_CLOSE_READINESS_EVALUATED_AT_INVALID');
  invariant(Date.parse(timestamp) >= Date.parse(landedCost.createdAt) && Date.parse(timestamp) >= Date.parse(marginActualization.createdAt), 'COST_CLOSE_READINESS_TIMESTAMP_INVALID', 'Readiness evaluation cannot predate its landed cost or margin basis');

  const basis = Object.freeze({
    orderId: orderCommit.orderId,
    orderVersion: orderCommit.orderVersion,
    orderCommitSnapshotId: orderCommit.id,
    brandId: orderCommit.brandId,
    shopId: orderCommit.shopId,
    landedCostSnapshotId: landedCost.id,
    marginActualizationSnapshotId: marginActualization.id,
    currency: orderCommit.currency,
    status,
    requirements: Object.freeze(normalizedRequirements),
    blockingReasons: Object.freeze(blockingReasons),
    evaluatedAt: timestamp,
  });
  return Object.freeze({ id, ...basis, contentHash: hashBasis(basis) });
}

export function createReadinessBoundCostCloseSnapshot({
  id,
  order,
  orderCommit,
  landedCost,
  marginActualization,
  readiness,
  closedAt,
}) {
  invariant(readiness?.id, 'COST_CLOSE_READINESS_REQUIRED', 'Cost close requires an immutable readiness snapshot');
  invariant(readiness.status === 'READY_TO_CLOSE', 'COST_CLOSE_NOT_READY', 'Cost close readiness is not READY_TO_CLOSE', { readinessSnapshotId: readiness.id, status: readiness.status, blockingReasons: readiness.blockingReasons });
  invariant(readiness.orderId === orderCommit?.orderId && readiness.orderCommitSnapshotId === orderCommit?.id, 'COST_CLOSE_READINESS_COMMIT_MISMATCH', 'Readiness belongs to another order commit');
  invariant(readiness.landedCostSnapshotId === landedCost?.id && readiness.marginActualizationSnapshotId === marginActualization?.id, 'COST_CLOSE_READINESS_BASIS_MISMATCH', 'Readiness does not reference the supplied landed cost and margin snapshots');
  const base = createCostCloseSnapshot({ id, order, orderCommit, landedCost, marginActualization, closedAt });
  invariant(Date.parse(base.closedAt) >= Date.parse(readiness.evaluatedAt), 'COST_CLOSE_READINESS_TIMESTAMP_INVALID', 'Cost close cannot predate its readiness evaluation');
  const basis = Object.freeze({
    orderId: base.orderId,
    orderVersion: base.orderVersion,
    orderCommitSnapshotId: base.orderCommitSnapshotId,
    brandId: base.brandId,
    shopId: base.shopId,
    landedCostSnapshotId: base.landedCostSnapshotId,
    marginActualizationSnapshotId: base.marginActualizationSnapshotId,
    costCloseReadinessSnapshotId: readiness.id,
    readinessContentHash: readiness.contentHash,
    costEntryIds: base.costEntryIds,
    supplyCommitmentSnapshotIds: base.supplyCommitmentSnapshotIds,
    currency: base.currency,
    totalLandedCost: base.totalLandedCost,
    netRevenue: base.netRevenue,
    contributionMarginAmount: base.contributionMarginAmount,
    contributionMarginPercent: base.contributionMarginPercent,
    closedAt: base.closedAt,
  });
  return Object.freeze({ id: base.id, ...basis, status: 'closed', contentHash: hashBasis(basis) });
}

function normalizeRequirement({ requirement, type, entriesById, reversedEntryIds, landedIds, orderCommit }) {
  invariant(REQUIREMENT_STATUSES.includes(requirement?.status), 'COST_CLOSE_READINESS_REQUIREMENT_STATUS_INVALID', 'Cost close readiness requirement status is invalid', { type, status: requirement?.status });
  const evidenceEntryIds = requirement.evidenceEntryIds ?? [];
  invariant(Array.isArray(evidenceEntryIds), 'COST_CLOSE_READINESS_EVIDENCE_INVALID', 'Readiness evidenceEntryIds must be an array', { type });
  invariant(new Set(evidenceEntryIds).size === evidenceEntryIds.length, 'COST_CLOSE_READINESS_EVIDENCE_DUPLICATE', 'Readiness evidence cannot contain duplicate cost entries', { type });
  const waiverReason = requirement.waiverReason === null || requirement.waiverReason === undefined ? null : String(requirement.waiverReason).trim();

  if (requirement.status === 'pending') {
    invariant(evidenceEntryIds.length === 0 && !waiverReason, 'COST_CLOSE_READINESS_PENDING_HAS_EVIDENCE', 'Pending readiness requirement cannot carry evidence or waiver reason', { type });
  }
  if (requirement.status === 'waived') {
    invariant(waiverReason && waiverReason.length <= 1000, 'COST_CLOSE_READINESS_WAIVER_REASON_REQUIRED', 'Waived readiness requirement requires a reason of at most 1000 characters', { type });
    invariant(evidenceEntryIds.length === 0, 'COST_CLOSE_READINESS_WAIVER_HAS_EVIDENCE', 'Waived readiness requirement cannot carry cost evidence', { type });
  }
  if (requirement.status === 'complete') {
    invariant(evidenceEntryIds.length > 0, 'COST_CLOSE_READINESS_EVIDENCE_REQUIRED', 'Completed readiness requirement requires evidence', { type });
    for (const entryId of evidenceEntryIds) {
      invariant(typeof entryId === 'string' && entryId.length > 0 && landedIds.has(entryId), 'COST_CLOSE_READINESS_EVIDENCE_OUTSIDE_LANDED_COST', 'Readiness evidence must belong to the exact landed cost snapshot', { type, entryId, landedCostEntryIds: [...landedIds] });
      const entry = entriesById.get(entryId);
      invariant(entry && entry.orderCommitSnapshotId === orderCommit.id && (entry.entryKind ?? 'actual') === 'actual', 'COST_CLOSE_READINESS_EVIDENCE_INVALID', 'Readiness evidence must be an actual cost entry from the same order commit', { type, entryId });
      invariant(!reversedEntryIds.has(entryId), 'COST_CLOSE_READINESS_EVIDENCE_REVERSED', 'Readiness evidence cannot reference an actual cost that has been reversed', { type, entryId });
      assertEvidenceMatchesRequirement(type, entry);
    }
  }

  return Object.freeze({
    type,
    status: requirement.status,
    evidenceEntryIds: Object.freeze([...evidenceEntryIds].sort()),
    waiverReason: requirement.status === 'waived' ? waiverReason : null,
  });
}

function assertEvidenceMatchesRequirement(type, entry) {
  if (type === 'credits') {
    invariant(entry.amount < 0, 'COST_CLOSE_READINESS_CREDIT_EVIDENCE_INVALID', 'Credits readiness evidence must be a negative actual-cost entry', { entryId: entry.id, amount: entry.amount });
    return;
  }
  invariant(EVIDENCE_COST_TYPES[type].includes(entry.costType), 'COST_CLOSE_READINESS_EVIDENCE_TYPE_MISMATCH', 'Readiness evidence cost type does not match its requirement', { requirementType: type, entryId: entry.id, costType: entry.costType });
}

function deriveReadinessStatus(requirements) {
  const pending = new Set(requirements.filter((requirement) => requirement.status === 'pending').map((requirement) => requirement.type));
  if (pending.has('factory')) return 'OPEN';
  if (pending.has('freight')) return 'WAITING_FOR_FREIGHT';
  if (pending.has('duty')) return 'WAITING_FOR_DUTY';
  if (pending.has('credits')) return 'WAITING_FOR_CREDITS';
  return 'READY_TO_CLOSE';
}

function assertExecutionBasis(order, orderCommit) {
  invariant(order?.id && order.status === 'attached', 'ORDER_NOT_COMMITTED_FOR_EXECUTION', 'Cost close readiness requires an attached wholesale order', { orderId: order?.id, status: order?.status });
  invariant(order.orderCommitSnapshotId === orderCommit?.id && orderCommit?.status === 'committed' && orderCommit.orderId === order.id, 'ORDER_COMMIT_SNAPSHOT_MISMATCH_FOR_EXECUTION', 'Cost close readiness requires the exact immutable order commit snapshot');
  invariant(orderCommit.orderVersion === order.version && orderCommit.brandId === order.brandId && orderCommit.shopId === order.shopId && orderCommit.currency === order.currency, 'ORDER_COMMIT_TRADE_MISMATCH_FOR_EXECUTION', 'Order and immutable commit differ on execution identity');
}

function assertEconomicsBasis(landedCost, margin, orderCommit) {
  invariant(landedCost?.id, 'COST_CLOSE_READINESS_LANDED_COST_REQUIRED', 'Landed cost snapshot is required');
  invariant(landedCost.orderId === orderCommit.orderId && landedCost.orderCommitSnapshotId === orderCommit.id && landedCost.currency === orderCommit.currency, 'COST_CLOSE_READINESS_LANDED_COST_MISMATCH', 'Landed cost belongs to another order commit');
  invariant(margin?.id && margin.orderId === orderCommit.orderId && margin.orderCommitSnapshotId === orderCommit.id, 'COST_CLOSE_READINESS_MARGIN_MISMATCH', 'Margin actualization belongs to another order commit');
  invariant(margin.landedCostSnapshotId === landedCost.id && margin.currency === orderCommit.currency && margin.landedCost === landedCost.totalCost, 'COST_CLOSE_READINESS_MARGIN_BASIS_MISMATCH', 'Margin actualization does not match the exact landed cost basis');
}

function requiredTimestamp(value, code) {
  const parsed = Date.parse(value);
  invariant(typeof value === 'string' && Number.isFinite(parsed), code, 'Timestamp must be a valid ISO date-time');
  return new Date(parsed).toISOString();
}
function hashBasis(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
