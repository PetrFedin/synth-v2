import { invariant } from '../../core/errors.mjs';

// Сколько нам можно потратить.
//
// Проект считает, во что изделие обошлось. Обратного вопроса он не задавал: какая цена у фабрики
// ещё сходится с розничной ценой и плановой наценкой. Цепочка короткая и вся выводится:
//
//   целевая себестоимость на месте (DDP) = целевая розничная цена ÷ наценка
//   целевая цена у фабрики (FOB)         = DDP ÷ (коэффициент страны × коэффициент категории)
//
// Коэффициенты — множители на пути от ворот фабрики до склада: фрахт, пошлина, обработка. Поэтому
// каждый из них **не меньше единицы**. Это не формальность: в системе, с которой снята механика,
// коэффициенты 1,30 и 0,30 дают цену у фабрики выше себестоимости на складе, то есть перевозка
// удешевляет товар. Правило ловит ровно такой случай.
//
// Курс замораживается вместе с датой, как замораживается отсрочка в графике платежей: цель, которая
// тихо меняется вслед за курсом, не годится для переговоров.

export const TARGET_PLAN_STATUSES = Object.freeze(['draft', 'published', 'superseded']);

/**
 * Курс сезона на дату.
 *
 * Берётся последний курс, действующий не позже даты. Курса нет — план не составляется: «примерно
 * такой» курс превращает целевую цену в число, на которое нельзя сослаться.
 */
export function resolveSeasonRate({ rates, fromCurrency, toCurrency, asOf }) {
  const from = currency(fromCurrency, 'TARGET_PRICE_CURRENCY_INVALID', 'FOB currency');
  const to = currency(toCurrency, 'TARGET_PRICE_CURRENCY_INVALID', 'Retail currency');
  invariant(from !== to, 'TARGET_PRICE_SAME_CURRENCY', 'A rate from a currency to itself is one, and recording it invites it to disagree with one', { currency: from });
  const on = day(asOf, 'TARGET_PRICE_AS_OF_INVALID', 'Rate date');
  const candidates = list(rates)
    .filter((rate) => rate?.fromCurrency === from && rate?.toCurrency === to && day(rate.effectiveOn, 'TARGET_PRICE_RATE_DATE_INVALID', 'Rate date') <= on)
    .sort((left, right) => (left.effectiveOn < right.effectiveOn ? 1 : -1));
  invariant(candidates.length > 0, 'TARGET_PRICE_RATE_NOT_IN_SEASON',
    'This season records no rate for that pair on or before that date', { fromCurrency: from, toCurrency: to, asOf: on });
  const rate = candidates[0];
  return Object.freeze({ fromCurrency: from, toCurrency: to, rate: positiveNumber(rate.rate, 'TARGET_PRICE_RATE_INVALID', 'Rate'), effectiveOn: day(rate.effectiveOn, 'TARGET_PRICE_RATE_DATE_INVALID', 'Rate date') });
}

/** Составить цель по цене на изделие. */
export function createTargetPricePlan({ id, brandId, campaignId, sku, rate, input, createdAt, actorId }) {
  const created = timestamp(createdAt, 'TARGET_PRICE_CREATED_AT_INVALID', 'Creation time');
  const rrpCurrency = currency(input?.rrpCurrency, 'TARGET_PRICE_CURRENCY_INVALID', 'Retail currency');
  invariant(rate?.toCurrency === rrpCurrency, 'TARGET_PRICE_RATE_CURRENCY_MISMATCH', 'The rate must convert the FOB currency into the retail one', { rateTo: rate?.toCurrency, rrpCurrency });

  return freezePlan({
    id: required(id, 'TARGET_PRICE_ID_REQUIRED', 'Plan id'),
    brandId: required(brandId, 'TARGET_PRICE_BRAND_REQUIRED', 'Brand id'),
    campaignId: required(campaignId, 'TARGET_PRICE_CAMPAIGN_REQUIRED', 'Season id'),
    sku: required(sku, 'TARGET_PRICE_SKU_REQUIRED', 'SKU'),
    targetRrpMinor: positiveInteger(input?.targetRrpMinor, 'TARGET_PRICE_RRP_INVALID', 'Target retail price'),
    rrpCurrency,
    // Наценка — во сколько раз розничная цена больше себестоимости на месте. Единица и меньше
    // означают продажу по себестоимости или дешевле: это не цель, а убыток.
    retailMarkup: ratio(input?.retailMarkup, 'TARGET_PRICE_MARKUP_INVALID', 'Retail markup', 1, false),
    sourcingCountryCode: optionalCountry(input?.sourcingCountryCode),
    countryCoefficient: ratio(input?.countryCoefficient, 'TARGET_PRICE_COUNTRY_COEFFICIENT_INVALID', 'Country logistics coefficient', 1, true),
    categoryCoefficient: ratio(input?.categoryCoefficient, 'TARGET_PRICE_CATEGORY_COEFFICIENT_INVALID', 'Category logistics coefficient', 1, true),
    fobCurrency: rate.fromCurrency,
    // Снимок с происхождением: план обязан указывать на строку курсов сезона, которая действительно
    // была, иначе «курс 77,6» — число, которое никто не может проверить.
    fxRate: rate.rate,
    fxEffectiveOn: rate.effectiveOn,
    status: 'draft',
    notes: optional(input?.notes, 1000, 'TARGET_PRICE_NOTES_INVALID', 'Notes'),
    version: 1,
    createdAt: created,
    createdBy: required(actorId, 'TARGET_PRICE_CREATED_BY_REQUIRED', 'Author'),
    updatedAt: created,
  });
}

/** Опубликовать цель: после этого на неё ссылаются в переговорах. */
export function publishTargetPricePlan(plan, { at, actorId }) {
  invariant(plan?.status === 'draft', 'TARGET_PRICE_NOT_DRAFT', 'Only a draft plan can be published', { status: plan?.status });
  const moment = timestamp(at, 'TARGET_PRICE_UPDATED_AT_INVALID', 'Update time');
  return freezePlan({ ...plan, status: 'published', publishedAt: moment, publishedBy: required(actorId, 'TARGET_PRICE_PUBLISHED_BY_REQUIRED', 'Author'), version: plan.version + 1, updatedAt: moment });
}

/**
 * Заменить цель новой.
 *
 * Старая не удаляется и не правится: на неё ссылались, когда договаривались о цене, и переписать её
 * значило бы задним числом изменить условия разговора.
 */
export function supersedeTargetPricePlan(plan, { reason, at, actorId }) {
  invariant(plan?.status !== 'superseded', 'TARGET_PRICE_ALREADY_SUPERSEDED', 'This plan is already superseded', { sku: plan?.sku });
  const moment = timestamp(at, 'TARGET_PRICE_UPDATED_AT_INVALID', 'Update time');
  return freezePlan({
    ...plan, status: 'superseded',
    supersessionReason: text(reason, 5, 1000, 'TARGET_PRICE_SUPERSESSION_REASON_REQUIRED', 'Reason'),
    supersededAt: moment, supersededBy: required(actorId, 'TARGET_PRICE_SUPERSEDED_BY_REQUIRED', 'Author'),
    version: plan.version + 1, updatedAt: moment,
  });
}

/**
 * Цель в деньгах — и сходится ли с ней то, что запросила фабрика.
 *
 * Ни одно из целевых чисел не хранится: они частные от уже записанных, и хранимая копия разошлась бы
 * при первой правке наценки. Котировка приходит из подтверждённого заказа, где цена зафиксирована,
 * поэтому сравнение идёт с тем, о чём договорились, а не с тем, что кто-то помнит.
 */
export function targetPricing(plan, { quotedFobMinor = null, quotedCurrency = null, bomCostMinor = null } = {}) {
  const landedFactor = round4(plan.countryCoefficient * plan.categoryCoefficient);
  const targetLandedMinor = Math.round(plan.targetRrpMinor / plan.retailMarkup);
  const targetFobInRrpMinor = Math.round(targetLandedMinor / landedFactor);
  const targetFobMinor = Math.round(targetFobInRrpMinor / plan.fxRate);

  // Сравнение только в одной валюте: пересчитывать котировку вторым курсом значило бы сравнивать с
  // числом, которого никто не называл.
  const comparable = quotedFobMinor !== null && quotedCurrency === plan.fobCurrency;
  const headroomMinor = comparable ? targetFobMinor - Number(quotedFobMinor) : null;

  return Object.freeze({
    ...plan,
    landedFactor,
    targetLandedMinor,
    targetFobInRrpMinor,
    targetFobMinor,
    quotedFobMinor: comparable ? Number(quotedFobMinor) : null,
    quotedCurrency: comparable ? quotedCurrency : null,
    headroomMinor,
    // Знак важнее величины: он сразу говорит, укладываемся мы в цель или вышли за неё.
    withinTarget: headroomMinor === null ? null : headroomMinor >= 0,
    headroomPercent: headroomMinor === null || targetFobMinor === 0 ? null : round4((headroomMinor / targetFobMinor) * 100),
    bomCostMinor: bomCostMinor === null ? null : Number(bomCostMinor),
    // Что остаётся фабрике сверх материалов, если платить по цели. Отрицательное значение означает,
    // что цель не покрывает даже ткань, и тогда спорить надо не о цене пошива.
    targetConversionMinor: bomCostMinor === null ? null : targetFobMinor - Number(bomCostMinor),
  });
}

function freezePlan(value) { return Object.freeze({ ...value }); }
function list(value) { return Array.isArray(value) ? value : []; }
function round4(value) { return Math.round(value * 10_000) / 10_000; }

function ratio(value, code, label, minimum, inclusive) {
  const number = Number(value);
  const ok = Number.isFinite(number) && number <= 100 && (inclusive ? number >= minimum : number > minimum);
  invariant(ok, code, inclusive
    ? `${label} cannot be below ${minimum}: freight, duty and handling only add to what the factory charges`
    : `${label} must be greater than ${minimum}`, { value });
  const rounded = Math.round(number * 10_000) / 10_000;
  invariant(Math.abs(number - rounded) < 1e-9, code, `${label} carries more precision than four decimals`, { value });
  return rounded;
}
function positiveNumber(value, code, label) {
  const number = Number(value);
  invariant(Number.isFinite(number) && number > 0, code, `${label} must be positive`, { value });
  return number;
}
function positiveInteger(value, code, label) {
  invariant(Number.isSafeInteger(Number(value)) && Number(value) >= 1, code, `${label} must be a positive integer of minor units`, { value });
  return Number(value);
}
function currency(value, code, label) {
  invariant(typeof value === 'string' && /^[A-Z]{3}$/.test(value), code, `${label} must be a three-letter code`, { value });
  return value;
}
function optionalCountry(value) {
  if (value === undefined || value === null || value === '') return null;
  invariant(typeof value === 'string' && /^[A-Z]{2}$/.test(value), 'TARGET_PRICE_COUNTRY_INVALID', 'A country is a two-letter code', { value });
  return value;
}
function day(value, code, label) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), code, `${label} is invalid`, { value });
  return value.slice(0, 10);
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
