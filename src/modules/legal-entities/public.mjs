import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';

// Юрлицо стороны сделки. Организация (`organisations`) остаётся собеседником в переписке и владельцем
// прав доступа; юрлицо — то, чьё имя стоит в счёте и договоре, и таких имён у одной организации может
// быть несколько (разные рынки, разные ставки налога). См. миграцию 134 за подробным обоснованием формы:
// изменяемая шапка + неизменяемая цепочка версий, как у размерной шкалы бренда.

const ENTITY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const INN_PATTERN = /^(?:[0-9]{10}|[0-9]{12})$/;
const OGRN_PATTERN = /^(?:[0-9]{13}|[0-9]{15})$/;
const KPP_PATTERN = /^[0-9]{9}$/;
const JURISDICTIONS = Object.freeze(['RU', 'FOREIGN']);

export const LEGAL_ENTITY_STATUS = Object.freeze({ DRAFT: 'draft', ACTIVE: 'active', ARCHIVED: 'archived' });

const statusTransitions = new Map([
  [LEGAL_ENTITY_STATUS.DRAFT, new Set([LEGAL_ENTITY_STATUS.ACTIVE, LEGAL_ENTITY_STATUS.ARCHIVED])],
  [LEGAL_ENTITY_STATUS.ACTIVE, new Set([LEGAL_ENTITY_STATUS.ARCHIVED])],
  [LEGAL_ENTITY_STATUS.ARCHIVED, new Set()],
]);

export function createLegalEntity({ id, organisationId, entityCode, createdAt, createdBy }) {
  requireId(id, 'LEGAL_ENTITY_ID_REQUIRED', 'Legal Entity id is required');
  requireId(organisationId, 'LEGAL_ENTITY_ORGANISATION_REQUIRED', 'Legal Entity organisation is required');
  invariant(ENTITY_CODE_PATTERN.test(entityCode ?? ''), 'LEGAL_ENTITY_CODE_INVALID', 'Legal Entity code is invalid');
  requireTimestamp(createdAt, 'LEGAL_ENTITY_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'LEGAL_ENTITY_CREATED_BY_REQUIRED');
  return Object.freeze({
    id,
    organisationId,
    entityCode,
    status: LEGAL_ENTITY_STATUS.DRAFT,
    version: 1,
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  });
}

export function transitionLegalEntityStatus(legalEntity, nextStatus, { updatedAt, updatedBy }) {
  invariant(legalEntity?.id && legalEntity?.organisationId, 'LEGAL_ENTITY_REQUIRED', 'Legal Entity is required');
  const allowed = statusTransitions.get(legalEntity.status);
  invariant(allowed?.has(nextStatus), 'LEGAL_ENTITY_STATUS_TRANSITION_INVALID', 'Legal Entity status transition is not allowed', {
    from: legalEntity.status, to: nextStatus,
  });
  requireTimestamp(updatedAt, 'LEGAL_ENTITY_UPDATED_AT_REQUIRED');
  requireActor(updatedBy, 'LEGAL_ENTITY_UPDATED_BY_REQUIRED');
  return Object.freeze({ ...legalEntity, status: nextStatus, version: legalEntity.version + 1, updatedAt, updatedBy });
}

export function createLegalEntityVersion({ id, legalEntity, versionNo, sourceLegalEntityVersion, jurisdiction, nameRu, nameEn, requisites, createdAt, createdBy }) {
  requireId(id, 'LEGAL_ENTITY_VERSION_ID_REQUIRED', 'Legal Entity Version id is required');
  invariant(legalEntity?.id && legalEntity?.organisationId, 'LEGAL_ENTITY_REQUIRED', 'Legal Entity is required');
  invariant(Number.isInteger(versionNo) && versionNo > 0, 'LEGAL_ENTITY_VERSION_NO_INVALID', 'Legal Entity Version number must be a positive integer');
  invariant(JURISDICTIONS.includes(jurisdiction), 'LEGAL_ENTITY_JURISDICTION_INVALID', 'Legal Entity jurisdiction must be RU or FOREIGN', { jurisdiction });
  requireLocalizedText(nameRu, 2, 320, 'LEGAL_ENTITY_NAME_RU_INVALID', 'Russian Legal Entity name');
  requireLocalizedText(nameEn, 2, 320, 'LEGAL_ENTITY_NAME_EN_INVALID', 'English Legal Entity name');
  requireTimestamp(createdAt, 'LEGAL_ENTITY_VERSION_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'LEGAL_ENTITY_VERSION_CREATED_BY_REQUIRED');

  if (versionNo === 1) {
    invariant(sourceLegalEntityVersion === null || sourceLegalEntityVersion === undefined, 'LEGAL_ENTITY_VERSION_SOURCE_INVALID', 'Legal Entity Version 1 cannot have a predecessor');
  } else {
    invariant(sourceLegalEntityVersion?.id, 'LEGAL_ENTITY_VERSION_SOURCE_REQUIRED', 'Later Legal Entity Version requires its immediate predecessor');
    invariant(sourceLegalEntityVersion.legalEntityId === legalEntity.id && sourceLegalEntityVersion.organisationId === legalEntity.organisationId, 'LEGAL_ENTITY_VERSION_SOURCE_LINEAGE_MISMATCH', 'Legal Entity Version predecessor must belong to the same Legal Entity/organisation');
    invariant(sourceLegalEntityVersion.versionNo + 1 === versionNo, 'LEGAL_ENTITY_VERSION_SEQUENCE_INVALID', 'Legal Entity Versions must be contiguous');
  }

  const normalizedRequisites = normalizeRequisites(jurisdiction, requisites);
  const content = Object.freeze({
    legalEntityId: legalEntity.id,
    organisationId: legalEntity.organisationId,
    versionNo,
    jurisdiction,
    nameRu: nameRu.trim(),
    nameEn: nameEn.trim(),
    requisites: normalizedRequisites,
    sourceLegalEntityVersionId: sourceLegalEntityVersion?.id ?? null,
  });
  return Object.freeze({ id, ...content, contentHash: hashCanonical(content), createdAt, createdBy });
}

/**
 * У РФ- и зарубежного юрлица разные обязательные поля (ИНН/ОГРН/КПП против регистрационного и
 * налогового номера) — общий для обеих юрисдикций остаётся только юридический адрес. Банковские и
 * прочие второстепенные поля принимаются как есть: это данные реестра, а не то, что домен обязан
 * знать наизусть в форме чек-суммы.
 */
function normalizeRequisites(jurisdiction, requisites) {
  invariant(requisites && typeof requisites === 'object' && !Array.isArray(requisites), 'LEGAL_ENTITY_REQUISITES_INVALID', 'Legal Entity requisites must be an object');
  const legalAddress = requisites.legalAddress;
  invariant(typeof legalAddress === 'string' && legalAddress.trim().length >= 5 && legalAddress.trim().length <= 400, 'LEGAL_ENTITY_ADDRESS_INVALID', 'Legal address must contain 5-400 characters');

  if (jurisdiction === 'RU') {
    invariant(INN_PATTERN.test(requisites.inn ?? ''), 'LEGAL_ENTITY_INN_INVALID', 'INN must be 10 (organisation) or 12 (sole proprietor) digits');
    invariant(OGRN_PATTERN.test(requisites.ogrn ?? ''), 'LEGAL_ENTITY_OGRN_INVALID', 'OGRN must be 13 or OGRNIP 15 digits');
    const kpp = optionalText(requisites.kpp);
    invariant(kpp === null || KPP_PATTERN.test(kpp), 'LEGAL_ENTITY_KPP_INVALID', 'KPP must be 9 digits when present');
    return Object.freeze({
      inn: requisites.inn,
      ogrn: requisites.ogrn,
      kpp,
      legalAddress: legalAddress.trim(),
      actualAddress: optionalText(requisites.actualAddress),
      bankName: optionalText(requisites.bankName),
      bankAccount: optionalText(requisites.bankAccount),
      bankBik: optionalText(requisites.bankBik),
      bankCorrespondentAccount: optionalText(requisites.bankCorrespondentAccount),
      taxationSystem: optionalText(requisites.taxationSystem),
      vatRate: optionalText(requisites.vatRate),
      signatory: optionalText(requisites.signatory),
    });
  }

  invariant(typeof requisites.registrationNumber === 'string' && requisites.registrationNumber.trim().length >= 1 && requisites.registrationNumber.trim().length <= 64, 'LEGAL_ENTITY_REGISTRATION_NUMBER_INVALID', 'Registration number is required');
  invariant(typeof requisites.taxNumber === 'string' && requisites.taxNumber.trim().length >= 1 && requisites.taxNumber.trim().length <= 64, 'LEGAL_ENTITY_TAX_NUMBER_INVALID', 'Tax number is required');
  return Object.freeze({
    registrationNumber: requisites.registrationNumber.trim(),
    taxNumber: requisites.taxNumber.trim(),
    legalAddress: legalAddress.trim(),
    bankName: optionalText(requisites.bankName),
    bankAccount: optionalText(requisites.bankAccount),
    bankCountry: optionalText(requisites.bankCountry),
    swift: optionalText(requisites.swift),
    contractLanguage: optionalText(requisites.contractLanguage),
    currencyRestrictions: optionalText(requisites.currencyRestrictions),
  });
}

function optionalText(value) {
  if (value === undefined || value === null || value === '') return null;
  invariant(typeof value === 'string' && value.trim().length <= 320, 'LEGAL_ENTITY_FIELD_TOO_LONG', 'Legal Entity requisite field is too long');
  return value.trim();
}

function hashCanonical(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function requireId(value, code, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, code, message);
}

function requireActor(value, code) {
  invariant(typeof value === 'string' && value.trim().length > 0, code, 'Actor id is required');
}

function requireTimestamp(value, code) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, 'Timestamp must be an ISO-compatible value');
}

function requireLocalizedText(value, min, max, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, code, `${label} must contain ${min}-${max} characters`);
}
