import { invariant } from '../../core/errors.mjs';
import { assertLotColourIsApproved } from '../material-colours/public.mjs';

// Из какого рулона сшита эта партия.
//
// A material was known — its composition, its mill, its unit — and the bill of materials said how
// much of it a garment takes. Which roll was never recorded, and two questions have no other answer:
// which dye lots ended up in one garment, and where a faulty batch went once the mill reports it.
//
// Ничего здесь не хранится дважды. The unit and the material version come from the material record,
// the requirement is computed from the bill that already states consumption and waste, and «сколько
// осталось» is received minus issued rather than a third number that can disagree with both.

export const MATERIAL_LOT_STATUSES = Object.freeze(['quarantine', 'released', 'rejected']);

/**
 * Принять партию материала.
 *
 * It arrives in quarantine, always. Releasing it is a decision somebody makes after looking at it,
 * and a lot that skipped that decision is indistinguishable from one that passed it — which is the
 * whole reason incoming inspection exists.
 */
export function receiveMaterialLot({ id, material, input, receivedAt, actorId }) {
  invariant(material?.status === 'published', 'MATERIAL_NOT_PUBLISHED', 'A lot can only be received against a published material', { materialCode: material?.code, status: material?.status });
  const received = timestamp(receivedAt, 'MATERIAL_LOT_RECEIVED_AT_INVALID', 'Receipt time');
  return Object.freeze({
    id: required(id, 'MATERIAL_LOT_ID_REQUIRED', 'Material lot id'),
    brandId: required(material.brandId, 'MATERIAL_LOT_BRAND_REQUIRED', 'Brand id'),
    materialCode: material.code,
    materialName: material.name,
    // Версия материала фиксируется: состав и единица измерения могут быть исправлены завтра, а эта
    // партия приехала по тому описанию, которое действовало сегодня.
    materialVersion: positiveInteger(material.version, 'MATERIAL_LOT_VERSION_INVALID', 'Material version'),
    unit: required(material.unit, 'MATERIAL_LOT_UNIT_REQUIRED', 'Unit'),
    lotReference: lotReference(input?.lotReference),
    // Красильная партия есть не у всего: пуговицы и нитки её не имеют, и пустое поле здесь честнее
    // выдуманного номера.
    dyeLot: optional(input?.dyeLot, 64, 'MATERIAL_LOT_DYE_LOT_INVALID', 'Dye lot'),
    // Цвет партии — ссылка на governed-справочник, а не подпись: по номеру крашения нельзя сказать,
    // какой это оттенок и утверждён ли он. Фурнитура цвета не несёт, и это законно.
    ...lotColour(input?.colour),
    supplierCode: optional(input?.supplierCode, 64, 'MATERIAL_LOT_SUPPLIER_INVALID', 'Supplier code'),
    receivedQuantity: quantity(input?.receivedQuantity, 'MATERIAL_LOT_QUANTITY_INVALID', 'Received quantity'),
    issuedQuantity: 0,
    status: 'quarantine',
    receivedAt: received,
    certificateReference: optional(input?.certificateReference, 200, 'MATERIAL_LOT_CERTIFICATE_INVALID', 'Certificate reference'),
    notes: optional(input?.notes, 1000, 'MATERIAL_LOT_NOTES_INVALID', 'Notes'),
    version: 1,
    createdAt: received,
    createdBy: required(actorId, 'MATERIAL_LOT_CREATED_BY_REQUIRED', 'Receiver'),
    updatedAt: received,
  });
}

/** Выпустить из карантина после входного контроля. */
export function releaseMaterialLot(lot, { certificateReference, notes, at, actorId, labDips = [] }) {
  invariant(lot?.status === 'quarantine', 'MATERIAL_LOT_NOT_IN_QUARANTINE', 'Only a quarantined lot can be released', { lotReference: lot?.lotReference, status: lot?.status });
  // Замок на цвет: перекрасить принятую партию невозможно, её можно только не принять. Партия без
  // названного цвета проходит — требовать его задним числом значило бы остановить склад.
  const standard = assertLotColourIsApproved(lot, { dips: labDips, at });
  return transition(lot, {
    status: 'released',
    certificateReference: certificateReference === undefined ? lot.certificateReference : optional(certificateReference, 200, 'MATERIAL_LOT_CERTIFICATE_INVALID', 'Certificate reference'),
    releaseNotes: optional(notes, 1000, 'MATERIAL_LOT_NOTES_INVALID', 'Notes'),
    // По какому эталону выпущена партия — записывается вместе с выпуском: приёмка читает именно
    // его, и «утверждено условно» без ссылки на условие ей ничего не говорит.
    releasedAgainstLabDip: standard === null ? null : standard.dipReference,
  }, at, actorId, 'MATERIAL_LOT_RELEASED_BY_REQUIRED');
}

/**
 * Вернуть в карантин.
 *
 * A problem found after release is ordinary — the mill writes, or a check at the cutting table
 * finds something — and the lot stops moving while it is looked at again. What was already issued
 * stays issued, because it is already in cloth.
 */
export function quarantineMaterialLot(lot, { reason, at, actorId }) {
  invariant(lot?.status === 'released', 'MATERIAL_LOT_NOT_RELEASED', 'Only a released lot can be put back into quarantine', { lotReference: lot?.lotReference, status: lot?.status });
  return transition(lot, {
    status: 'quarantine',
    quarantineReason: text(reason, 5, 1000, 'MATERIAL_LOT_QUARANTINE_REASON_REQUIRED', 'Quarantine reason'),
  }, at, actorId, 'MATERIAL_LOT_QUARANTINED_BY_REQUIRED');
}

/**
 * Не принять партию.
 *
 * Только пока она не в изделиях. Rejecting says «this should never have been used»; once it is in
 * garments that is no longer a status but a claim against the mill and a decision about goods
 * already cut, and letting a status stand in for it would quietly detach the record from the clothes.
 */
export function rejectMaterialLot(lot, { reason, at, actorId }) {
  invariant(lot?.status !== 'rejected', 'MATERIAL_LOT_ALREADY_REJECTED', 'This lot is already rejected', { lotReference: lot?.lotReference });
  invariant(lot.issuedQuantity === 0, 'MATERIAL_LOT_ALREADY_IN_PRODUCTION', 'This lot is already in garments and cannot be rejected', { lotReference: lot.lotReference, issuedQuantity: lot.issuedQuantity });
  return transition(lot, {
    status: 'rejected',
    rejectionReason: text(reason, 5, 1000, 'MATERIAL_LOT_REJECTION_REASON_REQUIRED', 'Rejection reason'),
  }, at, actorId, 'MATERIAL_LOT_REJECTED_BY_REQUIRED');
}

/**
 * Выдать рулон в производство.
 *
 * Остаток — это полученное минус выданное, и никакого третьего числа. A lot cannot give more than it
 * holds, and a quarantined one gives nothing at all, which is what quarantine means.
 */
export function issueMaterialLot(lot, { execution, quantity: requested, notes, issuedAt, actorId, alreadyIssuedToExecution = 0 }) {
  invariant(lot?.status === 'released', 'MATERIAL_LOT_NOT_RELEASED', 'Only a released lot can go into production', { lotReference: lot?.lotReference, status: lot?.status });
  invariant(execution?.brandId === lot.brandId, 'MATERIAL_LOT_FOREIGN_EXECUTION', 'This lot belongs to another brand than the production execution', { lotReference: lot.lotReference });
  invariant(execution.status === 'active', 'MATERIAL_LOT_EXECUTION_NOT_ACTIVE', 'Material goes into an active production execution', { executionCode: execution?.executionCode, status: execution?.status });
  const amount = quantity(requested, 'MATERIAL_LOT_ISSUE_QUANTITY_INVALID', 'Issued quantity');
  const remaining = round4(lot.receivedQuantity - lot.issuedQuantity + alreadyIssuedToExecution);
  invariant(amount <= remaining, 'MATERIAL_LOT_INSUFFICIENT', 'This lot does not hold that much', { lotReference: lot.lotReference, requested: amount, remaining });
  const at = timestamp(issuedAt, 'MATERIAL_LOT_ISSUED_AT_INVALID', 'Issue time');
  invariant(Date.parse(at) >= Date.parse(lot.receivedAt), 'MATERIAL_LOT_ISSUED_BEFORE_RECEIPT', 'A lot cannot be issued before it arrived');

  const issue = Object.freeze({
    lotId: lot.id,
    lotReference: lot.lotReference,
    dyeLot: lot.dyeLot,
    materialCode: lot.materialCode,
    unit: lot.unit,
    executionId: execution.id,
    executionCode: execution.executionCode,
    quantity: amount,
    issuedAt: at,
    issuedBy: required(actorId, 'MATERIAL_LOT_ISSUED_BY_REQUIRED', 'Issuer'),
    notes: optional(notes, 1000, 'MATERIAL_LOT_NOTES_INVALID', 'Notes'),
  });
  const updated = Object.freeze({
    ...lot,
    issuedQuantity: round4(lot.issuedQuantity - alreadyIssuedToExecution + amount),
    version: lot.version + 1,
    updatedAt: at,
  });
  return Object.freeze({ lot: updated, issue });
}

/**
 * Сколько материала нужно этой партии изделий.
 *
 * Taken from the bill, which already states consumption and waste per garment. Restating it here
 * would be a second opinion about the same number.
 */
export function materialRequirement({ bom, quantity: garments }) {
  const count = positiveInteger(garments, 'MATERIAL_REQUIREMENT_QUANTITY_INVALID', 'Garment quantity');
  const lines = Array.isArray(bom?.lines) ? bom.lines : [];
  const byMaterial = new Map();
  for (const line of lines) {
    const perGarment = Number(line.grossQuantity ?? line.quantity);
    if (!Number.isFinite(perGarment) || perGarment <= 0) continue;
    const current = byMaterial.get(line.materialCode) ?? { materialCode: line.materialCode, materialType: line.materialType, unit: line.unit, requiredQuantity: 0 };
    current.requiredQuantity = round4(current.requiredQuantity + perGarment * count);
    byMaterial.set(line.materialCode, current);
  }
  return Object.freeze([...byMaterial.values()].map((row) => Object.freeze(row)));
}

/**
 * Что в этой партии изделий — и что с этим не так.
 *
 * Two findings are computed here rather than stored, because both are comparisons and a stored
 * comparison goes stale:
 *
 *   * **недостача** — the bill needs more of a material than has been issued. Before cutting that is
 *     ordinary; the number is what tells somebody it is still ordinary.
 *
 *   * **разнооттеночность** — one material issued from more than one dye lot. Each roll passed its
 *     own inspection; the fault is in the pairing, and only this comparison can see a pairing.
 */
export function executionTraceability({ execution, bom, issues }) {
  const rows = Array.isArray(issues) ? issues : [];
  const required = new Map(materialRequirement({ bom, quantity: execution.quantity }).map((row) => [row.materialCode, row]));
  const byMaterial = new Map();
  for (const issue of rows) {
    const current = byMaterial.get(issue.materialCode) ?? {
      materialCode: issue.materialCode,
      unit: issue.unit,
      requiredQuantity: required.get(issue.materialCode)?.requiredQuantity ?? null,
      issuedQuantity: 0,
      lots: [],
      dyeLots: [],
    };
    current.issuedQuantity = round4(current.issuedQuantity + Number(issue.quantity));
    current.lots.push(Object.freeze({ lotId: issue.lotId, lotReference: issue.lotReference, dyeLot: issue.dyeLot ?? null, quantity: Number(issue.quantity), issuedAt: issue.issuedAt }));
    if (issue.dyeLot && !current.dyeLots.includes(issue.dyeLot)) current.dyeLots.push(issue.dyeLot);
    byMaterial.set(issue.materialCode, current);
  }
  // Материал, который нужен по ведомости, но не выдан вовсе, — тоже строка: пустая строка видна,
  // а отсутствующая — нет.
  for (const [materialCode, row] of required) {
    if (byMaterial.has(materialCode)) continue;
    byMaterial.set(materialCode, { materialCode, unit: row.unit, requiredQuantity: row.requiredQuantity, issuedQuantity: 0, lots: [], dyeLots: [] });
  }

  const materials = [...byMaterial.values()].map((row) => Object.freeze({
    ...row,
    lots: Object.freeze(row.lots),
    dyeLots: Object.freeze(row.dyeLots),
    shortfallQuantity: row.requiredQuantity === null ? null : round4(Math.max(0, row.requiredQuantity - row.issuedQuantity)),
    multipleDyeLots: row.dyeLots.length > 1,
  })).sort((left, right) => left.materialCode.localeCompare(right.materialCode));

  return Object.freeze({
    executionCode: execution.executionCode,
    quantity: execution.quantity,
    materials: Object.freeze(materials),
    shortfalls: Object.freeze(materials.filter((row) => row.shortfallQuantity !== null && row.shortfallQuantity > 0).map((row) => row.materialCode)),
    // Названо отдельно, потому что это не «чего-то не хватает», а «из этого нельзя шить одну вещь».
    mixedDyeLots: Object.freeze(materials.filter((row) => row.multipleDyeLots).map((row) => row.materialCode)),
  });
}

function transition(lot, patch, at, actorId, actorCode) {
  const moment = timestamp(at, 'MATERIAL_LOT_UPDATED_AT_INVALID', 'Transition time');
  return Object.freeze({
    ...lot,
    ...patch,
    version: lot.version + 1,
    updatedAt: moment,
    updatedBy: required(actorId, actorCode, 'Actor'),
  });
}

function round4(value) { return Math.round(value * 10_000) / 10_000; }
function quantity(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0 && number <= 1_000_000_000, code, `${label} must be a positive quantity`, { value });
  const rounded = round4(number);
  // Четыре знака — это то, что хранит база; молча отбросить пятый значило бы записать не то, что
  // ввели.
  invariant(Math.abs(number - rounded) < 1e-9, code, `${label} carries more precision than a quantity holds`, { value });
  return rounded;
}
function lotReference(value) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(value.trim()), 'MATERIAL_LOT_REFERENCE_INVALID', 'A lot reference is letters, digits and ._/-', { lotReference: value });
  return value.trim();
}
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer`, { value });
  return Number(value);
}
function required(value, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, code, `${label} is required`);
  return value.trim();
}
function text(value, minimum, maximum, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum, code, `${label} is invalid`);
  return value.trim();
}
function optional(value, maximum, code, label) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, 2, maximum, code, label);
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`);
  return new Date(value).toISOString();
}

function lotColour(colour) {
  if (colour === null || colour === undefined) {
    return { colourEntryId: null, colourEntryVersion: null, colourCode: null };
  }
  invariant(typeof colour === 'object' && typeof colour.entryId === 'string' && colour.entryId.trim()
    && Number.isInteger(colour.version) && colour.version > 0
    && typeof colour.code === 'string' && /^[A-Z0-9][A-Z0-9_.:/-]{0,127}$/.test(colour.code),
    'MATERIAL_LOT_COLOUR_INVALID', 'A lot colour references a governed colour entry with its version', { colour });
  return { colourEntryId: colour.entryId.trim(), colourEntryVersion: colour.version, colourCode: colour.code };
}
