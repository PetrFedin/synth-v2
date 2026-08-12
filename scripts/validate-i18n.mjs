import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const indexPath = path.join(publicDir, 'index.html');
const index = await readUtf8(indexPath);
const sourceUrls = [...index.matchAll(/<script defer src="([^"]+)"/g)].map(match => match[1]);
const sources = sourceUrls.map(assetPathname);
const expectedFoundation = [
  '/ui/i18n-runtime.js',
  '/ui/i18n-v7.js',
  '/ui/dom-2.js',
  '/ui/dom-1.js',
  '/ui/api.js',
  '/ui/workspace-pagination.js',
  '/ui/notification-pagination.js',
  '/ui/ui-capabilities.js',
  '/ui/ui-validation.js',
  '/ui/app-core.js',
];

assert(sources.filter(source => source === '/ui/i18n-runtime.js').length === 1, 'The localization runtime must be loaded exactly once.');
assert(sources.filter(source => source === '/ui/i18n-v7.js').length === 1, 'The strict bilingual runtime must be loaded exactly once.');
assert(!sources.includes('/ui/i18n.js'), 'The superseded localization runtime must not be loaded.');
assert(sources.at(-1) === '/ui/app-start.js', 'The application startup module must be loaded last.');
for (const [index, source] of expectedFoundation.entries()) {
  assert(sources[index] === source, `UI foundation order is invalid at position ${index + 1}: expected ${source}, received ${sources[index]}.`);
}

const runtimePath = path.join(publicDir, 'modules', 'i18n-runtime.js');
const runtimeSource = await readUtf8(runtimePath);
new vm.Script(runtimeSource, { filename: runtimePath });

const runtimeHarness = createHarness('ru-RU');
vm.runInContext(runtimeSource, runtimeHarness.context, { filename: runtimePath });
const i18n = runtimeHarness.window.SynthaI18n;
assert(i18n, 'Localization runtime did not expose SynthaI18n.');
assert(i18n.getLocale() === 'ru', 'Russian must be selected for a Russian browser when no preference is stored.');
assert(i18n.t('nav.overview') === '\u041e\u0431\u0437\u043e\u0440', 'Russian navigation dictionary is invalid.');
assert(i18n.translate('Create order') === '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0437\u0430\u043a\u0430\u0437', 'English-to-Russian compatibility translation is invalid.');
i18n.setLocale('en');
assert(i18n.getLocale() === 'en', 'English locale was not selected.');
assert(runtimeHarness.storage.get('syntha-v2-locale') === 'en', 'Locale preference was not persisted.');
assert(runtimeHarness.document.documentElement.lang === 'en', 'Document language was not synchronized.');
assert(i18n.t('nav.overview') === 'Overview', 'English navigation dictionary is invalid.');
assert(i18n.translate('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f: Core') === 'Collection: Core', 'Dynamic prefix translation is invalid.');
assert(runtimeHarness.events.length === 1 && runtimeHarness.events[0].type === 'syntha:locale-changed', 'Locale change event was not dispatched exactly once.');
const diagnostics = i18n.diagnostics();
assert(JSON.stringify(diagnostics.locales) === JSON.stringify(['ru', 'en']), 'Supported locale list is invalid.');
assert(diagnostics.invalidMessageKeys.length === 0, 'Localization dictionary contains invalid message pairs.');
assert(diagnostics.invalidPhraseCount === 0, 'Localization dictionary contains invalid phrase pairs.');
assert(diagnostics.messageCount >= 40, 'Localization dictionary is unexpectedly incomplete.');
assert(diagnostics.phraseCount >= 60, 'Compatibility translation dictionary is unexpectedly incomplete.');

const strictPath = path.join(publicDir, 'modules', 'i18n-v7.js');
const strictSource = await readUtf8(strictPath);
new vm.Script(strictSource, { filename: strictPath });
const strictHarness = createHarness('ru-RU');
vm.runInContext(runtimeSource, strictHarness.context, { filename: runtimePath });
vm.runInContext(strictSource, strictHarness.context, { filename: strictPath });
const strictI18n = strictHarness.window.SynthaI18n;
assert(strictI18n.t('auth.description') === '\u0415\u0434\u0438\u043d\u043e\u0435 \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e \u0434\u043b\u044f \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0438, \u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432\u0430 \u0438 \u043e\u043f\u0442\u043e\u0430432\u043e\u0439 \u0442\u043e\u0440\u0433\u043e\u0432\u043b\u0438.', 'Russian login copy is not strict Russian.');
assert(strictI18n.translate('Linesheets') === '\u041b\u0438\u0441\u0442\u044b \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439', 'Russian strict terminology is invalid.');
assert(strictI18n.translate('\u041d\u0435\u0442 linesheet') === '\u041d\u0435\u0442 \u043b\u0438\u0441\u0442 \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438', 'Embedded Russian terminology is not normalized.');
assert(strictI18n.translate('\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 cost snapshot') === '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u0441\u043d\u0438\u043c\u043e\u043a \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u0438', 'Mixed Russian BOM terminology is not normalized.');
strictI18n.setLocale('en');
assert(strictI18n.t('auth.description') === 'A unified workspace for product development, production and wholesale commerce.', 'English login copy is invalid.');
assert(strictI18n.translate('\u041b\u0438\u0441\u0442\u044b \u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0439') === 'Linesheets', 'English strict terminology is invalid.');
assert(strictI18n.translate('\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 cost snapshot') === 'Invalid cost snapshot', 'Mixed BOM terminology does not resolve to English.');
assert(strictI18n.diagnostics().strictPhraseCount >= 15, 'Strict bilingual phrase dictionary is unexpectedly incomplete.');
assert(strictI18n.diagnostics().legacyAliasCount >= 8, 'Legacy bilingual alias dictionary is unexpectedly incomplete.');

const executionHarness = createHarness('en-GB');
for (const source of sources.slice(0, -1)) {
  const modulePath = path.join(publicDir, 'modules', path.basename(source));
  const moduleSource = await readUtf8(modulePath);
  vm.runInContext(moduleSource, executionHarness.context, { filename: modulePath });
}

const formsSource = await readUtf8(path.join(publicDir, 'modules', 'forms-3.js'));
const viewsSource = await readUtf8(path.join(publicDir, 'modules', 'views-4.js'));
const routesSource = await readUtf8(path.join(root, 'src', 'http', 'routes.mjs'));
assert(/function orderCancellationForm\(order\)/.test(formsSource), 'Order cancellation button has no form handler.');
assert(/orderCancellationForm\(item\)/.test(viewsSource), 'Attached orders do not expose the cancellation form.');
assert(routesSource.includes("/^\\/v2\\/orders\\/([^/]+)\\/cancel$/"), 'Order cancellation API route is missing.');
assert(formsSource.includes('orderId: order.id') && formsSource.includes("validation.requiredText(values.reason"), 'Order cancellation payload validation is incomplete.');
assert(executionHarness.window.SynthaUiCapabilities, 'UI capability matrix was not loaded.');
assert(executionHarness.window.SynthaUiValidation, 'UI validation runtime was not loaded.');
assert(executionHarness.window.SynthaWorkspacePaging, 'Workspace pagination runtime was not loaded.');
assert(executionHarness.window.SynthaNotificationPaging, 'Notification pagination runtime was not loaded.');

console.log(`Localization and UI runtime contract OK (${sources.length} scripts, ${diagnostics.messageCount} keyed messages, ${diagnostics.phraseCount} compatibility phrases).`);

function assetPathname(asset) {
  try {
    return new URL(asset, 'http://syntha.local').pathname;
  } catch {
    assert(false, `Invalid UI asset URL: ${asset}`);
  }
}

async function readUtf8(file) {
  const buffer = await readFile(file);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    assert(false, `Invalid UTF-8 source detected: ${path.relative(root, file)}`);
  }
  assert(!text.includes('\uFFFD'), `Replacement character detected: ${path.relative(root, file)}`);
  assert(!/(?:\u00d0|\u00d1)[\u0080-\u00ff]/u.test(text), `Mojibake detected: ${path.relative(root, file)}`);
  return text;
}

function createHarness(browserLanguage) {
  const storage = new Map();
  const events = [];
  const document = {
    documentElement: { lang: '' },
    body: { dataset: {}, classList: { add() {}, remove() {} } },
    title: '',
    querySelector: () => ({ firstChild: null }),
    querySelectorAll: () => [],
    createElement: tag => ({ tagName: String(tag).toUpperCase() }),
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  const sessionStorage = {
    getItem: key => storage.get(`session:${key}`) ?? null,
    setItem: (key, value) => storage.set(`session:${key}`, String(value)),
    removeItem: key => storage.delete(`session:${key}`),
  };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  class AbortController {
    constructor() {
      const listeners = new Set();
      this.signal = {
        aborted: false,
        addEventListener(type, listener) { if (type === 'abort') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'abort') listeners.delete(listener); },
        dispatchAbort() { for (const listener of [...listeners]) listener(); },
      };
    }
    abort() {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.dispatchAbort();
    }
  }
  const listeners = new Map();
  const window = {
    document,
    navigator: { language: browserLanguage },
    localStorage,
    sessionStorage,
    CustomEvent,
    confirm: () => true,
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent(event) { events.push(event); listeners.get(event.type)?.(event); return true; },
  };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    navigator: window.navigator,
    localStorage,
    sessionStorage,
    CustomEvent,
    AbortController,
    NodeFilter: { SHOW_TEXT: 4 },
    TypeError,
    Error,
    Map,
    Set,
    Promise,
    Number,
    Math,
    Object,
    Array,
    console,
    Intl,
    Date,
    URL,
    URLSearchParams,
    structuredClone,
    queueMicrotask: () => {},
    encodeURIComponent,
    setTimeout: () => 0,
    clearTimeout: () => {},
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }),
  });
  return { context, window, document, storage, events };
}

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
