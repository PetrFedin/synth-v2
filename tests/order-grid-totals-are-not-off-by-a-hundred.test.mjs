import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const gridSource = await readFile(new URL('../public/modules/order-grid-core.js', import.meta.url), 'utf8');
const matrixSource = await readFile(new URL('../public/modules/linesheet-matrix-core.js', import.meta.url), 'utf8');
const linesheets = await readFile(new URL('../public/modules/linesheets.js', import.meta.url), 'utf8');

// Сумма в подвале сетки заказа завышалась **в сто раз** на любой цене с копейками.
//
// Две ошибки гасили друг друга на целых ценах и складывались на дробных. Первая: сетка угадывала
// единицу цены по её виду — `Number.isSafeInteger(raw) ? raw : Math.round(raw * 100)`, то есть «24»
// считалось 24 центами, а «24,50» — 24,50 евро. Вторая: подвал печатал минорный итог основным
// форматтером денег. В демо все цены целые, поэтому на экране всё сходилось, и дефект ждал первой
// цены вида 24,99 — то есть обычной.
//
// Числа ниже — не выдумка: это арифметика той же функции из репозитория, посчитанная на реальной
// форме ячейки, которую строит матрица линшита.

function grid() {
  const sandbox = { Object, Number, Math, String, Array, JSON, Map, Set };
  sandbox.window = sandbox;
  vm.runInContext(gridSource, vm.createContext(sandbox));
  return sandbox.SynthaOrderGrid;
}

function styleWith(unitPrice, wholesalePriceMinor) {
  return {
    sizes: [{ key: 'M', code: 'M' }],
    rows: [{ colorwayId: 'colorway-1', cells: { M: { sku: 'X', unitPrice, wholesalePriceMinor, currency: 'EUR' } } }],
  };
}

test('a price with cents no longer multiplies the total by a hundred', () => {
  const Grid = grid();
  // 24,00 / 24,50 / 24,99 / 25,00 — целые и дробные вперемешку, потому что раньше расходились
  // ровно дробные, а целые случайно сходились.
  for (const [major, minor] of [[24, 2400], [24.5, 2450], [24.99, 2499], [25, 2500]]) {
    const totals = Grid.styleTotals(styleWith(major, minor), { X: '60' });
    // Итог хранится в минорных единицах: сто ячеек не должны накопить дробную погрешность.
    assert.equal(totals.amountMinor, minor * 60, `${major} × 60 must be ${minor * 60} minor units`);
    // Сравнение идёт в минорных и только в них: `24.99 * 60` в двоичной дроби даёт
    // 1499.3999999999999, и это ровно та причина, по которой итог живёт целым числом копеек.
    assert.equal((totals.amountMinor / 100).toFixed(2), (major * 60).toFixed(2), `${major} × 60 must read as ${(major * 60).toFixed(2)}`);
  }
});

test('the unit is taken from the frozen integer, not guessed from the number', () => {
  const Grid = grid();
  // Тот самый случай, на котором угадывание ломалось: целое основное значение.
  const totals = Grid.styleTotals(styleWith(24, 2400), { X: '1' });
  assert.equal(totals.amountMinor, 2400, 'an integer major price is not 24 minor units');
  // И обратный: снимок, где минорного поля нет, читается как основное — запасной путь, не догадка.
  const legacy = Grid.styleTotals(styleWith(24.5, null), { X: '1' });
  assert.equal(legacy.amountMinor, 2450);
  const legacyInteger = Grid.styleTotals(styleWith(24, null), { X: '1' });
  assert.equal(legacyInteger.amountMinor, 2400, 'an old snapshot must not be read as cents either');
  // Догадка не должна вернуться — и ищется она в коде, а не в комментарии, который её описывает.
  const code = gridSource.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  assert.equal(code.includes('Number.isSafeInteger(raw) ? raw'), false, 'the guess must not come back');
});

test('the matrix carries the frozen minor amount with the price', () => {
  const sandbox = { Object, Number, Math, String, Array, JSON, Map, Set, Intl };
  sandbox.window = sandbox;
  vm.runInContext(matrixSource, vm.createContext(sandbox));
  assert.ok(sandbox.SynthaLinesheetMatrix, 'the matrix module must load');
  // Поле берётся из строки прайс-листа и только если это целое: половина факта хуже его отсутствия.
  assert.match(matrixSource, /wholesalePriceMinor: Number\.isSafeInteger\(Number\(line\.wholesalePriceMinor\)\) \? Number\(line\.wholesalePriceMinor\) : null/);
});

test('a minor total is printed by a minor formatter, and the two are separate functions', () => {
  // Флаг на месте вызова перепутать легко, и однажды так и вышло — поэтому у минорных денег
  // отдельная функция с именем, которое говорит о единице.
  assert.match(linesheets, /function formatMoneyMinor\(amountMinor, currency\)/);
  assert.match(linesheets, /minor: true/);
  assert.match(linesheets, /formatMoneyMinor\(totals\.amountMinor/);
  // И основной форматтер больше не получает минорную сумму.
  assert.equal(/formatMoney\(totals\.amountMinor/.test(linesheets), false);
});
