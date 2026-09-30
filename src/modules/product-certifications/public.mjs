import { invariant } from '../../core/errors.mjs';

// Сертификация продукта, выставленная внешним органом (OEKO-TEX, GOTS, GRS и т. п.) на стиль
// бренда — как документ соответствия (`src/modules/compliance-documents/public.mjs`), изменяемая
// шапка с замороженным составом, а не отдельная цепочка версий: у сертификата нет «версии
// содержимого», есть либо черновик, либо навсегда выставленный сертификат, либо сертификат,
// заменённый новым при продлении.

export const PRODUCT_CERTIFICATION_STATUSES = Object.freeze(['draft', 'issued', 'superseded']);

export function createProductCertification({ id, styleId, brandId, certificationType, certificateNumber, issuingBody, validFrom = null, validTo = null, createdAt, createdBy }) {
  const at = timestamp(createdAt, 'PRODUCT_CERTIFICATION_CREATED_AT_INVALID', 'Product Certification creation time');
  const { from, to } = assertValidity(validFrom, validTo);
  return freezeCertification({
    id: identifier(id, 'PRODUCT_CERTIFICATION_ID_REQUIRED', 'Product Certification id'),
    styleId: identifier(styleId, 'PRODUCT_CERTIFICATION_STYLE_REQUIRED', 'Style'),
    brandId: identifier(brandId, 'PRODUCT_CERTIFICATION_BRAND_REQUIRED', 'Brand'),
    certificationType: requiredText(certificationType, 2, 200, 'PRODUCT_CERTIFICATION_TYPE_INVALID', 'Certification type'),
    certificateNumber: requiredText(certificateNumber, 1, 120, 'PRODUCT_CERTIFICATION_NUMBER_INVALID', 'Certificate number'),
    issuingBody: requiredText(issuingBody, 2, 200, 'PRODUCT_CERTIFICATION_ISSUING_BODY_INVALID', 'Issuing body'),
    status: 'draft',
    validFrom: from,
    validTo: to,
    supersedesCertificationId: null,
    version: 1,
    issuedAt: null,
    supersededAt: null,
    createdAt: at,
    createdBy: identifier(createdBy, 'PRODUCT_CERTIFICATION_CREATED_BY_REQUIRED', 'Actor'),
    updatedAt: at,
    updatedBy: identifier(createdBy, 'PRODUCT_CERTIFICATION_CREATED_BY_REQUIRED', 'Actor'),
  });
}

export function issueProductCertification(certification, { actorId, issuedAt }) {
  invariant(certification?.status === 'draft', 'PRODUCT_CERTIFICATION_NOT_DRAFT', 'Only a draft Product Certification can be issued', { status: certification?.status });
  const at = timestamp(issuedAt, 'PRODUCT_CERTIFICATION_ISSUED_AT_INVALID', 'Product Certification issue time');
  return freezeCertification({
    ...certification,
    status: 'issued',
    version: certification.version + 1,
    issuedAt: at,
    updatedAt: at,
    updatedBy: identifier(actorId, 'PRODUCT_CERTIFICATION_UPDATED_BY_REQUIRED', 'Actor'),
  });
}

export function supersedeProductCertification(certification, replacement, { actorId, supersededAt }) {
  invariant(certification?.status === 'issued', 'PRODUCT_CERTIFICATION_NOT_ISSUED', 'Only an issued Product Certification can be superseded', { status: certification?.status });
  invariant(replacement?.status === 'draft', 'PRODUCT_CERTIFICATION_REPLACEMENT_NOT_DRAFT', 'The replacement Product Certification must still be a draft', { status: replacement?.status });
  invariant(replacement.styleId === certification.styleId, 'PRODUCT_CERTIFICATION_REPLACEMENT_STYLE_MISMATCH', 'Replacement Product Certification must belong to the same style');
  const at = timestamp(supersededAt, 'PRODUCT_CERTIFICATION_SUPERSEDED_AT_INVALID', 'Product Certification supersession time');
  const actor = identifier(actorId, 'PRODUCT_CERTIFICATION_UPDATED_BY_REQUIRED', 'Actor');
  const supersededCertification = freezeCertification({
    ...certification,
    status: 'superseded',
    version: certification.version + 1,
    supersededAt: at,
    updatedAt: at,
    updatedBy: actor,
  });
  const replacementLinked = freezeCertification({
    ...replacement,
    supersedesCertificationId: supersededCertification.id,
    updatedAt: at,
    updatedBy: actor,
  });
  return Object.freeze({ supersededCertification, replacement: replacementLinked });
}

export function assertProductCertificationVersion(certification, expectedVersion) {
  invariant(Number.isInteger(expectedVersion) && expectedVersion >= 1, 'PRODUCT_CERTIFICATION_EXPECTED_VERSION_INVALID', 'Expected Product Certification version is invalid', { expectedVersion });
  invariant(certification?.version === expectedVersion, 'PRODUCT_CERTIFICATION_CONCURRENCY_CONFLICT', 'Product Certification was changed by another operation', { certificateNumber: certification?.certificateNumber, expectedVersion, actualVersion: certification?.version });
}

function assertValidity(validFrom, validTo) {
  const from = validFrom === null || validFrom === undefined ? null : isoDate(validFrom, 'PRODUCT_CERTIFICATION_VALID_FROM_INVALID', 'Validity start date');
  const to = validTo === null || validTo === undefined ? null : isoDate(validTo, 'PRODUCT_CERTIFICATION_VALID_TO_INVALID', 'Validity end date');
  invariant(from === null || to === null || to >= from, 'PRODUCT_CERTIFICATION_VALIDITY_RANGE_INVALID', 'Validity end date must not precede its start date');
  return { from, to };
}

function freezeCertification(value) {
  invariant(PRODUCT_CERTIFICATION_STATUSES.includes(value.status), 'PRODUCT_CERTIFICATION_STATUS_INVALID', 'Product Certification status is invalid', { status: value.status });
  return Object.freeze(value);
}
function identifier(value, code, label) { return requiredText(value, 1, 200, code, label); }
function requiredText(value, min, max, code, label) { const normalized = typeof value === 'string' ? value.trim() : ''; invariant(normalized.length >= min && normalized.length <= max, code, `${label} must contain ${min} to ${max} characters`); return normalized; }
function timestamp(value, code, label) { const parsed = Date.parse(value); invariant(typeof value === 'string' && Number.isFinite(parsed), code, `${label} must be an ISO timestamp`); return new Date(parsed).toISOString(); }
function isoDate(value, code, label) { invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)), code, `${label} must be an ISO date (YYYY-MM-DD)`); return value; }
