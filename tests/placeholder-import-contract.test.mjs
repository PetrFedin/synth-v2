import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DICTIONARY_COLUMNS,
  findRepeatedCodes,
  importContract,
  mapHeaders,
  parseDecimalToMinor,
  readRow,
  referenceField,
} from '../src/modules/assortment-planning/import.mjs';

const HEADERS = ['Код слота', 'Название RU', 'Название EN', 'Валюта', 'РРЦ', 'Себестоимость', 'Категория', 'Плановое количество', 'Дата запуска'];
const { mapped } = mapHeaders(HEADERS);
const row = (...cells) => readRow(cells, mapped);

test('a header is recognised however the author capitalised or spaced it', () => {
  const variants = mapHeaders(['код слота', 'НАЗВАНИЕ RU', 'name_en', 'Currency', 'Р Р Ц', 'cost', 'категория', 'quantity', 'launch at']);
  assert.deepEqual(variants.missing, []);
  assert.equal(variants.mapped.placeholderCode, 0);
  assert.equal(variants.mapped.recommendedRetailPrice, 4);
  assert.equal(variants.mapped.launchAt, 8);
});

test('a column nobody reads is reported rather than ignored', () => {
  // A "Бюджет маркетинга" column that silently does nothing is how a plan arrives with a field
  // missing and nobody notices until the season is under way.
  const { unknown, missing } = mapHeaders(['Код слота', 'Название RU', 'Название EN', 'Валюта', 'Бюджет маркетинга']);
  assert.deepEqual(unknown, ['Бюджет маркетинга']);
  assert.deepEqual(missing, []);
});

test('a file missing a column the import cannot do without says which one', () => {
  const { missing } = mapHeaders(['Название RU', 'Название EN']);
  assert.deepEqual(missing.sort(), ['currency', 'placeholderCode']);
});

test('money is read the way a spreadsheet writes it', () => {
  assert.deepEqual(parseDecimalToMinor('249,00'), { ok: true, value: 24900 });
  assert.deepEqual(parseDecimalToMinor('249.00'), { ok: true, value: 24900 });
  assert.deepEqual(parseDecimalToMinor('1 250'), { ok: true, value: 125000 });
  assert.deepEqual(parseDecimalToMinor('1 250,5'), { ok: true, value: 125050 });
  assert.deepEqual(parseDecimalToMinor('249,00 €'), { ok: true, value: 24900 });
  assert.deepEqual(parseDecimalToMinor(''), { ok: true, value: null });
  // A third decimal is a number nobody meant to write in minor units, so it is refused rather than
  // rounded: rounding a price silently changes a plan.
  assert.equal(parseDecimalToMinor('10,999').ok, false);
  assert.equal(parseDecimalToMinor('abc').ok, false);
  assert.equal(parseDecimalToMinor('-5').ok, false);
});

test('a date is read only in the two forms that cannot be misread', () => {
  assert.equal(row('C1', 'Имя', 'Name', 'EUR', '', '', '', '', '01.09.2027').draft.launchAt, '2027-09-01T00:00:00.000Z');
  assert.equal(row('C1', 'Имя', 'Name', 'EUR', '', '', '', '', '2027-09-01').draft.launchAt, '2027-09-01T00:00:00.000Z');
  // 03/04 is the third of April to one reader and the fourth of March to another; guessing moves a
  // launch by a month in silence.
  for (const written of ['03/04/2027', 'сентябрь 2027', '31.02.2027', '2027-13-01']) {
    const read = row('C1', 'Имя', 'Name', 'EUR', '', '', '', '', written);
    assert.deepEqual(read.problems.map((problem) => problem.column), ['launchAt'], `accepted ${written}`);
    assert.equal(read.problems[0].reason, 'notDate');
  }
});

test('a row says everything that is wrong with it, not the first thing', () => {
  const read = row('', '', 'Name', 'EURO', '10,999', 'abc', '', 'много', '');
  const columns = read.problems.map((problem) => problem.column);
  assert.deepEqual(columns, ['placeholderCode', 'nameRu', 'currency', 'recommendedRetailPrice', 'plannedUnitCost', 'plannedQuantity']);
});

test('a plan that costs more than it sells for is refused on its own line', () => {
  const read = row('C1', 'Имя', 'Name', 'EUR', '10,00', '50,00');
  assert.deepEqual(read.problems, [{ column: 'plannedUnitCost', reason: 'costAboveRetail', value: '50,00' }]);
});

test('a clean row becomes exactly what the domain takes', () => {
  const read = row('ss27-out-001', 'Куртка', 'Jacket', 'eur', '249,00', '72,50', 'Одежда', '1 200', '01.09.2027');
  assert.deepEqual(read.problems, []);
  assert.equal(read.placeholderCode, 'SS27-OUT-001');
  assert.equal(read.draft.currency, 'EUR');
  assert.equal(read.draft.recommendedRetailPriceMinor, 24900);
  assert.equal(read.draft.plannedUnitCostMinor, 7250);
  assert.equal(read.draft.plannedQuantity, 1200);
  // The dictionary column comes back as the word the author wrote, for the caller to resolve.
  assert.deepEqual(read.lookups, { category: 'Одежда' });
  assert.equal(referenceField('category'), 'categoryRef');
});

test('a code repeated in the file names both lines, in the author\'s numbering', () => {
  const repeated = findRepeatedCodes([
    { code: 'A', line: 2 }, { code: 'B', line: 3 }, { code: 'A', line: 9 }, { code: '', line: 10 },
  ]);
  assert.deepEqual([...repeated.keys()], ['A']);
  assert.deepEqual(repeated.get('A'), [2, 9]);
});

test('the published contract is the one the reader enforces', () => {
  const contract = importContract();
  assert.deepEqual(contract.required, ['placeholderCode', 'nameRu', 'nameEn', 'currency']);
  const category = contract.columns.find((column) => column.field === 'category');
  assert.equal(category.dictionary, DICTIONARY_COLUMNS.category);
  // Every column the contract advertises is one the reader actually maps.
  for (const column of contract.columns) {
    const { mapped: byName } = mapHeaders([column.accepts[0]]);
    assert.equal(byName[column.field], 0, `${column.field} is advertised but not read`);
  }
});

test('the reader refuses what the domain would refuse, not something looser', async () => {
  // A check that passes a row the next step rejects is worse than no check: the author is told the
  // file is fine and then told it is not, with no line and no column. The bounds here and the ones
  // the domain enforces are the same rule, so they are compared rather than trusted.
  const domain = await readFile(new URL('../src/modules/assortment-planning/public.mjs', import.meta.url), 'utf8');
  const bounds = importContract().columns.filter((column) => column.length);
  assert.ok(bounds.length >= 4, 'the contract publishes the lengths it enforces');
  for (const column of bounds.filter((candidate) => candidate.field !== 'description')) {
    const [, max] = column.length;
    assert.match(domain, new RegExp(`max: ${max}`), `${column.field} max ${max} is not the domain's`);
  }

  const long = (n) => 'x'.repeat(n);
  const problems = (cells) => readRow(cells, mapHeaders(['Код', 'Название RU', 'Название EN', 'Валюта', 'Капсула', 'Дроп']).mapped).problems;
  assert.deepEqual(problems(['C1', 'А', 'A', 'EUR', '', '']).map((problem) => [problem.column, problem.reason]),
    [['nameRu', 'tooShort'], ['nameEn', 'tooShort']]);
  assert.deepEqual(problems(['C1', long(201), 'Name', 'EUR', '', '']).map((problem) => problem.reason), ['tooLong']);
  assert.deepEqual(problems(['C1', 'Имя', 'Name', 'EUR', long(121), '']).map((problem) => [problem.column, problem.reason]),
    [['capsule', 'tooLong']]);
  assert.deepEqual(problems(['C1', 'Имя', 'Name', 'EUR', '', 'Д']).map((problem) => [problem.column, problem.reason]),
    [['drop', 'tooShort']]);
});

test('the template the screen offers is one the import accepts', async () => {
  // The application shipped an English template whose "Colourways" and "Launch date" columns its own
  // reader did not know: a user filled them in and every value was dropped without a word.
  const ui = await readFile(new URL('../public/modules/placeholder-import.js', import.meta.url), 'utf8');
  const block = ui.slice(ui.indexOf('const COLUMN_LABEL'), ui.indexOf('// Why a row was refused'));
  const labels = [...block.matchAll(/^\s{4}(\w+): \['([^']+)', '([^']+)'\]/gm)];
  assert.ok(labels.length >= 18, `expected every column to carry a label, found ${labels.length}`);
  for (const [, field, ru, en] of labels) {
    for (const heading of [ru, en]) {
      const { mapped } = mapHeaders([heading]);
      assert.equal(mapped[field], 0, `the template heading "${heading}" is not read as ${field}`);
    }
  }
});
