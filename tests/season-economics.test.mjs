import test from 'node:test';
import assert from 'node:assert/strict';

import {
  landedFromQuote,
  marginBasisPoints,
  placeholderReconciliation,
  seasonEconomics,
} from '../src/modules/season-economics/public.mjs';

const plan = (overrides = {}) => ({
  rrpCurrency: 'RUB',
  fobCurrency: 'EUR',
  fxRate: 92.1,
  landedFactor: 1.2272,
  targetLandedMinor: 957_692,
  ...overrides,
});

const placeholder = (overrides = {}) => ({
  id: 'ph-1',
  placeholderCode: 'SS27-OUT-001',
  currency: 'RUB',
  recommendedRetailPriceMinor: 2_490_000,
  plannedUnitCostMinor: 957_692,
  plannedQuantity: 1200,
  colourwayCount: 3,
  ...overrides,
});

test('котировка фабрики поднимается до ввезённой себестоимости тем же курсом и коэффициентом, что и цель', () => {
  assert.equal(landedFromQuote({ quotedFobMinor: 5200, fxRate: 92.1, landedFactor: 1.2272 }), 587_731);
});

test('слот без единого связанного SKU честно остаётся только планом', () => {
  const slot = placeholderReconciliation(placeholder(), []);
  assert.equal(slot.coverage, 'planned-only');
  assert.equal(slot.targetLandedMinor, null);
  assert.equal(slot.actualLandedMinor, null);
  assert.equal(slot.plannedMarginBasisPoints, 6154);
  assert.equal(slot.plannedMarkup, 2.6);
  assert.equal(slot.targetToActualMinor, null, 'сравнивать не с чем, а не «ноль расхождения»');
});

test('план, цель и факт сводятся в одной валюте, и факт оказывается дешевле цели', () => {
  const slot = placeholderReconciliation(placeholder(), [
    { sku: 'SYN_JKT_R3_MID_M', targetPlan: plan(), quotedFobMinor: 5200, quotedCurrency: 'EUR', orderedQuantity: 400 },
  ]);
  assert.equal(slot.targetLandedMinor, 957_692);
  assert.equal(slot.actualLandedMinor, 587_731);
  assert.equal(slot.targetMarginBasisPoints, 6154);
  assert.equal(slot.actualMarginBasisPoints, 7640);
  assert.equal(slot.targetToActualMinor, 369_961, 'положительное расхождение — заплатили меньше цели');
  assert.equal(slot.marginAtRiskBasisPoints, 1486, 'маржа выше плановой, риска нет');
  assert.equal(slot.coverage, 'confirmed');
});

test('цель и факт по слоту взвешиваются заказанным количеством, а не числом SKU', () => {
  const slot = placeholderReconciliation(placeholder(), [
    { sku: 'A', targetPlan: plan(), quotedFobMinor: 1000, quotedCurrency: 'EUR', orderedQuantity: 900 },
    { sku: 'B', targetPlan: plan(), quotedFobMinor: 9000, quotedCurrency: 'EUR', orderedQuantity: 100 },
  ]);
  const cheap = landedFromQuote({ quotedFobMinor: 1000, fxRate: 92.1, landedFactor: 1.2272 });
  const dear = landedFromQuote({ quotedFobMinor: 9000, fxRate: 92.1, landedFactor: 1.2272 });
  assert.equal(slot.actualLandedMinor, Math.round((cheap * 900 + dear * 100) / 1000));
  assert.notEqual(slot.actualLandedMinor, Math.round((cheap + dear) / 2), 'поштучное среднее соврало бы в пользу дорогого SKU');
});

test('целевой план в другой розничной валюте отказывается сводиться, а не пересчитывается молча', () => {
  assert.throws(
    () => placeholderReconciliation(placeholder(), [
      { sku: 'A', targetPlan: plan({ rrpCurrency: 'EUR' }), quotedFobMinor: 5200, quotedCurrency: 'EUR' },
    ]),
    (error) => error.code === 'SEASON_TARGET_CURRENCY_DISAGREES',
  );
});

test('котировка в чужой валюте не становится фактом', () => {
  const slot = placeholderReconciliation(placeholder(), [
    { sku: 'A', targetPlan: plan(), quotedFobMinor: 5200, quotedCurrency: 'USD', orderedQuantity: 400 },
  ]);
  assert.equal(slot.actualLandedMinor, null);
  assert.equal(slot.realisations[0].quotedCurrency, null);
  assert.equal(slot.coverage, 'targeted', 'цель есть, факта нет');
});

test('отрицательная маржа остаётся отрицательной', () => {
  assert.equal(marginBasisPoints(1000, 1500), -5000);
});

test('сезон суммируется в деньгах, и объём слота влияет на маржу сезона', () => {
  const engine = placeholderReconciliation(
    placeholder({ id: 'ph-tee', placeholderCode: 'SS27-TOP-002', recommendedRetailPriceMinor: 390_000, plannedUnitCostMinor: 195_000, plannedQuantity: 5000 }), []);
  const jacket = placeholderReconciliation(placeholder(), []);
  const season = seasonEconomics([jacket, engine]);

  assert.equal(season.currency, 'RUB');
  assert.equal(season.plannedRevenueMinor, 2_490_000 * 1200 + 390_000 * 5000);
  assert.equal(season.plannedCostMinor, 957_692 * 1200 + 195_000 * 5000);
  assert.equal(season.plannedGrossMarginMinor, season.plannedRevenueMinor - season.plannedCostMinor);
  // Футболка идёт с маржой 50 %, жакет — 61.5 %. Простое среднее дало бы 55.8 %; сезон,
  // взвешенный деньгами, отличается, потому что тираж футболки вчетверо больше.
  const naive = Math.round((6154 + marginBasisPoints(390_000, 150_000)) / 2);
  assert.notEqual(season.plannedMarginBasisPoints, naive);
  assert.equal(season.plannedMarginBasisPoints, marginBasisPoints(season.plannedRevenueMinor, season.plannedCostMinor));
});

test('сезон считает факт по подтверждённым слотам и честно называет долю охвата', () => {
  const confirmed = placeholderReconciliation(placeholder(), [
    { sku: 'A', targetPlan: plan(), quotedFobMinor: 5200, quotedCurrency: 'EUR', orderedQuantity: 400 },
  ]);
  const open = placeholderReconciliation(placeholder({ id: 'ph-2', placeholderCode: 'SS27-DRS-003' }), []);
  const season = seasonEconomics([confirmed, open]);

  assert.equal(season.confirmedSlotCount, 1);
  assert.equal(season.quantifiedSlotCount, 2);
  assert.equal(season.complete, false);
  assert.equal(season.confirmedRevenueShareBasisPoints, 5000, 'половина сезона по выручке');
  assert.equal(season.actualCostMinor, 587_731 * 1200, 'факт считается по подтверждённому слоту, а не прячется');
  // Ключевое: факт сравнивается с планом по ТЕМ ЖЕ слотам, иначе «лучше плана» ничего не значит.
  assert.equal(season.actualMarginBasisPoints, marginBasisPoints(2_490_000 * 1200, 587_731 * 1200));
  assert.equal(season.plannedMarginOfConfirmedBasisPoints, marginBasisPoints(2_490_000 * 1200, 957_692 * 1200));
  assert.equal(season.marginVarianceBasisPoints,
    season.actualMarginBasisPoints - season.plannedMarginOfConfirmedBasisPoints);
  assert.ok(season.marginVarianceBasisPoints > 0, 'закупились дешевле плана');
});

test('частичный факт не смешивается с выручкой всего сезона', () => {
  const cheapBig = placeholderReconciliation(
    placeholder({ id: 'ph-tee', recommendedRetailPriceMinor: 390_000, plannedUnitCostMinor: 195_000, plannedQuantity: 5000 }), []);
  const confirmed = placeholderReconciliation(placeholder(), [
    { sku: 'A', targetPlan: plan(), quotedFobMinor: 5200, quotedCurrency: 'EUR', orderedQuantity: 400 },
  ]);
  const season = seasonEconomics([confirmed, cheapBig]);
  // Если бы факт делили на выручку всего сезона, маржа вышла бы неправдоподобно высокой.
  const wrong = marginBasisPoints(season.plannedRevenueMinor, season.actualCostMinor);
  assert.notEqual(season.actualMarginBasisPoints, wrong);
  assert.equal(season.actualMarginBasisPoints, marginBasisPoints(2_490_000 * 1200, 587_731 * 1200));
});

test('сезон целиком подтверждён — охват сто процентов', () => {
  const confirmed = placeholderReconciliation(placeholder(), [
    { sku: 'A', targetPlan: plan(), quotedFobMinor: 5200, quotedCurrency: 'EUR', orderedQuantity: 400 },
  ]);
  const whole = seasonEconomics([confirmed]);
  assert.equal(whole.complete, true);
  assert.equal(whole.confirmedRevenueShareBasisPoints, 10_000);
  assert.equal(whole.actualCostMinor, 587_731 * 1200);
});

test('сезон отказывается складывать разные розничные валюты', () => {
  const rub = placeholderReconciliation(placeholder(), []);
  const eur = placeholderReconciliation(placeholder({ id: 'ph-eur', currency: 'EUR' }), []);
  assert.throws(() => seasonEconomics([rub, eur]), (error) => error.code === 'SEASON_ECONOMICS_CURRENCY_MIXED');
});
