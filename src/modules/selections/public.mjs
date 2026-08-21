import { invariant } from '../../core/errors.mjs';
import { assertPostgresInteger, normalizeMoney } from '../../core/money.mjs';
import { assertBuyerCommercialSnapshot } from '../retail-doors/public.mjs';

const NOTE_MAX_LENGTH = 2_000;
const RICH_LINEAGE_KEYS = Object.freeze(['productSkuId', 'styleId', 'styleVersionId', 'colorwayId', 'sizeValueId', 'sizeCode']);
const COMMERCIAL_PROJECTION_LINEAGE_KEYS = Object.freeze([
  'commercialProjectionId',
  'commercialProjectionVersionNo',
  'commercialProjectionContentHash',
  'readinessSnapshotId',
  'styleVersionId',
]);

export function createSelection({ id, cycle, showroom, commercialBasis = null, buyerCommercialSnapshot = null, createdAt }) {
  invariant(id && cycle?.id && showroom?.id, 'SELECTION_IDENTITY_REQUIRED', 'Selection, cycle and showroom are required');
  invariant(cycle.stage === 'showroom', 'SELECTION_CYCLE_STAGE_INVALID', 'Selection can be created only at showroom stage', { stage: cycle.stage });
  invariant(showroom.status === 'open', 'SHOWROOM_NOT_OPEN', 'Selection requires an open showroom');
  invariant(showroom.collectionId === cycle.collectionId, 'SELECTION_COLLECTION_MISMATCH', 'Showroom and cycle must use the same collection');
  invariant(showroom.brandId === cycle.brandId, 'SELECTION_BRAND_MISMATCH', 'Showroom and cycle must use the same brand');
  const basis = commercialBasis ? validateCommercialBasis(commercialBasis, cycle, showroom) : null;
  const buyerContext = basis
    ? assertBuyerCommercialSnapshot(buyerCommercialSnapshot, { shopId: cycle.shopId })
    : null;
  invariant(basis || buyerCommercialSnapshot === null, 'SELECTION_RETAIL_DOOR_REQUIRES_BUYER_CATALOG', 'Retail door context can be pinned only with a BuyerCatalogVersion');
  return Object.freeze({
    id,
    cycleId: cycle.id,
    showroomId: showroom.id,
    collectionId: cycle.collectionId,
    brandId: cycle.brandId,
    shopId: cycle.shopId,
    commercialPublicationId: basis?.publicationId ?? null,
    priceListVersionId: basis?.priceListVersionId ?? null,
    buyerCatalogVersionId: basis?.buyerCatalogVersionId ?? null,
    commercialBasisHash: basis?.contentHash ?? null,
    accessGrantId: basis?.accessGrantId ?? null,
    commercialProjectionId: basis?.commercialProjectionId ?? null,
    commercialProjectionVersionNo: basis?.commercialProjectionVersionNo ?? null,
    commercialProjectionContentHash: basis?.commercialProjectionContentHash ?? null,
    readinessSnapshotId: basis?.readinessSnapshotId ?? null,
    styleVersionId: basis?.styleVersionId ?? null,
    retailDoorId: buyerContext?.retailDoorId ?? null,
    retailDoorVersion: buyerContext?.retailDoorVersion ?? null,
    buyerCommercialSnapshot: buyerContext,
    status: 'draft',
    lines: Object.freeze([]),
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function upsertSelectionLine(selection, line, actorId, updatedAt) {
  invariant(selection.status === 'draft', 'SELECTION_NOT_DRAFT', 'Only a draft selection can be edited');
  const nextLine = normalizeSelectionLine(line, actorId, updatedAt);
  const existingIndex = selection.lines.findIndex((candidate) => candidate.sku === nextLine.sku);
  const lines = [...selection.lines];
  if (existingIndex >= 0) lines[existingIndex] = nextLine;
  else lines.push(nextLine);
  lines.sort((left, right) => left.sku.localeCompare(right.sku));
  return Object.freeze({ ...selection, lines: Object.freeze(lines), version: selection.version + 1, updatedAt });
}

export function replaceSelectionLines(selection, lines, actorId, updatedAt) {
  invariant(selection.status === 'draft', 'SELECTION_NOT_DRAFT', 'Only a draft selection can be edited');
  invariant(Array.isArray(lines), 'SELECTION_MATRIX_LINES_INVALID', 'Selection matrix lines must be an array');
  const seen = new Set();
  const normalized = lines.map((line) => {
    const nextLine = normalizeSelectionLine(line, actorId, updatedAt);
    invariant(!seen.has(nextLine.sku), 'SELECTION_MATRIX_SKU_DUPLICATE', 'Selection matrix contains duplicate SKU', { sku: nextLine.sku });
    seen.add(nextLine.sku);
    return nextLine;
  });
  normalized.sort((left, right) => left.sku.localeCompare(right.sku));
  return Object.freeze({ ...selection, lines: Object.freeze(normalized), version: selection.version + 1, updatedAt });
}

export function submitSelection(selection, updatedAt) {
  invariant(selection.status === 'draft', 'SELECTION_NOT_DRAFT', 'Only a draft selection can be submitted');
  invariant(selection.lines.length > 0, 'SELECTION_LINES_REQUIRED', 'Selection must contain at least one line');
  const currencies = new Set(selection.lines.map((line) => line.currency));
  invariant(currencies.size === 1, 'SELECTION_CURRENCY_MISMATCH', 'All selection lines must use one currency');
  return Object.freeze({ ...selection, status: 'submitted', version: selection.version + 1, updatedAt });
}

function normalizeSelectionLine(line, actorId, updatedAt) {
  invariant(typeof line.sku === 'string' && line.sku.length > 0, 'SELECTION_LINE_SKU_REQUIRED', 'Selection line SKU is required');
  const quantity = assertPostgresInteger(line.quantity, { code: 'SELECTION_LINE_QUANTITY_INVALID', label: 'Selection quantity', min: 1 });
  const unitPrice = normalizeMoney(line.unitPrice, {
    invalidCode: 'SELECTION_LINE_PRICE_INVALID',
    scaleCode: 'SELECTION_LINE_PRICE_SCALE_INVALID',
    overflowCode: 'SELECTION_LINE_PRICE_TOO_LARGE',
    label: 'Selection unit price',
  });
  invariant(/^[A-Z]{3}$/.test(line.currency ?? ''), 'SELECTION_LINE_CURRENCY_INVALID', 'Selection line currency must be an ISO-4217 code');
  invariant(Number.isInteger(line.catalogVersion) && line.catalogVersion > 0, 'SELECTION_CATALOG_VERSION_INVALID', 'Catalog version must be a positive integer');
  const note = typeof line.note === 'string' ? line.note.trim() : '';
  invariant(note.length <= NOTE_MAX_LENGTH, 'SELECTION_LINE_NOTE_TOO_LONG', `Selection note must not exceed ${NOTE_MAX_LENGTH} characters`);
  const lineage = normalizeOptionalLineage(line);
  return Object.freeze({
    sku: line.sku,
    quantity,
    unitPrice,
    currency: line.currency,
    catalogVersion: line.catalogVersion,
    ...(lineage ?? {}),
    note,
    updatedBy: actorId,
    updatedAt,
  });
}

function normalizeOptionalLineage(line) {
  const present = RICH_LINEAGE_KEYS.filter((key) => line[key] !== undefined && line[key] !== null && line[key] !== '');
  if (present.length === 0) return null;
  invariant(present.length === RICH_LINEAGE_KEYS.length, 'SELECTION_LINE_LINEAGE_INCOMPLETE', 'Rich selection line requires complete Product/Style/Colorway/Size lineage', { sku: line.sku, present });
  for (const key of RICH_LINEAGE_KEYS) {
    invariant(typeof line[key] === 'string' && line[key].trim().length > 0, 'SELECTION_LINE_LINEAGE_INVALID', 'Rich selection lineage values must be non-empty strings', { sku: line.sku, key });
  }
  const sizeSortOrder = assertPostgresInteger(line.sizeSortOrder, { code: 'SELECTION_LINE_SIZE_ORDER_INVALID', label: 'Selection size sort order', min: 0 });
  const sizeLabelRu = normalizeOptionalLabel(line.sizeLabelRu, line.sizeCode);
  const sizeLabelEn = normalizeOptionalLabel(line.sizeLabelEn, line.sizeCode);
  const gtin = line.gtin === undefined || line.gtin === null || line.gtin === '' ? null : String(line.gtin).trim();
  return Object.freeze({
    productSkuId: line.productSkuId.trim(),
    styleId: line.styleId.trim(),
    styleVersionId: line.styleVersionId.trim(),
    colorwayId: line.colorwayId.trim(),
    sizeValueId: line.sizeValueId.trim(),
    sizeCode: line.sizeCode.trim(),
    sizeLabelRu,
    sizeLabelEn,
    sizeSortOrder,
    gtin,
  });
}

function normalizeOptionalLabel(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  invariant(typeof value === 'string' && value.trim().length > 0, 'SELECTION_LINE_SIZE_LABEL_INVALID', 'Selection size label must be a non-empty string');
  return value.trim();
}

function validateCommercialBasis(basis, cycle, showroom) {
  invariant(basis && basis.status === 'published', 'SELECTION_BUYER_CATALOG_NOT_PUBLISHED', 'Selection commercial basis must be a published buyer catalog');
  invariant(basis.publicationId && basis.priceListVersionId && basis.id && basis.contentHash && basis.accessGrantId, 'SELECTION_COMMERCIAL_BASIS_INCOMPLETE', 'Selection commercial basis is incomplete');
  invariant(basis.collectionId === cycle.collectionId, 'SELECTION_COMMERCIAL_COLLECTION_MISMATCH', 'Buyer catalog collection does not match cycle');
  invariant(basis.brandId === cycle.brandId, 'SELECTION_COMMERCIAL_BRAND_MISMATCH', 'Buyer catalog brand does not match cycle');
  invariant(basis.shopId === cycle.shopId, 'SELECTION_COMMERCIAL_SHOP_MISMATCH', 'Buyer catalog shop does not match cycle');
  invariant(basis.showroomId === showroom.id, 'SELECTION_COMMERCIAL_SHOWROOM_MISMATCH', 'Buyer catalog showroom does not match selection showroom');
  const projectionLineage = isRichCommercialBasis(basis) ? validateProjectionLineage(basis) : null;
  return Object.freeze({
    publicationId: basis.publicationId,
    priceListVersionId: basis.priceListVersionId,
    buyerCatalogVersionId: basis.id,
    contentHash: basis.contentHash,
    accessGrantId: basis.accessGrantId,
    commercialProjectionId: projectionLineage?.commercialProjectionId ?? null,
    commercialProjectionVersionNo: projectionLineage?.commercialProjectionVersionNo ?? null,
    commercialProjectionContentHash: projectionLineage?.commercialProjectionContentHash ?? null,
    readinessSnapshotId: projectionLineage?.readinessSnapshotId ?? null,
    styleVersionId: projectionLineage?.styleVersionId ?? null,
  });
}

function isRichCommercialBasis(basis) {
  return Array.isArray(basis?.styles) && basis.styles.length > 0;
}

function validateProjectionLineage(basis) {
  const present = COMMERCIAL_PROJECTION_LINEAGE_KEYS.filter((key) => basis[key] !== undefined && basis[key] !== null && basis[key] !== '');
  invariant(present.length === COMMERCIAL_PROJECTION_LINEAGE_KEYS.length, 'SELECTION_COMMERCIAL_PROJECTION_LINEAGE_REQUIRED', 'Rich BuyerCatalogVersion requires complete immutable CommercialProductProjectionVersion lineage', { buyerCatalogVersionId: basis?.id, present });
  for (const key of ['commercialProjectionId', 'commercialProjectionContentHash', 'readinessSnapshotId', 'styleVersionId']) {
    invariant(typeof basis[key] === 'string' && basis[key].trim().length > 0, 'SELECTION_COMMERCIAL_PROJECTION_LINEAGE_INVALID', 'Commercial projection lineage values must be non-empty strings', { buyerCatalogVersionId: basis?.id, key });
  }
  const commercialProjectionVersionNo = assertPostgresInteger(basis.commercialProjectionVersionNo, {
    code: 'SELECTION_COMMERCIAL_PROJECTION_VERSION_INVALID',
    label: 'Commercial projection version',
    min: 1,
  });
  return Object.freeze({
    commercialProjectionId: basis.commercialProjectionId.trim(),
    commercialProjectionVersionNo,
    commercialProjectionContentHash: basis.commercialProjectionContentHash.trim(),
    readinessSnapshotId: basis.readinessSnapshotId.trim(),
    styleVersionId: basis.styleVersionId.trim(),
  });
}
