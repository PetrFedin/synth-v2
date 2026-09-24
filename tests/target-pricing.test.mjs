import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createTargetPricePlan,
  publishTargetPricePlan,
  resolveSeasonRate,
  supersedeTargetPricePlan,
  targetPricing,
} from '../src/modules/target-pricing/public.mjs';

const root = process.cwd();
const AT = '2026-09-21T09:00:00.000Z';
const rates = [
  { fromCurrency: 'USD', toCurrency: 'RUB', rate: 74.2, effectiveOn: '2026-01-19' },
  { fromCurrency: 'USD', toCurrency: 'RUB', rate: 77.6, effectiveOn: '2026-08-01' },
  { fromCurrency: 'EUR', toCurrency: 'RUB', rate: 92.1, effectiveOn: '2026-08-01' },
];
const rate = () => resolveSeasonRate({ rates, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-09-21' });
function plan(overrides = {}) {
  return createTargetPricePlan({
    id: 'plan-1', brandId: 'brand-1', campaignId: 'campaign-1', sku: 'SKU-1', rate: rate(), createdAt: AT, actorId: 'finance',
    input: { targetRrpMinor: 60_000_000, rrpCurrency: 'RUB', retailMarkup: 2.7, sourcingCountryCode: 'CN', countryCoefficient: 1.3, categoryCoefficient: 1.05, ...overrides },
  });
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('Курс берётся из сезона на дату, а «примерно такого» курса не бывает', () => {
  assert.deepEqual([rate().rate, rate().effectiveOn], [77.6, '2026-08-01'], 'последний курс, действующий не позже даты');
  const earlier = resolveSeasonRate({ rates, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-03-01' });
  assert.equal(earlier.rate, 74.2, 'на март действует январский курс, а не августовский');
  assert.equal(codeOf(() => resolveSeasonRate({ rates, fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2025-12-31' })), 'TARGET_PRICE_RATE_NOT_IN_SEASON');
  assert.equal(codeOf(() => resolveSeasonRate({ rates, fromCurrency: 'CNY', toCurrency: 'RUB', asOf: '2026-09-21' })), 'TARGET_PRICE_RATE_NOT_IN_SEASON');
  // Курс валюты к самой себе — это единица; строка о нём может только разойтись с единицей.
  assert.equal(codeOf(() => resolveSeasonRate({ rates, fromCurrency: 'RUB', toCurrency: 'RUB', asOf: '2026-09-21' })), 'TARGET_PRICE_SAME_CURRENCY');
});

test('Перевозка и растаможка только добавляют — коэффициент меньше единицы не берём', () => {
  // Ровно тот случай, что даёт исходная система: 1,30 × 0,30 = 0,39, и цена у фабрики выходит
  // выше себестоимости на складе.
  assert.equal(codeOf(() => plan({ categoryCoefficient: 0.3 })), 'TARGET_PRICE_CATEGORY_COEFFICIENT_INVALID');
  assert.equal(codeOf(() => plan({ countryCoefficient: 0.9 })), 'TARGET_PRICE_COUNTRY_COEFFICIENT_INVALID');
  // Наценка не больше единицы — продажа по себестоимости или дешевле.
  assert.equal(codeOf(() => plan({ retailMarkup: 1 })), 'TARGET_PRICE_MARKUP_INVALID');
  // Коэффициент ровно единица законен: страна без пошлины и фрахта бывает.
  assert.equal(plan({ countryCoefficient: 1, categoryCoefficient: 1 }).countryCoefficient, 1);
});

test('Цель считается, а не хранится', () => {
  const priced = targetPricing(plan());
  // 600 000 ₽ ÷ 2,7 = 222 222,22 ₽ допустимой себестоимости на месте.
  assert.equal(priced.targetLandedMinor, 22_222_222);
  assert.equal(priced.landedFactor, 1.365, '1,30 × 1,05');
  // ÷ 1,365 → допустимая цена у фабрики в рублях, ÷ 77,6 → в долларах.
  assert.equal(priced.targetFobInRrpMinor, 16_280_016);
  assert.equal(priced.targetFobMinor, 209_794);
  assert.ok(priced.targetFobInRrpMinor < priced.targetLandedMinor, 'цена у фабрики ниже себестоимости на складе — иначе перевозка удешевляла бы товар');
  assert.equal(priced.quotedFobMinor, null, 'сравнивать пока не с чем');
  assert.equal(priced.withinTarget, null);
});

test('Котировка фабрики сравнивается с целью — и только в той же валюте', () => {
  const within = targetPricing(plan(), { quotedFobMinor: 180_000, quotedCurrency: 'USD', bomCostMinor: 120_000 });
  assert.equal(within.headroomMinor, 29_794);
  assert.equal(within.withinTarget, true);
  assert.equal(within.targetConversionMinor, 89_794, 'что остаётся фабрике сверх материалов, если платить по цели');

  const over = targetPricing(plan(), { quotedFobMinor: 260_000, quotedCurrency: 'USD' });
  assert.equal(over.withinTarget, false);
  assert.ok(over.headroomMinor < 0);

  // Котировку в другой валюте вторым курсом не пересчитываем: получилось бы число, которого никто
  // не называл.
  const other = targetPricing(plan(), { quotedFobMinor: 180_000, quotedCurrency: 'EUR' });
  assert.equal(other.quotedFobMinor, null);
  assert.equal(other.withinTarget, null);
});

test('Опубликованную цель не правят, а заменяют — на неё ссылались в переговорах', () => {
  const live = publishTargetPricePlan(plan(), { at: AT, actorId: 'finance' });
  assert.equal(live.status, 'published');
  assert.equal(codeOf(() => publishTargetPricePlan(live, { at: AT, actorId: 'finance' })), 'TARGET_PRICE_NOT_DRAFT');
  const replaced = supersedeTargetPricePlan(live, { reason: 'Курс ушёл, пересчитали цель', at: AT, actorId: 'finance' });
  assert.equal(replaced.status, 'superseded');
  assert.equal(codeOf(() => supersedeTargetPricePlan(replaced, { reason: 'Ещё раз', at: AT, actorId: 'finance' })), 'TARGET_PRICE_ALREADY_SUPERSEDED');
});

test('База держит те же правила', async () => {
  const sql = await readFile(path.join(root, 'db/migrations/117_target_pricing.sql'), 'utf8');
  assert.match(sql, /country_coefficient >= 1/);
  assert.match(sql, /category_coefficient >= 1/);
  assert.match(sql, /retail_markup > 1/);
  assert.match(sql, /TARGET_PRICE_RATE_NOT_IN_SEASON/);
  assert.match(sql, /TARGET_PRICE_RATE_DISAGREES/);
  assert.match(sql, /from_currency <> to_currency/);
  // Целевые числа не хранятся: это частные от уже записанных.
  assert.ok(!/target_fob_minor|target_landed_minor/.test(sql), 'the target figures are quotients, never stored');
});
