import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const FORMS = ['campaign-form.js', 'collection-form.js', 'catalog-form.js', 'forms-3.js', 'relationship-form.js', 'retail-doors.js', 'showroom-form.js'];

// Отказ формы человек читает чаще всего остального: он ошибается в поле каждый день. Сообщения
// валидации были только английскими, и русский пользователь, перепутав даты кампании, получал в
// диалоге «Campaign dates: start must be before end» — проверено живьём, именно так и выглядело.

test('every validation message exists in both languages', async () => {
  const source = await readFile(path.join(root, 'public/modules/ui-validation.js'), 'utf8');
  // Язык выбирается здесь, потому что таблица фраз ищет точное совпадение, а эти строки
  // собираются во время выполнения с подстановкой чисел.
  assert.match(source, /function phrase\(ru, en\)/);
  const calls = [...source.matchAll(/fail\('([A-Z_]+)',/g)].map(([, code]) => code);
  assert.ok(calls.length >= 10, 'the validator must still refuse the same things');

  // Ни одного сообщения, собранного в обход двуязычной пары.
  const messages = [...source.matchAll(/fail\('[A-Z_]+', ([^;]+)\);/g)].map(([, body]) => body);
  for (const body of messages) {
    assert.ok(/phrase\(/.test(body), `a refusal is assembled without a language pair: ${body.slice(0, 60)}`);
  }
});

test('no form passes the validator an English label the interface never shows', async () => {
  // Подпись обязана быть той же строкой, которой подписано поле: тогда название переводится один
  // раз и одинаково в форме и в отказе. Английская подпись рядом с русским сообщением давала
  // «Campaign name: минимум 2 символа» — половину перевода, что хуже отсутствия.
  const allowed = new Set(['Wholesale price', 'MOQ', 'Sellable quantity', 'Door code']);
  for (const file of FORMS) {
    const source = await readFile(path.join(root, 'public/modules', file), 'utf8');
    const labels = [...source.matchAll(/validation\.(?:requiredText|number|dateRange|futureDate|different)\([^)]*?'([A-Za-z][A-Za-z ,%]{2,40})'/g)]
      .map(([, label]) => label);
    for (const label of labels) {
      assert.ok(allowed.has(label), `${file} passes the validator the label "${label}", which the form itself does not use`);
    }
  }
});

test('a date range refuses without naming a field, because the sentence is already unambiguous', async () => {
  const source = await readFile(path.join(root, 'public/modules/ui-validation.js'), 'utf8');
  assert.match(source, /function dateRange\(start, end, label = ''\)/);
  assert.match(source, /function futureDate\(value, now = new Date\(\)\.toISOString\(\), label = ''\)/);
  // Без подписи фраза начинается с заглавной буквы, а не с двоеточия в пустоте.
  assert.match(source, /\$\{message\.charAt\(0\)\.toUpperCase\(\)\}\$\{message\.slice\(1\)\}/);
});
