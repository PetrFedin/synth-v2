import { invariant } from '../../core/errors.mjs';

// Плановая экономика сезона: план, цель и факт об одной и той же единице.
//
// Три документа уже отвечают на вопрос «сколько стоит вещь», каждый со своей стороны:
//
//   * плейсхолдер — что планировщик заложил, когда сезон был ещё строкой линейного плана;
//   * целевая цена — сколько нам МОЖНО заплатить, чтобы при этой РРЦ сойтись по марже;
//   * подтверждённый заказ — сколько мы в итоге ЗАПЛАТИЛИ.
//
// Порознь они не сравнивались ни разу, и это ровно тот разрыв, из-за которого сезонная маржа
// сегодня ниоткуда не берётся. Здесь они сводятся — и ни одно из сведённых чисел не хранится:
// все они частные от уже записанных, а хранимая копия разошлась бы при первой правке наценки.
//
// Два правила, без которых сведение было бы не сведением, а видимостью:
//
//   1. **Одна валюта.** Розничная цена в плейсхолдере, котировка фабрики и целевая цена приходят
//      в разных валютах. Сравнение начинается с приведения к валюте РРЦ, и если документы говорят
//      о разных розничных валютах — они планируют разный бизнес, и сведение отказывается быть.
//
//   2. **Одна линейка.** Котировка приводится к ввезённой себестоимости теми же коэффициентами и
//      тем же курсом, которыми считается цель. Посчитать факт другим курсом значило бы получить
//      расхождение, которого в деньгах нет.

/**
 * Что мы на самом деле платим за единицу, приведённое к розничной валюте.
 *
 * Котировка фабрики — цена на условиях FOB в её валюте. До полки эта цена доезжает умноженной на
 * курс и на логистические коэффициенты, и только в таком виде её можно ставить рядом с РРЦ. Это
 * единственное новое число во всей цепочке: цель умеет считаться сверху вниз, а факт снизу вверх
 * до сих пор не поднимался.
 */
export function landedFromQuote({ quotedFobMinor, fxRate, landedFactor }) {
  const quote = nonNegativeMinor(quotedFobMinor, 'SEASON_QUOTE_INVALID', 'Quoted FOB price');
  const rate = positiveNumber(fxRate, 'SEASON_FX_RATE_INVALID', 'FX rate');
  const factor = positiveNumber(landedFactor, 'SEASON_LANDED_FACTOR_INVALID', 'Landed factor');
  return Math.round(quote * rate * factor);
}

/**
 * Маржа в базисных пунктах. Отрицательная — законный ответ: он означает, что вещь продаётся
 * дешевле, чем обходится, и спрятать это округлением было бы худшим, что здесь можно сделать.
 */
export function marginBasisPoints(retailPriceMinor, unitCostMinor) {
  if (retailPriceMinor === null || unitCostMinor === null) return null;
  invariant(retailPriceMinor > 0, 'SEASON_RETAIL_PRICE_INVALID', 'Retail price must be positive to derive a margin', { retailPriceMinor });
  return Math.round(((retailPriceMinor - unitCostMinor) / retailPriceMinor) * 10_000);
}

/**
 * Сведение одного плейсхолдера: план ↔ цель ↔ факт.
 *
 * `realisations` — то, чем слот плана обернулся: по одной записи на связанный SKU, с его
 * опубликованной целевой ценой и котировкой из подтверждённого заказа. Пустой список — законное
 * состояние: слот запланирован, но ещё ничем не стал, и тогда есть только план.
 */
export function placeholderReconciliation(placeholder, realisations = []) {
  const currency = requiredCurrency(placeholder?.currency);
  const retailMinor = optionalMinor(placeholder?.recommendedRetailPriceMinor, 'SEASON_RETAIL_PRICE_INVALID', 'Recommended retail price');
  const plannedUnitCostMinor = optionalMinor(placeholder?.plannedUnitCostMinor, 'SEASON_PLANNED_COST_INVALID', 'Planned unit cost');
  const plannedQuantity = optionalPositiveInteger(placeholder?.plannedQuantity, 'SEASON_PLANNED_QUANTITY_INVALID', 'Planned quantity');

  const rows = list(realisations).map((realisation) => realisationLine(realisation, { currency }));

  // Цель и факт по слоту — средневзвешенные по заказанному количеству, а не средние по SKU.
  // Слот из тысячи футболок и сотни жакетов, усреднённый поштучно, соврал бы в пользу жакета.
  const targetLandedMinor = weightedAverage(rows, 'targetLandedMinor');
  const actualLandedMinor = weightedAverage(rows, 'actualLandedMinor');
  const orderedQuantity = rows.reduce((total, row) => total + (row.orderedQuantity ?? 0), 0);

  // Наценка выводится, а не хранится: она есть частное розничной цены и себестоимости, и
  // четвёртое число рядом с тремя связанными разошлось бы с ними при первой же правке.
  const plannedMarkup = retailMinor !== null && plannedUnitCostMinor ? round4(retailMinor / plannedUnitCostMinor) : null;

  const plannedMarginBasisPoints = marginBasisPoints(retailMinor, plannedUnitCostMinor);
  const targetMarginBasisPoints = marginBasisPoints(retailMinor, targetLandedMinor);
  const actualMarginBasisPoints = marginBasisPoints(retailMinor, actualLandedMinor);

  return Object.freeze({
    placeholderId: placeholder?.id ?? null,
    placeholderCode: placeholder?.placeholderCode ?? null,
    currency,
    recommendedRetailPriceMinor: retailMinor,
    plannedUnitCostMinor,
    plannedMarkup,
    plannedQuantity,
    colourwayCount: optionalPositiveInteger(placeholder?.colourwayCount, 'SEASON_COLOURWAY_COUNT_INVALID', 'Colourway count'),
    realisations: Object.freeze(rows),
    realisedSkuCount: rows.length,
    orderedQuantity: orderedQuantity || null,
    targetLandedMinor,
    actualLandedMinor,
    plannedMarginBasisPoints,
    targetMarginBasisPoints,
    actualMarginBasisPoints,
    // Расхождения знаковые и в тех же единицах, что и то, от чего они считаются: положительное
    // означает, что мы дешевле плана, отрицательное — что дороже.
    planToTargetMinor: difference(plannedUnitCostMinor, targetLandedMinor),
    planToActualMinor: difference(plannedUnitCostMinor, actualLandedMinor),
    targetToActualMinor: difference(targetLandedMinor, actualLandedMinor),
    marginAtRiskBasisPoints: difference(actualMarginBasisPoints, plannedMarginBasisPoints) === null
      ? null
      : actualMarginBasisPoints - plannedMarginBasisPoints,
    // Полнота важнее самого числа: маржа сезона, посчитанная по трети слотов, читается как маржа
    // сезона и ею не является, поэтому слот честно говорит, чем именно он подтверждён.
    coverage: rows.length === 0 ? 'planned-only'
      : actualLandedMinor !== null ? 'confirmed'
      : targetLandedMinor !== null ? 'targeted'
      : 'linked',
  });
}

/**
 * Плановая экономика сезона — свод по слотам.
 *
 * Выручка и себестоимость суммируются в деньгах, а не в марже: среднее от процентов по слотам с
 * разными объёмами не равно марже сезона, и разница здесь не academic — слот-«паровоз» с тонкой
 * маржой и большим тиражом сдвигает сезон сильнее, чем дорогой слот на сто штук.
 *
 * Сезон почти никогда не подтверждён целиком, поэтому факт считается по тем слотам, которые
 * подтверждены, и сравнивается с планом **по тем же слотам**. Сравнивать частичную себестоимость
 * с выручкой всего сезона значило бы занизить затраты и объявить маржу, которой нет; а прятать
 * факт до последнего подтверждения значило бы оставить поле пустым ровно тогда, когда оно нужно.
 * Поэтому рядом с каждым частичным числом стоит доля сезона, по которой оно посчитано.
 */
export function seasonEconomics(reconciliations = []) {
  const slots = list(reconciliations);
  const currencies = new Set(slots.map((slot) => slot.currency).filter(Boolean));
  invariant(currencies.size <= 1, 'SEASON_ECONOMICS_CURRENCY_MIXED',
    'A season total cannot be summed across retail currencies', { currencies: [...currencies] });
  const currency = currencies.size === 1 ? [...currencies][0] : null;

  const whole = { revenue: 0, cost: 0, slots: 0 };
  const targeted = { revenue: 0, cost: 0, plannedCost: 0, slots: 0 };
  const confirmed = { revenue: 0, cost: 0, plannedCost: 0, slots: 0 };

  for (const slot of slots) {
    const quantity = slot.plannedQuantity;
    if (!quantity || slot.recommendedRetailPriceMinor === null) continue;
    const plannedCost = slot.plannedUnitCostMinor === null ? null : slot.plannedUnitCostMinor * quantity;
    // Слот без плановой себестоимости в итог сезона не входит вовсе.
    //
    // Раньше его выручка прибавлялась, а затраты — нет, потому что их не было: слот с розничной
    // ценой и без себестоимости давал сезону чистую выручку с нулевыми затратами и завышал маржу.
    // Считать такой слот наполовину — хуже, чем не считать: половина оказывается в пользу
    // приятного ответа. Он попадает в `slotCount`, но не в деньги, и разница между двумя числами
    // сама говорит, что сезон посчитан не целиком.
    if (plannedCost === null) continue;
    const revenue = slot.recommendedRetailPriceMinor * quantity;
    whole.slots += 1;
    whole.revenue += revenue;
    whole.cost += plannedCost;

    // Цель и факт пересчитываются на плановое количество, а не на заказанное: иначе «стало
    // дешевле» означало бы всего лишь «заказали меньше».
    if (slot.targetLandedMinor !== null) {
      targeted.slots += 1;
      targeted.revenue += revenue;
      targeted.cost += slot.targetLandedMinor * quantity;
      targeted.plannedCost += plannedCost;
    }
    if (slot.actualLandedMinor !== null) {
      confirmed.slots += 1;
      confirmed.revenue += revenue;
      confirmed.cost += slot.actualLandedMinor * quantity;
      confirmed.plannedCost += plannedCost;
    }
  }

  const revenue = whole.revenue || null;
  const share = (part) => (revenue === null || part.revenue === 0 ? null : Math.round((part.revenue / revenue) * 10_000));

  return Object.freeze({
    currency,
    slotCount: slots.length,
    quantifiedSlotCount: whole.slots,
    plannedRevenueMinor: revenue,
    plannedCostMinor: revenue === null ? null : whole.cost,
    plannedGrossMarginMinor: revenue === null ? null : revenue - whole.cost,
    plannedMarginBasisPoints: marginBasisPoints(revenue, revenue === null ? null : whole.cost),

    targetedSlotCount: targeted.slots,
    targetedRevenueShareBasisPoints: share(targeted),
    targetCostMinor: targeted.slots === 0 ? null : targeted.cost,
    targetMarginBasisPoints: targeted.slots === 0 ? null : marginBasisPoints(targeted.revenue, targeted.cost),

    confirmedSlotCount: confirmed.slots,
    confirmedRevenueShareBasisPoints: share(confirmed),
    actualCostMinor: confirmed.slots === 0 ? null : confirmed.cost,
    actualMarginBasisPoints: confirmed.slots === 0 ? null : marginBasisPoints(confirmed.revenue, confirmed.cost),
    // План по тем же слотам, что и факт: только так «лучше плана» означает то, что говорит.
    plannedMarginOfConfirmedBasisPoints: confirmed.slots === 0
      ? null : marginBasisPoints(confirmed.revenue, confirmed.plannedCost),
    marginVarianceBasisPoints: confirmed.slots === 0 ? null
      : marginBasisPoints(confirmed.revenue, confirmed.cost) - marginBasisPoints(confirmed.revenue, confirmed.plannedCost),

    complete: whole.slots > 0 && confirmed.slots === whole.slots,
  });
}

function realisationLine(realisation, { currency }) {
  const sku = requiredText(realisation?.sku, 'SEASON_REALISATION_SKU_INVALID', 'Realisation SKU');
  const plan = realisation?.targetPlan ?? null;
  if (plan === null) {
    return Object.freeze({
      sku, targetLandedMinor: null, actualLandedMinor: null, landedFactor: null,
      quotedFobMinor: null, quotedCurrency: null,
      orderedQuantity: optionalPositiveInteger(realisation?.orderedQuantity, 'SEASON_ORDERED_QUANTITY_INVALID', 'Ordered quantity'),
    });
  }

  // Розничная валюта целевого плана и плейсхолдера обязаны совпасть. Расхождение здесь — не
  // мелочь пересчёта: два документа назначили вещи разную цену на полке, и какой из них верен,
  // решает человек, а не округление.
  invariant(plan.rrpCurrency === currency, 'SEASON_TARGET_CURRENCY_DISAGREES',
    'The target price plan states a different retail currency than the placeholder',
    { sku, placeholderCurrency: currency, targetCurrency: plan.rrpCurrency });

  const landedFactor = positiveNumber(plan.landedFactor, 'SEASON_LANDED_FACTOR_INVALID', 'Landed factor');
  const targetLandedMinor = optionalMinor(plan.targetLandedMinor, 'SEASON_TARGET_LANDED_INVALID', 'Target landed cost');

  // Котировка сравнивается только в валюте, в которой назначен план: пересчитывать её вторым
  // курсом значило бы сравнивать с числом, которого никто не называл.
  const comparable = realisation?.quotedFobMinor !== null && realisation?.quotedFobMinor !== undefined
    && realisation?.quotedCurrency === plan.fobCurrency;

  return Object.freeze({
    sku,
    landedFactor,
    targetLandedMinor,
    quotedFobMinor: comparable ? Number(realisation.quotedFobMinor) : null,
    quotedCurrency: comparable ? realisation.quotedCurrency : null,
    actualLandedMinor: comparable
      ? landedFromQuote({ quotedFobMinor: realisation.quotedFobMinor, fxRate: plan.fxRate, landedFactor })
      : null,
    orderedQuantity: optionalPositiveInteger(realisation?.orderedQuantity, 'SEASON_ORDERED_QUANTITY_INVALID', 'Ordered quantity'),
  });
}

function weightedAverage(rows, field) {
  const usable = rows.filter((row) => row[field] !== null && row[field] !== undefined);
  if (usable.length === 0) return null;
  // Без количеств взвешивать нечем, и равный вес — единственное честное допущение.
  const weights = usable.map((row) => row.orderedQuantity ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return null;
  const weighted = usable.reduce((sum, row, index) => sum + row[field] * weights[index], 0);
  return Math.round(weighted / total);
}

function difference(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) return null;
  return left - right;
}

function list(value) { return Array.isArray(value) ? value : []; }
function round4(value) { return Math.round(value * 10_000) / 10_000; }

function requiredCurrency(value) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), 'SEASON_CURRENCY_INVALID',
    'A retail currency is required', { currency: value });
  return value;
}

function requiredText(value, code, label) {
  invariant(typeof value === 'string' && value.trim().length > 0, code, `${label} is required`, { value });
  return value.trim();
}

function nonNegativeMinor(value, code, label) {
  const number = Number(value);
  invariant(Number.isSafeInteger(number) && number >= 0, code, `${label} must be a non-negative integer amount in minor units`, { value });
  return number;
}

function optionalMinor(value, code, label) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  invariant(Number.isSafeInteger(number) && number >= 0, code, `${label} must be a non-negative integer amount in minor units`, { value });
  return number;
}

function optionalPositiveInteger(value, code, label) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  invariant(Number.isSafeInteger(number) && number > 0, code, `${label} must be a positive integer`, { value });
  return number;
}

function positiveNumber(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0, code, `${label} must be a positive number`, { value });
  return number;
}
