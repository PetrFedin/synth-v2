import { invariant } from '../../core/errors.mjs';

// Раскройный стол.
//
// Материал прослеживается до рулона, ведомость говорит, сколько ткани уходит на изделие. Между ними
// лежит единственное место, где ткань становится деталями и где эта цифра либо подтверждается, либо
// нет.
//
// Вся арифметика здесь — три действия, и ни одно из них не хранится:
//
//   настелено       = длина раскладки × слои
//   раскроено       = слои × изделий в слое
//   расход на изделие = длина раскладки ÷ изделий в слое
//
// Последнее не зависит от числа слоёв, и это не совпадение: настелив вдвое больше, получишь вдвое
// больше изделий из вдвое большего метража. Именно независимость делает цифру сравнимой с ведомостью
// — а сравнение с ведомостью и есть ответ на вопрос, укладывается ли фабрика в норму.

export const SPREAD_STATUSES = Object.freeze(['laid', 'cut', 'cancelled']);

/**
 * Настелить полотно и положить на него раскладку.
 *
 * Два отказа несут здесь весь смысл. **Снято с рулонов должно равняться настеленному** — это не
 * сверка, а тождество: ткань не берётся ниоткуда и не исчезает. И **настил делается только из
 * рулонов, выданных в те самые партии, которые он раскраивает** — иначе запись о том, из чего сшита
 * партия, расходится с тем, из чего её раскроили, и прослеживаемость перестаёт что-либо значить.
 */
export function laySpread({ id, material, executions, issues, input, laidAt, actorId }) {
  const markerLength = quantity(input?.markerLength, 'CUTTING_MARKER_LENGTH_INVALID', 'Marker length');
  const plies = positiveInteger(input?.plies, 'CUTTING_PLIES_INVALID', 'Number of plies');
  invariant(material?.status === 'published', 'MATERIAL_NOT_PUBLISHED', 'A spread is laid from a published material', { materialCode: material?.code });
  const laid = timestamp(laidAt, 'CUTTING_LAID_AT_INVALID', 'Spread time');

  const outputs = normalizeOutputs(input?.marker, executions, material.brandId);
  const garmentsPerPly = outputs.reduce((total, output) => total + output.garmentsPerPly, 0);
  const clothLaid = round4(markerLength * plies);
  const lots = normalizeLots(input?.lots, issues, outputs, material);
  const clothTaken = round4(lots.reduce((total, lot) => total + lot.quantity, 0));
  invariant(clothTaken === clothLaid, 'CUTTING_CLOTH_DOES_NOT_BALANCE',
    'What was taken off the rolls must equal what was laid on the table',
    { clothTaken, clothLaid, markerLength, plies });

  return Object.freeze({
    id: required(id, 'CUTTING_SPREAD_ID_REQUIRED', 'Spread id'),
    brandId: material.brandId,
    materialCode: material.code,
    unit: material.unit,
    spreadReference: spreadReference(input?.spreadReference),
    markerLength,
    plies,
    fabricWidth: optionalQuantity(input?.fabricWidth, 'CUTTING_FABRIC_WIDTH_INVALID', 'Fabric width'),
    marker: outputs,
    lots,
    status: 'laid',
    laidAt: laid,
    laidBy: required(actorId, 'CUTTING_LAID_BY_REQUIRED', 'Spreader'),
    notes: optionalText(input?.notes, 1000, 'CUTTING_NOTES_INVALID', 'Notes'),
    version: 1,
    createdAt: laid,
    updatedAt: laid,
    // Приводится сразу, чтобы читателю не приходилось повторять деление, которое легко сделать иначе.
    garmentsPerPly,
    clothLaid,
    consumptionPerGarment: round4(markerLength / garmentsPerPly),
  });
}

/** Отметить, что настил раскроен. */
export function markSpreadCut(spread, { at, actorId }) {
  invariant(spread?.status === 'laid', 'CUTTING_SPREAD_NOT_LAID', 'Only a laid spread can be marked cut', { spreadReference: spread?.spreadReference, status: spread?.status });
  const moment = timestamp(at, 'CUTTING_CUT_AT_INVALID', 'Cut time');
  invariant(Date.parse(moment) >= Date.parse(spread.laidAt), 'CUTTING_CUT_BEFORE_LAID', 'A spread cannot be cut before it was laid');
  return Object.freeze({ ...spread, status: 'cut', cutAt: moment, cutBy: required(actorId, 'CUTTING_CUT_BY_REQUIRED', 'Cutter'), version: spread.version + 1, updatedAt: moment });
}

/** Отменить настил. Раскроенный настил отменить нельзя: детали уже вырезаны. */
export function cancelSpread(spread, { reason, at, actorId }) {
  invariant(spread?.status === 'laid', 'CUTTING_SPREAD_NOT_LAID', 'Only a laid spread can be cancelled', { spreadReference: spread?.spreadReference, status: spread?.status });
  const moment = timestamp(at, 'CUTTING_CANCELLED_AT_INVALID', 'Cancellation time');
  return Object.freeze({
    ...spread, status: 'cancelled',
    cancellationReason: text(reason, 5, 1000, 'CUTTING_CANCELLATION_REASON_REQUIRED', 'Cancellation reason'),
    cancelledAt: moment, cancelledBy: required(actorId, 'CUTTING_CANCELLED_BY_REQUIRED', 'Actor'),
    version: spread.version + 1, updatedAt: moment,
  });
}

/**
 * Укладывается ли раскрой в ведомость — и раскроено ли столько, сколько заказано.
 *
 * Плановый расход берётся из ведомости, которая уже хранит его с учётом отхода; повторять его здесь
 * значило бы завести второе мнение об одном числе. Отменённые настилы не считаются ни в ткани, ни в
 * изделиях: они не состоялись.
 */
export function cuttingSummary({ execution, bom, spreads }) {
  const rows = list(spreads).filter((spread) => spread.status !== 'cancelled');
  const planned = new Map();
  for (const line of list(bom?.lines)) {
    const perGarment = Number(line.grossQuantity ?? line.quantity);
    if (!Number.isFinite(perGarment) || perGarment <= 0) continue;
    planned.set(line.materialCode, round4((planned.get(line.materialCode) ?? 0) + perGarment));
  }

  const byMaterial = new Map();
  let garmentsCut = 0;
  for (const spread of rows) {
    const mine = list(spread.marker).filter((output) => output.executionId === execution.id);
    if (!mine.length) continue;
    const perPlyHere = mine.reduce((total, output) => total + output.garmentsPerPly, 0);
    const perPlyTotal = list(spread.marker).reduce((total, output) => total + output.garmentsPerPly, 0);
    const cutHere = perPlyHere * spread.plies;
    garmentsCut += cutHere;
    // Ткань настила делится между партиями пропорционально тому, сколько изделий каждой лежит в
    // слое: одна раскладка на несколько размеров — это общий метраж, а не метраж каждого по
    // отдельности.
    const clothHere = round4(spread.markerLength * spread.plies * (perPlyHere / perPlyTotal));
    const current = byMaterial.get(spread.materialCode) ?? { materialCode: spread.materialCode, unit: spread.unit, clothUsed: 0, garmentsCut: 0, spreads: [] };
    current.clothUsed = round4(current.clothUsed + clothHere);
    current.garmentsCut += cutHere;
    current.spreads.push(Object.freeze({
      spreadReference: spread.spreadReference, plies: spread.plies, markerLength: spread.markerLength,
      garmentsPerPly: perPlyHere, garmentsCut: cutHere, clothUsed: clothHere,
      lots: Object.freeze(list(spread.lots).map((lot) => lot.lotReference)),
    }));
    byMaterial.set(spread.materialCode, current);
  }

  const materials = [...byMaterial.values()].map((row) => {
    const actualPerGarment = row.garmentsCut > 0 ? round4(row.clothUsed / row.garmentsCut) : null;
    const plannedPerGarment = planned.get(row.materialCode) ?? null;
    return Object.freeze({
      ...row,
      spreads: Object.freeze(row.spreads),
      plannedPerGarment,
      actualPerGarment,
      // Перерасход положительный, экономия отрицательная. Знак важнее величины: он сразу говорит,
      // в какую сторону фабрика разошлась с нормой.
      variancePerGarment: plannedPerGarment === null || actualPerGarment === null ? null : round4(actualPerGarment - plannedPerGarment),
      variancePercent: plannedPerGarment ? round4(((actualPerGarment - plannedPerGarment) / plannedPerGarment) * 100) : null,
    });
  }).sort((left, right) => left.materialCode.localeCompare(right.materialCode));

  return Object.freeze({
    executionCode: execution.executionCode,
    orderedQuantity: execution.quantity,
    garmentsCut,
    // Недокрой — обычное состояние посреди раскроя, перекрой — решение, которое кто-то принял.
    // Обе цифры названы, и ни одна не выдаётся за ошибку сама по себе.
    shortfall: Math.max(0, execution.quantity - garmentsCut),
    overcut: Math.max(0, garmentsCut - execution.quantity),
    materials: Object.freeze(materials),
    overConsuming: Object.freeze(materials.filter((row) => row.variancePerGarment !== null && row.variancePerGarment > 0).map((row) => row.materialCode)),
  });
}

function normalizeOutputs(marker, executions, brandId) {
  invariant(Array.isArray(marker) && marker.length >= 1 && marker.length <= 40, 'CUTTING_MARKER_INVALID', 'A marker holds between one and forty production lots');
  const byCode = new Map(list(executions).map((execution) => [execution.executionCode, execution]));
  const seen = new Set();
  return Object.freeze(marker.map((entry, index) => {
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry), 'CUTTING_MARKER_INVALID', 'Marker entry is invalid', { index });
    const executionCode = required(entry.executionCode, 'CUTTING_EXECUTION_CODE_REQUIRED', 'Production execution code');
    const execution = byCode.get(executionCode);
    invariant(execution, 'PRODUCTION_EXECUTION_NOT_FOUND', 'This production execution is not among the ones being cut', { executionCode });
    invariant(execution.brandId === brandId, 'CUTTING_EXECUTION_FOREIGN', 'This production execution belongs to another brand', { executionCode });
    invariant(execution.status === 'active', 'CUTTING_EXECUTION_NOT_ACTIVE', 'Cloth is cut for a lot that is in production', { executionCode, status: execution.status });
    invariant(!seen.has(executionCode), 'CUTTING_EXECUTION_DUPLICATED', 'One production lot appears twice in a marker, which is one number rather than two rows', { executionCode });
    seen.add(executionCode);
    return Object.freeze({
      executionId: execution.id,
      executionCode,
      sku: execution.sku,
      garmentsPerPly: positiveInteger(entry.garmentsPerPly, 'CUTTING_GARMENTS_PER_PLY_INVALID', 'Garments per ply'),
    });
  }));
}

function normalizeLots(lots, issues, outputs, material) {
  invariant(Array.isArray(lots) && lots.length >= 1 && lots.length <= 40, 'CUTTING_LOTS_INVALID', 'A spread is laid from between one and forty rolls');
  const servedExecutions = new Set(outputs.map((output) => output.executionId));
  // Выдано именно в те партии, которые режет этот настил.
  const issuedHere = new Map();
  for (const issue of list(issues)) {
    if (!servedExecutions.has(issue.executionId)) continue;
    issuedHere.set(issue.lotReference, issue);
  }
  const seen = new Set();
  return Object.freeze(lots.map((entry, index) => {
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry), 'CUTTING_LOTS_INVALID', 'Lot entry is invalid', { index });
    const lotReference = required(entry.lotReference, 'CUTTING_LOT_REFERENCE_REQUIRED', 'Lot reference');
    const issue = issuedHere.get(lotReference);
    invariant(issue, 'CUTTING_LOT_NOT_ISSUED_HERE', 'This roll was not issued to any of the production lots this spread cuts', { lotReference });
    invariant(issue.materialCode === material.code, 'CUTTING_LOT_WRONG_MATERIAL', 'This roll is of another material than the spread', { lotReference, lotMaterial: issue.materialCode, spreadMaterial: material.code });
    invariant(!seen.has(lotReference), 'CUTTING_LOT_DUPLICATED', 'One roll appears twice in a spread, which is one quantity rather than two rows', { lotReference });
    seen.add(lotReference);
    const taken = quantity(entry.quantity, 'CUTTING_LOT_QUANTITY_INVALID', 'Cloth taken from this roll');
    // С рулона не берут больше, чем в эту партию выдано. Сумма по всем настилам одного рулона
    // держится триггером в базе; здесь ловится очевидный случай, чтобы отказ пришёл с понятной
    // цифрой, а не как нарушение ограничения.
    const issuedHereQuantity = Number(issue.quantity);
    invariant(!Number.isFinite(issuedHereQuantity) || taken <= issuedHereQuantity, 'CUTTING_EXCEEDS_ISSUED_CLOTH',
      'This spread takes more cloth off the roll than was issued into production',
      { lotReference, taken, issued: issuedHereQuantity });
    return Object.freeze({
      lotId: issue.lotId,
      lotReference,
      dyeLot: issue.dyeLot ?? null,
      quantity: taken,
    });
  }));
}

function list(value) { return Array.isArray(value) ? value : []; }
function round4(value) { return Math.round(value * 10_000) / 10_000; }
function quantity(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0 && number <= 1_000_000_000, code, `${label} must be a positive quantity`, { value });
  const rounded = round4(number);
  invariant(Math.abs(number - rounded) < 1e-9, code, `${label} carries more precision than a quantity holds`, { value });
  return rounded;
}
function optionalQuantity(value, code, label) {
  if (value === undefined || value === null || value === '') return null;
  return quantity(value, code, label);
}
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer`, { value });
  return Number(value);
}
function spreadReference(value) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(value.trim()), 'CUTTING_SPREAD_REFERENCE_INVALID', 'A spread reference is letters, digits and ._/-', { spreadReference: value });
  return value.trim();
}
function required(value, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200, code, `${label} is required`);
  return value.trim();
}
function text(value, minimum, maximum, code, label) {
  invariant(typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum, code, `${label} is invalid`);
  return value.trim();
}
function optionalText(value, maximum, code, label) {
  if (value === undefined || value === null || value === '') return null;
  return text(value, 2, maximum, code, label);
}
function timestamp(value, code, label) {
  invariant(typeof value === 'string' && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`);
  return new Date(value).toISOString();
}
