import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const source = await readFile(path.join(process.cwd(), 'public/modules/order-grid-core.js'), 'utf8');
const scope = {};
new Function('globalThis', `${source}`).call(scope, scope);
const Grid = scope.SynthaOrderGrid;

// Ячейка несёт цену так, как её строит матрица линшита: `unitPrice` — в основных единицах (24,00),
// `wholesalePriceMinor` — то же целым числом копеек из замороженной строки прайс-листа.
//
// Приспособление раньше подавало `unitPrice: 2400`, то есть считало основное поле минорным, — и
// тем закрепляло дефект: сумма в подвале сетки завышалась в сто раз на любой цене с копейками.
function cell(sku, { moq = 1, ats = null, priceMinor = 2400, size = 'M' } = {}) {
  return {
    sku,
    minimumOrderQuantity: moq,
    availableToSell: ats,
    unitPrice: priceMinor / 100,
    wholesalePriceMinor: priceMinor,
    currency: 'EUR',
    size: { key: size, code: size },
  };
}

function style() {
  const sizes = [{ key: 'S', code: 'S' }, { key: 'M', code: 'M' }, { key: 'L', code: 'L' }];
  return {
    sizes,
    rows: [
      { code: 'NAVY', nameRu: 'Тёмно-синий', cells: { S: cell('A_S', { size: 'S' }), M: cell('A_M', { moq: 6 }), L: cell('A_L', { size: 'L', ats: 4 }) } },
      { code: 'OFFWHITE', nameRu: 'Молочный', cells: { S: cell('B_S', { size: 'S' }), M: cell('B_M'), L: cell('B_L', { size: 'L' }) } },
    ],
  };
}

test('A blank cell and a zero are different answers', () => {
  assert.equal(Grid.readEntry('').kind, 'blank');
  assert.equal(Grid.readEntry(null).kind, 'blank');
  assert.equal(Grid.readEntry('   ').kind, 'blank');
  // Zero is a decision, not a mistake: the reader looked at the SKU and wants none of it. The
  // stored matrix has no zero line, so it removes the line — but it is never an error.
  const zero = Grid.evaluateCell(cell('A_M'), '0');
  assert.equal(zero.kind, 'remove');
  assert.equal(zero.level, 'ok');
  assert.equal(zero.code, 'REMOVED');
});

test('A cell is judged by the same rules the save is refused with', () => {
  assert.equal(Grid.evaluateCell(cell('A_M', { moq: 6 }), '3').code, 'MOQ_NOT_MET');
  assert.equal(Grid.evaluateCell(cell('A_M', { moq: 6 }), '6').level, 'ok');
  assert.equal(Grid.evaluateCell(cell('A_L', { ats: 4 }), '5').code, 'AVAILABILITY_EXCEEDED');
  assert.equal(Grid.evaluateCell(cell('A_L', { ats: 4 }), '4').level, 'ok');
  assert.equal(Grid.evaluateCell(cell('A_M'), 'шесть').code, 'QUANTITY_INVALID');
  assert.equal(Grid.evaluateCell(cell('A_M'), '-2').code, 'QUANTITY_INVALID');
  assert.equal(Grid.evaluateCell(cell('A_M'), '2.5').code, 'QUANTITY_INVALID');
});

test('A spreadsheet writes numbers the way its locale does', () => {
  assert.equal(Grid.readEntry('1 200').quantity, 1200);
  assert.equal(Grid.readEntry('1 200').quantity, 1200);
  assert.equal(Grid.readEntry('12,00').quantity, 12);
  assert.equal(Grid.readEntry('12.000').quantity, 12);
});

test('A clipboard grid keeps quoted fields whole', () => {
  assert.deepEqual(Grid.parseClipboardGrid('1\t2\t3\n4\t5\t6'), [['1', '2', '3'], ['4', '5', '6']]);
  assert.deepEqual(Grid.parseClipboardGrid('1\t2\n'), [['1', '2']]);
  assert.deepEqual(Grid.parseClipboardGrid('"a\tb"\t2'), [['a\tb', '2']]);
  assert.deepEqual(Grid.parseClipboardGrid('"say ""hi"""\t2'), [['say "hi"', '2']]);
  assert.deepEqual(Grid.parseClipboardGrid(''), []);
});

test('A paste is planned before anything is written', () => {
  const plan = Grid.planPaste({ style: style(), anchorSku: 'A_S', grid: [['2', '8', '9'], ['4', '5', '6']], quantities: {} });
  assert.equal(plan.anchor.row, 0);
  assert.equal(plan.anchor.column, 0);
  assert.equal(plan.changes.length, 6);
  const byS = Object.fromEntries(plan.changes.map(change => [change.sku, change]));
  assert.equal(byS.A_M.level, 'ok');            // 8 clears the MOQ of 6
  assert.equal(byS.A_L.code, 'AVAILABILITY_EXCEEDED'); // 9 asked of a size with 4 left
  assert.equal(plan.errors, 1);
});

test('A paste that runs off the edge of the style says how much fell outside', () => {
  const plan = Grid.planPaste({ style: style(), anchorSku: 'A_M', grid: [['6', '1', '9', '9']], quantities: {} });
  // Anchored on the middle size, two of the four pasted columns have nowhere to land.
  assert.equal(plan.outside, 2);
  assert.equal(plan.changes.length, 2);
});

test('An unchanged cell is not a change', () => {
  const plan = Grid.planPaste({ style: style(), anchorSku: 'B_S', grid: [['3', '4', '5']], quantities: { B_S: '3' } });
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.changes.length, 2);
});

test('Applying a plan leaves the previous map for undo, and skips refused cells by default', () => {
  const quantities = { A_S: '1' };
  const plan = Grid.planPaste({ style: style(), anchorSku: 'A_S', grid: [['2', '3', '1']], quantities });
  const applied = Grid.applyPlan(quantities, plan);
  assert.equal(applied.next.A_S, '2');
  assert.equal(applied.next.A_M, undefined, 'a quantity below the MOQ is not written');
  assert.equal(applied.next.A_L, '1');
  assert.equal(applied.previous.A_S, '1');
  const forced = Grid.applyPlan(quantities, plan, { includeErrors: true });
  assert.equal(forced.next.A_M, '3');
});

test('A zero in a pasted block removes the line rather than writing a nought', () => {
  const plan = Grid.planPaste({ style: style(), anchorSku: 'B_S', grid: [['0']], quantities: { B_S: '7' } });
  assert.equal(plan.changes[0].kind, 'remove');
  assert.equal(plan.changes[0].after, '0');
  const applied = Grid.applyPlan({ B_S: '7' }, plan);
  assert.equal(applied.next.B_S, '0');
});

test('Totals add up by row, by column and for the style, in units and in money', () => {
  const totals = Grid.styleTotals(style(), { A_S: '2', A_M: '6', B_L: '10' });
  assert.equal(totals.rows[0].units, 8);
  assert.equal(totals.rows[1].units, 10);
  assert.equal(totals.columns[0].units, 2);
  assert.equal(totals.columns[1].units, 6);
  assert.equal(totals.columns[2].units, 10);
  assert.equal(totals.units, 18);
  assert.equal(totals.amountMinor, 18 * 2400);
  assert.equal(totals.lines, 3);
  assert.equal(totals.currency, 'EUR');
});

test('A cell nobody can order says which of the two reasons it is', () => {
  assert.equal(Grid.cellClosedReason(cell('X', { ats: 0 })), 'SOLD_OUT');
  assert.equal(Grid.cellClosedReason(cell('X', { moq: 12, ats: 5 })), 'BELOW_MOQ_STOCK');
  assert.equal(Grid.cellClosedReason(cell('X', { moq: 12, ats: 12 })), '');
  assert.equal(Grid.cellClosedReason(null), 'NO_SKU');
});
