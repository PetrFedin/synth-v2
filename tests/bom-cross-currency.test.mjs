import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createBom } from '../src/modules/bom/public.mjs';
import { FX_RATE_SCALE } from '../src/core/money.mjs';

const root = process.cwd();
const now = '2026-09-23T10:00:00.000Z';

const catalogSku = Object.freeze({ sku: 'SYN_JKT_X_MID_M', brandId: 'brand-1', version: 1, status: 'published' });
const materials = Object.freeze([
  Object.freeze({ code: 'MAT-SHELL', brandId: 'brand-1', name: 'Рипстоп', type: 'fabric', unit: 'm', unitCost: 6.4, currency: 'EUR', status: 'published', version: 1 }),
  Object.freeze({ code: 'MAT-TRIM-RU', brandId: 'brand-1', name: 'Фурнитура', type: 'trim', unit: 'pc', unitCost: 120, currency: 'RUB', status: 'published', version: 1 }),
]);

function bomWith(rate) {
  return createBom({
    id: 'bom-1',
    catalogSku,
    materials,
    createdAt: now,
    input: {
      sku: catalogSku.sku, currency: 'EUR', laborCost: 12, overheadCost: 4, logisticsCost: 3, otherCost: 1, notes: null,
      lines: [
        { lineId: 'L1', component: 'Верх', materialCode: 'MAT-SHELL', quantity: 2.1, wastePercent: 7 },
        { lineId: 'TRIM1', component: 'Фурнитура', materialCode: 'MAT-TRIM-RU', quantity: 6, wastePercent: 2, exchangeRate: rate },
      ],
    },
  });
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('A rate is a rate, not money: eight decimal places survive into the cost', () => {
  // Денежная шкала в четыре знака обесценивала курс до бессмыслицы. RUB→EUR это 0,01085776, а
  // четыре знака позволяли записать только 0,0109: строка стоила 8,0050 € вместо 7,9739 € —
  // ошибка тихая, систематическая и всегда в одну сторону.
  assert.equal(FX_RATE_SCALE, 8);
  const value = bomWith(0.01085776);
  const trim = value.lines.find((line) => line.lineId === 'TRIM1');
  assert.equal(trim.materialCurrency, 'RUB');
  assert.equal(trim.exchangeRate, 0.01085776);
  // 6 шт + 2 % = 6,12; 6,12 × 120 ₽ × 0,01085776 = 7,9739 €
  assert.equal(trim.grossQuantity, 6.12);
  assert.equal(trim.lineCost, 7.9739);
  // Строка в валюте ведомости считается по курсу 1 и не трогается.
  assert.equal(value.lines.find((line) => line.lineId === 'L1').exchangeRate, 1);
});

test('A cross-currency line cannot be written without a rate, and a same-currency line cannot invent one', () => {
  const missing = codeOf(() => createBom({
    id: 'bom-2', catalogSku, materials, createdAt: now,
    input: {
      sku: catalogSku.sku, currency: 'EUR', laborCost: 12, overheadCost: 4, logisticsCost: 3, otherCost: 1, notes: null,
      lines: [{ lineId: 'TRIM1', component: 'Фурнитура', materialCode: 'MAT-TRIM-RU', quantity: 6, wastePercent: 2 }],
    },
  }));
  assert.equal(missing, 'BOM_EXCHANGE_RATE_REQUIRED');

  const invented = codeOf(() => createBom({
    id: 'bom-3', catalogSku, materials, createdAt: now,
    input: {
      sku: catalogSku.sku, currency: 'EUR', laborCost: 12, overheadCost: 4, logisticsCost: 3, otherCost: 1, notes: null,
      lines: [{ lineId: 'L1', component: 'Верх', materialCode: 'MAT-SHELL', quantity: 2.1, wastePercent: 7, exchangeRate: 1.2 }],
    },
  }));
  assert.equal(invented, 'BOM_EXCHANGE_RATE_INVALID');
});

test('The rate rule lives in one place, and the register that stores it keeps every digit', async () => {
  // Правило о восьми знаках платформа знала и раньше — в экономике заказа. Ведомость была
  // единственным местом, где курс считался деньгами, и единственным, где курс применяется к
  // деньгам построчно.
  const economics = await readFile(path.join(root, 'src/modules/order-economics/public.mjs'), 'utf8');
  assert.match(economics, /normalizeFxRate as normalizeSharedFxRate/);
  assert.doesNotMatch(economics, /FX rate must use at most 8 decimal places/);

  // Писатель приводил курс к numeric(20,4) прямо в запросе, поэтому payload и проекция
  // расходились: в payload лежал точный курс, в колонке — округлённый.
  const store = await readFile(path.join(root, 'src/infrastructure/postgres-bom-store.mjs'), 'utf8');
  assert.match(store, /exchange_rate numeric\(20, 8\)/);
  const migration = await readFile(path.join(root, 'db/migrations/132_bom_exchange_rate_is_a_rate.sql'), 'utf8');
  assert.match(migration, /ALTER COLUMN exchange_rate TYPE numeric\(20, 8\)/);
});
