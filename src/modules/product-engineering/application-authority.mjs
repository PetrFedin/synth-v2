import crypto from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

/** @param {any} options */
export function createCanonicalApplicationIntent({
  id,
  proposal,
  actorId,
  applicationCommandId,
  canonicalCommandId,
  expectedProposalVersion,
  expectedCanonicalVersion,
  canonicalBefore,
  lineage = {},
  preparedAt,
} = {}) {
  invariant(proposal?.id && proposal?.analysisRunId && proposal?.targetAuthority && proposal?.targetField, 'PRODUCT_ENGINEERING_APPLICATION_PROPOSAL_REQUIRED', 'Canonical application intent requires an engineering proposal');
  invariant(proposal.status === 'accepted', 'PRODUCT_ENGINEERING_PROPOSAL_NOT_ACCEPTED', 'Only an accepted proposal can create a canonical application intent');
  invariant(proposal.version === expectedProposalVersion, 'PRODUCT_ENGINEERING_PROPOSAL_CONCURRENCY_CONFLICT', 'Engineering proposal changed before application intent was prepared', { proposalId: proposal.id, expectedProposalVersion, actualVersion: proposal.version });
  invariant(typeof proposal.targetEntityId === 'string' && proposal.targetEntityId, 'PRODUCT_ENGINEERING_APPLY_TARGET_REQUIRED', 'Canonical application requires an explicit target entity');
  invariant(canonicalBefore && typeof canonicalBefore === 'object' && !Array.isArray(canonicalBefore), 'PRODUCT_ENGINEERING_CANONICAL_PRECONDITION_REQUIRED', 'Exact canonical precondition snapshot is required');
  invariant(Number.isInteger(canonicalBefore.version) && canonicalBefore.version === expectedCanonicalVersion, 'PRODUCT_ENGINEERING_CANONICAL_CONCURRENCY_CONFLICT', 'Canonical target changed before application intent was prepared', { proposalId: proposal.id, expectedCanonicalVersion, actualVersion: canonicalBefore.version });
  const preconditionSnapshot = deepFreeze(structuredClone(canonicalBefore));
  const deterministicDiff = buildDeterministicDiff(preconditionSnapshot, proposal.proposedValue);
  const normalizedLineage = normalizeLineage(proposal, lineage);
  const intent = {
    id: required(id),
    proposalId: proposal.id,
    analysisRunId: proposal.analysisRunId,
    findingId: proposal.findingId ?? null,
    brandId: proposal.brandId,
    styleId: proposal.styleId,
    actorId: required(actorId),
    applicationCommandId: required(applicationCommandId),
    canonicalCommandId: required(canonicalCommandId),
    targetAuthority: proposal.targetAuthority,
    targetEntityId: proposal.targetEntityId,
    targetAction: proposal.targetField,
    expectedProposalVersion,
    expectedCanonicalVersion,
    preconditionSnapshot,
    preconditionHash: sha(preconditionSnapshot),
    deterministicDiff,
    lineage: normalizedLineage,
    preparedAt: timestamp(preparedAt),
  };
  return deepFreeze({ ...intent, intentHash: sha(intent) });
}

/** @param {any} options */
export function createCanonicalApplicationReceipt({ id, intent, canonicalResult, appliedAt } = {}) {
  invariant(intent?.id && intent?.intentHash, 'PRODUCT_ENGINEERING_APPLICATION_INTENT_REQUIRED', 'Canonical application receipt requires a prepared intent');
  invariant(canonicalResult && typeof canonicalResult === 'object' && !Array.isArray(canonicalResult), 'PRODUCT_ENGINEERING_CANONICAL_RESULT_REQUIRED', 'Canonical application receipt requires a canonical command result');
  invariant(Number.isInteger(canonicalResult.version) && canonicalResult.version >= 1, 'PRODUCT_ENGINEERING_CANONICAL_RESULT_VERSION_REQUIRED', 'Canonical command result must expose its resulting version');
  invariant(canonicalResult.version > intent.expectedCanonicalVersion, 'PRODUCT_ENGINEERING_CANONICAL_RESULT_VERSION_INVALID', 'Canonical command result must advance the expected canonical version', { expectedCanonicalVersion: intent.expectedCanonicalVersion, resultingCanonicalVersion: canonicalResult.version });
  const resultSnapshot = deepFreeze(structuredClone(canonicalResult));
  const receipt = {
    id: required(id),
    intentId: intent.id,
    intentHash: intent.intentHash,
    proposalId: intent.proposalId,
    analysisRunId: intent.analysisRunId,
    findingId: intent.findingId,
    brandId: intent.brandId,
    styleId: intent.styleId,
    actorId: intent.actorId,
    applicationCommandId: intent.applicationCommandId,
    canonicalCommandId: intent.canonicalCommandId,
    targetAuthority: intent.targetAuthority,
    targetEntityId: intent.targetEntityId,
    targetAction: intent.targetAction,
    expectedProposalVersion: intent.expectedProposalVersion,
    expectedCanonicalVersion: intent.expectedCanonicalVersion,
    resultingCanonicalVersion: canonicalResult.version,
    preconditionHash: intent.preconditionHash,
    deterministicDiff: intent.deterministicDiff,
    lineage: intent.lineage,
    resultSnapshot,
    resultHash: sha(resultSnapshot),
    appliedAt: timestamp(appliedAt),
  };
  return deepFreeze({ ...receipt, receiptHash: sha(receipt) });
}

/** @param {any} proposal @param {any} workspace */
export function applicationLineage(proposal, workspace = null) {
  const evidence = Array.isArray(workspace?.evidence)
    ? workspace.evidence.filter((row) => proposal?.findingId ? row.findingId === proposal.findingId : true)
    : [];
  const sourceIds = [...new Set(evidence.map((row) => row.sourceId).filter(Boolean))].sort();
  const evidenceIds = evidence.map((row) => row.id).filter(Boolean).sort();
  const modelRunIds = Array.isArray(workspace?.modelRuns) ? workspace.modelRuns.map((row) => row.id).filter(Boolean).sort() : [];
  return normalizeLineage(proposal, { evidenceIds, sourceIds, modelRunIds });
}

/** @param {any} before @param {any} proposedValue */
export function buildDeterministicDiff(before, proposedValue) {
  invariant(proposedValue && typeof proposedValue === 'object' && !Array.isArray(proposedValue), 'PRODUCT_ENGINEERING_APPLY_VALUE_INVALID', 'Canonical apply proposal value must be an object');
  const rows = [];
  for (const field of Object.keys(proposedValue).sort()) {
    invariant(field !== 'expectedVersion', 'PRODUCT_ENGINEERING_APPLY_VALUE_INVALID', 'Proposal value cannot supply canonical expectedVersion');
    const beforePresent = Object.hasOwn(before, field);
    const previous = beforePresent ? before[field] : null;
    const next = proposedValue[field];
    rows.push(Object.freeze({
      field,
      beforePresent,
      before: deepFreeze(structuredClone(previous)),
      after: deepFreeze(structuredClone(next)),
      changed: canonicalJson(previous) !== canonicalJson(next),
    }));
  }
  return Object.freeze(rows);
}

/** @param {any} proposal @param {any} lineage */
function normalizeLineage(proposal, lineage = {}) {
  const list = (value) => Object.freeze([...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item))].sort());
  return deepFreeze({
    analysisRunId: proposal?.analysisRunId ?? lineage.analysisRunId ?? null,
    findingId: proposal?.findingId ?? lineage.findingId ?? null,
    evidenceIds: list(lineage.evidenceIds),
    sourceIds: list(lineage.sourceIds),
    modelRunIds: list(lineage.modelRunIds),
  });
}

/** @param {any} value */
function required(value) {
  invariant(typeof value === 'string' && value.trim(), 'PRODUCT_ENGINEERING_APPLICATION_ID_INVALID', 'Canonical application identifier is required');
  return value;
}
/** @param {any} value */
function timestamp(value) {
  const date = new Date(value);
  invariant(Number.isFinite(date.getTime()), 'PRODUCT_ENGINEERING_APPLICATION_TIME_INVALID', 'Canonical application timestamp is invalid');
  return date.toISOString();
}
/** @param {any} value */
function sha(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
/** @param {any} value */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
