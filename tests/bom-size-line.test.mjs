import test from 'node:test';
import assert from 'node:assert/strict';

import { bomComposition, efficiencyBasisPoints, styleSizeLine } from '../src/modules/bom/size-line.mjs';

const line = (overrides = {}) => ({
  lineId: 'L1', component: 'Верх', materialCode: 'MAT-SHELL', materialType: 'fabric',
  unit: 'm', quantity: 2.1, wastePercent: 7, grossQuantity: 2.247, lineCost: 14.38,
  isMain: true, placement: 'Полочка и спинка', ...overrides,
});

function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }

test('выход выводится из нетто и брутто, а не хранится рядом отдельным полем', () => {
  // Семь процентов отходов дают 93,46 %, а не 93 %: на тираже разница видна.
  assert.equal(efficiencyBasisPoints(line()), 9346);
  // У фурнитуры отходов нет, и «выход 100 %» на пуговице — шум, а не показатель.
  assert.equal(efficiencyBasisPoints(line({ quantity: 1, grossQuantity: 1 })), null);
  assert.equal(efficiencyBasisPoints({ quantity: 1 }), null);
});

test('ведомость разбирается по типам материала с подсчётом и долей от себестоимости материалов', () => {
  const view = bomComposition({ lines: [
    line(),
    line({ lineId: 'L2', materialCode: 'MAT-LINING', component: 'Подкладка', quantity: 1.4, grossQuantity: 1.47, wastePercent: 5, lineCost: 5.62, isMain: false }),
    line({ lineId: 'L3', materialCode: 'MAT-ZIP', materialType: 'trim', unit: 'pcs', quantity: 1, grossQuantity: 1, wastePercent: 0, lineCost: 1.2, isMain: false }),
  ] });

  assert.equal(view.lineCount, 3);
  assert.equal(view.materialCost, 21.2);
  const fabric = view.groups.find((group) => group.materialType === 'fabric');
  assert.equal(fabric.lineCount, 2);
  assert.equal(fabric.mainCount, 1, 'основная ткань в группе одна');
  assert.equal(fabric.costShareBasisPoints, Math.round((20 / 21.2) * 10_000));
  const trim = view.groups.find((group) => group.materialType === 'trim');
  assert.equal(trim.lineCount, 1);
});

test('общий выход взвешен деньгами: метры и штуки не складываются', () => {
  const view = bomComposition({ lines: [
    line({ lineCost: 100 }),
    line({ lineId: 'L2', materialCode: 'MAT-ZIP', materialType: 'trim', unit: 'pcs', quantity: 1, grossQuantity: 1, wastePercent: 0, lineCost: 1 }),
  ] });
  // Молния выхода не объявляет, поэтому в средневзвешенное не входит вовсе.
  assert.equal(view.efficiencyBasisPoints, 9346);

  const mixed = bomComposition({ lines: [
    line({ lineCost: 100 }),
    line({ lineId: 'L2', materialCode: 'MAT-LINING', quantity: 1, grossQuantity: 2, lineCost: 100 }),
  ] });
  // Две строки равной стоимости: 93,46 % и 50 % дают 71,73 %.
  assert.equal(mixed.efficiencyBasisPoints, Math.round((9346 + 5000) / 2));
});

const sizeRow = (sizeCode, sortOrder, overrides = {}) => ({
  sizeCode, sizeSortOrder: sortOrder, catalogSku: `SKU-${sizeCode}`, bomStatus: 'published',
  bomTotalCost: 40, currency: 'EUR',
  materialCode: 'MAT-SHELL', materialType: 'fabric', component: 'Верх', unit: 'm',
  isMain: true, placement: 'Полочка', quantity: 2.1, grossQuantity: 2.247, wastePercent: 7, lineCost: 14.38,
  ...overrides,
});

test('ряд упорядочен по справочнику размеров, а не по алфавиту', () => {
  const view = styleSizeLine([
    sizeRow('RU_48', 480), sizeRow('RU_40', 400), sizeRow('RU_44', 440),
  ]);
  assert.deepEqual(view.sizes.map((size) => size.sizeCode), ['RU_40', 'RU_44', 'RU_48']);
  assert.equal(view.sizeCount, 3);
  assert.equal(view.publishedSizeCount, 3);
});

test('расход собирается в сетку и виден разброс по ряду', () => {
  const view = styleSizeLine([
    sizeRow('RU_40', 400, { quantity: 2.0, grossQuantity: 2.14 }),
    sizeRow('RU_44', 440, { quantity: 2.1, grossQuantity: 2.247 }),
    sizeRow('RU_48', 480, { quantity: 2.25, grossQuantity: 2.408 }),
  ]);
  const shell = view.materials[0];
  assert.equal(shell.materialCode, 'MAT-SHELL');
  assert.deepEqual(shell.consumption.map((cell) => cell.quantity), [2.0, 2.1, 2.25]);
  assert.equal(shell.minQuantity, 2.0);
  assert.equal(shell.maxQuantity, 2.25);
  assert.equal(shell.graded, true);
  assert.equal(view.exceptions.length, 0);
  assert.equal(view.complete, true);
});

test('одна цифра во все размеры — это не градация, и сетка это показывает', () => {
  const view = styleSizeLine([sizeRow('RU_40', 400), sizeRow('RU_44', 440), sizeRow('RU_48', 480)]);
  assert.equal(view.materials[0].graded, false, 'во все размеры вписан один расход');
  assert.equal(view.exceptions.length, 0, 'это подозрительно, но законно — отказа нет');
});

test('расход, падающий с размером, называется, но не отвергается', () => {
  const view = styleSizeLine([
    sizeRow('RU_40', 400, { quantity: 2.3 }),
    sizeRow('RU_44', 440, { quantity: 2.1 }),
  ]);
  const exception = view.exceptions.find((item) => item.code === 'consumption-not-graded');
  assert.ok(exception, 'расход упал на большем размере');
  assert.equal(exception.sizeCode, 'RU_44');
  assert.match(exception.detail, /RU_40 — 2\.3/);
  assert.equal(view.complete, false);
});

test('материал, пропавший в одном размере, находится сравнением ряда', () => {
  const view = styleSizeLine([
    sizeRow('RU_40', 400),
    sizeRow('RU_40', 400, { materialCode: 'MAT-LINING', component: 'Подкладка', isMain: false, quantity: 1.4, grossQuantity: 1.47 }),
    sizeRow('RU_44', 440),
  ]);
  const missing = view.exceptions.find((item) => item.code === 'material-missing-in-size');
  assert.ok(missing);
  assert.equal(missing.materialCode, 'MAT-LINING');
  assert.equal(missing.sizeCode, 'RU_44');
});

test('размер без опубликованной ведомости назван отдельно и не считается посчитанным', () => {
  const view = styleSizeLine([
    sizeRow('RU_40', 400),
    sizeRow('RU_44', 440, { bomStatus: 'draft' }),
  ]);
  assert.equal(view.publishedSizeCount, 1);
  assert.equal(view.sizeCount, 2);
  const exception = view.exceptions.find((item) => item.code === 'size-without-published-bom');
  assert.equal(exception.sizeCode, 'RU_44');
  assert.match(exception.detail, /черновик|draft/);
});

test('пропуск в середине ряда не объявляется дважды', () => {
  // Материала нет в 44-м: это уже названо как «material-missing-in-size», и «расход упал»
  // про тот же пропуск было бы сообщением об одной ошибке дважды.
  const view = styleSizeLine([
    sizeRow('RU_40', 400, { quantity: 2.0 }),
    sizeRow('RU_44', 440, { materialCode: 'MAT-LINING', isMain: false }),
    sizeRow('RU_48', 480, { quantity: 2.25 }),
  ]);
  assert.equal(view.exceptions.filter((item) => item.code === 'consumption-not-graded').length, 0,
    'через пропуск расход считается по соседним названным размерам: 2,0 → 2,25 растёт');
  // Пропусков ровно три: ткани нет в 44-м, подкладки — в 40-м и 48-м. Каждый назван один раз.
  assert.equal(view.exceptions.filter((item) => item.code === 'material-missing-in-size').length, 3);
});

test('один стиль не может вести ведомость в двух валютах', () => {
  assert.equal(
    codeOf(() => styleSizeLine([sizeRow('RU_40', 400), sizeRow('RU_44', 440, { currency: 'RUB' })])),
    'BOM_SIZE_LINE_CURRENCY_MIXED',
  );
});

test('основные материалы идут первыми: ряд читают сверху вниз', () => {
  const view = styleSizeLine([
    sizeRow('RU_40', 400, { materialCode: 'MAT-ZIP', materialType: 'trim', isMain: false }),
    sizeRow('RU_40', 400),
  ]);
  assert.deepEqual(view.materials.map((material) => material.materialCode), ['MAT-SHELL', 'MAT-ZIP']);
});
