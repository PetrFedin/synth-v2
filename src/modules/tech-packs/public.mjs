import { invariant } from '../../core/errors.mjs';

export const TECH_PACK_STATUSES = Object.freeze(['draft', 'issued', 'superseded', 'withdrawn']);
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,63}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CREATE_FIELDS = Object.freeze(new Set(['techPackCode', 'sku', 'supplierCode', 'supplierName', 'supplierEmail', 'title', 'description', 'constructionNotes', 'qualityNotes', 'packingNotes']));
const EDIT_FIELDS = Object.freeze(new Set(['supplierCode', 'supplierName', 'supplierEmail', 'title', 'description', 'constructionNotes', 'qualityNotes', 'packingNotes']));

export function createTechPack({ id, catalogSku, input, createdAt, revision = 1, sourceTechPackCode = null }) {
  invariant(typeof id === 'string' && ID_PATTERN.test(id), 'TECH_PACK_ID_INVALID', 'Tech pack id is invalid');
  assertObject(input, 'TECH_PACK_INPUT_INVALID', 'Tech pack input is invalid');
  assertAllowedFields(input, CREATE_FIELDS, 'TECH_PACK_FIELD_FORBIDDEN');
  const normalized = normalizeEditable({ catalogSku, input });
  const at = timestamp(createdAt, 'TECH_PACK_CREATED_AT_INVALID');
  return freezeTechPack({
    id,
    techPackCode: code(input.techPackCode, 'TECH_PACK_CODE_INVALID'),
    ...normalized,
    revision: positiveInteger(revision, 999, 'TECH_PACK_REVISION_INVALID'),
    sourceTechPackCode: sourceTechPackCode === null ? null : code(sourceTechPackCode, 'TECH_PACK_SOURCE_CODE_INVALID'),
    status: 'draft',
    version: 1,
    issuedAt: null,
    issuedBy: null,
    withdrawnAt: null,
    withdrawalReason: null,
    createdAt: at,
    updatedAt: at,
  });
}

export function updateDraftTechPack(techPack, { catalogSku, input, updatedAt }) {
  invariant(techPack?.status === 'draft', 'TECH_PACK_NOT_DRAFT', 'Only a draft tech pack can be edited');
  assertObject(input, 'TECH_PACK_INPUT_INVALID', 'Tech pack input is invalid');
  assertAllowedFields(input, EDIT_FIELDS, 'TECH_PACK_FIELD_FORBIDDEN');
  const normalized = normalizeEditable({ catalogSku, input: { sku: techPack.sku, ...input } });
  invariant(normalized.brandId === techPack.brandId, 'TECH_PACK_BRAND_MISMATCH', 'Tech pack brand cannot change');
  const next = { ...techPack, ...normalized };
  if (editableProjection(next) === editableProjection(techPack)) return techPack;
  const at = timestamp(updatedAt, 'TECH_PACK_UPDATED_AT_INVALID');
  assertNotBefore(techPack.updatedAt, at);
  return freezeTechPack({ ...next, version: techPack.version + 1, updatedAt: at });
}

export function issueTechPack(techPack, { catalogSku, bom, measurementChart, approvedSample, actorId, issuedAt }) {
  invariant(techPack?.status === 'draft', 'TECH_PACK_NOT_DRAFT', 'Only a draft tech pack can be issued');
  assertDependencies(techPack, { catalogSku, bom, measurementChart, approvedSample });
  assertDocumentComplete(techPack);
  invariant(typeof actorId === 'string' && ID_PATTERN.test(actorId), 'TECH_PACK_ISSUER_INVALID', 'Tech pack issuer is invalid');
  const at = timestamp(issuedAt, 'TECH_PACK_ISSUED_AT_INVALID');
  assertNotBefore(techPack.updatedAt, at);
  return freezeTechPack({ ...techPack, status: 'issued', version: techPack.version + 1, issuedAt: at, issuedBy: actorId, updatedAt: at });
}

export function createTechPackRevision({ id, issuedTechPack, catalogSku, input, createdAt }) {
  invariant(issuedTechPack?.status === 'issued', 'TECH_PACK_NOT_ISSUED', 'Only an issued tech pack can create a revision');
  assertObject(input, 'TECH_PACK_REVISION_INPUT_INVALID', 'Tech pack revision input is invalid');
  const next = createTechPack({
    id,
    catalogSku,
    createdAt,
    revision: issuedTechPack.revision + 1,
    sourceTechPackCode: issuedTechPack.techPackCode,
    input: {
      techPackCode: input.techPackCode,
      sku: issuedTechPack.sku,
      supplierCode: Object.hasOwn(input, 'supplierCode') ? input.supplierCode : issuedTechPack.supplierCode,
      supplierName: Object.hasOwn(input, 'supplierName') ? input.supplierName : issuedTechPack.supplierName,
      supplierEmail: Object.hasOwn(input, 'supplierEmail') ? input.supplierEmail : issuedTechPack.supplierEmail,
      title: Object.hasOwn(input, 'title') ? input.title : issuedTechPack.title,
      description: Object.hasOwn(input, 'description') ? input.description : issuedTechPack.description,
      constructionNotes: Object.hasOwn(input, 'constructionNotes') ? input.constructionNotes : issuedTechPack.constructionNotes,
      qualityNotes: Object.hasOwn(input, 'qualityNotes') ? input.qualityNotes : issuedTechPack.qualityNotes,
      packingNotes: Object.hasOwn(input, 'packingNotes') ? input.packingNotes : issuedTechPack.packingNotes,
    },
  });
  invariant(next.brandId === issuedTechPack.brandId, 'TECH_PACK_BRAND_MISMATCH', 'Tech pack revision brand cannot change');
  return next;
}

export function supersedeTechPack(techPack, { supersededAt }) {
  invariant(techPack?.status === 'issued', 'TECH_PACK_NOT_ISSUED', 'Only an issued tech pack can be superseded');
  const at = timestamp(supersededAt, 'TECH_PACK_SUPERSEDED_AT_INVALID');
  assertNotBefore(techPack.updatedAt, at);
  return freezeTechPack({ ...techPack, status: 'superseded', version: techPack.version + 1, updatedAt: at });
}

export function withdrawTechPack(techPack, { reason, withdrawnAt }) {
  invariant(['draft', 'issued'].includes(techPack?.status), 'TECH_PACK_NOT_WITHDRAWABLE', 'Only a draft or issued tech pack can be withdrawn');
  const withdrawalReason = requiredText(reason, 5, 500, 'TECH_PACK_WITHDRAWAL_REASON_INVALID');
  const at = timestamp(withdrawnAt, 'TECH_PACK_WITHDRAWN_AT_INVALID');
  assertNotBefore(techPack.updatedAt, at);
  return freezeTechPack({ ...techPack, status: 'withdrawn', version: techPack.version + 1, withdrawnAt: at, withdrawalReason, updatedAt: at });
}

function normalizeEditable({ catalogSku, input }) {
  invariant(catalogSku?.sku === input.sku, 'TECH_PACK_SKU_NOT_FOUND', 'Catalog SKU not found', { sku: input.sku });
  invariant(typeof catalogSku.brandId === 'string' && ID_PATTERN.test(catalogSku.brandId), 'TECH_PACK_BRAND_INVALID', 'Tech pack brand is invalid');
  invariant(Number.isInteger(catalogSku.version) && catalogSku.version >= 1, 'TECH_PACK_SKU_VERSION_INVALID', 'Catalog SKU version is invalid');
  return Object.freeze({
    sku: code(input.sku, 'TECH_PACK_SKU_INVALID'),
    brandId: catalogSku.brandId,
    skuVersion: catalogSku.version,
    supplierCode: optionalCode(input.supplierCode, 'TECH_PACK_SUPPLIER_CODE_INVALID'),
    supplierName: optionalText(input.supplierName, 160, 'TECH_PACK_SUPPLIER_NAME_INVALID'),
    supplierEmail: optionalEmail(input.supplierEmail),
    title: requiredText(input.title, 3, 200, 'TECH_PACK_TITLE_INVALID'),
    description: optionalText(input.description, 4000, 'TECH_PACK_DESCRIPTION_INVALID'),
    constructionNotes: optionalText(input.constructionNotes, 8000, 'TECH_PACK_CONSTRUCTION_NOTES_INVALID'),
    qualityNotes: optionalText(input.qualityNotes, 4000, 'TECH_PACK_QUALITY_NOTES_INVALID'),
    packingNotes: optionalText(input.packingNotes, 4000, 'TECH_PACK_PACKING_NOTES_INVALID'),
  });
}

function assertDependencies(techPack, { catalogSku, bom, measurementChart, approvedSample }) {
  invariant(catalogSku?.sku === techPack.sku && catalogSku.brandId === techPack.brandId, 'TECH_PACK_SKU_MISMATCH', 'Tech pack SKU context is invalid');
  invariant(catalogSku.status === 'published', 'TECH_PACK_SKU_NOT_PUBLISHED', 'SKU must be published before issuing a tech pack');
  invariant(catalogSku.version === techPack.skuVersion, 'TECH_PACK_SKU_SNAPSHOT_STALE', 'Tech pack SKU snapshot is stale');
  invariant(bom?.sku === techPack.sku && bom.brandId === techPack.brandId && bom.status === 'published', 'TECH_PACK_BOM_NOT_PUBLISHED', 'A published BOM is required before issuing a tech pack');
  invariant(measurementChart?.sku === techPack.sku && measurementChart.brandId === techPack.brandId && measurementChart.status === 'published', 'TECH_PACK_MEASUREMENT_NOT_PUBLISHED', 'A published measurement chart is required before issuing a tech pack');
  invariant(approvedSample?.sku === techPack.sku && approvedSample.brandId === techPack.brandId && approvedSample.status === 'approved', 'TECH_PACK_SAMPLE_NOT_APPROVED', 'An approved sample is required before issuing a tech pack');
}

function assertDocumentComplete(value) {
  invariant(value.supplierCode && value.supplierName && value.supplierEmail, 'TECH_PACK_SUPPLIER_REQUIRED', 'Supplier code, name and email are required before issue');
  invariant(value.constructionNotes, 'TECH_PACK_CONSTRUCTION_NOTES_REQUIRED', 'Construction notes are required before issue');
  invariant(value.qualityNotes, 'TECH_PACK_QUALITY_NOTES_REQUIRED', 'Quality notes are required before issue');
  invariant(value.packingNotes, 'TECH_PACK_PACKING_NOTES_REQUIRED', 'Packing notes are required before issue');
}

function editableProjection(value) { return JSON.stringify({ skuVersion: value.skuVersion, supplierCode: value.supplierCode, supplierName: value.supplierName, supplierEmail: value.supplierEmail, title: value.title, description: value.description, constructionNotes: value.constructionNotes, qualityNotes: value.qualityNotes, packingNotes: value.packingNotes }); }
function freezeTechPack(value) { return Object.freeze({ ...value }); }
function assertNotBefore(previous, current) { invariant(Date.parse(current) >= Date.parse(previous), 'TECH_PACK_TIME_ORDER_INVALID', 'Tech pack lifecycle cannot move time backwards', { previous, current }); }
function assertObject(value, errorCode, message) { invariant(value && typeof value === 'object' && !Array.isArray(value), errorCode, message); }
function assertAllowedFields(value, allowed, errorCode) { const forbidden = Object.keys(value).filter((field) => !allowed.has(field)).sort(); invariant(forbidden.length === 0, errorCode, 'Tech pack input contains unsupported fields', { fields: forbidden }); }
function code(value, errorCode) { invariant(typeof value === 'string' && CODE_PATTERN.test(value), errorCode, 'Code is invalid'); return value; }
function optionalCode(value, errorCode) { if (value === undefined || value === null || value === '') return null; return code(value, errorCode); }
function positiveInteger(value, maximum, errorCode) { invariant(Number.isSafeInteger(value) && value >= 1 && value <= maximum, errorCode, 'Value is outside the allowed range'); return value; }
function requiredText(value, minimum, maximum, errorCode) { invariant(typeof value === 'string', errorCode, 'Text is required'); const normalized = value.trim().replace(/\s+/g, ' '); invariant(normalized.length >= minimum && normalized.length <= maximum && !/[\u0000-\u001f\u007f]/.test(normalized), errorCode, 'Text is invalid'); return normalized; }
function optionalText(value, maximum, errorCode) { if (value === undefined || value === null || value === '') return null; return requiredText(value, 1, maximum, errorCode); }
function optionalEmail(value) { if (value === undefined || value === null || value === '') return null; invariant(typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254, 'TECH_PACK_SUPPLIER_EMAIL_INVALID', 'Supplier email is invalid'); return value.toLowerCase(); }
function timestamp(value, errorCode) { invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), errorCode, 'Timestamp is invalid'); return new Date(value).toISOString(); }
