import { invariant } from '../../core/errors.mjs';
import { assertPostgresInteger, normalizeMoney } from '../../core/money.mjs';

const NOTE_MAX_LENGTH = 2_000;

export function createSelection({ id, cycle, showroom, createdAt }) {
  invariant(id && cycle?.id && showroom?.id, 'SELECTION_IDENTITY_REQUIRED', 'Selection, cycle and showroom are required');
  invariant(cycle.stage === 'showroom', 'SELECTION_CYCLE_STAGE_INVALID', 'Selection can be created only at showroom stage', { stage: cycle.stage });
  invariant(showroom.status === 'open', 'SHOWROOM_NOT_OPEN', 'Selection requires an open showroom');
  invariant(showroom.collectionId === cycle.collectionId, 'SELECTION_COLLECTION_MISMATCH', 'Showroom and cycle must use the same collection');
  invariant(showroom.brandId === cycle.brandId, 'SELECTION_BRAND_MISMATCH', 'Showroom and cycle must use the same brand');
  return Object.freeze({
    id,
    cycleId: cycle.id,
    showroomId: showroom.id,
    collectionId: cycle.collectionId,
    brandId: cycle.brandId,
    shopId: cycle.shopId,
    status: 'draft',
    lines: Object.freeze([]),
    version: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

export function upsertSelectionLine(selection, line, actorId, updatedAt) {
  invariant(selection.status === 'draft', 'SELECTION_NOT_DRAFT', 'Only a draft selection can be edited');
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
  const nextLine = Object.freeze({
    sku: line.sku,
    quantity,
    unitPrice,
    currency: line.currency,
    catalogVersion: line.catalogVersion,
    note,
    updatedBy: actorId,
    updatedAt,
  });
  const existingIndex = selection.lines.findIndex((candidate) => candidate.sku === line.sku);
  const lines = [...selection.lines];
  if (existingIndex >= 0) lines[existingIndex] = nextLine;
  else lines.push(nextLine);
  lines.sort((left, right) => left.sku.localeCompare(right.sku));
  return Object.freeze({ ...selection, lines: Object.freeze(lines), version: selection.version + 1, updatedAt });
}

export function submitSelection(selection, updatedAt) {
  invariant(selection.status === 'draft', 'SELECTION_NOT_DRAFT', 'Only a draft selection can be submitted');
  invariant(selection.lines.length > 0, 'SELECTION_LINES_REQUIRED', 'Selection must contain at least one line');
  const currencies = new Set(selection.lines.map((line) => line.currency));
  invariant(currencies.size === 1, 'SELECTION_CURRENCY_MISMATCH', 'All selection lines must use one currency');
  return Object.freeze({ ...selection, status: 'submitted', version: selection.version + 1, updatedAt });
}
