import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'public', 'modules', 'i18n-runtime.js'), 'utf8');

test('locale defaults from browser language and persists an explicit switch', () => {
  const harness = createHarness('ru-RU');
  vm.runInContext(source, harness.context);
  const i18n = harness.window.SynthaI18n;

  assert.equal(i18n.getLocale(), 'ru');
  assert.equal(i18n.t('nav.catalog'), '\u041a\u0430\u0442\u0430\u043b\u043e\u0433');
  assert.equal(harness.document.documentElement.lang, 'ru');

  i18n.setLocale('en');
  assert.equal(i18n.getLocale(), 'en');
  assert.equal(i18n.t('nav.catalog'), 'Catalog');
  assert.equal(harness.storage.get('syntha-v2-locale'), 'en');
  assert.equal(harness.document.documentElement.lang, 'en');
  assert.deepEqual(harness.events.map(event => event.type), ['syntha:locale-changed']);

  i18n.setLocale('en');
  assert.equal(harness.events.length, 1, 'Selecting the current locale must not dispatch a duplicate render event');
});

test('stored locale overrides browser locale and invalid values safely fall back', () => {
  const stored = createHarness('ru-RU', [['syntha-v2-locale', 'en']]);
  vm.runInContext(source, stored.context);
  assert.equal(stored.window.SynthaI18n.getLocale(), 'en');

  const unsupported = createHarness('de-DE');
  vm.runInContext(source, unsupported.context);
  assert.equal(unsupported.window.SynthaI18n.getLocale(), 'ru');
  unsupported.window.SynthaI18n.setLocale('unsupported');
  assert.equal(unsupported.window.SynthaI18n.getLocale(), 'ru');
});

test('translations cover keyed, compatibility, dynamic, status and stage text', () => {
  const harness = createHarness('en-GB');
  vm.runInContext(source, harness.context);
  const i18n = harness.window.SynthaI18n;

  assert.equal(i18n.translate('\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437'), 'Create order');
  assert.equal(i18n.translate('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: Main'), 'Collection: Main');
  assert.equal(i18n.t('status.cancelled'), 'cancelled');
  assert.equal(i18n.t('stage.order-builder'), 'Order Builder');

  i18n.setLocale('ru');
  assert.equal(i18n.translate('Create order'), '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437');
  assert.equal(i18n.translate('Collection: Main'), '\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: Main');
  assert.equal(i18n.t('status.cancelled'), '\u043e\u0442\u043c\u0435\u043d\u0451\u043d');
  assert.equal(i18n.t('stage.order-builder'), '\u041a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0442\u043e\u0440 \u0437\u0430\u043a\u0430\u0437\u0430');
});

test('date and number formatting follows the selected locale', () => {
  const harness = createHarness('ru-RU');
  vm.runInContext(source, harness.context);
  const i18n = harness.window.SynthaI18n;
  const ruNumber = i18n.formatNumber(1234.5, { maximumFractionDigits: 1 });
  const ruDate = i18n.formatDate('2026-07-31T12:30:00.000Z');

  i18n.setLocale('en');
  const enNumber = i18n.formatNumber(1234.5, { maximumFractionDigits: 1 });
  const enDate = i18n.formatDate('2026-07-31T12:30:00.000Z');

  assert.notEqual(ruNumber, enNumber);
  assert.notEqual(ruDate, enDate);
  assert.equal(i18n.localeTag(), 'en-GB');
  assert.equal(i18n.formatDate(null), '\u2014');
});

test('localization diagnostics contain only complete RU EN pairs', () => {
  const harness = createHarness('en-GB');
  vm.runInContext(source, harness.context);
  const diagnostics = harness.window.SynthaI18n.diagnostics();
  assert.deepEqual(Array.from(diagnostics.locales), ['ru', 'en']);
  assert.deepEqual(Array.from(diagnostics.invalidMessageKeys), []);
  assert.equal(diagnostics.invalidPhraseCount, 0);
  assert.ok(diagnostics.messageCount >= 40);
  assert.ok(diagnostics.phraseCount >= 60);
});

function createHarness(browserLanguage, entries = []) {
  const storage = new Map(entries);
  const events = [];
  const document = { documentElement: { lang: '' }, title: '' };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const window = {
    document,
    navigator: { language: browserLanguage },
    localStorage,
    CustomEvent,
    dispatchEvent(event) { events.push(event); return true; },
  };
  window.window = window;
  const context = vm.createContext({ window, document, navigator: window.navigator, localStorage, CustomEvent, Intl, Date });
  return { context, window, document, storage, events };
}
