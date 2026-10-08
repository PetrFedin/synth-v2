import crypto from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';
import { PRODUCT_ENGINEERING_IMPACT_POLICY } from './proposal-impact.mjs';

/** @param {any} options */
export function createEngineeringSourceRevision({
  id,
  superseded,
  replacement,
  reason,
  createdAt,
  createdBy,
} = {}) {
  invariant(superseded?.id && replacement?.id, 'PRODUCT_ENGINEERING_SOURCE_REVISION_SOURCES_REQUIRED', 'Source revision requires exact superseded and replacement sources');
  invariant(superseded.id !== replacement.id, 'PRODUCT_ENGINEERING_SOURCE_REVISION_SELF', 'A source cannot supersede itself');
  invariant(superseded.brandId === replacement.brandId && superseded.styleId === replacement.styleId, 'PRODUCT_ENGINEERING_SOURCE_REVISION_SCOPE_MISMATCH', 'Source revision must remain inside the same brand/style');
  invariant(superseded.status === 'admitted' && replacement.status === 'admitted', 'PRODUCT_ENGINEERING_SOURCE_REVISION_NOT_ADMITTED', 'Both source versions must be admitted before revision');
  invariant(sourceReady(superseded) && sourceReady(replacement), 'PRODUCT_ENGINEERING_SOURCE_REVISION_NOT_PARSED', 'Both source versions must have completed governed parsing before revision');
  invariant(typeof superseded.contentHash === 'string' && /^[0-9a-f]{64}$/.test(superseded.contentHash), 'PRODUCT_ENGINEERING_SOURCE_REVISION_HASH_REQUIRED', 'Superseded source requires exact SHA-256');
  invariant(typeof replacement.contentHash === 'string' && /^[0-9a-f]{64}$/.test(replacement.contentHash), 'PRODUCT_ENGINEERING_SOURCE_REVISION_HASH_REQUIRED', 'Replacement source requires exact SHA-256');
  invariant(superseded.contentHash !== replacement.contentHash, 'PRODUCT_ENGINEERING_SOURCE_REVISION_IDENTICAL', 'Replacement source must contain different governed bytes');
  const normalizedReason = text(reason, 2000, 'PRODUCT_ENGINEERING_SOURCE_REVISION_REASON_REQUIRED');
  return deepFreeze({
    id: required(id),
    brandId: superseded.brandId,
    styleId: superseded.styleId,
    supersededSourceId: superseded.id,
    replacementSourceId: replacement.id,
    supersededContentHash: superseded.contentHash,
    replacementContentHash: replacement.contentHash,
    reason: normalizedReason,
    createdAt: timestamp(createdAt),
    createdBy: required(createdBy),
  });
}

/** @param {any} options */
export function evaluateSourceRevisionImpact({ revision, lineage } = {}) {
  invariant(revision?.id && revision?.supersededSourceId && revision?.replacementSourceId, 'PRODUCT_ENGINEERING_SOURCE_REVISION_REQUIRED', 'Source revision is required for change impact');
  const exact = normalizeLineage(lineage);
  const impacts = [];

  for (const row of exact.analyses) impacts.push(observed('analysis', row.id, versionText(row.version), 'analysis', 're-run', 'high', { analysisRunId: row.id }));
  for (const row of exact.evidence) impacts.push(observed('evidence', row.id, null, 'evidence', 'revalidate', 'high', { evidenceId: row.id, findingId: row.findingId ?? null }));
  for (const row of exact.findings) impacts.push(observed('finding', row.id, row.contentHash ?? null, 'finding', 're-review', 'high', { findingId: row.id, supersededById: row.supersededById ?? null }));
  for (const row of exact.proposals) impacts.push(observed('proposal', row.id, versionText(row.version), 'proposal', 're-review', row.status === 'accepted' ? 'high' : 'medium', {
    proposalId: row.id,
    status: row.status,
    targetAuthority: row.targetAuthority ?? null,
    targetField: row.targetField ?? null,
    targetEntityId: row.targetEntityId ?? null,
  }));
  for (const row of exact.garmentNodes) impacts.push(observed('garment_node', row.id, null, 'garment_graph', 're-review', 'high', {
    graphId: row.graphId,
    nodeType: row.nodeType,
    findingId: row.findingId ?? null,
  }));
  for (const row of exact.technicalFlats) impacts.push(observed('technical_flat', row.id, versionText(row.drawingVersionNo), 'technical_flat', 'revision', 'high', {
    drawingId: row.drawingId,
    drawingVersionNo: row.drawingVersionNo,
    objectType: row.objectType,
    garmentNodeId: row.garmentNodeId,
  }));

  for (const receipt of exact.receipts) {
    impacts.push(observed('canonical_target', receipt.targetEntityId, versionText(receipt.resultingCanonicalVersion), receipt.targetAuthority, 're-review', 'high', {
      receiptId: receipt.id,
      receiptHash: receipt.receiptHash,
      proposalId: receipt.proposalId,
      targetAction: receipt.targetAction,
    }));
    const rules = PRODUCT_ENGINEERING_IMPACT_POLICY[receipt.targetAuthority]?.[receipt.targetAction] ?? [];
    for (const rule of rules) {
      impacts.push(policyRequired(receipt.targetEntityId, versionText(receipt.resultingCanonicalVersion), rule.area, rule.action, rule.severity, {
        receiptId: receipt.id,
        receiptHash: receipt.receiptHash,
        proposalId: receipt.proposalId,
        canonicalAuthority: receipt.targetAuthority,
        canonicalAction: receipt.targetAction,
      }));
    }
  }

  const deduped = dedupeImpacts(impacts);
  const snapshot = {
    sourceRevisionId: revision.id,
    brandId: revision.brandId,
    styleId: revision.styleId,
    supersededSourceId: revision.supersededSourceId,
    replacementSourceId: revision.replacementSourceId,
    supersededContentHash: revision.supersededContentHash,
    replacementContentHash: revision.replacementContentHash,
    exactDependencyCounts: {
      analyses: exact.analyses.length,
      evidence: exact.evidence.length,
      findings: exact.findings.length,
      proposals: exact.proposals.length,
      garmentNodes: exact.garmentNodes.length,
      technicalFlats: exact.technicalFlats.length,
      canonicalReceipts: exact.receipts.length,
    },
    impacts: deduped,
  };
  return deepFreeze({ snapshot, impactHash: sha(snapshot), impacts: deduped });
}

/** @param {any} options */
export function createEngineeringChangeCase({ id, revision, evaluation, createdAt, createdBy } = {}) {
  invariant(evaluation?.snapshot && evaluation?.impactHash && Array.isArray(evaluation.impacts), 'PRODUCT_ENGINEERING_CHANGE_EVALUATION_REQUIRED', 'Deterministic change impact evaluation is required');
  return deepFreeze({
    id: required(id),
    sourceRevisionId: revision.id,
    brandId: revision.brandId,
    styleId: revision.styleId,
    status: 'open',
    impactSnapshot: evaluation.snapshot,
    impactHash: evaluation.impactHash,
    createdAt: timestamp(createdAt),
    createdBy: required(createdBy),
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgementNote: null,
    resolvedAt: null,
    resolvedBy: null,
    version: 1,
  });
}

/** @param {any} changeCase @param {any} options */
export function acknowledgeEngineeringChangeCase(changeCase, { note, acknowledgedAt, acknowledgedBy } = {}) {
  invariant(changeCase?.status === 'open', 'PRODUCT_ENGINEERING_CHANGE_CASE_NOT_OPEN', 'Only an open change case can be acknowledged');
  return deepFreeze({
    ...changeCase,
    status: 'acknowledged',
    acknowledgedAt: timestamp(acknowledgedAt),
    acknowledgedBy: required(acknowledgedBy),
    acknowledgementNote: text(note, 4000, 'PRODUCT_ENGINEERING_CHANGE_ACK_NOTE_REQUIRED'),
    version: changeCase.version + 1,
  });
}

/** @param {any} options */
export function createEngineeringChangeImpactReceipt({ id, impact, disposition, reason, evidence, resultReference = null, verification = null, waiver = null, createdAt, createdBy } = {}) {
  invariant(impact?.id && impact?.changeCaseId, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_REQUIRED', 'Exact change impact is required');
  invariant(impact.status === 'pending', 'PRODUCT_ENGINEERING_CHANGE_IMPACT_NOT_PENDING', 'Only a pending change impact can be closed', { impactId: impact.id, status: impact.status });
  invariant(['resolved','waived'].includes(disposition), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_DISPOSITION_INVALID', 'Change impact disposition must be resolved or waived');
  invariant(Array.isArray(evidence) && evidence.length >= 1, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_EVIDENCE_REQUIRED', 'Closing a change impact requires explicit evidence');
  const normalizedEvidence = deepFreeze(structuredClone(evidence));
  const normalizedReason = text(reason, 4000, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_REASON_REQUIRED');
  let normalizedResult = null;
  let normalizedVerification = null;
  let normalizedWaiver = null;
  if (disposition === 'resolved') {
    invariant(waiver === null || waiver === undefined, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_INVALID', 'Resolved impact cannot contain waiver policy');
    if (impact.evidenceStatus === 'policy_required') {
      invariant(resultReference && typeof resultReference === 'object' && !Array.isArray(resultReference), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_REQUIRED', 'Resolving a policy-required impact requires the resulting canonical reference');
      invariant(verification && typeof verification === 'object' && !Array.isArray(verification), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_UNVERIFIED', 'Policy-required resolution requires independent canonical result verification');
    }
    if (resultReference !== null && resultReference !== undefined) {
      invariant(resultReference && typeof resultReference === 'object' && !Array.isArray(resultReference), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID', 'Result reference must be an object');
      invariant(typeof resultReference.authority === 'string' && resultReference.authority.trim(), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID', 'Result reference authority is required');
      invariant(typeof resultReference.entityId === 'string' && resultReference.entityId.trim(), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID', 'Result reference entity id is required');
      invariant(resultReference.version !== undefined || resultReference.contentHash !== undefined, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_INVALID', 'Result reference requires a resulting version or content hash');
      normalizedResult = deepFreeze(structuredClone(resultReference));
      invariant(verification && verification.authority === normalizedResult.authority && verification.requested?.entityId === normalizedResult.entityId, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_UNVERIFIED', 'Result verification does not match the exact canonical reference');
      invariant(typeof verification.verificationHash === 'string' && /^[0-9a-f]{64}$/.test(verification.verificationHash), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_UNVERIFIED', 'Result verification hash is invalid');
      normalizedVerification = deepFreeze(structuredClone(verification));
    } else {
      invariant(verification === null || verification === undefined, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RESULT_UNVERIFIED', 'Verification cannot exist without a result reference');
    }
  } else {
    invariant(resultReference === null || resultReference === undefined, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_RESULT_INVALID', 'Waived impact cannot claim a canonical correction result');
    invariant(verification === null || verification === undefined, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_RESULT_INVALID', 'Waived impact cannot contain canonical correction verification');
    invariant(waiver && typeof waiver === 'object' && !Array.isArray(waiver), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_REQUIRED', 'Waived impact requires an explicit waiver policy');
    invariant(typeof waiver.scope === 'string' && waiver.scope.trim(), 'PRODUCT_ENGINEERING_CHANGE_IMPACT_WAIVER_SCOPE_REQUIRED', 'Waiver scope is required');
    normalizedWaiver = deepFreeze({
      scope: waiver.scope.trim(),
      expiresAt: waiver.expiresAt === null || waiver.expiresAt === undefined ? null : timestamp(waiver.expiresAt),
      reviewAt: waiver.reviewAt === null || waiver.reviewAt === undefined ? null : timestamp(waiver.reviewAt),
    });
  }
  const body = {
    id: required(id),
    changeCaseId: impact.changeCaseId,
    impactId: impact.id,
    disposition,
    previousImpactVersion: impact.version,
    resultingImpactVersion: impact.version + 1,
    reason: normalizedReason,
    evidence: normalizedEvidence,
    resultReference: normalizedResult,
    resultVerification: normalizedVerification,
    waiver: normalizedWaiver,
    createdAt: timestamp(createdAt),
    createdBy: required(createdBy),
  };
  return deepFreeze({ ...body, receiptHash: sha(body) });
}

/** @param {any} impact @param {any} receipt */
export function closeEngineeringChangeImpact(impact, receipt) {
  invariant(receipt?.impactId === impact?.id && receipt?.changeCaseId === impact?.changeCaseId, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_RECEIPT_MISMATCH', 'Resolution receipt does not match the exact change impact');
  invariant(impact.status === 'pending' && receipt.previousImpactVersion === impact.version, 'PRODUCT_ENGINEERING_CHANGE_IMPACT_CONCURRENCY_CONFLICT', 'Change impact changed before resolution');
  return deepFreeze({ ...impact, status: receipt.disposition === 'waived' ? 'waived' : 'resolved', version: receipt.resultingImpactVersion });
}

/** @param {any} changeCase @param {any} options */
export function resolveEngineeringChangeCase(changeCase, { resolvedAt, resolvedBy } = {}) {
  invariant(changeCase && ['open','acknowledged'].includes(changeCase.status), 'PRODUCT_ENGINEERING_CHANGE_CASE_NOT_ACTIVE', 'Only an active change case can be resolved');
  return deepFreeze({ ...changeCase, status: 'resolved', resolvedAt: timestamp(resolvedAt), resolvedBy: required(resolvedBy), version: changeCase.version + 1 });
}

/** @param {any} lineage */
function normalizeLineage(lineage = {}) {
  const sort = (rows, key = 'id') => Object.freeze([...(Array.isArray(rows) ? rows : [])].sort((a, b) => String(a?.[key] ?? '').localeCompare(String(b?.[key] ?? ''))));
  return deepFreeze({
    analyses: sort(lineage.analyses),
    evidence: sort(lineage.evidence),
    findings: sort(lineage.findings),
    proposals: sort(lineage.proposals),
    garmentNodes: sort(lineage.garmentNodes),
    technicalFlats: sort(lineage.technicalFlats),
    receipts: sort(lineage.receipts),
  });
}

/** @param {string} kind @param {string} entityId @param {string|null} entityVersion @param {string} area @param {string} action @param {string} severity @param {any} basis */
function observed(kind, entityId, entityVersion, area, action, severity, basis) {
  return deepFreeze({ impactKind: kind, entityId, entityVersion, area, requiredAction: action, severity, evidenceStatus: 'observed', basis });
}

/** @param {string} entityId @param {string|null} entityVersion @param {string} area @param {string} action @param {string} severity @param {any} basis */
function policyRequired(entityId, entityVersion, area, action, severity, basis) {
  return deepFreeze({ impactKind: 'downstream_policy', entityId, entityVersion, area, requiredAction: action, severity, evidenceStatus: 'policy_required', basis });
}

/** @param {any[]} rows */
function dedupeImpacts(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = [row.impactKind, row.entityId, row.entityVersion ?? '', row.area, row.requiredAction].join('|');
    const existing = byKey.get(key);
    if (!existing || severityRank(row.severity) > severityRank(existing.severity)) byKey.set(key, row);
  }
  return Object.freeze([...byKey.values()].sort((a, b) => {
    const severity = severityRank(b.severity) - severityRank(a.severity);
    if (severity) return severity;
    return [a.impactKind, a.area, a.entityId, a.requiredAction].join('|').localeCompare([b.impactKind, b.area, b.entityId, b.requiredAction].join('|'));
  }));
}

function severityRank(value) {
  return value === 'blocking' ? 3 : value === 'high' ? 2 : 1;
}
function sourceReady(value) {
  return value.parseStatus === 'completed' || value.parseStatus === 'not_required';
}
/** @param {any} value */
function required(value) {
  invariant(typeof value === 'string' && value.trim(), 'PRODUCT_ENGINEERING_CHANGE_ID_INVALID', 'Change impact identifier is required');
  return value;
}
/** @param {any} value @param {number} max @param {string} code */
function text(value, max, code) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= max, code, 'Required change-impact text is invalid');
  return value.trim();
}
/** @param {any} value */
function timestamp(value) {
  const date = new Date(value);
  invariant(Number.isFinite(date.getTime()), 'PRODUCT_ENGINEERING_CHANGE_TIME_INVALID', 'Change impact timestamp is invalid');
  return date.toISOString();
}
/** @param {any} value */
function versionText(value) {
  return value === null || value === undefined ? null : String(value);
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
