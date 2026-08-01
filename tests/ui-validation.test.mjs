import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'ui-validation.js'), 'utf8');

function validation() {
  const window = {};
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, Date, Number, String, Object }));
  return window.SynthaUiValidation;
}

test('required text trims values and enforces boundaries', () => {
  const check = validation();
  assert.equal(check.requiredText('  Core  ', 'Name'), 'Core');
  assert.throws(() => check.requiredText(' ', 'Name'), /minimum 2 characters/);
  assert.throws(() => check.requiredText('12345', 'Name', { maxLength: 4 }), /maximum 4 characters/);
});

test('date validation rejects missing reversed and equal ranges', () => {
  const check = validation();
  assert.doesNotThrow(() => check.dateRange('2026-08-01', '2026-08-02'));
  assert.throws(() => check.dateRange('', '2026-08-02'), /both dates are required/);
  assert.throws(() => check.dateRange('2026-08-02', '2026-08-01'), /start must be before end/);
  assert.throws(() => check.dateRange('2026-08-01', '2026-08-01'), /start must be before end/);
});

test('future date must be strictly after now', () => {
  const check = validation();
  const now = '2026-08-01T10:00:00.000Z';
  assert.equal(check.futureDate('2026-08-01T10:00:01.000Z', now), '2026-08-01T10:00:01.000Z');
  assert.throws(() => check.futureDate(now, now), /date must be in the future/);
  assert.throws(() => check.futureDate('invalid', now), /date must be in the future/);
});

test('currency and SKU normalization match domain contracts', () => {
  const check = validation();
  assert.equal(check.currency(' eur '), 'EUR');
  assert.throws(() => check.currency('EU'), /three-letter ISO code/);
  assert.equal(check.sku(' core-01 '), 'CORE-01');
  assert.throws(() => check.sku('A'), /2-64 uppercase/);
  assert.throws(() => check.sku('bad sku'), /2-64 uppercase/);
});

test('numeric validation enforces integer and range semantics', () => {
  const check = validation();
  assert.equal(check.number('5', 'MOQ', { integer: true, min: 1 }), 5);
  assert.throws(() => check.number('1.5', 'MOQ', { integer: true }), /whole number/);
  assert.throws(() => check.number(-1, 'Stock', { integer: true, min: 0 }), /allowed range/);
  assert.throws(() => check.number(101, 'Prepayment', { min: 0, max: 100 }), /allowed range/);
});

test('trade parties cannot be identical', () => {
  const check = validation();
  assert.throws(() => check.different('org-1', 'org-1', 'Trade parties'), /values must differ/);
  assert.equal(check.different('org-1', 'org-2', 'Trade parties'), 'org-1');
});
