import { createHash } from 'node:crypto';
import { invariant } from '../../core/errors.mjs';

const STYLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const SIZE_SCALE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,63}$/;
const SKU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const COLORWAY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,63}$/;
const ATTRIBUTE_CODE_PATTERN = /^[a-z][a-z0-9_.-]{2,127}$/;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const GTIN_PATTERN = /^(?:[0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$/;

export const STYLE_LIFECYCLE = Object.freeze({
  DRAFT: 'draft',
  IN_DEVELOPMENT: 'in_development',
  SAMPLE_REVIEW: 'sample_review',
  TECHNICALLY_APPROVED: 'technically_approved',
  SOURCING_APPROVED: 'sourcing_approved',
  PURCHASE_OR_PRODUCTION_READY: 'purchase_or_production_ready',
  COMPLIANCE_READY: 'compliance_ready',
  COMMERCIAL_READY: 'commercial_ready',
  ACTIVE: 'active',
  DISCONTINUED: 'discontinued',
  ON_HOLD: 'on_hold',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded',
});

const lifecycleTransitions = new Map([
  [STYLE_LIFECYCLE.DRAFT, new Set([STYLE_LIFECYCLE.IN_DEVELOPMENT, STYLE_LIFECYCLE.REJECTED])],
  [STYLE_LIFECYCLE.IN_DEVELOPMENT, new Set([STYLE_LIFECYCLE.SAMPLE_REVIEW, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.REJECTED])],
  [STYLE_LIFECYCLE.SAMPLE_REVIEW, new Set([STYLE_LIFECYCLE.IN_DEVELOPMENT, STYLE_LIFECYCLE.TECHNICALLY_APPROVED, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.REJECTED])],
  [STYLE_LIFECYCLE.TECHNICALLY_APPROVED, new Set([STYLE_LIFECYCLE.SOURCING_APPROVED, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.SOURCING_APPROVED, new Set([STYLE_LIFECYCLE.PURCHASE_OR_PRODUCTION_READY, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.PURCHASE_OR_PRODUCTION_READY, new Set([STYLE_LIFECYCLE.COMPLIANCE_READY, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.COMPLIANCE_READY, new Set([STYLE_LIFECYCLE.COMMERCIAL_READY, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.COMMERCIAL_READY, new Set([STYLE_LIFECYCLE.ACTIVE, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.ACTIVE, new Set([STYLE_LIFECYCLE.DISCONTINUED, STYLE_LIFECYCLE.ON_HOLD, STYLE_LIFECYCLE.SUPERSEDED])],
  [STYLE_LIFECYCLE.ON_HOLD, new Set([
    STYLE_LIFECYCLE.IN_DEVELOPMENT,
    STYLE_LIFECYCLE.SAMPLE_REVIEW,
    STYLE_LIFECYCLE.TECHNICALLY_APPROVED,
    STYLE_LIFECYCLE.SOURCING_APPROVED,
    STYLE_LIFECYCLE.PURCHASE_OR_PRODUCTION_READY,
    STYLE_LIFECYCLE.COMPLIANCE_READY,
    STYLE_LIFECYCLE.COMMERCIAL_READY,
    STYLE_LIFECYCLE.ACTIVE,
    STYLE_LIFECYCLE.DISCONTINUED,
    STYLE_LIFECYCLE.REJECTED,
    STYLE_LIFECYCLE.SUPERSEDED,
  ])],
  [STYLE_LIFECYCLE.DISCONTINUED, new Set()],
  [STYLE_LIFECYCLE.REJECTED, new Set()],
  [STYLE_LIFECYCLE.SUPERSEDED, new Set()],
]);

const mediaTypes = new Set(['image', 'video', 'document', 'swatch']);
const mediaRoles = new Set(['hero', 'gallery', 'detail', 'swatch', 'technical', 'video', 'document']);
const attributeOwnerTypes = new Set(['style_version', 'colorway', 'sku']);

export const PRODUCT_MEDIA_TYPES = Object.freeze([...mediaTypes]);
export const PRODUCT_MEDIA_ROLES = Object.freeze([...mediaRoles]);
export const PRODUCT_ATTRIBUTE_OWNER_TYPES = Object.freeze([...attributeOwnerTypes]);

export function createProductStyle({ id, brandId, styleCode, createdAt, createdBy }) {
  requireId(id, 'PRODUCT_STYLE_ID_REQUIRED', 'Product Style id is required');
  requireId(brandId, 'PRODUCT_STYLE_BRAND_REQUIRED', 'Product Style brand is required');
  invariant(STYLE_CODE_PATTERN.test(styleCode ?? ''), 'PRODUCT_STYLE_CODE_INVALID', 'Style code must contain 2-64 uppercase letters, numbers, dots, underscores, slashes or dashes');
  requireActor(createdBy, 'PRODUCT_STYLE_CREATED_BY_REQUIRED');
  requireTimestamp(createdAt, 'PRODUCT_STYLE_CREATED_AT_REQUIRED');
  return Object.freeze({
    id,
    brandId,
    styleCode,
    lifecycleStatus: STYLE_LIFECYCLE.DRAFT,
    version: 1,
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  });
}

export function transitionProductStyle(style, nextStatus, { updatedAt, updatedBy }) {
  invariant(style?.id && style?.brandId, 'PRODUCT_STYLE_REQUIRED', 'Product Style is required');
  invariant(lifecycleTransitions.has(style.lifecycleStatus), 'PRODUCT_STYLE_STATUS_INVALID', 'Current Product Style lifecycle status is invalid');
  invariant(lifecycleTransitions.get(style.lifecycleStatus).has(nextStatus), 'PRODUCT_STYLE_TRANSITION_INVALID', 'Product Style lifecycle transition is not allowed', {
    styleId: style.id,
    from: style.lifecycleStatus,
    to: nextStatus,
  });
  requireActor(updatedBy, 'PRODUCT_STYLE_UPDATED_BY_REQUIRED');
  requireTimestamp(updatedAt, 'PRODUCT_STYLE_UPDATED_AT_REQUIRED');
  return Object.freeze({
    ...style,
    lifecycleStatus: nextStatus,
    version: style.version + 1,
    updatedAt,
    updatedBy,
  });
}

export function createProductStyleVersion({
  id,
  style,
  versionNo,
  sourceStyleVersion = null,
  titleRu,
  titleEn,
  categoryRef = null,
  productTypeRef = null,
  genderRef = null,
  technicalPayload = {},
  createdAt,
  createdBy,
}) {
  invariant(style?.id && style?.brandId, 'PRODUCT_STYLE_REQUIRED', 'Product Style is required');
  requireId(id, 'PRODUCT_STYLE_VERSION_ID_REQUIRED', 'Product Style Version id is required');
  requirePositiveInteger(versionNo, 'PRODUCT_STYLE_VERSION_NUMBER_INVALID', 'Product Style Version number');
  requireLocalizedText(titleRu, 2, 200, 'PRODUCT_STYLE_VERSION_TITLE_RU_INVALID', 'Russian title');
  requireLocalizedText(titleEn, 2, 200, 'PRODUCT_STYLE_VERSION_TITLE_EN_INVALID', 'English title');
  requirePlainObject(technicalPayload, 'PRODUCT_STYLE_VERSION_PAYLOAD_INVALID', 'Technical payload must be a plain object');
  assertJsonSerializable(technicalPayload, 'PRODUCT_STYLE_VERSION_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_STYLE_VERSION_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_STYLE_VERSION_CREATED_BY_REQUIRED');

  if (versionNo === 1) {
    invariant(sourceStyleVersion === null, 'PRODUCT_STYLE_VERSION_SOURCE_INVALID', 'Version 1 cannot have a source Style Version');
  } else {
    invariant(sourceStyleVersion?.id, 'PRODUCT_STYLE_VERSION_SOURCE_REQUIRED', 'A later Style Version requires the immediately preceding source version');
    invariant(sourceStyleVersion.styleId === style.id && sourceStyleVersion.brandId === style.brandId, 'PRODUCT_STYLE_VERSION_SOURCE_LINEAGE_MISMATCH', 'Source Style Version must belong to the same Style and brand');
    invariant(sourceStyleVersion.versionNo + 1 === versionNo, 'PRODUCT_STYLE_VERSION_SEQUENCE_INVALID', 'Style Version numbers must be contiguous');
  }

  const normalizedCategoryRef = normalizeMdmRef(categoryRef, 'PRODUCT_STYLE_VERSION_CATEGORY_REF_INVALID');
  const normalizedProductTypeRef = normalizeMdmRef(productTypeRef, 'PRODUCT_STYLE_VERSION_PRODUCT_TYPE_REF_INVALID');
  const normalizedGenderRef = normalizeMdmRef(genderRef, 'PRODUCT_STYLE_VERSION_GENDER_REF_INVALID');
  const content = {
    styleId: style.id,
    brandId: style.brandId,
    versionNo,
    sourceStyleVersionId: sourceStyleVersion?.id ?? null,
    titleRu: titleRu.trim(),
    titleEn: titleEn.trim(),
    categoryRef: normalizedCategoryRef,
    productTypeRef: normalizedProductTypeRef,
    genderRef: normalizedGenderRef,
    technicalPayload,
  };
  return Object.freeze({
    id,
    ...content,
    contentHash: hashCanonical(content),
    createdAt,
    createdBy,
  });
}

export function createProductColorway({
  id,
  styleVersion,
  colorwayCode,
  nameRu,
  nameEn,
  colorRef = null,
  swatchHex = null,
  payload = {},
  createdAt,
  createdBy,
}) {
  invariant(styleVersion?.id && styleVersion?.brandId, 'PRODUCT_STYLE_VERSION_REQUIRED', 'Product Style Version is required');
  requireId(id, 'PRODUCT_COLORWAY_ID_REQUIRED', 'Product Colorway id is required');
  invariant(COLORWAY_CODE_PATTERN.test(colorwayCode ?? ''), 'PRODUCT_COLORWAY_CODE_INVALID', 'Colorway code is invalid');
  requireLocalizedText(nameRu, 1, 160, 'PRODUCT_COLORWAY_NAME_RU_INVALID', 'Russian colorway name');
  requireLocalizedText(nameEn, 1, 160, 'PRODUCT_COLORWAY_NAME_EN_INVALID', 'English colorway name');
  invariant(swatchHex === null || HEX_PATTERN.test(swatchHex), 'PRODUCT_COLORWAY_SWATCH_HEX_INVALID', 'Colorway swatch must be a six-digit HEX value');
  requirePlainObject(payload, 'PRODUCT_COLORWAY_PAYLOAD_INVALID', 'Colorway payload must be a plain object');
  assertJsonSerializable(payload, 'PRODUCT_COLORWAY_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_COLORWAY_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_COLORWAY_CREATED_BY_REQUIRED');
  const normalizedColorRef = normalizeMdmRef(colorRef, 'PRODUCT_COLORWAY_COLOR_REF_INVALID');
  const content = {
    styleVersionId: styleVersion.id,
    brandId: styleVersion.brandId,
    colorwayCode,
    nameRu: nameRu.trim(),
    nameEn: nameEn.trim(),
    colorRef: normalizedColorRef,
    swatchHex,
    payload,
  };
  return Object.freeze({ id, ...content, contentHash: hashCanonical(content), createdAt, createdBy });
}

export function createProductSizeScale({ id, brandId, scaleCode, nameRu, nameEn, createdAt, createdBy }) {
  requireId(id, 'PRODUCT_SIZE_SCALE_ID_REQUIRED', 'Product Size Scale id is required');
  requireId(brandId, 'PRODUCT_SIZE_SCALE_BRAND_REQUIRED', 'Product Size Scale brand is required');
  invariant(SIZE_SCALE_CODE_PATTERN.test(scaleCode ?? ''), 'PRODUCT_SIZE_SCALE_CODE_INVALID', 'Size Scale code is invalid');
  requireLocalizedText(nameRu, 2, 160, 'PRODUCT_SIZE_SCALE_NAME_RU_INVALID', 'Russian Size Scale name');
  requireLocalizedText(nameEn, 2, 160, 'PRODUCT_SIZE_SCALE_NAME_EN_INVALID', 'English Size Scale name');
  requireTimestamp(createdAt, 'PRODUCT_SIZE_SCALE_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_SIZE_SCALE_CREATED_BY_REQUIRED');
  return Object.freeze({
    id,
    brandId,
    scaleCode,
    nameRu: nameRu.trim(),
    nameEn: nameEn.trim(),
    status: 'draft',
    version: 1,
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  });
}

export function updateProductSizeScale(sizeScale, { nameRu, nameEn, status, updatedAt, updatedBy }) {
  invariant(sizeScale?.id && sizeScale?.brandId, 'PRODUCT_SIZE_SCALE_REQUIRED', 'Product Size Scale is required');
  requireLocalizedText(nameRu, 2, 160, 'PRODUCT_SIZE_SCALE_NAME_RU_INVALID', 'Russian Size Scale name');
  requireLocalizedText(nameEn, 2, 160, 'PRODUCT_SIZE_SCALE_NAME_EN_INVALID', 'English Size Scale name');
  invariant(new Set(['draft', 'active', 'inactive', 'archived']).has(status), 'PRODUCT_SIZE_SCALE_STATUS_INVALID', 'Product Size Scale status is invalid');
  requireTimestamp(updatedAt, 'PRODUCT_SIZE_SCALE_UPDATED_AT_REQUIRED');
  requireActor(updatedBy, 'PRODUCT_SIZE_SCALE_UPDATED_BY_REQUIRED');
  return Object.freeze({
    ...sizeScale,
    nameRu: nameRu.trim(),
    nameEn: nameEn.trim(),
    status,
    version: sizeScale.version + 1,
    updatedAt,
    updatedBy,
  });
}

export function createProductSizeScaleVersion({
  id,
  sizeScale,
  versionNo,
  sourceSizeScaleVersion = null,
  sizeSystemRef = null,
  payload = {},
  createdAt,
  createdBy,
}) {
  invariant(sizeScale?.id && sizeScale?.brandId, 'PRODUCT_SIZE_SCALE_REQUIRED', 'Product Size Scale is required');
  requireId(id, 'PRODUCT_SIZE_SCALE_VERSION_ID_REQUIRED', 'Product Size Scale Version id is required');
  requirePositiveInteger(versionNo, 'PRODUCT_SIZE_SCALE_VERSION_NUMBER_INVALID', 'Product Size Scale Version number');
  requirePlainObject(payload, 'PRODUCT_SIZE_SCALE_VERSION_PAYLOAD_INVALID', 'Size Scale payload must be a plain object');
  assertJsonSerializable(payload, 'PRODUCT_SIZE_SCALE_VERSION_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_SIZE_SCALE_VERSION_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_SIZE_SCALE_VERSION_CREATED_BY_REQUIRED');

  if (versionNo === 1) {
    invariant(sourceSizeScaleVersion === null, 'PRODUCT_SIZE_SCALE_VERSION_SOURCE_INVALID', 'Version 1 cannot have a source Size Scale Version');
  } else {
    invariant(sourceSizeScaleVersion?.id, 'PRODUCT_SIZE_SCALE_VERSION_SOURCE_REQUIRED', 'A later Size Scale Version requires the immediately preceding source version');
    invariant(sourceSizeScaleVersion.sizeScaleId === sizeScale.id && sourceSizeScaleVersion.brandId === sizeScale.brandId, 'PRODUCT_SIZE_SCALE_VERSION_SOURCE_LINEAGE_MISMATCH', 'Source Size Scale Version must belong to the same Size Scale and brand');
    invariant(sourceSizeScaleVersion.versionNo + 1 === versionNo, 'PRODUCT_SIZE_SCALE_VERSION_SEQUENCE_INVALID', 'Size Scale Version numbers must be contiguous');
  }

  const normalizedSizeSystemRef = normalizeMdmRef(sizeSystemRef, 'PRODUCT_SIZE_SCALE_SYSTEM_REF_INVALID');
  const content = {
    sizeScaleId: sizeScale.id,
    brandId: sizeScale.brandId,
    versionNo,
    sourceSizeScaleVersionId: sourceSizeScaleVersion?.id ?? null,
    sizeSystemRef: normalizedSizeSystemRef,
    payload,
  };
  return Object.freeze({ id, ...content, contentHash: hashCanonical(content), createdAt, createdBy });
}

export function createProductSizeValue({
  id,
  sizeScaleVersion,
  sizeCode,
  labelRu,
  labelEn,
  sortOrder,
  sizeRef = null,
  payload = {},
  createdAt,
  createdBy,
}) {
  invariant(sizeScaleVersion?.id && sizeScaleVersion?.brandId, 'PRODUCT_SIZE_SCALE_VERSION_REQUIRED', 'Product Size Scale Version is required');
  requireId(id, 'PRODUCT_SIZE_VALUE_ID_REQUIRED', 'Product Size Value id is required');
  requireLocalizedText(sizeCode, 1, 64, 'PRODUCT_SIZE_VALUE_CODE_INVALID', 'Size code');
  requireLocalizedText(labelRu, 1, 80, 'PRODUCT_SIZE_VALUE_LABEL_RU_INVALID', 'Russian Size Value label');
  requireLocalizedText(labelEn, 1, 80, 'PRODUCT_SIZE_VALUE_LABEL_EN_INVALID', 'English Size Value label');
  invariant(Number.isInteger(sortOrder) && sortOrder >= 0, 'PRODUCT_SIZE_VALUE_SORT_ORDER_INVALID', 'Size Value sort order must be a non-negative integer');
  requirePlainObject(payload, 'PRODUCT_SIZE_VALUE_PAYLOAD_INVALID', 'Size Value payload must be a plain object');
  assertJsonSerializable(payload, 'PRODUCT_SIZE_VALUE_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_SIZE_VALUE_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_SIZE_VALUE_CREATED_BY_REQUIRED');
  return Object.freeze({
    id,
    sizeScaleVersionId: sizeScaleVersion.id,
    brandId: sizeScaleVersion.brandId,
    sizeCode: sizeCode.trim(),
    labelRu: labelRu.trim(),
    labelEn: labelEn.trim(),
    sortOrder,
    sizeRef: normalizeMdmRef(sizeRef, 'PRODUCT_SIZE_VALUE_MDM_REF_INVALID'),
    payload,
    createdAt,
    createdBy,
  });
}

export function createProductSku({
  id,
  skuCode,
  styleVersion,
  colorway,
  sizeValue,
  gtin = null,
  payload = {},
  createdAt,
  createdBy,
}) {
  requireId(id, 'PRODUCT_SKU_ID_REQUIRED', 'Product SKU id is required');
  invariant(SKU_CODE_PATTERN.test(skuCode ?? ''), 'PRODUCT_SKU_CODE_INVALID', 'Product SKU code must contain 2-64 uppercase letters, numbers, dots, underscores or dashes');
  invariant(styleVersion?.id && styleVersion?.brandId, 'PRODUCT_STYLE_VERSION_REQUIRED', 'Product Style Version is required');
  invariant(colorway?.id && colorway?.brandId, 'PRODUCT_COLORWAY_REQUIRED', 'Product Colorway is required');
  invariant(sizeValue?.id && sizeValue?.brandId, 'PRODUCT_SIZE_VALUE_REQUIRED', 'Product Size Value is required');
  invariant(colorway.styleVersionId === styleVersion.id && colorway.brandId === styleVersion.brandId, 'PRODUCT_SKU_COLORWAY_LINEAGE_MISMATCH', 'Product SKU Colorway must belong to the exact Style Version and brand');
  invariant(sizeValue.brandId === styleVersion.brandId, 'PRODUCT_SKU_SIZE_LINEAGE_MISMATCH', 'Product SKU Size Value must belong to the same brand');
  invariant(gtin === null || GTIN_PATTERN.test(gtin), 'PRODUCT_SKU_GTIN_INVALID', 'GTIN must contain exactly 8, 12, 13 or 14 digits when provided');
  requirePlainObject(payload, 'PRODUCT_SKU_PAYLOAD_INVALID', 'Product SKU payload must be a plain object');
  assertJsonSerializable(payload, 'PRODUCT_SKU_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_SKU_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_SKU_CREATED_BY_REQUIRED');
  const content = {
    skuCode,
    brandId: styleVersion.brandId,
    styleVersionId: styleVersion.id,
    colorwayId: colorway.id,
    sizeValueId: sizeValue.id,
    gtin,
    payload,
  };
  return Object.freeze({ id, ...content, contentHash: hashCanonical(content), createdAt, createdBy });
}

export function createProductMedia({
  id,
  styleVersion,
  colorway = null,
  mediaType,
  mediaRole,
  uri,
  sortOrder,
  contentHash = null,
  payload = {},
  createdAt,
  createdBy,
}) {
  requireId(id, 'PRODUCT_MEDIA_ID_REQUIRED', 'Product Media id is required');
  invariant(styleVersion?.id && styleVersion?.brandId, 'PRODUCT_STYLE_VERSION_REQUIRED', 'Product Style Version is required');
  if (colorway) {
    invariant(colorway.styleVersionId === styleVersion.id && colorway.brandId === styleVersion.brandId, 'PRODUCT_MEDIA_COLORWAY_LINEAGE_MISMATCH', 'Product Media Colorway must belong to the exact Style Version and brand');
  }
  invariant(mediaTypes.has(mediaType), 'PRODUCT_MEDIA_TYPE_INVALID', 'Product Media type is invalid');
  invariant(mediaRoles.has(mediaRole), 'PRODUCT_MEDIA_ROLE_INVALID', 'Product Media role is invalid');
  invariant(typeof uri === 'string' && uri.trim().length > 0 && uri.trim().length <= 2048, 'PRODUCT_MEDIA_URI_INVALID', 'Product Media URI is invalid');
  invariant(Number.isInteger(sortOrder) && sortOrder >= 0, 'PRODUCT_MEDIA_SORT_ORDER_INVALID', 'Product Media sort order must be a non-negative integer');
  invariant(contentHash === null || /^[0-9a-f]{64}$/.test(contentHash), 'PRODUCT_MEDIA_CONTENT_HASH_INVALID', 'Product Media content hash must be lowercase SHA-256 when provided');
  requirePlainObject(payload, 'PRODUCT_MEDIA_PAYLOAD_INVALID', 'Product Media payload must be a plain object');
  assertJsonSerializable(payload, 'PRODUCT_MEDIA_PAYLOAD_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_MEDIA_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_MEDIA_CREATED_BY_REQUIRED');
  return Object.freeze({
    id,
    brandId: styleVersion.brandId,
    styleVersionId: styleVersion.id,
    colorwayId: colorway?.id ?? null,
    mediaType,
    mediaRole,
    uri: uri.trim(),
    sortOrder,
    contentHash,
    payload,
    createdAt,
    createdBy,
  });
}

export function createProductAttributeValue({
  id,
  ownerType,
  owner,
  attributeCode,
  attributeCatalogVersion,
  value,
  mdmRef = null,
  createdAt,
  createdBy,
}) {
  requireId(id, 'PRODUCT_ATTRIBUTE_VALUE_ID_REQUIRED', 'Product Attribute Value id is required');
  invariant(attributeOwnerTypes.has(ownerType), 'PRODUCT_ATTRIBUTE_OWNER_TYPE_INVALID', 'Product Attribute owner type is invalid');
  invariant(owner?.id && owner?.brandId, 'PRODUCT_ATTRIBUTE_OWNER_REQUIRED', 'Product Attribute owner is required');
  invariant(ATTRIBUTE_CODE_PATTERN.test(attributeCode ?? ''), 'PRODUCT_ATTRIBUTE_CODE_INVALID', 'Product Attribute code is invalid');
  invariant(typeof attributeCatalogVersion === 'string' && attributeCatalogVersion.trim().length > 0 && attributeCatalogVersion.trim().length <= 32, 'PRODUCT_ATTRIBUTE_CATALOG_VERSION_INVALID', 'Attribute catalog version is required');
  invariant(value !== undefined, 'PRODUCT_ATTRIBUTE_VALUE_REQUIRED', 'Product Attribute value is required');
  assertJsonSerializable(value, 'PRODUCT_ATTRIBUTE_VALUE_INVALID');
  requireTimestamp(createdAt, 'PRODUCT_ATTRIBUTE_CREATED_AT_REQUIRED');
  requireActor(createdBy, 'PRODUCT_ATTRIBUTE_CREATED_BY_REQUIRED');
  return Object.freeze({
    id,
    brandId: owner.brandId,
    ownerType,
    ownerId: owner.id,
    attributeCode,
    attributeCatalogVersion: attributeCatalogVersion.trim(),
    value,
    mdmRef: normalizeMdmRef(mdmRef, 'PRODUCT_ATTRIBUTE_MDM_REF_INVALID'),
    createdAt,
    createdBy,
  });
}

export function createProductCatalogSkuLink({ id, productSku, catalogSku, brandId, linkedAt, linkedBy }) {
  requireId(id, 'PRODUCT_CATALOG_SKU_LINK_ID_REQUIRED', 'Product/catalog SKU link id is required');
  invariant(productSku?.id && productSku?.skuCode && productSku?.brandId, 'PRODUCT_SKU_REQUIRED', 'Canonical Product SKU is required');
  invariant(catalogSku?.sku && catalogSku?.brandId, 'CATALOG_SKU_REQUIRED', 'Legacy catalog SKU is required');
  invariant(productSku.brandId === brandId && catalogSku.brandId === brandId, 'PRODUCT_CATALOG_SKU_LINK_BRAND_MISMATCH', 'Product/catalog SKU link cannot cross brands');
  invariant(productSku.skuCode === catalogSku.sku, 'PRODUCT_CATALOG_SKU_LINK_CODE_MISMATCH', 'Compatibility link requires the same canonical and catalog SKU code');
  requireTimestamp(linkedAt, 'PRODUCT_CATALOG_SKU_LINKED_AT_REQUIRED');
  requireActor(linkedBy, 'PRODUCT_CATALOG_SKU_LINKED_BY_REQUIRED');
  return Object.freeze({ id, productSkuId: productSku.id, catalogSku: catalogSku.sku, brandId, linkedAt, linkedBy });
}

export function hashProductIdentitySnapshot(value) {
  assertJsonSerializable(value, 'PRODUCT_IDENTITY_SNAPSHOT_INVALID');
  return hashCanonical(value);
}

function normalizeMdmRef(ref, code) {
  if (ref === null || ref === undefined) return null;
  invariant(ref && typeof ref === 'object' && !Array.isArray(ref), code, 'MDM reference must be an object');
  invariant(typeof ref.entryId === 'string' && ref.entryId.length > 0, code, 'MDM reference entryId is required');
  invariant(Number.isInteger(ref.version) && ref.version > 0, code, 'MDM reference version must be a positive integer');
  return Object.freeze({ entryId: ref.entryId, version: ref.version });
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

function assertJsonSerializable(value, code) {
  try {
    const encoded = JSON.stringify(value);
    invariant(encoded !== undefined, code, 'Value must be JSON serializable');
  } catch (error) {
    if (error?.code === code) throw error;
    invariant(false, code, 'Value must be JSON serializable');
  }
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

function requirePositiveInteger(value, code, label) {
  invariant(Number.isInteger(value) && value > 0, code, `${label} must be a positive integer`);
}

function requirePlainObject(value, code, message) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, code, message);
}
