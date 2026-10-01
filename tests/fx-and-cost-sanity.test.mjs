import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSaneFxRate, normalizeFxRate } from '../src/core/money.mjs';
import { createBom } from '../src/modules/bom/public.mjs';
import { recordCurrencyReferenceRate } from '../src/modules/currency-reference/public.mjs';
import { landedFromQuote } from '../src/modules/season-economics/public.mjs';
import { resolveSeasonRate } from '../src/modules/target-pricing/public.mjs';

const absurd = [0, -1, 0.0000001, 1_000_001, 1e12, Number.NaN, Infinity];

test('M-06: the shared FX sanity corridor rejects zero, negative and absurd rates and keeps real ones', () => {
  for (const value of absurd) assert.throws(() => normalizeFxRate(value), (error) => error?.code === 'FX_RATE_INVALID', String(value));
  for (const value of [0.000037, 0.010858, 1, 92.5, 25_000]) assert.equal(assertSaneFxRate(value), value);
  assert.equal(normalizeFxRate(0.010858), 0.010858);
});

test('M-06: reference, season and landed-cost rates go through the same corridor', () => {
  const base = { id: 'r1', source: 'cbr', fromCurrency: 'USD', toCurrency: 'RUB', effectiveOn: '2026-10-01', recordedAt: '2026-10-01T00:00:00.000Z' };
  assert.equal(recordCurrencyReferenceRate({ ...base, rate: 92.5 }).rate, 92.5);
  assert.throws(() => recordCurrencyReferenceRate({ ...base, rate: 9_250_000_000 }), (error) => error?.code === 'CURRENCY_REFERENCE_RATE_INVALID');
  const seasonRate = (rate) => resolveSeasonRate({ rates: [{ fromCurrency: 'USD', toCurrency: 'RUB', rate, effectiveOn: '2026-10-01' }], fromCurrency: 'USD', toCurrency: 'RUB', asOf: '2026-10-02' });
  assert.equal(seasonRate(92.5).rate, 92.5);
  assert.throws(() => seasonRate(0.00000001), (error) => error?.code === 'TARGET_PRICE_RATE_INVALID');
  assert.equal(landedFromQuote({ quotedFobMinor: 1000, fxRate: 90, landedFactor: 1.2 }), 108000);
  assert.throws(() => landedFromQuote({ quotedFobMinor: 1000, fxRate: 90_000_000, landedFactor: 1.2 }), (error) => error?.code === 'SEASON_FX_RATE_INVALID');
});

test('M-06: a BOM line cannot carry an absurd exchange rate or cost nothing', () => {
  const catalogSku = { sku: 'STYLE-001', brandId: 'brand-1', status: 'draft', version: 1 };
  const material = { code: 'ZIP-001', brandId: 'brand-1', name: 'Metal zip', type: 'trim', unit: 'pc', currency: 'USD', unitCost: 0.0001, version: 1, status: 'published' };
  const build = (line) => createBom({ id: 'bom-1', catalogSku, materials: [material], input: { sku: 'STYLE-001', currency: 'EUR', lines: [{ lineId: 'ZIP', component: 'Zip', materialCode: 'ZIP-001', wastePercent: 0, ...line }], laborCost: 1, overheadCost: 0, logisticsCost: 0, otherCost: 0 }, createdAt: '2026-08-03T12:00:00.000Z' });
  assert.throws(() => build({ quantity: 1, exchangeRate: 1e9 }), (error) => error?.code === 'BOM_EXCHANGE_RATE_INVALID');
  assert.throws(() => build({ quantity: 1, exchangeRate: 0.0000000001 }), (error) => error?.code === 'BOM_EXCHANGE_RATE_INVALID');
  assert.throws(() => build({ quantity: 0.0001, exchangeRate: 0.5 }), (error) => error?.code === 'BOM_LINE_COST_INVALID');
  assert.equal(build({ quantity: 10, exchangeRate: 0.9 }).lines[0].lineCost, 0.0009);
});
