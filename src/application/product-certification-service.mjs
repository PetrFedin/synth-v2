import { domainEvent } from '../core/events.mjs';
import { invariant, requireEntity } from '../core/errors.mjs';
import { canonicalJson, fingerprintsMatch } from '../core/fingerprints.mjs';
import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';
import {
  createProductCertification as createProductCertificationDomain,
  issueProductCertification as issueProductCertificationDomain,
  supersedeProductCertification as supersedeProductCertificationDomain,
  assertProductCertificationVersion,
} from '../modules/product-certifications/public.mjs';

export function createProductCertificationService({ store, clock = () => new Date().toISOString(), nextId = defaultIdGenerator() } = {}) {
  invariant(store && typeof store.transaction === 'function', 'PRODUCT_CERTIFICATION_STORE_REQUIRED', 'Product Certification store is required');

  function execute(commandId, actorId, operation, input, prepare, action) {
    invariant(typeof commandId === 'string' && commandId.trim(), 'COMMAND_ID_REQUIRED', 'Every Product Certification mutation requires commandId');
    invariant(typeof actorId === 'string' && actorId.trim(), 'PRODUCT_CERTIFICATION_ACTOR_REQUIRED', 'Actor id is required');
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

  async function authorize(tx, brandId, actorId, capability) {
    invariant(typeof brandId === 'string' && brandId, 'PRODUCT_CERTIFICATION_BRAND_REQUIRED', 'Brand id is required');
    const membership = await tx.getMembership(brandId, actorId);
    assertCapability(membership, capability);
    return membership;
  }

  async function append(tx, type, aggregateId, payload, commandId, actorId) {
    await tx.appendOutbox(domainEvent({ id: nextId('event'), type, aggregateId, occurredAt: now(clock), payload, metadata: { commandId, actorId } }));
  }

  return Object.freeze({
    createProductCertification(commandId, actorId, input) {
      return execute(commandId, actorId, 'createProductCertification', input,
        async (tx) => {
          const style = requireEntity(await tx.getStyle(input?.styleId), 'PRODUCT_CERTIFICATION_STYLE_NOT_FOUND', { styleId: input?.styleId });
          await authorize(tx, style.brandId, actorId, CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE);
          const existing = await tx.getCertificateByNumber(style.id, input?.certificateNumber);
          return Object.freeze({ style, existing });
        },
        async (tx, context) => {
          invariant(!context.existing, 'PRODUCT_CERTIFICATION_ALREADY_EXISTS', 'Certificate number already exists for this style', { certificateNumber: input.certificateNumber });
          const value = createProductCertificationDomain({
            id: nextId('product-certification'),
            styleId: context.style.id,
            brandId: context.style.brandId,
            certificationType: input.certificationType,
            certificateNumber: input.certificateNumber,
            issuingBody: input.issuingBody,
            validFrom: input.validFrom ?? null,
            validTo: input.validTo ?? null,
            createdAt: now(clock),
            createdBy: actorId,
          });
          await tx.insertCertification(value);
          await append(tx, 'product-certification.created', value.id, { styleId: value.styleId, brandId: value.brandId, certificationType: value.certificationType, certificateNumber: value.certificateNumber, status: value.status }, commandId, actorId);
          return value;
        });
    },

    issueProductCertification(commandId, actorId, certificationId, input) {
      return execute(commandId, actorId, `issueProductCertification:${certificationId}`, input,
        async (tx) => {
          const certification = requireEntity(await tx.getCertificationById(certificationId), 'PRODUCT_CERTIFICATION_NOT_FOUND', { certificationId });
          await authorize(tx, certification.brandId, actorId, CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE);
          return certification;
        },
        async (tx, certification) => {
          assertProductCertificationVersion(certification, input?.expectedVersion);
          const value = issueProductCertificationDomain(certification, { actorId, issuedAt: now(clock) });
          await tx.saveCertification(value, input.expectedVersion);
          await append(tx, 'product-certification.issued', value.id, { styleId: value.styleId, certificateNumber: value.certificateNumber, status: value.status, version: value.version }, commandId, actorId);
          return value;
        });
    },

    supersedeProductCertification(commandId, actorId, certificationId, input) {
      return execute(commandId, actorId, `supersedeProductCertification:${certificationId}`, input,
        async (tx) => {
          const certification = requireEntity(await tx.getCertificationById(certificationId), 'PRODUCT_CERTIFICATION_NOT_FOUND', { certificationId });
          await authorize(tx, certification.brandId, actorId, CAPABILITIES.PRODUCT_CERTIFICATION_MANAGE);
          const existingByNumber = await tx.getCertificateByNumber(certification.styleId, input?.replacementCertificateNumber);
          return Object.freeze({ certification, existingByNumber });
        },
        async (tx, context) => {
          assertProductCertificationVersion(context.certification, input?.expectedVersion);
          invariant(!context.existingByNumber, 'PRODUCT_CERTIFICATION_ALREADY_EXISTS', 'Certificate number already exists for this style', { certificateNumber: input.replacementCertificateNumber });
          const draftReplacement = createProductCertificationDomain({
            id: nextId('product-certification'),
            styleId: context.certification.styleId,
            brandId: context.certification.brandId,
            certificationType: context.certification.certificationType,
            certificateNumber: input.replacementCertificateNumber,
            issuingBody: input.issuingBody ?? context.certification.issuingBody,
            validFrom: input.validFrom ?? context.certification.validFrom,
            validTo: input.validTo ?? context.certification.validTo,
            createdAt: now(clock),
            createdBy: actorId,
          });
          const { supersededCertification, replacement } = supersedeProductCertificationDomain(context.certification, draftReplacement, { actorId, supersededAt: now(clock) });
          await tx.saveCertification(supersededCertification, input.expectedVersion);
          await tx.insertCertification(replacement);
          await append(tx, 'product-certification.superseded', supersededCertification.id, { styleId: supersededCertification.styleId, certificateNumber: supersededCertification.certificateNumber, replacementCertificationId: replacement.id, replacementCertificateNumber: replacement.certificateNumber }, commandId, actorId);
          return Object.freeze({ supersededCertification, replacement });
        });
    },

    async listForActor(actorId, styleId) {
      return store.transaction(async (tx) => {
        const style = requireEntity(await tx.getStyle(styleId), 'PRODUCT_CERTIFICATION_STYLE_NOT_FOUND', { styleId });
        await authorize(tx, style.brandId, actorId, CAPABILITIES.PRODUCT_CERTIFICATION_READ);
        return tx.listCertificationsForStyle(style.id);
      });
    },
  });
}

function now(clock) {
  const value = clock();
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), 'PRODUCT_CERTIFICATION_CLOCK_INVALID', 'Clock must return an ISO-compatible timestamp');
  return value;
}

function defaultIdGenerator() {
  let sequence = 0;
  return (prefix) => `${prefix}_${Date.now().toString(36)}${(++sequence).toString(36)}`;
}
