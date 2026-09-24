import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'ui-validation.js'), 'utf8');

// Отказ проверяется по **коду**, а не по прозе: прозу читает человек, и она зависит от его языка,
// а код — это договор. Локаль подставляется двойником рантайма i18n: так видно, что сообщение
// действительно меняется, а не только объявлено меняющимся.
function validation(locale) {
  const window = {};
  window.window = window;
  if (locale) window.SynthaI18n = { getLocale: () => locale, translate: (value) => value };
  vm.runInContext(source, vm.createContext({ window, Date, Number, String, Object }));
  return window.SynthaUiValidation;
}
function codeOf(fn) { try { fn(); } catch (error) { return error.code; } return 'NO_ERROR'; }
function messageOf(fn) { try { fn(); } catch (error) { return error.message; } return ''; }

test('required text trims values and enforces boundaries', () => {
  const check = validation();
  assert.equal(check.requiredText('  Core  ', 'Name'), 'Core');
  assert.equal(codeOf(() => check.requiredText(' ', 'Name')), 'FIELD_TOO_SHORT');
  assert.equal(codeOf(() => check.requiredText('12345', 'Name', { maxLength: 4 })), 'FIELD_TOO_LONG');
  // Одно и то же нарушение читается на языке читателя, и подпись поля стоит впереди.
  assert.match(messageOf(() => validation('ru').requiredText(' ', 'Name')), /^Name: минимум 2 символа$/);
  assert.match(messageOf(() => validation('en').requiredText(' ', 'Name')), /^Name: minimum 2 characters$/);
});

test('date validation rejects missing reversed and equal ranges', () => {
  const check = validation();
  assert.doesNotThrow(() => check.dateRange('2026-08-01', '2026-08-02'));
  assert.equal(codeOf(() => check.dateRange('', '2026-08-02')), 'DATE_REQUIRED');
  assert.equal(codeOf(() => check.dateRange('2026-08-02', '2026-08-01')), 'DATE_RANGE_INVALID');
  assert.equal(codeOf(() => check.dateRange('2026-08-01', '2026-08-01')), 'DATE_RANGE_INVALID');
  // Без подписи фраза стоит сама и начинается с заглавной: «Начало: начало должно быть раньше
  // окончания» читалось бы хуже, а в форме диапазон дат один и без названия однозначен.
  assert.match(messageOf(() => validation('ru').dateRange('2026-08-02', '2026-08-01')), /^Начало должно быть раньше окончания$/);
  assert.match(messageOf(() => validation('en').dateRange('2026-08-02', '2026-08-01')), /^Start must be before end$/);
});

test('future date must be strictly after now', () => {
  const check = validation();
  const now = '2026-08-01T10:00:00.000Z';
  assert.equal(check.futureDate('2026-08-01T10:00:01.000Z', now), '2026-08-01T10:00:01.000Z');
  assert.equal(codeOf(() => check.futureDate(now, now)), 'FUTURE_DATE_REQUIRED');
  assert.equal(codeOf(() => check.futureDate('invalid', now)), 'FUTURE_DATE_REQUIRED');
  assert.match(messageOf(() => validation('en').futureDate(now, now)), /^Date must be in the future$/);
});

test('currency and SKU normalization match domain contracts', () => {
  const check = validation();
  assert.equal(check.currency(' eur '), 'EUR');
  assert.equal(codeOf(() => check.currency('EU')), 'CURRENCY_INVALID');
  assert.equal(check.sku(' core-01 '), 'CORE-01');
  assert.equal(codeOf(() => check.sku('A')), 'SKU_INVALID');
  assert.equal(codeOf(() => check.sku('bad sku')), 'SKU_INVALID');
  // Оба сообщения называют, каким значение должно быть, а не только что оно неверно.
  assert.match(messageOf(() => validation('en').currency('EU')), /three-letter ISO code, for example EUR or RUB/);
  assert.match(messageOf(() => validation('ru').currency('EU')), /трёхбуквенный код ISO, например EUR или RUB/);
  assert.match(messageOf(() => validation('en').sku('A')), /2-64 uppercase/);
  assert.match(messageOf(() => validation('ru').sku('A')), /от 2 до 64 знаков/);
});

test('numeric validation enforces integer and range semantics', () => {
  const check = validation();
  assert.equal(check.number('5', 'MOQ', { integer: true, min: 1 }), 5);
  assert.equal(codeOf(() => check.number('1.5', 'MOQ', { integer: true })), 'INTEGER_REQUIRED');
  assert.equal(codeOf(() => check.number(-1, 'Stock', { integer: true, min: 0 })), 'NUMBER_RANGE_INVALID');
  assert.equal(codeOf(() => check.number(101, 'Prepayment', { min: 0, max: 100 })), 'NUMBER_RANGE_INVALID');
  // Границы называются числами, а не словом «недопустимо»: человек должен знать, что ввести.
  assert.match(messageOf(() => validation('ru').number(101, 'Prepayment', { min: 0, max: 100 })), /^Prepayment: допустимо от 0 до 100$/);
  assert.match(messageOf(() => validation('en').number(101, 'Prepayment', { min: 0, max: 100 })), /^Prepayment: allowed range is 0 to 100$/);
});

test('trade parties cannot be identical', () => {
  const check = validation();
  assert.equal(codeOf(() => check.different('org-1', 'org-1', 'Trade parties')), 'VALUES_MUST_DIFFER');
  // Без подписи — самостоятельная фраза: связь запрашивают у другой организации, а не у своей.
  assert.match(messageOf(() => validation('ru').different('org-1', 'org-1')), /^Значения должны различаться$/);
  assert.equal(check.different('org-1', 'org-2', 'Trade parties'), 'org-1');
});
