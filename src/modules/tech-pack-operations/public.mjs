import { invariant } from '../../core/errors.mjs';
import { requiredText } from '../../core/validation.mjs';

// Отношение к последовательности BOL, чтобы это больше не выяснялось заново.
//
// В системе два перечня операций, и они **не дубль**, хотя перекрываются шестью колонками:
//
//   * здесь — операции **внутри выданного техпака**: снимок для фабрики, с классом оборудования,
//     закрывающийся, когда техпак выходит из черновика;
//   * `bol_operations` (миграция 116) — **переиспользуемая последовательность** со стадией и
//     технологическим узлом, на которую ссылается пооперационный контроль.
//
// Настоящий дефект не в том, что их два, а в том, что они **не связаны**: список операций техпака
// набирается руками, хотя опубликованная последовательность для этого SKU уже есть, и два ответа на
// вопрос «какие у изделия операции» могут разойтись. Правильное лечение — выводить список техпака
// из последовательности, а не сливать таблицы: слияние снесло бы правило класса оборудования.


// The sequence of operations a factory performs to make the garment, with the machine each one needs
// and how long it is expected to take. It is the part of a tech pack a production planner reads: it
// is what a line is balanced against and what a quoted make cost is checked against.

const OPERATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;

export const MACHINE_CLASSES = Object.freeze([
  'lockstitch',
  'overlock',
  'coverstitch',
  'blindstitch',
  'bartack',
  'buttonhole',
  'button_attach',
  'fusing',
  'pressing',
  'cutting',
  'manual',
  'other',
]);

const machineClasses = new Set(MACHINE_CLASSES);

export function createTechPackOperation({
  id,
  techPack,
  sequence,
  operationCode,
  nameRu,
  nameEn,
  equipment = null,
  machineClass,
  standardMinutes,
  notes = null,
  createdAt,
  createdBy,
}) {
  invariant(id && techPack?.techPackCode, 'TECH_PACK_OPERATION_IDENTITY_REQUIRED', 'Operation id and tech pack are required');
  // An issued tech pack is what a factory quoted and committed against. Changing the operations
  // underneath it would change the document without changing its revision.
  invariant(techPack.status === 'draft', 'TECH_PACK_NOT_DRAFT', 'Operations can only change while the tech pack is a draft', { status: techPack.status });
  invariant(OPERATION_CODE_PATTERN.test(operationCode ?? ''), 'TECH_PACK_OPERATION_CODE_INVALID', 'Operation code is invalid', { operationCode });
  invariant(Number.isInteger(sequence) && sequence > 0 && sequence <= 999, 'TECH_PACK_OPERATION_SEQUENCE_INVALID', 'Operation sequence must be between 1 and 999', { sequence });
  invariant(machineClasses.has(machineClass), 'TECH_PACK_OPERATION_MACHINE_CLASS_INVALID', 'Unknown machine class', { machineClass, allowed: MACHINE_CLASSES });
  // A standard time of zero is not a measurement, it is a missing one, and it would silently reduce
  // the make cost the whole sequence adds up to.
  invariant(typeof standardMinutes === 'number' && Number.isFinite(standardMinutes) && standardMinutes > 0 && standardMinutes <= 600,
    'TECH_PACK_OPERATION_STANDARD_MINUTES_INVALID', 'Standard time must be above zero and at most 600 minutes', { standardMinutes });
  invariant(typeof createdBy === 'string' && createdBy.trim(), 'TECH_PACK_OPERATION_ACTOR_REQUIRED', 'Operation actor is required');
  invariant(typeof createdAt === 'string' && !Number.isNaN(Date.parse(createdAt)), 'TECH_PACK_OPERATION_TIMESTAMP_INVALID', 'Operation timestamp is invalid');
  return Object.freeze({
    id,
    techPackCode: techPack.techPackCode,
    brandId: techPack.brandId,
    sequence,
    operationCode,
    nameRu: requiredText(nameRu, { code: 'TECH_PACK_OPERATION_NAME_REQUIRED', label: 'Operation name', max: 200 }),
    nameEn: requiredText(nameEn, { code: 'TECH_PACK_OPERATION_NAME_REQUIRED', label: 'Operation name', max: 200 }),
    equipment: equipment ? requiredText(equipment, { code: 'TECH_PACK_OPERATION_EQUIPMENT_INVALID', label: 'Equipment', max: 120 }) : null,
    machineClass,
    standardMinutes: Math.round(standardMinutes * 100) / 100,
    notes: notes ? String(notes).slice(0, 1000) : null,
    createdAt,
    createdBy,
  });
}

// What the sequence says the garment takes to make. A planner balances a line against this, so it is
// derived from the operations every time rather than stored and left to drift.
export function totalStandardMinutes(operations) {
  return Math.round((Array.isArray(operations) ? operations : [])
    .reduce((sum, operation) => sum + (Number(operation?.standardMinutes) || 0), 0) * 100) / 100;
}
