import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Один словарь статусов на весь продукт. Экраны показывают статус из базы через `statusLabel`
// (dom-2.js), а подписи лежат в `status.*` рантайма i18n. Тест держит их в согласии с доменом:
// значение статуса, у которого нет подписи, показывается человеку сырым кодом (`not_assessed`,
// `published`, `revoked`) — так и вышло в приёмочном прогоне, поэтому проверка идёт не по списку,
// написанному руками, а по самим доменным константам src/modules/*.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const [runtime, dom2] = await Promise.all([read('i18n-runtime.js'), read('dom-2.js')]);

function labeller(locale) {
  const window = { navigator: { language: locale } };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(runtime, context);
  window.I18N = window.SynthaI18n;
  window.SynthaI18n.setLocale(locale);
  vm.runInContext(`${dom2}\nthis.statusLabel = statusLabel;`, context);
  return window.statusLabel;
}
const ru = labeller('ru');
const en = labeller('en');
const CYRILLIC = /[а-яё]/i;

// Не статусы: список измерений готовности подписывается своей панелью (product-readiness-panel.js).
const NOT_STATUS_CONSTANTS = new Set(['PRODUCT_READINESS_DIMENSIONS']);
const STATUS_CONSTANT = /(STATUS|STATES?|LIFECYCLE|SEVERIT|RESULTS|ALLOWED_ROLES)/;

async function domainStatusValues() {
  const modulesDir = path.join(root, 'src', 'modules');
  const found = new Map();
  for (const entry of await readdir(modulesDir)) {
    const file = path.join(modulesDir, entry, 'public.mjs');
    try { await access(file); } catch { continue; }
    const exported = await import(file);
    for (const [name, value] of Object.entries(exported)) {
      if (!STATUS_CONSTANT.test(name) || NOT_STATUS_CONSTANTS.has(name)) continue;
      const values = Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
      for (const item of values) if (typeof item === 'string') found.set(`${entry}:${name}:${item}`, item);
    }
  }
  return found;
}

test('every status value the domain can produce has a Russian and an English label', async () => {
  const values = await domainStatusValues();
  assert.ok(values.size > 80, `the domain constants were not found (${values.size})`);
  const missing = [];
  for (const [where, value] of values) {
    const russian = ru(value);
    const english = en(value);
    if (!CYRILLIC.test(russian)) missing.push(`${where}: ru «${russian}»`);
    if (CYRILLIC.test(english) || english === '—' || !english) missing.push(`${where}: en «${english}»`);
  }
  assert.deepEqual(missing, [], 'domain status values without a label in the one status dictionary');
});

test('the states the screens invent themselves (not in any domain list) are labelled too', () => {
  for (const code of ['not_assessed', 'not_published', 'blocked', 'ready', 'inactive', 'revoked', 'invited', 'expired', 'committed', 'attached', 'pending_approval', 'awaiting_quote', 'quote_submitted', 'won', 'lost', 'unread', 'shared', 'private']) {
    assert.match(ru(code), CYRILLIC, `ru ${code}`);
    assert.doesNotMatch(en(code), CYRILLIC, `en ${code}`);
    assert.notEqual(ru(code), code, `${code} is shown as the raw code`);
  }
  // The two the registry of styles showed raw next to «готов» and «опубликовано».
  assert.equal(ru('not_assessed'), 'не проверено');
  assert.equal(ru('not_published'), 'не опубликовано');
});

test('the domain spells compound values both ways and in both cases; the label does not care', () => {
  assert.equal(ru('ready-for-qc'), ru('ready_for_qc'));
  assert.equal(ru('not-applicable'), ru('not_applicable'));
  assert.equal(ru('VALUE'), ru('value'));
  assert.equal(ru('MISSING'), ru('missing'));
});

test('a value the dictionary has never seen is shown as readable words, never as the raw code', () => {
  assert.equal(en('some_future_status'), 'some future status');
  assert.equal(ru('another-new-state'), 'another new state');
  assert.equal(ru('SHOUTING_CODE'), 'shouting code');
  for (const raw of [null, undefined, '']) assert.equal(ru(raw), '—');
});

test('roles read as roles where the product names them with the status dictionary', () => {
  for (const role of ['owner', 'admin', 'sales', 'production', 'quality', 'buyer', 'finance', 'viewer', 'member']) {
    assert.match(ru(role), CYRILLIC, role);
  }
});
