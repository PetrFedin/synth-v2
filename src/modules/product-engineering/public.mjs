import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';
import { canonicalJson } from '../../core/fingerprints.mjs';

export const ENGINEERING_PURPOSES = Object.freeze([
  'garment_interpretation','document_ingestion','measurement_assist','bom_assist',
  'construction_assist','technical_flat','sample_review','conflict_review',
]);
export const ANALYSIS_STATUSES = Object.freeze(['queued','running','completed','failed','cancelled']);
export const FINDING_ORIGINS = Object.freeze(['observed','ai_inferred','document_extracted','rule_derived','unknown']);
export const PROPOSAL_AUTHORITIES = Object.freeze([
  'product_identity','measurement','bom','construction','tech_pack','sample',
  'material','colour','operation_sequence',
]);
export const PROPOSAL_STATUSES = Object.freeze(['pending','accepted','rejected','superseded']);
export const CONFLICT_SEVERITIES = Object.freeze(['info','warning','blocking']);
export const DRAWING_VIEWS = Object.freeze(['front','back','left','right','inside','detail']);
export const DRAWING_OBJECT_TYPES = Object.freeze([
  'outline','panel','seam','stitch','pocket','closure','collar','cuff','trim',
  'measurement_anchor','construction_callout','dart','pleat','hem','grainline',
  'foldline','notch','button','buttonhole','zipper','annotation',
]);

const CODE = /^[a-z][a-z0-9_.-]{1,159}$/;
const FINDING = /^[a-z][a-z0-9_.-]{2,127}$/;
const SEMANTIC = /^[A-Z0-9][A-Z0-9._/-]{0,79}$/;
const HASH = /^[0-9a-f]{64}$/;

export function createAnalysisRun({ id, style, styleVersionId = null, purpose, inputManifest, requestedAt, requestedBy }) {
  requireId(id, 'PRODUCT_ENGINEERING_ANALYSIS_ID_REQUIRED');
  invariant(style?.id && style?.brandId, 'PRODUCT_ENGINEERING_STYLE_REQUIRED', 'Product Style is required');
  invariant(ENGINEERING_PURPOSES.includes(purpose), 'PRODUCT_ENGINEERING_PURPOSE_INVALID', 'Engineering analysis purpose is invalid', { purpose });
  requireObject(inputManifest, 'PRODUCT_ENGINEERING_INPUT_MANIFEST_INVALID', 'Input manifest must be an object');
  const at = timestamp(requestedAt, 'PRODUCT_ENGINEERING_TIME_INVALID');
  const manifest = freeze(structuredClone(inputManifest));
  return freeze({
    id,
    brandId: style.brandId,
    styleId: style.id,
    styleVersionId: nullableId(styleVersionId),
    purpose,
    status: 'queued',
    inputManifest: manifest,
    inputHash: sha256(manifest),
    requestedAt: at,
    requestedBy: actor(requestedBy),
    startedAt: null,
    completedAt: null,
    failureCode: null,
    failureMessage: null,
    version: 1,
  });
}

export function startAnalysis(run, { startedAt }) {
  invariant(run?.status === 'queued', 'PRODUCT_ENGINEERING_ANALYSIS_NOT_QUEUED', 'Only a queued analysis can start');
  const at = timestamp(startedAt, 'PRODUCT_ENGINEERING_TIME_INVALID');
  invariant(Date.parse(at) >= Date.parse(run.requestedAt), 'PRODUCT_ENGINEERING_TIME_ORDER_INVALID', 'Analysis cannot start before it was requested');
  return freeze({ ...run, status: 'running', startedAt: at, version: run.version + 1 });
}

export function completeAnalysis(run, { completedAt }) {
  invariant(run?.status === 'running', 'PRODUCT_ENGINEERING_ANALYSIS_NOT_RUNNING', 'Only a running analysis can complete');
  const at = timestamp(completedAt, 'PRODUCT_ENGINEERING_TIME_INVALID');
  invariant(Date.parse(at) >= Date.parse(run.startedAt), 'PRODUCT_ENGINEERING_TIME_ORDER_INVALID', 'Analysis cannot complete before it started');
  return freeze({ ...run, status: 'completed', completedAt: at, failureCode: null, failureMessage: null, version: run.version + 1 });
}

export function failAnalysis(run, { failureCode, failureMessage = null, failedAt }) {
  invariant(['queued','running'].includes(run?.status), 'PRODUCT_ENGINEERING_ANALYSIS_NOT_ACTIVE', 'Only an active analysis can fail');
  const at = timestamp(failedAt, 'PRODUCT_ENGINEERING_TIME_INVALID');
  return freeze({
    ...run,
    status: 'failed',
    completedAt: at,
    failureCode: shortCode(failureCode, 'PRODUCT_ENGINEERING_FAILURE_CODE_INVALID'),
    failureMessage: optionalText(failureMessage, 2000, 'PRODUCT_ENGINEERING_FAILURE_MESSAGE_INVALID'),
    version: run.version + 1,
  });
}

export function createModelRun({ id, analysisRun, provider, model, purpose, promptVersion, schemaVersion, inputHash, startedAt, createdBy }) {
  invariant(analysisRun?.id && analysisRun?.brandId && analysisRun?.styleId, 'PRODUCT_ENGINEERING_ANALYSIS_REQUIRED', 'Engineering analysis is required');
  invariant(analysisRun.status === 'running', 'PRODUCT_ENGINEERING_ANALYSIS_NOT_RUNNING', 'Model runs can start only while the analysis is running');
  requireId(id, 'PRODUCT_ENGINEERING_MODEL_RUN_ID_REQUIRED');
  invariant(ENGINEERING_PURPOSES.includes(purpose), 'PRODUCT_ENGINEERING_PURPOSE_INVALID', 'Model run purpose is invalid', { purpose });
  invariant(purpose === analysisRun.purpose || purpose === 'conflict_review', 'PRODUCT_ENGINEERING_MODEL_PURPOSE_MISMATCH', 'Model run purpose must match the analysis purpose or conflict review');
  return freeze({
    id,
    brandId: analysisRun.brandId,
    styleId: analysisRun.styleId,
    analysisRunId: analysisRun.id,
    provider: text(provider, 1, 120, 'PRODUCT_ENGINEERING_PROVIDER_INVALID'),
    model: text(model, 1, 160, 'PRODUCT_ENGINEERING_MODEL_INVALID'),
    purpose,
    promptVersion: text(promptVersion, 1, 80, 'PRODUCT_ENGINEERING_PROMPT_VERSION_INVALID'),
    schemaVersion: text(schemaVersion, 1, 80, 'PRODUCT_ENGINEERING_SCHEMA_VERSION_INVALID'),
    inputHash: hash(inputHash, 'PRODUCT_ENGINEERING_INPUT_HASH_INVALID'),
    outputHash: null,
    status: 'started',
    usage: freeze({}),
    costMinor: null,
    currency: null,
    failureCode: null,
    startedAt: timestamp(startedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    completedAt: null,
    createdBy: actor(createdBy),
  });
}

export function failModelRun(run, { failureCode, completedAt }) {
  invariant(run?.status === 'started', 'PRODUCT_ENGINEERING_MODEL_RUN_NOT_STARTED', 'Only a started model run can fail');
  return freeze({
    ...run,
    status: 'failed',
    failureCode: shortCode(failureCode, 'PRODUCT_ENGINEERING_FAILURE_CODE_INVALID'),
    completedAt: timestamp(completedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
  });
}

export function completeModelRun(run, { outputHash, usage = {}, costMinor = null, currency = null, completedAt }) {
  invariant(run?.status === 'started', 'PRODUCT_ENGINEERING_MODEL_RUN_NOT_STARTED', 'Only a started model run can complete');
  requireObject(usage, 'PRODUCT_ENGINEERING_MODEL_USAGE_INVALID', 'Model usage must be an object');
  const money = costMinor === null ? null : nonNegativeInteger(costMinor, 'PRODUCT_ENGINEERING_MODEL_COST_INVALID');
  invariant((money === null && currency === null) || (money !== null && /^[A-Z]{3}$/.test(currency ?? '')), 'PRODUCT_ENGINEERING_MODEL_CURRENCY_INVALID', 'Model cost currency is invalid');
  return freeze({
    ...run,
    outputHash: hash(outputHash, 'PRODUCT_ENGINEERING_OUTPUT_HASH_INVALID'),
    status: 'completed',
    usage: freeze(structuredClone(usage)),
    costMinor: money,
    currency,
    completedAt: timestamp(completedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
  });
}

export function createFinding({ id, analysisRun, findingType, origin, value, confidence = null, createdAt, createdBy }) {
  invariant(['running','completed'].includes(analysisRun?.status), 'PRODUCT_ENGINEERING_ANALYSIS_FINDING_CLOSED', 'Findings require a running or completed analysis');
  requireId(id, 'PRODUCT_ENGINEERING_FINDING_ID_REQUIRED');
  invariant(FINDING.test(findingType ?? ''), 'PRODUCT_ENGINEERING_FINDING_TYPE_INVALID', 'Finding type is invalid');
  invariant(FINDING_ORIGINS.includes(origin), 'PRODUCT_ENGINEERING_FINDING_ORIGIN_INVALID', 'Finding origin is invalid', { origin });
  assertJson(value, 'PRODUCT_ENGINEERING_FINDING_VALUE_INVALID');
  return freeze({
    id,
    analysisRunId: analysisRun.id,
    brandId: analysisRun.brandId,
    styleId: analysisRun.styleId,
    findingType,
    origin,
    value: freeze(structuredClone(value)),
    confidence: probability(confidence),
    contentHash: sha256({ findingType, origin, value }),
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
    supersededById: null,
  });
}

export function createEvidence({ id, analysisRun, finding, sourceKind, sourceId = null, sourceLocator = {}, sourceHash = null, excerpt = null, createdAt, createdBy }) {
  invariant(finding?.analysisRunId === analysisRun?.id, 'PRODUCT_ENGINEERING_EVIDENCE_LINEAGE_MISMATCH', 'Evidence must belong to the same analysis as its finding');
  const allowed = ['product_media','style_reference','document','spreadsheet','external_uri','manual_observation','sample'];
  invariant(allowed.includes(sourceKind), 'PRODUCT_ENGINEERING_EVIDENCE_SOURCE_INVALID', 'Evidence source kind is invalid', { sourceKind });
  requireObject(sourceLocator, 'PRODUCT_ENGINEERING_EVIDENCE_LOCATOR_INVALID', 'Evidence locator must be an object');
  return freeze({
    id: required(id),
    findingId: finding.id,
    analysisRunId: analysisRun.id,
    brandId: analysisRun.brandId,
    styleId: analysisRun.styleId,
    sourceKind,
    sourceId: nullableId(sourceId),
    sourceLocator: freeze(structuredClone(sourceLocator)),
    sourceHash: sourceHash === null ? null : hash(sourceHash, 'PRODUCT_ENGINEERING_EVIDENCE_HASH_INVALID'),
    excerpt: optionalText(excerpt, 2000, 'PRODUCT_ENGINEERING_EVIDENCE_EXCERPT_INVALID'),
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
  });
}

export function createProposal({ id, analysisRun, finding = null, targetAuthority, targetEntityId = null, targetField, proposedValue, confidence = null, rationale = null, createdAt, createdBy }) {
  invariant(['running','completed'].includes(analysisRun?.status), 'PRODUCT_ENGINEERING_ANALYSIS_PROPOSAL_CLOSED', 'Proposals require a running or completed analysis');
  invariant(finding === null || finding.analysisRunId === analysisRun.id, 'PRODUCT_ENGINEERING_PROPOSAL_LINEAGE_MISMATCH', 'Proposal finding must belong to the same analysis');
  invariant(PROPOSAL_AUTHORITIES.includes(targetAuthority), 'PRODUCT_ENGINEERING_TARGET_AUTHORITY_INVALID', 'Proposal target authority is invalid', { targetAuthority });
  invariant(CODE.test(targetField ?? ''), 'PRODUCT_ENGINEERING_TARGET_FIELD_INVALID', 'Proposal target field is invalid');
  assertJson(proposedValue, 'PRODUCT_ENGINEERING_PROPOSAL_VALUE_INVALID');
  return freeze({
    id: required(id),
    analysisRunId: analysisRun.id,
    findingId: finding?.id ?? null,
    brandId: analysisRun.brandId,
    styleId: analysisRun.styleId,
    targetAuthority,
    targetEntityId: nullableId(targetEntityId),
    targetField,
    proposedValue: freeze(structuredClone(proposedValue)),
    confidence: probability(confidence),
    rationale: optionalText(rationale, 4000, 'PRODUCT_ENGINEERING_RATIONALE_INVALID'),
    status: 'pending',
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
    appliedReference: null,
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
    version: 1,
  });
}

export function resolveProposal(proposal, { decision, note = null, resolvedAt, resolvedBy }) {
  invariant(proposal?.status === 'pending', 'PRODUCT_ENGINEERING_PROPOSAL_NOT_PENDING', 'Only a pending proposal can be resolved');
  invariant(['accepted','rejected'].includes(decision), 'PRODUCT_ENGINEERING_PROPOSAL_DECISION_INVALID', 'Proposal decision is invalid');
  const resolutionNote = optionalText(note, 4000, 'PRODUCT_ENGINEERING_RESOLUTION_NOTE_INVALID');
  invariant(decision !== 'rejected' || resolutionNote, 'PRODUCT_ENGINEERING_REJECTION_REASON_REQUIRED', 'Rejected proposals require a reason');
  return freeze({
    ...proposal,
    status: decision,
    resolutionNote,
    resolvedAt: timestamp(resolvedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    resolvedBy: actor(resolvedBy),
    version: proposal.version + 1,
  });
}

export function markProposalApplied(proposal, { authority, entityId, version = null, action = null, commandId = null, receiptId = null, receiptHash = null, appliedAt }) {
  invariant(proposal?.status === 'accepted', 'PRODUCT_ENGINEERING_PROPOSAL_NOT_ACCEPTED', 'Only an accepted proposal can be marked applied');
  invariant(authority === proposal.targetAuthority, 'PRODUCT_ENGINEERING_APPLIED_AUTHORITY_MISMATCH', 'Applied authority must match the proposal target');
  invariant(action === null || action === proposal.targetField, 'PRODUCT_ENGINEERING_APPLIED_ACTION_MISMATCH', 'Applied action must match the proposal target field');
  invariant(receiptId === null || typeof receiptId === 'string' && receiptId.trim(), 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_INVALID', 'Applied receipt id is invalid');
  invariant(receiptHash === null || typeof receiptHash === 'string' && /^[0-9a-f]{64}$/.test(receiptHash), 'PRODUCT_ENGINEERING_APPLICATION_RECEIPT_INVALID', 'Applied receipt hash is invalid');
  return freeze({
    ...proposal,
    appliedReference: freeze({
      authority,
      entityId: required(entityId),
      version,
      action,
      commandId: commandId === null ? null : required(commandId),
      receiptId,
      receiptHash,
      appliedAt: timestamp(appliedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    }),
    version: proposal.version + 1,
  });
}

export function createConflict({ id, analysisRun, conflictType, subject, candidates, severity, createdAt, createdBy }) {
  invariant(['running','completed'].includes(analysisRun?.status), 'PRODUCT_ENGINEERING_ANALYSIS_CONFLICT_CLOSED', 'Conflicts require a running or completed analysis');
  invariant(FINDING.test(conflictType ?? ''), 'PRODUCT_ENGINEERING_CONFLICT_TYPE_INVALID', 'Conflict type is invalid');
  invariant(Array.isArray(candidates) && candidates.length >= 2, 'PRODUCT_ENGINEERING_CONFLICT_CANDIDATES_INVALID', 'Conflict requires at least two candidates');
  candidates.forEach((candidate) => assertJson(candidate, 'PRODUCT_ENGINEERING_CONFLICT_CANDIDATE_INVALID'));
  invariant(CONFLICT_SEVERITIES.includes(severity), 'PRODUCT_ENGINEERING_CONFLICT_SEVERITY_INVALID', 'Conflict severity is invalid');
  return freeze({
    id: required(id),
    analysisRunId: analysisRun.id,
    brandId: analysisRun.brandId,
    styleId: analysisRun.styleId,
    conflictType,
    subject: text(subject, 1, 240, 'PRODUCT_ENGINEERING_CONFLICT_SUBJECT_INVALID'),
    candidates: freeze(structuredClone(candidates)),
    severity,
    status: 'open',
    resolution: null,
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
    resolvedAt: null,
    resolvedBy: null,
    version: 1,
  });
}

export function resolveConflict(conflict, { disposition, resolution = {}, resolvedAt, resolvedBy }) {
  invariant(conflict?.status === 'open', 'PRODUCT_ENGINEERING_CONFLICT_NOT_OPEN', 'Only an open conflict can be resolved');
  invariant(['resolved','ignored'].includes(disposition), 'PRODUCT_ENGINEERING_CONFLICT_DECISION_INVALID', 'Conflict disposition is invalid');
  requireObject(resolution, 'PRODUCT_ENGINEERING_CONFLICT_RESOLUTION_INVALID', 'Conflict resolution must be an object');
  return freeze({
    ...conflict,
    status: disposition,
    resolution: freeze(structuredClone(resolution)),
    resolvedAt: timestamp(resolvedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    resolvedBy: actor(resolvedBy),
    version: conflict.version + 1,
  });
}

export function createTechnicalDrawing({ id, style, styleVersionId = null, analysisRun = null, viewType, versionNo, sourceDrawingId = null, svg, createdAt, createdBy }) {
  invariant(style?.id && style?.brandId, 'PRODUCT_ENGINEERING_STYLE_REQUIRED', 'Product Style is required');
  invariant(DRAWING_VIEWS.includes(viewType), 'TECHNICAL_DRAWING_VIEW_INVALID', 'Technical drawing view is invalid', { viewType });
  invariant(Number.isInteger(versionNo) && versionNo >= 1, 'TECHNICAL_DRAWING_VERSION_INVALID', 'Technical drawing version must be a positive integer');
  const normalizedSvg = text(svg, 20, 2_000_000, 'TECHNICAL_DRAWING_SVG_INVALID');
  invariant(/<svg(?:\s|>)/i.test(normalizedSvg), 'TECHNICAL_DRAWING_SVG_INVALID', 'Technical drawing must contain SVG markup');
  invariant(!/<\s*(script|foreignObject|iframe|object|embed)\b/i.test(normalizedSvg), 'TECHNICAL_DRAWING_SVG_UNSAFE', 'Technical drawing contains unsafe SVG elements');
  invariant(!/\son[a-z]+\s*=/i.test(normalizedSvg), 'TECHNICAL_DRAWING_SVG_UNSAFE', 'Technical drawing contains event-handler attributes');
  invariant(!/(?:href|xlink:href)\s*=\s*["']\s*(?:javascript:|https?:|data:text\/html)/i.test(normalizedSvg), 'TECHNICAL_DRAWING_SVG_UNSAFE', 'Technical drawing contains unsafe external references');
  return freeze({
    id: required(id),
    brandId: style.brandId,
    styleId: style.id,
    styleVersionId: nullableId(styleVersionId),
    analysisRunId: analysisRun?.id ?? null,
    viewType,
    versionNo,
    sourceDrawingId: nullableId(sourceDrawingId),
    status: 'draft',
    svg: normalizedSvg,
    contentHash: sha256(normalizedSvg),
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
    approvedAt: null,
    approvedBy: null,
  });
}

export function approveTechnicalDrawing(drawing, { approvedAt, approvedBy }) {
  invariant(drawing?.status === 'draft', 'TECHNICAL_DRAWING_NOT_DRAFT', 'Only a draft drawing can be approved');
  return freeze({ ...drawing, status: 'approved', approvedAt: timestamp(approvedAt, 'PRODUCT_ENGINEERING_TIME_INVALID'), approvedBy: actor(approvedBy) });
}

export function createDrawingObject({ id, drawing, objectType, semanticCode = null, garmentNodeId = null, geometry, linkPayload = {}, confidence = null, createdAt, createdBy }) {
  invariant(drawing?.status === 'draft', 'TECHNICAL_DRAWING_NOT_DRAFT', 'Drawing objects can change only while the drawing is a draft');
  invariant(DRAWING_OBJECT_TYPES.includes(objectType), 'TECHNICAL_DRAWING_OBJECT_TYPE_INVALID', 'Technical drawing object type is invalid', { objectType });
  requireObject(geometry, 'TECHNICAL_DRAWING_GEOMETRY_INVALID', 'Drawing geometry must be an object');
  requireObject(linkPayload, 'TECHNICAL_DRAWING_LINK_INVALID', 'Drawing link payload must be an object');
  invariant(semanticCode === null || SEMANTIC.test(semanticCode), 'TECHNICAL_DRAWING_SEMANTIC_CODE_INVALID', 'Drawing semantic code is invalid');
  return freeze({
    id: required(id),
    drawingId: drawing.id,
    brandId: drawing.brandId,
    styleId: drawing.styleId,
    objectType,
    semanticCode,
    garmentNodeId: nullableId(garmentNodeId),
    geometry: freeze(structuredClone(geometry)),
    linkPayload: freeze(structuredClone(linkPayload)),
    confidence: probability(confidence),
    createdAt: timestamp(createdAt, 'PRODUCT_ENGINEERING_TIME_INVALID'),
    createdBy: actor(createdBy),
  });
}

function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex'); }
function hash(value, code) { invariant(typeof value === 'string' && HASH.test(value), code, 'SHA-256 hash is invalid'); return value; }
function probability(value) { if (value === null || value === undefined) return null; invariant(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1, 'PRODUCT_ENGINEERING_CONFIDENCE_INVALID', 'Confidence must be between 0 and 1'); return Math.round(value * 10000) / 10000; }
function requireObject(value, code, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), code, message); assertJson(value, code); return value; }
function assertJson(value, code) { try { canonicalJson(value); } catch { invariant(false, code, 'Value must be JSON-serializable'); } }
function required(value) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, 'PRODUCT_ENGINEERING_ID_INVALID', 'Identifier is invalid'); return value; }
function requireId(value, code) { invariant(typeof value === 'string' && value.length >= 1 && value.length <= 160, code, 'Identifier is required'); }
function nullableId(value) { if (value === null || value === undefined || value === '') return null; return required(value); }
function actor(value) { invariant(typeof value === 'string' && value.trim() && value.length <= 160, 'PRODUCT_ENGINEERING_ACTOR_INVALID', 'Actor is required'); return value; }
function timestamp(value, code) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), code, 'Timestamp is invalid'); return new Date(value).toISOString(); }
function shortCode(value, code) { invariant(typeof value === 'string' && /^[A-Z0-9][A-Z0-9_.-]{0,119}$/.test(value), code, 'Code is invalid'); return value; }
function nonNegativeInteger(value, code) { invariant(Number.isSafeInteger(value) && value >= 0, code, 'Value must be a non-negative safe integer'); return value; }
function text(value, min, max, code) { invariant(typeof value === 'string', code, 'Text is required'); const normalized = value.trim(); invariant(normalized.length >= min && normalized.length <= max, code, 'Text length is invalid'); return normalized; }
function optionalText(value, max, code) { if (value === null || value === undefined || value === '') return null; return text(value, 1, max, code); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const nested of Object.values(value)) freeze(nested); return value; }
