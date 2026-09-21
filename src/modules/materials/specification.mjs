import { invariant } from '../../core/errors.mjs';

// Измеримые свойства материала и его состав.
//
// До сих пор о полотне было известно то, что кто-то напечатал: плотность внутри названия, состав
// одной строкой, ширины раскроя нет. Здесь эти свойства становятся числами, которые можно сложить,
// сравнить и опровергнуть.
//
// Ничего выводимого не хранится: себестоимость за единицу расхода и цена DDP — частные уже
// записанных чисел, и хранимая копия разошлась бы при первой правке коэффициента.

export const MATERIAL_WIDTH_UNITS = Object.freeze(['mm', 'cm', 'm']);
export const MATERIAL_PURCHASE_UNITS = Object.freeze(['m', 'kg', 'pc', 'yd']);

const MILLIMETRES = Object.freeze({ mm: 1, cm: 10, m: 1000 });
// Проценты состава сравниваются в тысячных долях целыми: 33,333 три раза дают 99,999, и с плавающей
// точкой этот случай то проходит, то нет в зависимости от порядка сложения.
const PERCENT_SCALE = 1000;

export function widthInMillimetres(value, unit) {
  const width = positiveNumber(value, 'MATERIAL_WIDTH_INVALID', 'Width');
  invariant(MATERIAL_WIDTH_UNITS.includes(unit), 'MATERIAL_WIDTH_UNIT_INVALID', 'Width unit must be mm, cm or m', { unit });
  return width * MILLIMETRES[unit];
}

/**
 * Измеримые свойства полотна.
 *
 * Единица закупки и коэффициент пересчёта называются вместе или не называются вовсе: коэффициент
 * без пары единиц пересчитывает неизвестно что во что. А одна и та же единица, пересчитанная в себя
 * с коэффициентом, отличным от единицы, — опечатка, которая молча перемасштабирует каждую строку
 * ведомости, поэтому она отказывается записываться.
 */
/**
 * @param {{ consumptionUnit?: string, weightGsm?: number|null, cuttableWidth?: number|null,
 *   cuttableWidthUnit?: string|null, countryOfOrigin?: string|null, purchaseUnit?: string|null,
 *   conversionFactor?: number|null, materialSubtype?: string|null }} input
 */
export function materialSpecification({
  consumptionUnit,
  weightGsm = null,
  cuttableWidth = null,
  cuttableWidthUnit = null,
  countryOfOrigin = null,
  purchaseUnit = null,
  conversionFactor = null,
  materialSubtype = null,
} = {}) {
  invariant(MATERIAL_PURCHASE_UNITS.includes(consumptionUnit), 'MATERIAL_UNIT_INVALID',
    'A consumption unit is required', { consumptionUnit });

  const width = optionalPositiveNumber(cuttableWidth, 'MATERIAL_CUTTABLE_WIDTH_INVALID', 'Cuttable width');
  invariant((width === null) === (cuttableWidthUnit === null || cuttableWidthUnit === undefined),
    'MATERIAL_CUTTABLE_WIDTH_UNIT_REQUIRED', 'Cuttable width and its unit are named together or not at all',
    { cuttableWidth, cuttableWidthUnit });
  if (width !== null) {
    invariant(MATERIAL_WIDTH_UNITS.includes(cuttableWidthUnit), 'MATERIAL_WIDTH_UNIT_INVALID',
      'Width unit must be mm, cm or m', { cuttableWidthUnit });
  }

  const factor = optionalPositiveNumber(conversionFactor, 'MATERIAL_CONVERSION_FACTOR_INVALID', 'Conversion factor');
  const buying = purchaseUnit ?? null;
  invariant((factor === null) === (buying === null), 'MATERIAL_CONVERSION_PAIR_REQUIRED',
    'A purchase unit and a conversion factor are named together or not at all', { purchaseUnit, conversionFactor });
  if (buying !== null) {
    invariant(MATERIAL_PURCHASE_UNITS.includes(buying), 'MATERIAL_PURCHASE_UNIT_INVALID',
      'Purchase unit is invalid', { purchaseUnit });
    invariant(buying !== consumptionUnit || factor === 1, 'MATERIAL_CONVERSION_SELF_SCALED',
      'A unit converted into itself has a factor of one', { unit: consumptionUnit, conversionFactor: factor });
  }

  return Object.freeze({
    consumptionUnit,
    weightGsm: optionalPositiveNumber(weightGsm, 'MATERIAL_WEIGHT_INVALID', 'Weight'),
    cuttableWidth: width,
    cuttableWidthUnit: width === null ? null : cuttableWidthUnit,
    cuttableWidthMillimetres: width === null ? null : widthInMillimetres(width, cuttableWidthUnit),
    countryOfOrigin: optionalCountry(countryOfOrigin),
    purchaseUnit: buying,
    conversionFactor: factor,
    materialSubtype: optionalText(materialSubtype, 120, 'MATERIAL_SUBTYPE_INVALID', 'Material subtype'),
  });
}

/**
 * Состав строками, сходящийся ровно в сто процентов.
 *
 * Сто процентов — не формальность: состав печатается на этикетке, его читает покупатель и проверяет
 * надзор, а состав, который не сходится, ложен в обе стороны. Проценты складываются в тысячных
 * долях целыми, поэтому «33,333 три раза» честно отвергается: одно из волокон несёт остаток.
 */
export function materialComposition(rows) {
  const lines = list(rows);
  invariant(lines.length > 0, 'MATERIAL_COMPOSITION_EMPTY', 'A composition needs at least one fibre');

  const seen = new Set();
  const normalized = lines.map((row, index) => {
    const fibreCode = requiredCode(row?.fibreCode, 'MATERIAL_FIBRE_CODE_INVALID', 'Fibre code');
    invariant(!seen.has(fibreCode), 'MATERIAL_FIBRE_REPEATED',
      'A fibre is named once in a composition', { fibreCode });
    seen.add(fibreCode);
    const percentage = scaledPercentage(row?.percentage);
    invariant(row?.fibreRef && typeof row.fibreRef.entryId === 'string' && Number.isInteger(row.fibreRef.version) && row.fibreRef.version > 0,
      'MATERIAL_FIBRE_REF_INVALID', 'A composition line references a governed fibre entry with its version', { fibreCode });
    return Object.freeze({
      fibreCode,
      fibreRef: Object.freeze({ entryId: row.fibreRef.entryId, version: row.fibreRef.version }),
      percentage: percentage / PERCENT_SCALE,
      position: index + 1,
    });
  });

  const total = normalized.reduce((sum, row) => sum + Math.round(row.percentage * PERCENT_SCALE), 0);
  invariant(total === 100 * PERCENT_SCALE, 'MATERIAL_COMPOSITION_NOT_WHOLE',
    'A composition must add up to exactly 100 percent', { totalPercent: total / PERCENT_SCALE });

  return Object.freeze(normalized);
}

/**
 * Себестоимость за единицу расхода.
 *
 * Ткань покупают в одних единицах, а расходуют в других. Без пересчёта ведомость умножает расход в
 * метрах на цену за килограмм, и ошибка не видна ни в одной строке — она видна только в итоге.
 */
export function costPerConsumptionUnit({ unitCost, conversionFactor = null }) {
  const cost = positiveNumber(unitCost, 'MATERIAL_UNIT_COST_INVALID', 'Unit cost');
  if (conversionFactor === null || conversionFactor === undefined) return round4(cost);
  const factor = positiveNumber(conversionFactor, 'MATERIAL_CONVERSION_FACTOR_INVALID', 'Conversion factor');
  return round4(cost / factor);
}

/**
 * Цена DDP за единицу расхода — цена у ворот поставщика, доведённая до склада.
 *
 * Коэффициент приходит снаружи: логистические коэффициенты живут в целевом ценообразовании, и
 * второй их источник разошёлся бы с первым при первой же правке. Меньше единицы он быть не может —
 * дорога только добавляет к цене.
 */
export function ddpPricePerConsumptionUnit({ unitCost, conversionFactor = null, logisticsCoefficient }) {
  const base = costPerConsumptionUnit({ unitCost, conversionFactor });
  const coefficient = positiveNumber(logisticsCoefficient, 'MATERIAL_LOGISTICS_COEFFICIENT_INVALID', 'Logistics coefficient');
  invariant(coefficient >= 1, 'MATERIAL_LOGISTICS_COEFFICIENT_BELOW_ONE',
    'Freight, duty and handling only add to a price', { logisticsCoefficient: coefficient });
  return round4(base * coefficient);
}

/**
 * Настил не шире полотна. Полотно без заявленной ширины раскроя — не повод отказать: старые
 * материалы её не несут, и требовать её задним числом значило бы остановить работу из-за
 * недостающего справочного поля.
 */
export function assertSpreadFitsCloth({ fabricWidth, fabricWidthUnit, cuttableWidth = null, cuttableWidthUnit = null }) {
  if (fabricWidth === null || fabricWidth === undefined) return null;
  const laid = widthInMillimetres(fabricWidth, fabricWidthUnit);
  if (cuttableWidth === null || cuttableWidth === undefined) return Object.freeze({ laidMillimetres: laid, clothMillimetres: null, slackMillimetres: null });
  const cloth = widthInMillimetres(cuttableWidth, cuttableWidthUnit);
  invariant(laid <= cloth, 'CUTTING_SPREAD_WIDER_THAN_CLOTH',
    'A spread cannot be laid wider than the cloth it is laid on',
    { laidMillimetres: laid, clothMillimetres: cloth });
  return Object.freeze({ laidMillimetres: laid, clothMillimetres: cloth, slackMillimetres: cloth - laid });
}

function list(value) { return Array.isArray(value) ? value : []; }
function round4(value) { return Math.round(value * 10_000) / 10_000; }

function scaledPercentage(value) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0 && number <= 100, 'MATERIAL_FIBRE_PERCENTAGE_INVALID',
    'A fibre percentage is a positive number up to one hundred', { percentage: value });
  const scaled = Math.round(number * PERCENT_SCALE);
  invariant(Math.abs(number * PERCENT_SCALE - scaled) < 1e-6, 'MATERIAL_FIBRE_PERCENTAGE_INVALID',
    'A fibre percentage uses at most three decimal places', { percentage: value });
  return scaled;
}

function positiveNumber(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0, code, `${label} must be a positive number`, { value });
  return number;
}

function optionalPositiveNumber(value, code, label) {
  if (value === null || value === undefined) return null;
  return positiveNumber(value, code, label);
}

function optionalCountry(value) {
  if (value === null || value === undefined || value === '') return null;
  invariant(typeof value === 'string' && /^[A-Z]{2}$/.test(value), 'MATERIAL_COUNTRY_INVALID',
    'Country of origin is an ISO 3166-1 alpha-2 code', { countryOfOrigin: value });
  return value;
}

function optionalText(value, maximum, code, label) {
  if (value === null || value === undefined || value === '') return null;
  invariant(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= maximum, code, `${label} is invalid`, { value });
  return value.trim();
}

function requiredCode(value, code, label) {
  invariant(typeof value === 'string' && /^[A-Z0-9][A-Z0-9_.:/-]{0,127}$/.test(value.trim()), code, `${label} is invalid`, { value });
  return value.trim();
}
