import { invariant } from '../../core/errors.mjs';

// Цвет материала и его утверждение перед закупкой.
//
// У материала до сих пор был один цвет строкой — «Midnight Navy». Это не цвет, а подпись к нему:
// по ней нельзя ни найти, ни сверить, ни сказать, утверждён ли этот оттенок к производству.
//
// Настоящая работа с цветом устроена иначе. Полотно выпускается в нескольких цветах; на каждый цвет
// фабрика красит **лабораторный образец** — физический лоскут — и присылает его бренду; бренд
// сверяет его с эталоном и выносит решение. Пока решения нет, красить тираж нельзя: перекрасить
// принятую партию невозможно, её можно только не принять.
//
// Поэтому здесь два правила несут весь смысл:
//
//   1. **Решение выносится только по присланному образцу.** Утвердить то, чего не присылали, —
//      значит утвердить оттенок, которого никто не видел.
//   2. **Эталон в цвете и сезоне ровно один.** Два действующих утверждения на один цвет означают,
//      что вопрос «какой оттенок правильный» не имеет ответа, а именно на него смотрит приёмка.
//
// Срок действия задаётся датами, а не ссылкой на сезон: партия материала не знает своей кампании —
// до неё пришлось бы идти через исполнение, заказ, SKU и коллекцию, и проверка при выпуске партии
// зависела бы от половины схемы.

export const MATERIAL_COLOUR_STATUSES = Object.freeze(['active', 'retired']);

export const LAB_DIP_STATUSES = Object.freeze([
  'requested',
  'submitted',
  'approved',
  'conditionally_approved',
  'rejected_resubmit',
  'rejected_cancelled',
  'cancelled',
]);

// Утверждение с условием — тоже утверждение: тираж красят. Разница в том, что условие записано и
// его проверяют на приёмке, поэтому оба статуса открывают закупку.
export const LAB_DIP_APPROVED_STATUSES = Object.freeze(['approved', 'conditionally_approved']);
const TERMINAL = Object.freeze(new Set(['approved', 'conditionally_approved', 'rejected_cancelled', 'cancelled']));

const TRANSITIONS = new Map([
  ['requested', new Set(['submitted', 'cancelled'])],
  ['submitted', new Set(['approved', 'conditionally_approved', 'rejected_resubmit', 'rejected_cancelled', 'cancelled'])],
  ['rejected_resubmit', new Set(['submitted', 'cancelled'])],
  ['approved', new Set()],
  ['conditionally_approved', new Set()],
  ['rejected_cancelled', new Set()],
  ['cancelled', new Set()],
]);

/** Цвет, в котором выпускается это полотно. */
export function materialColour({ id, material, colour, supplierColourReference = null, position, createdAt, actorId }) {
  invariant(material?.code, 'MATERIAL_COLOUR_MATERIAL_REQUIRED', 'A material is required');
  const reference = governedColour(colour);
  return Object.freeze({
    id: required(id, 'MATERIAL_COLOUR_ID_REQUIRED', 'Colour id'),
    materialCode: material.code,
    brandId: required(material.brandId, 'MATERIAL_COLOUR_BRAND_REQUIRED', 'Brand'),
    ...reference,
    supplierColourReference: optionalText(supplierColourReference, 120, 'MATERIAL_COLOUR_SUPPLIER_REFERENCE_INVALID', 'Supplier colour reference'),
    position: positiveInteger(position, 'MATERIAL_COLOUR_POSITION_INVALID', 'Position'),
    status: 'active',
    createdAt: timestamp(createdAt, 'MATERIAL_COLOUR_TIMESTAMP_INVALID', 'Timestamp'),
    createdBy: required(actorId, 'MATERIAL_COLOUR_ACTOR_REQUIRED', 'Actor'),
  });
}

/** Образец запрошен у фабрики. */
export function requestLabDip({ id, materialColour: colour, dipReference, supplierCode, campaignId = null, validFrom = null, validTo = null, notes = null, at, actorId }) {
  invariant(colour?.materialCode && colour?.colourCode, 'LAB_DIP_COLOUR_REQUIRED', 'A material colour is required');
  invariant(colour.status !== 'retired', 'LAB_DIP_COLOUR_RETIRED', 'A retired colour is not dyed again', { colourCode: colour.colourCode });
  const from = optionalDate(validFrom, 'LAB_DIP_VALID_FROM_INVALID', 'Valid from');
  const to = optionalDate(validTo, 'LAB_DIP_VALID_TO_INVALID', 'Valid to');
  if (from !== null && to !== null) {
    invariant(Date.parse(to) > Date.parse(from), 'LAB_DIP_VALIDITY_INVERTED',
      'A validity window ends after it begins', { validFrom: from, validTo: to });
  }
  const requestedAt = timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp');
  return Object.freeze({
    id: required(id, 'LAB_DIP_ID_REQUIRED', 'Lab dip id'),
    brandId: colour.brandId,
    materialCode: colour.materialCode,
    materialColourId: colour.id,
    colourEntryId: colour.colourEntryId,
    colourEntryVersion: colour.colourEntryVersion,
    colourCode: colour.colourCode,
    campaignId: campaignId ?? null,
    dipReference: reference(dipReference),
    supplierCode: required(supplierCode, 'LAB_DIP_SUPPLIER_REQUIRED', 'Supplier'),
    status: 'requested',
    // Раунд — не украшение: он говорит, сколько раз фабрика не попала в цвет, и это тот же факт о
    // поставщике, что и задержка поставки.
    submissionRound: 0,
    validFrom: from,
    validTo: to,
    notes: optionalText(notes, 1000, 'LAB_DIP_NOTES_INVALID', 'Notes'),
    requestedAt,
    requestedBy: required(actorId, 'LAB_DIP_ACTOR_REQUIRED', 'Actor'),
    submittedAt: null,
    submittedBy: null,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    version: 1,
    createdAt: requestedAt,
    updatedAt: requestedAt,
  });
}

/** Фабрика прислала лоскут. Повторная присылка идёт следующим раундом. */
export function submitLabDip(dip, { at, actorId, notes = null }) {
  assertTransition(dip, 'submitted');
  return next(dip, {
    status: 'submitted',
    submissionRound: dip.submissionRound + 1,
    submittedAt: timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp'),
    submittedBy: required(actorId, 'LAB_DIP_ACTOR_REQUIRED', 'Actor'),
    // Решение предыдущего раунда снимается вместе с присылкой: иначе запись говорила бы, что
    // образец и отклонён, и прислан заново, не различая, к какому раунду относится отказ.
    decidedAt: null,
    decidedBy: null,
    decisionNote: notes === null ? null : optionalText(notes, 1000, 'LAB_DIP_NOTES_INVALID', 'Notes'),
  }, at, actorId);
}

/**
 * Решение по присланному образцу.
 *
 * Условное утверждение обязано нести условие: «утверждено условно» без записанного условия — это
 * статус, который ничего не сообщает приёмке, а именно она будет его читать. Отказ обязан нести
 * причину по той же причине: фабрика не может попасть в цвет по слову «нет».
 */
export function decideLabDip(dip, { verdict, note = null, at, actorId }) {
  invariant(LAB_DIP_STATUSES.includes(verdict), 'LAB_DIP_VERDICT_INVALID', 'Unknown verdict', { verdict });
  invariant(verdict !== 'submitted' && verdict !== 'requested', 'LAB_DIP_VERDICT_INVALID', 'A decision is not a submission', { verdict });
  assertTransition(dip, verdict);
  const needsNote = verdict === 'conditionally_approved' || verdict === 'rejected_resubmit' || verdict === 'rejected_cancelled';
  const decisionNote = optionalText(note, 1000, 'LAB_DIP_DECISION_NOTE_INVALID', 'Decision note');
  invariant(!needsNote || decisionNote !== null, 'LAB_DIP_DECISION_NOTE_REQUIRED',
    'A conditional approval states its condition, and a rejection states its reason', { verdict });
  return next(dip, {
    status: verdict,
    decidedAt: timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp'),
    // Кто решил — записывается всегда. Запрета «решает не тот, кто прислал» здесь нет намеренно:
    // присылает фабрика, а её присылку в системе фиксирует человек бренда, и в маленькой команде
    // это тот же человек. Запись обоих оставляет это видимым, не останавливая работу.
    decidedBy: required(actorId, 'LAB_DIP_ACTOR_REQUIRED', 'Actor'),
    decisionNote,
  }, at, actorId);
}

export function cancelLabDip(dip, { reason, at, actorId }) {
  assertTransition(dip, 'cancelled');
  const note = optionalText(reason, 1000, 'LAB_DIP_DECISION_NOTE_INVALID', 'Reason');
  invariant(note !== null, 'LAB_DIP_DECISION_NOTE_REQUIRED', 'Cancelling states why');
  return next(dip, { status: 'cancelled', decidedAt: timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp'), decidedBy: required(actorId, 'LAB_DIP_ACTOR_REQUIRED', 'Actor'), decisionNote: note }, at, actorId);
}

/**
 * Действующий эталон цвета на указанный момент.
 *
 * Утверждение с истёкшим сроком — не эталон: сезон кончился, и красить по нему заново нельзя.
 * Когда действующих оказывается больше одного, ответа на вопрос «какой оттенок правильный» нет, и
 * это отказ, а не выбор первого попавшегося.
 */
export function effectiveLabDip(dips, { materialCode, colourCode, at }) {
  const moment = Date.parse(timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp'));
  const effective = list(dips).filter((dip) => dip
    && dip.materialCode === materialCode
    && dip.colourCode === colourCode
    && LAB_DIP_APPROVED_STATUSES.includes(dip.status)
    && (dip.validFrom === null || Date.parse(dip.validFrom) <= moment)
    && (dip.validTo === null || Date.parse(dip.validTo) >= moment));
  if (effective.length === 0) return null;
  invariant(effective.length === 1, 'LAB_DIP_STANDARD_AMBIGUOUS',
    'More than one approved lab dip is effective for this colour', { materialCode, colourCode, count: effective.length });
  return effective[0];
}

/**
 * Партия материала выпускается из карантина только в утверждённом цвете.
 *
 * Партия без названного цвета проверку проходит: фурнитура и старые записи цвета не несут, и
 * требовать его задним числом значило бы остановить склад из-за недостающего справочного поля.
 */
export function assertLotColourIsApproved(lot, { dips, at }) {
  if (!lot?.colourCode) return null;
  const dip = effectiveLabDip(dips, { materialCode: lot.materialCode, colourCode: lot.colourCode, at });
  invariant(dip !== null, 'MATERIAL_LOT_COLOUR_NOT_APPROVED',
    'This colour has no effective approved lab dip, so bulk cannot be released',
    { materialCode: lot.materialCode, colourCode: lot.colourCode });
  return dip;
}

/**
 * Сколько раз фабрика не попала в цвет.
 *
 * Это тот же факт о поставщике, что и срыв срока, и он складывается в ту же оценку: раунды считают
 * по закрытым образцам, потому что открытый ещё может быть принят с первого раза.
 */
export function labDipPerformance(dips) {
  const closed = list(dips).filter((dip) => dip && TERMINAL.has(dip.status) && dip.submissionRound > 0);
  const rounds = closed.reduce((total, dip) => total + dip.submissionRound, 0);
  const approved = closed.filter((dip) => LAB_DIP_APPROVED_STATUSES.includes(dip.status));
  const firstTime = approved.filter((dip) => dip.submissionRound === 1);
  return Object.freeze({
    closedCount: closed.length,
    approvedCount: approved.length,
    rejectedCount: closed.length - approved.length,
    totalRounds: rounds,
    averageRounds: closed.length === 0 ? null : Math.round((rounds / closed.length) * 100) / 100,
    firstTimeApprovalCount: firstTime.length,
    firstTimeApprovalBasisPoints: approved.length === 0 ? null : Math.round((firstTime.length / approved.length) * 10_000),
  });
}

function assertTransition(dip, target) {
  invariant(dip && LAB_DIP_STATUSES.includes(dip.status), 'LAB_DIP_INVALID', 'Lab dip is invalid');
  const allowed = TRANSITIONS.get(dip.status) ?? new Set();
  invariant(allowed.has(target), 'LAB_DIP_TRANSITION_INVALID',
    'A lab dip cannot move between these states', { from: dip.status, to: target });
}

function next(dip, changes, at, actorId) {
  return Object.freeze({
    ...dip,
    ...changes,
    version: dip.version + 1,
    updatedAt: timestamp(at, 'LAB_DIP_TIMESTAMP_INVALID', 'Timestamp'),
    updatedBy: required(actorId, 'LAB_DIP_ACTOR_REQUIRED', 'Actor'),
  });
}

function governedColour(colour) {
  invariant(colour && typeof colour === 'object', 'MATERIAL_COLOUR_REFERENCE_INVALID', 'A governed colour is required');
  invariant(typeof colour.entryId === 'string' && colour.entryId.trim(), 'MATERIAL_COLOUR_REFERENCE_INVALID', 'A colour entry id is required');
  invariant(Number.isInteger(colour.version) && colour.version > 0, 'MATERIAL_COLOUR_REFERENCE_INVALID', 'A colour entry version is required');
  invariant(typeof colour.code === 'string' && /^[A-Z0-9][A-Z0-9_.:/-]{0,127}$/.test(colour.code), 'MATERIAL_COLOUR_REFERENCE_INVALID', 'A colour code is required');
  return {
    colourEntryId: colour.entryId.trim(),
    colourEntryVersion: colour.version,
    colourCode: colour.code,
  };
}

function list(value) { return Array.isArray(value) ? value : []; }
function required(value, code, label) { invariant(typeof value === 'string' && value.trim(), code, `${label} is required`); return value.trim(); }
function reference(value) {
  invariant(typeof value === 'string' && /^[A-Z0-9][A-Z0-9._/-]{1,63}$/.test(value ?? ''), 'LAB_DIP_REFERENCE_INVALID', 'Lab dip reference is invalid', { dipReference: value });
  return value;
}
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer`, { value });
  return Number(value);
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} must be an ISO timestamp`, { value });
  return value;
}
function optionalDate(value, code, label) {
  if (value === null || value === undefined || value === '') return null;
  return timestamp(value, code, label);
}
function optionalText(value, maximum, code, label) {
  if (value === null || value === undefined || value === '') return null;
  invariant(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= maximum, code, `${label} is invalid`, { value });
  return value.trim();
}
