import { invariant } from '../core/errors.mjs';
import { assertBodyContract, assertQueryContract, bodyContract } from './request-contract.mjs';
import {
  DRAWING_OBJECT_TYPES,
  DRAWING_VIEWS,
  ENGINEERING_PURPOSES,
  FINDING_ORIGINS,
  PROPOSAL_AUTHORITIES,
} from '../modules/product-engineering/public.mjs';

const EMPTY = bodyContract();
const ANALYSIS_CREATE = bodyContract(['styleVersionId', 'purpose', 'inputManifest']);
const MODEL_START = bodyContract(['provider', 'model', 'purpose', 'promptVersion', 'schemaVersion', 'inputHash']);
const MODEL_COMPLETE = bodyContract(['outputHash', 'usage', 'costMinor', 'currency']);
const EVIDENCE_FIELDS = ['sourceKind', 'sourceId', 'sourceLocator', 'sourceHash', 'excerpt'];
const FINDING_CREATE = bodyContract(['findingType', 'origin', 'value', 'confidence', 'evidence'], {}, { evidence: EVIDENCE_FIELDS });
const PROPOSAL_CREATE = bodyContract(['findingId', 'targetAuthority', 'targetEntityId', 'targetField', 'proposedValue', 'confidence', 'rationale']);
const PROPOSAL_RESOLVE = bodyContract(['expectedVersion', 'decision', 'note']);
const PROPOSAL_APPLY = bodyContract(['expectedProposalVersion', 'expectedCanonicalVersion']);
const CONFLICT_CREATE = bodyContract(['conflictType', 'subject', 'candidates', 'severity']);
const CONFLICT_RESOLVE = bodyContract(['expectedVersion', 'disposition', 'resolution']);
const DRAWING_CREATE = bodyContract(['styleVersionId', 'analysisRunId', 'viewType', 'svg']);
const DRAWING_OBJECT = bodyContract(['objectType', 'semanticCode', 'garmentNodeId', 'geometry', 'linkPayload', 'confidence']);
const SOURCE_CREATE = bodyContract(['kind','ingestMode','mediaType','originalName','sizeBytes','contentHash','storageRef','sourceUri','metadata']);
const SOURCE_SCAN = bodyContract(['expectedVersion','status','engine','details']);
const SOURCE_ADMIT = bodyContract(['expectedVersion','policyVersion']);
const SOURCE_REJECT = bodyContract(['expectedVersion','code','message','quarantine']);
const SOURCE_FRAGMENT = bodyContract(['kind','locator','content','contentHash']);
const SOURCE_PARSE_COMPLETE = bodyContract(['expectedVersion','parser','parserVersion','fragmentCount']);
const CONFLICT_SEVERITIES = ['info','warning','blocking'];
const SOURCE_KINDS = ['product_media','style_reference','document','spreadsheet','external_uri','sample','manual_observation'];
const INGEST_MODES = ['upload','connector','canonical_asset','manual'];
const SCAN_RESULTS = ['clean','infected','error'];
const FRAGMENT_KINDS = ['document_page','sheet','cell_range','image_region','text_span','metadata','manual_note'];

/**
 * @param {{ productEngineering?: any }} [options]
 */
export function createProductEngineeringRoutes(options = {}) {
  const { productEngineering } = options;
  const service = productEngineering ?? unavailableService();
  return Object.freeze([
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/engineering\/sources$/, SOURCE_CREATE, validateSourceCreate, ({ commandId, actorId, params, body }) => service.registerSource(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/product-engineering\/sources\/([^/]+)$/, [], ({ actorId, params }) => service.getSourceForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/product-engineering\/sources\/([^/]+)\/scan$/, SOURCE_SCAN, validateSourceScan, ({ commandId, actorId, params, body }) => service.recordSourceScan(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/sources\/([^/]+)\/admit$/, SOURCE_ADMIT, validateSourceAdmit, ({ commandId, actorId, params, body }) => service.admitSource(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/sources\/([^/]+)\/reject$/, SOURCE_REJECT, validateSourceReject, ({ commandId, actorId, params, body }) => service.rejectSource(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/sources\/([^/]+)\/fragments$/, SOURCE_FRAGMENT, validateSourceFragment, ({ commandId, actorId, params, body }) => service.addSourceFragment(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/sources\/([^/]+)\/parse-complete$/, SOURCE_PARSE_COMPLETE, validateSourceParseComplete, ({ commandId, actorId, params, body }) => service.completeSourceParsing(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/engineering\/analyses$/, ANALYSIS_CREATE, validateAnalysis, ({ commandId, actorId, params, body }) => service.requestAnalysis(commandId, actorId, params[0], body)),
    read('GET', /^\/v2\/product\/styles\/([^/]+)\/engineering$/, ['limit'], ({ actorId, params, query }) => service.getStyleWorkspaceForActor(actorId, params[0], { limit: query.limit })),
    read('GET', /^\/v2\/product-engineering\/analyses\/([^/]+)$/, [], ({ actorId, params }) => service.getAnalysisWorkspaceForActor(actorId, params[0])),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/start$/, EMPTY, () => {}, ({ commandId, actorId, params }) => service.startAnalysis(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/complete$/, EMPTY, () => {}, ({ commandId, actorId, params }) => service.completeAnalysis(commandId, actorId, params[0])),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/model-runs$/, MODEL_START, validateModelStart, ({ commandId, actorId, params, body }) => service.startModelRun(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/model-runs\/([^/]+)\/complete$/, MODEL_COMPLETE, validateModelComplete, ({ commandId, actorId, params, body }) => service.completeModelRun(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/findings$/, FINDING_CREATE, validateFinding, ({ commandId, actorId, params, body }) => service.recordFinding(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/proposals$/, PROPOSAL_CREATE, validateProposal, ({ commandId, actorId, params, body }) => service.createProposal(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/proposals\/([^/]+)\/resolve$/, PROPOSAL_RESOLVE, validateProposalResolution, ({ commandId, actorId, params, body }) => service.resolveProposal(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/proposals\/([^/]+)\/apply$/, PROPOSAL_APPLY, validateProposalApply, ({ commandId, actorId, params, body }) => service.applyProposal(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/analyses\/([^/]+)\/conflicts$/, CONFLICT_CREATE, validateConflict, ({ commandId, actorId, params, body }) => service.createConflict(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/conflicts\/([^/]+)\/resolve$/, CONFLICT_RESOLVE, validateConflictResolution, ({ commandId, actorId, params, body }) => service.resolveConflict(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product\/styles\/([^/]+)\/engineering\/drawings$/, DRAWING_CREATE, validateDrawing, ({ commandId, actorId, params, body }) => service.createDrawing(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/drawings\/([^/]+)\/objects$/, DRAWING_OBJECT, validateDrawingObject, ({ commandId, actorId, params, body }) => service.addDrawingObject(commandId, actorId, params[0], body)),
    mutate('POST', /^\/v2\/product-engineering\/drawings\/([^/]+)\/approve$/, EMPTY, () => {}, ({ commandId, actorId, params }) => service.approveDrawing(commandId, actorId, params[0])),
  ]);
}

function mutate(method, pattern, contract, validate, execute) {
  return Object.freeze({
    method, pattern, mutation: true,
    execute(context) {
      assertQueryContract(context.query ?? {}, []);
      assertBodyContract(context.body, contract);
      validate(context.body);
      return execute(context);
    },
  });
}

function read(method, pattern, queryFields, execute) {
  return Object.freeze({
    method, pattern, mutation: false,
    execute(context) {
      assertQueryContract(context.query ?? {}, queryFields);
      return execute(context);
    },
  });
}


function validateSourceCreate(body) {
  invariant(SOURCE_KINDS.includes(body.kind), 'HTTP_BODY_FIELD_INVALID', 'kind is invalid', { field:'kind', allowed:SOURCE_KINDS });
  invariant(INGEST_MODES.includes(body.ingestMode), 'HTTP_BODY_FIELD_INVALID', 'ingestMode is invalid', { field:'ingestMode', allowed:INGEST_MODES });
  if (body.mediaType !== undefined && body.mediaType !== null) nonEmpty(body.mediaType,'mediaType');
  if (body.originalName !== undefined && body.originalName !== null) nonEmpty(body.originalName,'originalName');
  invariant(body.sizeBytes === undefined || body.sizeBytes === null || (Number.isSafeInteger(body.sizeBytes) && body.sizeBytes >= 0), 'HTTP_BODY_FIELD_INVALID', 'sizeBytes must be a non-negative integer', { field:'sizeBytes' });
  if (body.contentHash !== undefined && body.contentHash !== null) sha(body.contentHash,'contentHash');
  if (body.storageRef !== undefined && body.storageRef !== null) nonEmpty(body.storageRef,'storageRef');
  if (body.sourceUri !== undefined && body.sourceUri !== null) nonEmpty(body.sourceUri,'sourceUri');
  if (body.metadata !== undefined) object(body.metadata,'metadata');
}
function validateSourceScan(body) {
  version(body.expectedVersion,'expectedVersion');
  invariant(SCAN_RESULTS.includes(body.status), 'HTTP_BODY_FIELD_INVALID', 'status is invalid', { field:'status', allowed:SCAN_RESULTS });
  if (body.engine !== undefined && body.engine !== null) nonEmpty(body.engine,'engine');
  if (body.details !== undefined) object(body.details,'details');
}
function validateSourceAdmit(body) {
  version(body.expectedVersion,'expectedVersion');
  nonEmpty(body.policyVersion,'policyVersion');
}
function validateSourceReject(body) {
  version(body.expectedVersion,'expectedVersion');
  nonEmpty(body.code,'code');
  nonEmpty(body.message,'message');
  invariant(body.quarantine === undefined || typeof body.quarantine === 'boolean','HTTP_BODY_FIELD_INVALID','quarantine must be boolean',{field:'quarantine'});
}
function validateSourceFragment(body) {
  invariant(FRAGMENT_KINDS.includes(body.kind),'HTTP_BODY_FIELD_INVALID','kind is invalid',{field:'kind',allowed:FRAGMENT_KINDS});
  object(body.locator,'locator');
  if (body.contentHash !== undefined && body.contentHash !== null) sha(body.contentHash,'contentHash');
}
function validateSourceParseComplete(body) {
  version(body.expectedVersion,'expectedVersion');
  nonEmpty(body.parser,'parser');
  nonEmpty(body.parserVersion,'parserVersion');
  invariant(Number.isInteger(body.fragmentCount) && body.fragmentCount >= 0,'HTTP_BODY_FIELD_INVALID','fragmentCount must be a non-negative integer',{field:'fragmentCount'});
}

function validateAnalysis(body) {
  invariant(ENGINEERING_PURPOSES.includes(body.purpose), 'HTTP_BODY_FIELD_INVALID', 'purpose is invalid', { field: 'purpose', allowed: ENGINEERING_PURPOSES });
  object(body.inputManifest, 'inputManifest');
  optionalId(body.styleVersionId, 'styleVersionId');
}
function validateModelStart(body) {
  for (const field of ['provider','model','promptVersion','schemaVersion']) nonEmpty(body[field], field);
  invariant(ENGINEERING_PURPOSES.includes(body.purpose), 'HTTP_BODY_FIELD_INVALID', 'purpose is invalid', { field: 'purpose', allowed: ENGINEERING_PURPOSES });
  sha(body.inputHash, 'inputHash');
}
function validateModelComplete(body) {
  sha(body.outputHash, 'outputHash');
  if (body.usage !== undefined) object(body.usage, 'usage');
  invariant(body.costMinor === undefined || body.costMinor === null || (Number.isSafeInteger(body.costMinor) && body.costMinor >= 0), 'HTTP_BODY_FIELD_INVALID', 'costMinor must be a non-negative integer', { field: 'costMinor' });
  invariant(body.currency === undefined || body.currency === null || /^[A-Z]{3}$/.test(body.currency), 'HTTP_BODY_FIELD_INVALID', 'currency is invalid', { field: 'currency' });
}
function validateFinding(body) {
  nonEmpty(body.findingType, 'findingType');
  invariant(FINDING_ORIGINS.includes(body.origin), 'HTTP_BODY_FIELD_INVALID', 'origin is invalid', { field: 'origin', allowed: FINDING_ORIGINS });
  invariant(Object.hasOwn(body, 'value'), 'HTTP_BODY_FIELD_INVALID', 'value is required', { field: 'value' });
  probability(body.confidence, 'confidence');
  invariant(body.evidence === undefined || Array.isArray(body.evidence), 'HTTP_BODY_FIELD_INVALID', 'evidence must be an array', { field: 'evidence' });
  for (const [index, row] of (body.evidence ?? []).entries()) {
    invariant(SOURCE_KINDS.includes(row.sourceKind), 'HTTP_BODY_FIELD_INVALID', 'evidence sourceKind is invalid', { field: `evidence[${index}].sourceKind`, allowed: SOURCE_KINDS });
    optionalId(row.sourceId, `evidence[${index}].sourceId`);
    if (row.sourceLocator !== undefined) object(row.sourceLocator, `evidence[${index}].sourceLocator`);
    if (row.sourceHash !== undefined && row.sourceHash !== null) sha(row.sourceHash, `evidence[${index}].sourceHash`);
  }
}
function validateProposal(body) {
  optionalId(body.findingId, 'findingId');
  invariant(PROPOSAL_AUTHORITIES.includes(body.targetAuthority), 'HTTP_BODY_FIELD_INVALID', 'targetAuthority is invalid', { field: 'targetAuthority', allowed: PROPOSAL_AUTHORITIES });
  optionalId(body.targetEntityId, 'targetEntityId');
  nonEmpty(body.targetField, 'targetField');
  invariant(Object.hasOwn(body, 'proposedValue'), 'HTTP_BODY_FIELD_INVALID', 'proposedValue is required', { field: 'proposedValue' });
  probability(body.confidence, 'confidence');
}
function validateProposalApply(body) {
  version(body.expectedProposalVersion, 'expectedProposalVersion');
  version(body.expectedCanonicalVersion, 'expectedCanonicalVersion');
}
function validateProposalResolution(body) {
  version(body.expectedVersion, 'expectedVersion');
  invariant(['accepted','rejected'].includes(body.decision), 'HTTP_BODY_FIELD_INVALID', 'decision is invalid', { field: 'decision' });
}
function validateConflict(body) {
  nonEmpty(body.conflictType, 'conflictType');
  nonEmpty(body.subject, 'subject');
  invariant(Array.isArray(body.candidates) && body.candidates.length >= 2, 'HTTP_BODY_FIELD_INVALID', 'candidates must contain at least two values', { field: 'candidates' });
  invariant(CONFLICT_SEVERITIES.includes(body.severity), 'HTTP_BODY_FIELD_INVALID', 'severity is invalid', { field: 'severity', allowed: CONFLICT_SEVERITIES });
}
function validateConflictResolution(body) {
  version(body.expectedVersion, 'expectedVersion');
  invariant(['resolved','ignored'].includes(body.disposition), 'HTTP_BODY_FIELD_INVALID', 'disposition is invalid', { field: 'disposition' });
  if (body.resolution !== undefined) object(body.resolution, 'resolution');
}
function validateDrawing(body) {
  optionalId(body.styleVersionId, 'styleVersionId');
  optionalId(body.analysisRunId, 'analysisRunId');
  invariant(DRAWING_VIEWS.includes(body.viewType), 'HTTP_BODY_FIELD_INVALID', 'viewType is invalid', { field: 'viewType', allowed: DRAWING_VIEWS });
  invariant(typeof body.svg === 'string' && body.svg.length >= 20, 'HTTP_BODY_FIELD_INVALID', 'svg is required', { field: 'svg' });
}
function validateDrawingObject(body) {
  invariant(DRAWING_OBJECT_TYPES.includes(body.objectType), 'HTTP_BODY_FIELD_INVALID', 'objectType is invalid', { field: 'objectType', allowed: DRAWING_OBJECT_TYPES });
  if (body.semanticCode !== undefined && body.semanticCode !== null) nonEmpty(body.semanticCode, 'semanticCode');
  optionalId(body.garmentNodeId, 'garmentNodeId');
  object(body.geometry, 'geometry');
  if (body.linkPayload !== undefined) object(body.linkPayload, 'linkPayload');
  probability(body.confidence, 'confidence');
}
function object(value, field) { invariant(value && typeof value === 'object' && !Array.isArray(value), 'HTTP_BODY_FIELD_INVALID', `${field} must be an object`, { field }); }
function nonEmpty(value, field) { invariant(typeof value === 'string' && value.trim().length > 0, 'HTTP_BODY_FIELD_INVALID', `${field} is required`, { field }); }
function optionalId(value, field) { invariant(value === undefined || value === null || (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)), 'HTTP_BODY_FIELD_INVALID', `${field} is invalid`, { field }); }
function probability(value, field) { invariant(value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1), 'HTTP_BODY_FIELD_INVALID', `${field} must be between 0 and 1`, { field }); }
function sha(value, field) { invariant(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'HTTP_BODY_FIELD_INVALID', `${field} must be a SHA-256 hex digest`, { field }); }
function version(value, field) { invariant(Number.isInteger(value) && value >= 1, 'HTTP_BODY_FIELD_INVALID', `${field} must be a positive integer`, { field }); }

function unavailableService() {
  const fail = () => invariant(false, 'PRODUCT_ENGINEERING_SERVICE_REQUIRED', 'Product Engineering service is required');
  return new Proxy({}, { get: () => fail });
}
