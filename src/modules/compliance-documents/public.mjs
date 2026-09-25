import { invariant } from '../../core/errors.mjs';

// Документ соответствия/ЭДО, выставленный юрлицом (`src/modules/legal-entities/public.mjs`) на конкретную
// зафиксированную версию его реквизитов — как заказ на материал (`src/modules/material-purchase-orders/public.mjs`),
// изменяемая шапка с замороженным составом, а не отдельная цепочка версий: у документа нет «версии
// содержимого», есть либо черновик, либо навсегда выставленный документ, либо документ, заменённый новым.

export const COMPLIANCE_DOCUMENT_TYPES = Object.freeze(['upd', 'eaeu_declaration_of_conformity', 'eaeu_certificate_of_conformity']);
export const COMPLIANCE_DOCUMENT_STATUSES = Object.freeze(['draft', 'issued', 'superseded']);
export const COMPLIANCE_DOCUMENT_EDO_STATUSES = Object.freeze(['sent', 'delivered', 'signed', 'rejected']);

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,79}$/;

export function createComplianceDocument({ id, organisationId, documentNumber, documentType, issuer, counterpartyLegalEntityId, validFrom, validTo, createdAt, createdBy }) {
  invariant(COMPLIANCE_DOCUMENT_TYPES.includes(documentType), 'COMPLIANCE_DOCUMENT_TYPE_INVALID', 'Compliance Document type is invalid', { documentType });
  assertIssuer(issuer);
  const at = timestamp(createdAt, 'COMPLIANCE_DOCUMENT_CREATED_AT_INVALID', 'Compliance Document creation time');
  const normalizedValidFrom = assertValidity(documentType, validFrom, validTo).validFrom;
  const normalizedValidTo = assertValidity(documentType, validFrom, validTo).validTo;
  return freezeDocument({
    id: identifier(id, 'COMPLIANCE_DOCUMENT_ID_REQUIRED', 'Compliance Document id'),
    organisationId: identifier(organisationId, 'COMPLIANCE_DOCUMENT_ORGANISATION_REQUIRED', 'Organisation'),
    documentNumber: code(documentNumber, 'COMPLIANCE_DOCUMENT_NUMBER_INVALID', 'Compliance Document number'),
    documentType,
    issuerLegalEntityId: identifier(issuer.id, 'COMPLIANCE_DOCUMENT_ISSUER_REQUIRED', 'Issuer Legal Entity'),
    issuerLegalEntityVersionId: identifier(issuer.currentVersionId, 'COMPLIANCE_DOCUMENT_ISSUER_VERSION_REQUIRED', 'Issuer Legal Entity version'),
    counterpartyLegalEntityId: counterpartyLegalEntityId ? identifier(counterpartyLegalEntityId, 'COMPLIANCE_DOCUMENT_COUNTERPARTY_INVALID', 'Counterparty Legal Entity') : null,
    status: 'draft',
    edoStatus: null,
    validFrom: normalizedValidFrom,
    validTo: normalizedValidTo,
    supersedesDocumentId: null,
    version: 1,
    issuedAt: null,
    supersededAt: null,
    createdAt: at,
    createdBy: identifier(createdBy, 'COMPLIANCE_DOCUMENT_CREATED_BY_REQUIRED', 'Actor'),
    updatedAt: at,
    updatedBy: identifier(createdBy, 'COMPLIANCE_DOCUMENT_CREATED_BY_REQUIRED', 'Actor'),
  });
}

export function issueComplianceDocument(document, { actorId, issuedAt }) {
  invariant(document?.status === 'draft', 'COMPLIANCE_DOCUMENT_NOT_DRAFT', 'Only a draft Compliance Document can be issued', { status: document?.status });
  const at = timestamp(issuedAt, 'COMPLIANCE_DOCUMENT_ISSUED_AT_INVALID', 'Compliance Document issue time');
  return freezeDocument({
    ...document,
    status: 'issued',
    version: document.version + 1,
    issuedAt: at,
    updatedAt: at,
    updatedBy: identifier(actorId, 'COMPLIANCE_DOCUMENT_UPDATED_BY_REQUIRED', 'Actor'),
  });
}

export function recordComplianceDocumentEdoStatus(document, { edoStatus, actorId, recordedAt }) {
  invariant(document?.documentType === 'upd', 'COMPLIANCE_DOCUMENT_EDO_NOT_APPLICABLE', 'Only a УПД carries an ЭДО transmission status', { documentType: document?.documentType });
  invariant(['issued', 'superseded'].includes(document?.status), 'COMPLIANCE_DOCUMENT_NOT_ISSUED', 'Only an issued Compliance Document can record an ЭДО status', { status: document?.status });
  invariant(COMPLIANCE_DOCUMENT_EDO_STATUSES.includes(edoStatus), 'COMPLIANCE_DOCUMENT_EDO_STATUS_INVALID', 'ЭДО status is invalid', { edoStatus });
  assertEdoTransition(document.edoStatus, edoStatus);
  const at = timestamp(recordedAt, 'COMPLIANCE_DOCUMENT_EDO_RECORDED_AT_INVALID', 'ЭДО status record time');
  return freezeDocument({
    ...document,
    edoStatus,
    version: document.version + 1,
    updatedAt: at,
    updatedBy: identifier(actorId, 'COMPLIANCE_DOCUMENT_UPDATED_BY_REQUIRED', 'Actor'),
  });
}

export function supersedeComplianceDocument(document, replacement, { actorId, supersededAt }) {
  invariant(document?.status === 'issued', 'COMPLIANCE_DOCUMENT_NOT_ISSUED', 'Only an issued Compliance Document can be superseded', { status: document?.status });
  invariant(replacement?.status === 'draft', 'COMPLIANCE_DOCUMENT_REPLACEMENT_NOT_DRAFT', 'The replacement Compliance Document must still be a draft', { status: replacement?.status });
  invariant(replacement.documentType === document.documentType, 'COMPLIANCE_DOCUMENT_REPLACEMENT_TYPE_MISMATCH', 'Replacement Compliance Document must be the same document type');
  invariant(replacement.organisationId === document.organisationId, 'COMPLIANCE_DOCUMENT_REPLACEMENT_ORGANISATION_MISMATCH', 'Replacement Compliance Document must belong to the same organisation');
  const at = timestamp(supersededAt, 'COMPLIANCE_DOCUMENT_SUPERSEDED_AT_INVALID', 'Compliance Document supersession time');
  const actor = identifier(actorId, 'COMPLIANCE_DOCUMENT_UPDATED_BY_REQUIRED', 'Actor');
  const supersededDocument = freezeDocument({
    ...document,
    status: 'superseded',
    version: document.version + 1,
    supersededAt: at,
    updatedAt: at,
    updatedBy: actor,
  });
  const replacementLinked = freezeDocument({
    ...replacement,
    supersedesDocumentId: supersededDocument.id,
    updatedAt: at,
    updatedBy: actor,
  });
  return Object.freeze({ supersededDocument, replacement: replacementLinked });
}

export function assertComplianceDocumentVersion(document, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'COMPLIANCE_DOCUMENT_EXPECTED_VERSION_INVALID', 'Expected Compliance Document version is invalid', { expectedVersion });
  invariant(document?.version === expectedVersion, 'COMPLIANCE_DOCUMENT_CONCURRENCY_CONFLICT', 'Compliance Document was changed by another operation', { documentNumber: document?.documentNumber, expectedVersion, actualVersion: document?.version });
}

const EDO_TRANSITIONS = new Map([
  [null, new Set(['sent'])],
  ['sent', new Set(['delivered', 'rejected'])],
  ['delivered', new Set(['signed', 'rejected'])],
  ['signed', new Set()],
  ['rejected', new Set(['sent'])],
]);

function assertEdoTransition(from, to) {
  const allowed = EDO_TRANSITIONS.get(from ?? null);
  invariant(allowed?.has(to), 'COMPLIANCE_DOCUMENT_EDO_TRANSITION_INVALID', 'ЭДО status transition is not allowed', { from, to });
}

function assertIssuer(issuer) {
  invariant(issuer?.status === 'active', 'COMPLIANCE_DOCUMENT_ISSUER_NOT_ACTIVE', 'Compliance Document issuer Legal Entity must be active', { status: issuer?.status });
  invariant(issuer.currentVersionId, 'COMPLIANCE_DOCUMENT_ISSUER_VERSION_MISSING', 'Compliance Document issuer has no requisites version to pin');
}

function assertValidity(documentType, validFrom, validTo) {
  if (documentType === 'upd') {
    invariant(validFrom === null || validFrom === undefined, 'COMPLIANCE_DOCUMENT_VALIDITY_NOT_APPLICABLE', 'УПД does not carry a validity period');
    invariant(validTo === null || validTo === undefined, 'COMPLIANCE_DOCUMENT_VALIDITY_NOT_APPLICABLE', 'УПД does not carry a validity period');
    return { validFrom: null, validTo: null };
  }
  const from = isoDate(validFrom, 'COMPLIANCE_DOCUMENT_VALID_FROM_INVALID', 'Validity start date');
  const to = validTo === null || validTo === undefined ? null : isoDate(validTo, 'COMPLIANCE_DOCUMENT_VALID_TO_INVALID', 'Validity end date');
  invariant(to === null || to >= from, 'COMPLIANCE_DOCUMENT_VALIDITY_RANGE_INVALID', 'Validity end date must not precede its start date');
  return { validFrom: from, validTo: to };
}

function freezeDocument(value) {
  invariant(COMPLIANCE_DOCUMENT_STATUSES.includes(value.status), 'COMPLIANCE_DOCUMENT_STATUS_INVALID', 'Compliance Document status is invalid', { status: value.status });
  return Object.freeze(value);
}
function identifier(value, codeValue, label) { return requiredText(value, 1, 200, codeValue, label); }
function code(value, codeValue, label) { const normalized = requiredText(value, 3, 80, codeValue, label).toUpperCase(); invariant(CODE_PATTERN.test(normalized), codeValue, `${label} is invalid`); return normalized; }
function timestamp(value, codeValue, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), codeValue, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function isoDate(value, codeValue, label) { invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)), codeValue, `${label} must be an ISO date (YYYY-MM-DD)`); return value; }
function requiredText(value, min, max, codeValue, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, codeValue, `${label} must contain ${min} to ${max} characters`); return normalized; }
