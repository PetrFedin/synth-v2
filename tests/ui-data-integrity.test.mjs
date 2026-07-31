import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i18nSource = await readFile(path.join(root, 'public', 'modules', 'i18n-runtime.js'), 'utf8');
const domSource = await readFile(path.join(root, 'public', 'modules', 'dom-2.js'), 'utf8');
const domHelpersSource = await readFile(path.join(root, 'public', 'modules', 'dom-1.js'), 'utf8');

function createContext(language = 'en-GB') {
  const document = { documentElement: { lang: '' }, title: '' };
  const localStorage = { getItem: () => null, setItem: () => {} };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const window = { document, navigator: { language }, localStorage, CustomEvent, dispatchEvent: () => true };
  window.window = window;
  const context = vm.createContext({ window, document, navigator: window.navigator, localStorage, CustomEvent, Intl, Date, console, setTimeout: () => 0 });
  vm.runInContext(i18nSource, context);
  context.I18N = window.SynthaI18n;
  vm.runInContext(domSource, context);
  return { context, i18n: window.SynthaI18n };
}

test('metadata labels translate while business values remain byte-for-byte unchanged', () => {
  const { context, i18n } = createContext('en-GB');
  assert.equal(context.translateDataText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: Open'), 'Collection: Open');
  assert.equal(context.translateDataText('\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: Collection'), 'Organisation: Collection');

  i18n.setLocale('ru');
  assert.equal(context.translateDataText('Collection: Open'), '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: Open');
  assert.equal(context.translateDataText('Organisation: Collection'), '\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f: Collection');
});

test('entity titles and select option labels use raw text rendering', () => {
  assert.match(domHelpersSource, /entity-title', rawText:/);
  assert.match(domHelpersSource, /el\('option',\{value,rawText:text\}\)/);
  assert.doesNotMatch(domHelpersSource, /entity-title', text: title/);
});

test('workflow forms consume guarded contexts instead of independent campaign collection and showroom lists', async () => {
  const forms = await readFile(path.join(root, 'public', 'modules', 'forms-3.js'), 'utf8');
  assert.match(forms, /buildCycleContexts\(state\.workspace, ownIds\(\)\)/);
  assert.match(forms, /buildSelectionContexts\(state\.workspace, ownIds\(\), new Date\(\)\.toISOString\(\)\)/);
  assert.doesNotMatch(forms, /selectDef\('campaignId'/);
  assert.doesNotMatch(forms, /selectDef\('showroomId'/);
});
