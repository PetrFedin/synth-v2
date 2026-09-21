import { invariant } from '../../core/errors.mjs';
import { PRODUCTION_MILESTONE_CODES } from '../production-execution/public.mjs';
import { QUALITY_DEFECT_SEVERITIES } from '../final-quality/public.mjs';
import { assertOperationFitsCheck } from '../operation-sequences/public.mjs';

// Пооперационный контроль.
//
// A fault found at the operation that made it costs one piece; the same fault found after packing
// costs the lot. This module is what stands between those two, and it is deliberately built on the
// milestones production execution already owns rather than on a stage list of its own — two answers
// to "what stage is this lot at" would drift apart within a season.
//
// Severities come from Final Quality and stage codes from Production Execution for the same reason.
// A defect that is `major` in an inline check and `significant` in a final inspection is two
// vocabularies, and nothing can be counted across two vocabularies.

export const INLINE_CHECK_STATUSES = Object.freeze(['open', 'closed']);
export const INLINE_DISPOSITIONS = Object.freeze(['rework', 'scrap', 'accepted']);
export const DEFECT_TYPE_STATUSES = Object.freeze(['active', 'retired']);
export const DEFECT_ORIGIN_STAGES = PRODUCTION_MILESTONE_CODES;
export const DEFECT_SEVERITIES = QUALITY_DEFECT_SEVERITIES;

/**
 * Register a fault in the brand's catalogue.
 *
 * The severity lives here and not on the occurrence. That is the whole point of a catalogue: a fault
 * that is major in one check and minor in the next cannot be counted, and counting is the only
 * reason to have codes at all. A brand that needs the same fault judged differently in two places
 * has two faults — «пуговица смещена, перёд» and «пуговица смещена, подкладка» — which is how real
 * defect catalogues are written.
 */
export function createDefectType({ id, brandId, code, severity, originStage, nameRu, nameEn, createdAt, actorId }) {
  const created = timestamp(createdAt, 'DEFECT_TYPE_CREATED_AT_INVALID', 'Defect type creation time');
  return freeze({
    id: required(id, 'DEFECT_TYPE_ID_REQUIRED', 'Defect type id', 200),
    brandId: required(brandId, 'DEFECT_TYPE_BRAND_REQUIRED', 'Brand id', 200),
    code: defectCode(code),
    severity: oneOf(severity, DEFECT_SEVERITIES, 'DEFECT_TYPE_SEVERITY_INVALID', 'Defect severity'),
    originStage: originStage === undefined || originStage === null || originStage === ''
      ? null
      : oneOf(originStage, DEFECT_ORIGIN_STAGES, 'DEFECT_TYPE_ORIGIN_STAGE_INVALID', 'Defect origin stage'),
    nameRu: text(nameRu, 2, 160, 'DEFECT_TYPE_NAME_RU_INVALID', 'Defect name (ru)'),
    nameEn: text(nameEn, 2, 160, 'DEFECT_TYPE_NAME_EN_INVALID', 'Defect name (en)'),
    status: 'active',
    version: 1,
    createdAt: created,
    createdBy: required(actorId, 'DEFECT_TYPE_CREATED_BY_REQUIRED', 'Defect type author', 200),
    updatedAt: created,
  });
}

/**
 * Take a fault out of use without taking it out of history.
 *
 * Deleting it would leave every check that recorded it pointing at nothing, and those checks are the
 * record of why a lot was reworked. Retiring says «перестаньте этим пользоваться» and keeps the past
 * readable, which is the only honest way to correct a catalogue.
 */
export function retireDefectType(type, { actorId, at }) {
  invariant(type?.status === 'active', 'DEFECT_TYPE_NOT_ACTIVE', 'Only an active defect type can be retired', { code: type?.code, status: type?.status });
  const moment = timestamp(at, 'DEFECT_TYPE_RETIRED_AT_INVALID', 'Defect type retirement time');
  return freeze({
    ...type,
    status: 'retired',
    version: type.version + 1,
    retiredAt: moment,
    retiredBy: required(actorId, 'DEFECT_TYPE_RETIRED_BY_REQUIRED', 'Defect type retirer', 200),
    updatedAt: moment,
  });
}

/**
 * Record a check performed at one milestone of one lot.
 *
 * Three refusals are worth naming, because each of them is a way the record could otherwise lie:
 *
 *   * a check cannot inspect more pieces than the lot holds;
 *   * it cannot find more defective pieces than it inspected;
 *   * it cannot be recorded against a milestone that is already signed off. A stage that is complete
 *     has had its verdict; adding defects to it afterwards would mean a milestone was completed with
 *     known, undecided defects — the exact thing the gate below exists to prevent.
 */
export function recordInlineCheck({ id, execution, catalogue, input, recordedAt, actorId }) {
  invariant(execution?.status === 'active', 'INLINE_QC_EXECUTION_NOT_ACTIVE', 'Inline quality control applies to an active production execution', { executionCode: execution?.executionCode, status: execution?.status });
  const milestoneCode = oneOf(input?.milestoneCode, DEFECT_ORIGIN_STAGES, 'INLINE_QC_MILESTONE_INVALID', 'Milestone code');
  const milestone = execution.milestones.find((candidate) => candidate.code === milestoneCode);
  invariant(milestone, 'INLINE_QC_MILESTONE_NOT_ON_EXECUTION', 'This production execution has no such milestone', { milestoneCode });
  invariant(milestone.status !== 'completed', 'INLINE_QC_MILESTONE_ALREADY_COMPLETED', 'A completed milestone cannot take a new inline check', { milestoneCode });

  const recorded = timestamp(recordedAt, 'INLINE_QC_RECORDED_AT_INVALID', 'Inline check time');
  invariant(Date.parse(recorded) >= Date.parse(execution.startedAt), 'INLINE_QC_BEFORE_START', 'An inline check cannot precede the start of production');
  const checkedQuantity = positiveInteger(input?.checkedQuantity, 'INLINE_QC_CHECKED_QUANTITY_INVALID', 'Checked quantity');
  invariant(checkedQuantity <= execution.quantity, 'INLINE_QC_CHECKED_EXCEEDS_LOT', 'A check cannot inspect more pieces than the lot holds', { checkedQuantity, quantity: execution.quantity });

  // Проверка может назвать операцию, а не только веху: «нашли на притачивании воротника» вместо
  // «нашли на пошиве». Операция обязана принадлежать этому изделию и этой вехе — иначе ссылка
  // сообщала бы не больше, чем её отсутствие.
  const operationId = input?.operationId ?? null;
  if (operationId) {
    assertOperationFitsCheck(input?.operation, { milestoneCode, sku: execution.sku });
    invariant(input.operation.id === operationId, 'INLINE_QC_OPERATION_NOT_FOUND', 'This operation does not exist', { operationId });
  }

  const defects = normalizeDefects(input?.defects, catalogue, execution.brandId);
  const defectiveQuantity = defects.reduce((total, defect) => total + defect.quantity, 0);
  invariant(defectiveQuantity <= checkedQuantity, 'INLINE_QC_DEFECTIVE_EXCEEDS_CHECKED', 'A check cannot find more defective pieces than it inspected', { defectiveQuantity, checkedQuantity });

  return freeze({
    id: required(id, 'INLINE_QC_ID_REQUIRED', 'Inline check id', 200),
    brandId: execution.brandId,
    executionId: execution.id,
    executionCode: execution.executionCode,
    supplierCode: execution.supplierCode,
    sku: execution.sku,
    lotQuantity: execution.quantity,
    milestoneCode,
    operationId,
    operationCode: operationId ? input.operation.operationCode ?? null : null,
    operationName: operationId ? input.operation.nameRu ?? null : null,
    checkNumber: positiveInteger(input?.checkNumber, 'INLINE_QC_CHECK_NUMBER_INVALID', 'Check number'),
    checkedQuantity,
    defectiveQuantity,
    defects,
    // Доля дефектных на этапе. Kept as a rate rather than left to be recomputed, because it is the
    // number an operation is judged by and it must mean the same thing everywhere it is read.
    defectRate: round4(defectiveQuantity / checkedQuantity),
    status: defectiveQuantity > 0 ? 'open' : 'closed',
    disposition: null,
    dispositionNotes: null,
    inspectorName: text(input?.inspectorName, 2, 160, 'INLINE_QC_INSPECTOR_NAME_INVALID', 'Inspector name'),
    notes: optional(input?.notes, 2000, 'INLINE_QC_NOTES_INVALID', 'Inline check notes'),
    version: 1,
    recordedAt: recorded,
    recordedBy: required(actorId, 'INLINE_QC_RECORDED_BY_REQUIRED', 'Inline check author', 200),
    dispositionedAt: null,
    dispositionedBy: null,
  });
}

/**
 * Decide what happens to what the check found.
 *
 * `accepted` needs a reason and the others do not, and that asymmetry is the point: reworking or
 * scrapping defective pieces explains itself, while shipping them onward is a decision somebody has
 * to own in writing.
 */
export function dispositionInlineCheck(check, { disposition, notes, at, actorId }) {
  invariant(check?.status === 'open', 'INLINE_QC_NOT_OPEN', 'Only an open inline check can be dispositioned', { status: check?.status });
  const decision = oneOf(disposition, INLINE_DISPOSITIONS, 'INLINE_QC_DISPOSITION_INVALID', 'Disposition');
  const moment = timestamp(at, 'INLINE_QC_DISPOSITIONED_AT_INVALID', 'Disposition time');
  invariant(Date.parse(moment) >= Date.parse(check.recordedAt), 'INLINE_QC_DISPOSITION_BEFORE_CHECK', 'A disposition cannot precede the check it decides');
  const reason = decision === 'accepted'
    ? text(notes, 10, 2000, 'INLINE_QC_ACCEPTANCE_REASON_REQUIRED', 'Reason for accepting known defects')
    : optional(notes, 2000, 'INLINE_QC_DISPOSITION_NOTES_INVALID', 'Disposition notes');
  return freeze({
    ...check,
    status: 'closed',
    disposition: decision,
    dispositionNotes: reason,
    version: check.version + 1,
    dispositionedAt: moment,
    dispositionedBy: required(actorId, 'INLINE_QC_DISPOSITIONED_BY_REQUIRED', 'Disposition author', 200),
  });
}

/**
 * The gate: a milestone is not signed off while the defects found on it are undecided.
 *
 * Production execution asks this before completing a milestone. Without it an inline check is a note
 * somebody wrote while known-defective work moved on to the next operation, which is the situation
 * the whole module exists to end.
 */
export function assertMilestoneClearOfOpenChecks(openChecks, milestoneCode) {
  const blocking = list(openChecks).filter((check) => check?.milestoneCode === milestoneCode && check.status === 'open');
  invariant(blocking.length === 0, 'PRODUCTION_MILESTONE_HAS_OPEN_INLINE_CHECK',
    'This milestone has an inline check whose defects nobody has decided about',
    { milestoneCode, openChecks: blocking.map((check) => check.checkNumber) });
}

/**
 * What the inline record says about a lot, for the people who have to act on it.
 *
 * The counts are by severity because that is how the decision is actually made: one critical defect
 * is not three minor ones, and a total that adds them together says nothing.
 */
export function summarizeInlineChecks(checks) {
  const rows = list(checks);
  const counts = { critical: 0, major: 0, minor: 0 };
  let checked = 0;
  let defective = 0;
  for (const check of rows) {
    checked += Number(check.checkedQuantity) || 0;
    defective += Number(check.defectiveQuantity) || 0;
    for (const defect of list(check.defects)) counts[defect.severity] += Number(defect.quantity) || 0;
  }
  return Object.freeze({
    checks: rows.length,
    open: rows.filter((check) => check.status === 'open').length,
    checkedQuantity: checked,
    defectiveQuantity: defective,
    defectRate: checked > 0 ? round4(defective / checked) : 0,
    severityCounts: Object.freeze(counts),
  });
}

/**
 * Where the faults come from, worst first.
 *
 * A list of defects tells nobody what to fix. The same list grouped by the stage the fault
 * originates at is the first thing that does, and it is why `originStage` is on the catalogue.
 */
export function defectPareto(checks, catalogue) {
  const byCode = new Map(list(catalogue).map((type) => [type.code, type]));
  const totals = new Map();
  for (const check of list(checks)) {
    for (const defect of list(check.defects)) {
      const current = totals.get(defect.defectCode) ?? { defectCode: defect.defectCode, severity: defect.severity, quantity: 0, originStage: byCode.get(defect.defectCode)?.originStage ?? null };
      current.quantity += Number(defect.quantity) || 0;
      totals.set(defect.defectCode, current);
    }
  }
  const rank = { critical: 0, major: 1, minor: 2 };
  return Object.freeze([...totals.values()]
    .sort((left, right) => right.quantity - left.quantity || rank[left.severity] - rank[right.severity] || left.defectCode.localeCompare(right.defectCode))
    .map((row) => Object.freeze(row)));
}

function normalizeDefects(value, catalogue, brandId) {
  invariant(Array.isArray(value), 'INLINE_QC_DEFECTS_INVALID', 'Defects must be an array');
  invariant(value.length <= 100, 'INLINE_QC_DEFECTS_INVALID', 'A single check records at most 100 defect lines');
  const byCode = new Map(list(catalogue).map((type) => [type.code, type]));
  const seen = new Set();
  return Object.freeze(value.map((defect, index) => {
    invariant(defect && typeof defect === 'object' && !Array.isArray(defect), 'INLINE_QC_DEFECT_INVALID', 'Defect line is invalid', { index });
    const code = defectCode(defect.defectCode);
    // Свободного текста здесь больше нет: код либо есть в каталоге бренда, либо строки нет.
    const registered = byCode.get(code);
    invariant(registered, 'INLINE_QC_DEFECT_TYPE_NOT_FOUND', 'This defect code is not in the brand catalogue', { defectCode: code });
    invariant(registered.brandId === brandId, 'INLINE_QC_DEFECT_TYPE_FOREIGN', 'This defect code belongs to another brand', { defectCode: code });
    invariant(registered.status === 'active', 'INLINE_QC_DEFECT_TYPE_RETIRED', 'This defect code has been retired', { defectCode: code });
    invariant(!seen.has(code), 'INLINE_QC_DEFECT_DUPLICATED', 'One defect type appears twice in a check, which is an addition error rather than two findings', { defectCode: code });
    seen.add(code);
    return Object.freeze({
      defectTypeId: registered.id,
      defectCode: code,
      // Severity is read from the catalogue, never from the caller.
      severity: registered.severity,
      quantity: positiveInteger(defect.quantity, 'INLINE_QC_DEFECT_QUANTITY_INVALID', 'Defect quantity'),
      notes: optional(defect.notes, 500, 'INLINE_QC_DEFECT_NOTES_INVALID', 'Defect notes'),
    });
  }));
}

function list(value) { return Array.isArray(value) ? value : []; }
function freeze(value) { return Object.freeze(value); }
function round4(value) { return Math.round(value * 10_000) / 10_000; }

function defectCode(value) {
  invariant(typeof value === 'string' && /^[A-Z0-9][A-Z0-9-]{1,63}$/.test(value.trim()), 'DEFECT_CODE_INVALID', 'A defect code is uppercase letters, digits and hyphens', { defectCode: value });
  return value.trim();
}
function oneOf(value, allowed, code, label) {
  invariant(typeof value === 'string' && allowed.includes(value), code, `${label} is invalid`, { value });
  return value;
}
function required(value, code, label, maximum) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= maximum, code, `${label} is required`);
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
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer`, { value });
  return Number(value);
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`);
  return new Date(value).toISOString();
}
