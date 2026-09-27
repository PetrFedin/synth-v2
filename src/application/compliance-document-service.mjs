import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createComplianceDocument as createComplianceDocumentDomain,
  issueComplianceDocument as issueComplianceDocumentDomain,
  recordComplianceDocumentEdoStatus as recordComplianceDocumentEdoStatusDomain,
  supersedeComplianceDocument as supersedeComplianceDocumentDomain,
  assertComplianceDocumentVersion,
} from '../modules/compliance-documents/public.mjs';

export function createComplianceDocumentService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'COMPLIANCE_DOCUMENT_STORE_REQUIRED', 'Compliance Document store is required');

  function execute(commandId, actorId, operation, input, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every Compliance Document mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim(), 'COMPLIANCE_DOCUMENT_ACTOR_REQUIRED', 'Actor id is required');
    const fingerprint = `${operation}:${actorId}:${canonicalJson(input ?? {})}`;
    return store.transaction(async (tx) => {
      const previous = await tx.getCommand(commandId);
      if (previous) invariant(fingerprintsMatch(previous.fingerprint, fingerprint), 'COMMAND_ID_CONFLICT', 'commandId was already used by another mutation', { commandId });
      const context = await prepare(tx, { replay: Boolean(previous) });
      if (previous) return previous.result;
      const result = await action(tx, context);
      await tx.insertCommand(Object.freeze({ id: commandId, fingerprint, actorId, result, completedAt: now(clock) }));
      return result;
    });
  }

  async function authorize(tx, organisationId, actorId, capability) {
    invariant(typeof organisationId === 'string' && organisationId, 'COMPLIANCE_DOCUMENT_ORGANISATION_REQUIRED', 'Organisation id is required');
    const membership = await tx.getMembership(organisationId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: now(clock), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    createComplianceDocument(commandId, actorId, input) {
      return execute(commandId, actorId, 'createComplianceDocument', input,
        async (tx) => {
          await authorize(tx, input?.organisationId, actorId, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE);
          const issuer = requireEntity(await tx.getLegalEntityWithLatestVersion(input?.issuerLegalEntityId), 'COMPLIANCE_DOCUMENT_ISSUER_NOT_FOUND', { issuerLegalEntityId: input?.issuerLegalEntityId });
          invariant(issuer.organisationId === input.organisationId, 'COMPLIANCE_DOCUMENT_ISSUER_ORGANISATION_MISMATCH', 'Issuer Legal Entity does not belong to this organisation', { organisationId: input.organisationId, issuerLegalEntityId: issuer.id });
          if (input.counterpartyLegalEntityId) {
            invariant(await tx.legalEntityExists(input.counterpartyLegalEntityId), 'COMPLIANCE_DOCUMENT_COUNTERPARTY_NOT_FOUND', { counterpartyLegalEntityId: input.counterpartyLegalEntityId });
          }
          const existing = await tx.getDocumentByNumber(input.organisationId, input.documentNumber);
          return Object.freeze({ issuer, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'COMPLIANCE_DOCUMENT_ALREADY_EXISTS', 'Compliance Document number already exists', { documentNumber: input.documentNumber });
          const value = createComplianceDocumentDomain({
            id: nextId('compliance-document'),
            organisationId: input.organisationId,
            documentNumber: input.documentNumber,
            documentType: input.documentType,
            issuer: context.issuer,
            counterpartyLegalEntityId: input.counterpartyLegalEntityId ?? null,
            validFrom: input.validFrom ?? null,
            validTo: input.validTo ?? null,
            createdAt: now(clock),
            createdBy: actorId,
          });
          await tx.insertDocument(value);
          await append(tx, 'compliance-document.created', value.id, { organisationId: value.organisationId, documentNumber: value.documentNumber, documentType: value.documentType, status: value.status }, commandId, actorId);
          return value;
        });
    },

    issueComplianceDocument(commandId, actorId, documentId, input) {
      return execute(commandId, actorId, `issueComplianceDocument:${documentId}`, input,
        async (tx) => {
          const document = requireEntity(await tx.getDocumentById(documentId), 'COMPLIANCE_DOCUMENT_NOT_FOUND', { documentId });
          await authorize(tx, document.organisationId, actorId, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE);
          return document;
        },
        async (tx, document) => {
          assertComplianceDocumentVersion(document, input?.expectedVersion);
          const value = issueComplianceDocumentDomain(document, { actorId, issuedAt: now(clock) });
          await tx.saveDocument(value, input.expectedVersion);
          await append(tx, 'compliance-document.issued', value.id, { organisationId: value.organisationId, documentNumber: value.documentNumber, status: value.status, version: value.version }, commandId, actorId);
          return value;
        });
    },

    recordEdoStatus(commandId, actorId, documentId, input) {
      return execute(commandId, actorId, `recordComplianceDocumentEdoStatus:${documentId}`, input,
        async (tx) => {
          const document = requireEntity(await tx.getDocumentById(documentId), 'COMPLIANCE_DOCUMENT_NOT_FOUND', { documentId });
          await authorize(tx, document.organisationId, actorId, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE);
          return document;
        },
        async (tx, document) => {
          assertComplianceDocumentVersion(document, input?.expectedVersion);
          const value = recordComplianceDocumentEdoStatusDomain(document, { edoStatus: input.edoStatus, actorId, recordedAt: now(clock) });
          await tx.saveDocument(value, input.expectedVersion);
          await append(tx, 'compliance-document.edo-status-recorded', value.id, { organisationId: value.organisationId, documentNumber: value.documentNumber, edoStatus: value.edoStatus, version: value.version }, commandId, actorId);
          return value;
        });
    },

    supersedeComplianceDocument(commandId, actorId, documentId, input) {
      return execute(commandId, actorId, `supersedeComplianceDocument:${documentId}`, input,
        async (tx) => {
          const document = requireEntity(await tx.getDocumentById(documentId), 'COMPLIANCE_DOCUMENT_NOT_FOUND', { documentId });
          await authorize(tx, document.organisationId, actorId, CAPABILITIES.COMPLIANCE_DOCUMENT_MANAGE);
          const issuer = requireEntity(await tx.getLegalEntityWithLatestVersion(document.issuerLegalEntityId), 'COMPLIANCE_DOCUMENT_ISSUER_NOT_FOUND', { issuerLegalEntityId: document.issuerLegalEntityId });
          const existingByNumber = await tx.getDocumentByNumber(document.organisationId, input.replacementDocumentNumber);
          return Object.freeze({ document, issuer, existingByNumber });
        },
        async (tx, context) => {
          assertComplianceDocumentVersion(context.document, input?.expectedVersion);
          invariant(!context.existingByNumber, 'COMPLIANCE_DOCUMENT_ALREADY_EXISTS', 'Compliance Document number already exists', { documentNumber: input.replacementDocumentNumber });
          const draftReplacement = createComplianceDocumentDomain({
            id: nextId('compliance-document'),
            organisationId: context.document.organisationId,
            documentNumber: input.replacementDocumentNumber,
            documentType: context.document.documentType,
            issuer: context.issuer,
            counterpartyLegalEntityId: context.document.counterpartyLegalEntityId,
            validFrom: context.document.validFrom,
            validTo: context.document.validTo,
            createdAt: now(clock),
            createdBy: actorId,
          });
          const { supersededDocument, replacement } = supersedeComplianceDocumentDomain(context.document, draftReplacement, { actorId, supersededAt: now(clock) });
          await tx.saveDocument(supersededDocument, input.expectedVersion);
          await tx.insertDocument(replacement);
          await append(tx, 'compliance-document.superseded', supersededDocument.id, { organisationId: supersededDocument.organisationId, documentNumber: supersededDocument.documentNumber, replacementDocumentId: replacement.id, replacementDocumentNumber: replacement.documentNumber }, commandId, actorId);
          return Object.freeze({ supersededDocument, replacement });
        });
    },

    async getForActor(actorId, documentId) {
      return store.transaction(async (tx) => {
        const document = requireEntity(await tx.getDocumentById(documentId), 'COMPLIANCE_DOCUMENT_NOT_FOUND', { documentId });
        const membership = await tx.getMembership(document.organisationId, actorId);
        assertCapability(membership, CAPABILITIES.COMPLIANCE_DOCUMENT_READ);
        return document;
      });
    },

    async listForActor(actorId, organisationId) {
      return store.transaction(async (tx) => {
        await authorize(tx, organisationId, actorId, CAPABILITIES.COMPLIANCE_DOCUMENT_READ);
        return tx.listDocuments(organisationId);
      });
    },
  });
}

function now(clock) {
  const value = clock();
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), 'COMPLIANCE_DOCUMENT_CLOCK_INVALID', 'Clock must return an ISO-compatible timestamp');
  return value;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${Date.now().toString(36)}${(++sequence).toString(36)}`;
}
