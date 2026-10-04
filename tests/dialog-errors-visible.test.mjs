import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Найдено настоящим кликом на живом приложении: «Запросы цен» → победитель → «Создать PO и
// разместить» → сервер отвечает 422 (нет подтверждённого техпака), а в диалоге ничего не видно:
// отказ показан тостом ПОД модальным окном (top layer), а под полями висит пустая розовая полоса —
// плашка с атрибутом `hidden`, которую адаптеры дизайн-системы
// (`body.omnidata-v14 [data-od14-component="alert"] { display: grid !important }`) делали видимой,
// потому что общее `[hidden] { display: none !important }` проигрывало им по специфичности.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const modulesDir = path.join(publicDir, 'modules');
const readModule = (name) => readFile(path.join(modulesDir, name), 'utf8');

// ---------------------------------------------------------------------------------------------
// 1. CSS: скрытая плашка скрыта при любой раскладке таблиц стилей.

// Специфичность селектора (a, b, c): :is/:not/:has берут наибольший аргумент, :where — ноль.
function specificity(selector) {
  let a = 0; let b = 0; let c = 0;
  let rest = selector;
  const take = (name) => {
    for (;;) {
      const index = rest.indexOf(`:${name}(`);
      if (index === -1) return;
      let depth = 0; let end = index + name.length + 1;
      for (; end < rest.length; end += 1) {
        if (rest[end] === '(') depth += 1;
        if (rest[end] === ')') { depth -= 1; if (depth === 0) break; }
      }
      const inner = rest.slice(index + name.length + 2, end);
      rest = rest.slice(0, index) + rest.slice(end + 1);
      if (name === 'where') continue;
      const best = inner.split(',').map(specificity).sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2])).pop() || [0, 0, 0];
      a += best[0]; b += best[1]; c += best[2];
    }
  };
  ['is', 'not', 'has', 'where'].forEach(take);
  rest = rest.replace(/"[^"]*"|'[^']*'/g, '""');
  a += (rest.match(/#[\w-]+/g) || []).length;
  b += (rest.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
  rest = rest.replace(/\[[^\]]*\]|#[\w-]+|\.[\w-]+|::?[\w-]+(\([^)]*\))?/g, ' ');
  c += (rest.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [a, b, c];
}
const compare = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

const cssFiles = (await readdir(publicDir)).filter((name) => name.endsWith('.css'));
const cssText = Object.fromEntries(await Promise.all(cssFiles.map(async (name) => [name, await readFile(path.join(publicDir, name), 'utf8')])));
function rulesOf(text) {
  const rules = [];
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ selector: match[1].trim(), body: match[2] });
  return rules;
}

test('скрытый элемент скрыт: ни одно правило display !important не сильнее общей защиты [hidden]', () => {
  const guard = rulesOf(cssText['styles.css']).find((rule) => /\[hidden\]/.test(rule.selector) && /display:\s*none\s*!important/.test(rule.body) && /#/.test(rule.selector));
  assert.ok(guard, 'в styles.css нет защитного правила [hidden] с повышенной специфичностью');
  const guardSpecificity = specificity(guard.selector);
  const offenders = [];
  for (const [file, text] of Object.entries(cssText)) {
    for (const rule of rulesOf(text)) {
      const display = /(?:^|;)\s*display:\s*([a-z-]+)\s*!important/.exec(rule.body);
      if (!display || display[1] === 'none') continue;
      for (const part of rule.selector.split(/,(?![^(]*\))/)) {
        if (/\[hidden\]|:not\(\[hidden\]\)/.test(part)) continue;
        if (compare(specificity(part.trim()), guardSpecificity) >= 0) offenders.push(`${file}: ${part.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'эти правила показали бы элемент с атрибутом hidden');
});

test('каждая плашка ошибки диалога с hidden известна общему показу ошибок', async () => {
  const known = new Set();
  const dom2 = await readModule('dom-2.js');
  const selector = /DIALOG_ERROR_SELECTOR\s*=\s*'([^']+)'/.exec(dom2)?.[1] || '';
  for (const part of selector.split(',')) known.add(part.trim());
  const found = [];
  for (const file of (await readdir(modulesDir)).filter((name) => name.endsWith('.js'))) {
    const source = await readModule(file);
    for (const match of source.matchAll(/className:\s*'([^']*(?:error|problem)[^']*)'[^}]*\bhidden:\s*true/g)) found.push({ file, className: match[1] });
  }
  assert.ok(found.length >= 7, `плашек с hidden должно находиться не меньше семи, найдено ${found.length}`);
  for (const { file, className } of found) {
    assert.ok(className.split(/\s+/).some((name) => known.has(`.${name}`)), `${file}: плашка «${className}» не учтена в DIALOG_ERROR_SELECTOR`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. Мини-DOM песочницы: настоящие dom-2.js, error-messages.js и sourcing.js.

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.attrs = new Map(); this.handlers = {};
    this.className = ''; this._text = ''; this.disabled = false; this.value = ''; this.modal = false;
  }

  get hidden() { return this.attrs.has('hidden'); }

  set hidden(value) { if (value) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }

  get textContent() { return this._text + this.children.map((child) => (child instanceof Node ? child.textContent : String(child))).join(''); }

  set textContent(value) { this._text = String(value); this.children = []; }

  get firstChild() { return this.children[0] || null; }

  get isConnected() { let item = this; while (item.parentNode) item = item.parentNode; return item.tagName === 'HTML'; }

  append(...items) { for (const item of items) { if (item instanceof Node) { item.parentNode = this; this.children.push(item); } else this._text += String(item); } }

  insertBefore(item, before) { item.parentNode = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); }

  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }

  setAttribute(name, value) { if (name === 'class') this.className = String(value); else this.attrs.set(name, String(value)); }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  hasAttribute(name) { return this.attrs.has(name); }

  removeAttribute(name) { this.attrs.delete(name); }

  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }

  scrollIntoView() {}

  focus() {}

  showModal() { this.attrs.set('open', ''); this.modal = true; }

  close() { this.attrs.delete('open'); this.modal = false; for (const handler of this.handlers.close || []) handler(); }

  matches(selector) {
    if (selector === ':modal') return this.modal;
    return selector.split(',').some((part) => {
      const piece = part.trim();
      const tag = /^[a-z][\w-]*/i.exec(piece)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      const classes = [...piece.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (!classes.every((name) => this.className.split(/\s+/).includes(name))) return false;
      return [...piece.matchAll(/\[([\w-]+)\]/g)].every((m) => this.attrs.has(m[1]));
    });
  }

  querySelectorAll(selector) {
    const out = [];
    const visit = (item) => { for (const child of item.children) { if (child instanceof Node) { if (child.matches(selector)) out.push(child); visit(child); } } };
    visit(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  // Событие всплывает: подписка на диалоге ловит отправку формы внутри него.
  dispatch(type, event = {}) {
    const fired = { preventDefault() {}, ...event };
    const chain = []; for (let item = this; item; item = item.parentNode) chain.push(item);
    return Promise.all(chain.flatMap((item) => (item.handlers[type] || []).map((handler) => handler(fired))));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function stand() {
  const documentElement = new Node('html');
  const body = new Node('body');
  documentElement.append(body);
  const document = {
    documentElement, body,
    createElement: (tag) => new Node(tag),
    createTextNode: (value) => String(value),
    querySelector: (selector) => documentElement.querySelector(selector),
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
  };
  const toastHost = new Node('div'); toastHost.setAttribute('id', 'toast'); body.append(toastHost);
  // querySelector('#toast') — единственный селектор по id, который нужен коду.
  const baseQuery = document.querySelector;
  document.querySelector = (selector) => (selector === '#toast' ? toastHost : baseQuery(selector));
  const window = { Object, Array, String, Number, Promise, URLSearchParams, Intl, Date, Map, Set, Math, JSON, Error, queueMicrotask, setTimeout, clearTimeout };
  window.window = window;
  window.Node = Node;
  window.document = document;
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  window.FormData = class { constructor(form) { this.entries = () => form.querySelectorAll('input, textarea, select').map((input) => [input.getAttribute('name'), input.value || input.textContent || '']); } };
  window.localText = (ru) => ru;
  window.I18N = { t: (key) => (key === 'common.requestError' ? 'Не удалось выполнить запрос.' : key), getLocale: () => 'ru', localeTag: () => 'ru-RU', formatMoney: (v) => String(v), translate: (v) => v };
  window.state = { view: 'rfqs', user: { actorId: 'u-1' }, workspace: { memberships: [], organisations: [], catalogSkus: [] } };
  window.clear = (node) => { node.children = []; node._text = ''; };
  window.el = (tag, props = {}) => { const item = new Node(tag); if (props.className) item.className = props.className; item._text = props.rawText ?? props.text ?? ''; return item; };
  window.notice = (message, kind = '') => { const item = new Node('div'); item.className = `notice ${kind}`.trim(); item._text = message; return item; };
  window.renderApp = () => {};
  window.renderView = () => null;
  window.reload = async () => {};
  window.api = async () => ({ items: [], nextCursor: null });
  const inert = () => new Proxy(function inertGlobal() {}, { get: (_t, key) => (key === 'then' ? undefined : inert()), apply: () => new Node('div'), construct: () => new Node('div') });
  const context = vm.createContext(window);
  for (const name of ['error-messages.js', 'dom-2.js', 'ui-capabilities.js', 'sourcing-core.js', 'sourcing.js']) {
    const source = await readModule(name);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { vm.runInContext(source, context, { filename: name }); break; } catch (error) {
        const missing = /^(\w+) is not defined/.exec(error.message)?.[1];
        if (!missing || attempt === 79) throw error;
        window[missing] = inert();
      }
    }
  }
  return { window, document, toastHost };
}

const RFQ = {
  rfqCode: 'RFQ-PENDING-QUOTE-001', brandId: 'org-1', version: 3, targetQuantity: 240, deliveryDueAt: '2027-01-02T00:00:00.000Z',
  status: 'awarded', quotes: [], supplierCodes: [],
};

// Так api.js превращает отказ сервера: текст — по словарю, код остаётся в `code`.
function refusal(window, code, serverMessage) {
  return Object.assign(new Error(window.SynthaErrorMessages.describe(code, serverMessage)), { code, status: 422 });
}

async function submitOpenDialog(document) {
  const dialog = document.querySelectorAll('dialog[open]').pop();
  assert.ok(dialog, 'диалог должен быть открыт');
  await dialog.querySelector('form').dispatch('submit');
  await settle();
  return dialog;
}

// ---------------------------------------------------------------------------------------------
// 3. Поведение.

test('«Создать PO и разместить» с отказом по техпаку: русский текст и подсказка — в плашке самого диалога', async () => {
  const { window, document, toastHost } = await stand();
  window.mutate = async () => { throw refusal(window, 'TECH_PACK_ACKNOWLEDGEMENT_REQUIRED', 'Production allocation requires a supplier-acknowledged Tech Pack'); };
  window.SynthaSourcingWorkspace.openAllocationDialog(RFQ);
  const dialog = document.querySelector('dialog[open]');
  const banner = dialog.querySelector('.sourcing-form-error');
  assert.equal(banner.hidden, true, 'до отправки плашка скрыта');

  await submitOpenDialog(document);

  assert.equal(document.querySelectorAll('dialog[open]').length, 1, 'диалог остаётся открытым, чтобы человек мог исправить причину');
  assert.equal(banner.hidden, false, 'плашка показана');
  assert.match(banner.textContent, /Размещать производство можно только по техпаку, который подтвердила фабрика/);
  assert.match(banner.textContent, /Технические пакеты/, 'сказано, что делать и где');
  assert.equal(toastHost.textContent, '', 'отказ не должен лежать тостом под модальным окном');
});

test('отказ мутации в диалоге выбора победителя тоже виден в самом диалоге', async () => {
  const { window, document, toastHost } = await stand();
  window.mutate = async () => { throw refusal(window, 'RFQ_CONCURRENCY_CONFLICT', 'The request was changed elsewhere'); };
  const quotes = [{ supplierCode: 'S1', supplierName: 'Фабрика', totalCostMinor: 100, leadTimeDays: 10 }];
  window.SynthaSourcingWorkspace.openAwardDialog({ ...RFQ, status: 'quoted', quotes, bomCurrency: 'EUR' });
  const dialog = await submitOpenDialog(document);
  const banner = dialog.querySelector('.sourcing-form-error');
  assert.equal(banner.hidden, false);
  assert.ok(banner.textContent.length > 10, 'в плашке есть текст отказа');
  assert.equal(toastHost.textContent, '');
});

test('reportError: в ближайшем открытом модальном диалоге, иначе тост', async () => {
  const { window, document, toastHost } = await stand();
  assert.equal(window.reportError('Нет модального окна'), 'toast');
  assert.match(toastHost.textContent, /Нет модального окна/);

  // Диалог без собственной плашки (как диалоги образцов и техпаков): плашка создаётся на месте, перед подвалом.
  const outer = document.createElement('dialog'); const form = document.createElement('form'); const footer = document.createElement('footer');
  form.append(footer); outer.append(form); document.body.append(outer); outer.showModal();
  const inner = document.createElement('dialog'); const innerForm = document.createElement('form'); const innerFooter = document.createElement('footer');
  innerForm.append(innerFooter); inner.append(innerForm); document.body.append(inner); inner.showModal();

  assert.equal(window.reportError({ message: 'CAPABILITY_DENIED' }), 'dialog');
  const banner = inner.querySelector('[data-dialog-error]');
  assert.ok(banner, 'плашка создана в верхнем (последнем открытом) диалоге');
  assert.equal(outer.querySelector('[data-dialog-error]'), null, 'нижний диалог не затронут');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /нет прав/i, 'код превращён в русскую фразу');
  assert.equal(innerForm.children.indexOf(banner), innerForm.children.indexOf(innerFooter) - 1, 'плашка стоит перед кнопками');

  // Повторная отправка прячет плашку, чтобы старая ошибка не висела рядом с новым результатом.
  await innerForm.dispatch('submit');
  assert.equal(banner.hidden, true);

  // Обычный toast(..., 'error') под модальным окном ведёт себя так же.
  window.toast('Что-то пошло не так', 'error');
  assert.equal(inner.querySelector('[data-dialog-error]').hidden, false);
  assert.match(inner.querySelector('[data-dialog-error]').textContent, /Что-то пошло не так/);

  // А не-ошибочный тост под модальным окном рисуется внутри него, иначе его не видно.
  window.toast('Сохранено', 'success');
  assert.match(inner.querySelector('[data-toast-host]').textContent, /Сохранено/);
});

test('диалоги образцов и техпаков не теряют исключение отправки молча', async () => {
  for (const name of ['samples.js', 'tech-packs.js']) {
    const source = await readModule(name);
    const handler = /form\.addEventListener\('submit', async \(event\) => \{[^\n]*\}\);/.exec(source)?.[0] || '';
    assert.match(handler, /try \{/, `${name}: обработчик отправки диалога без try/catch`);
    assert.match(handler, /reportError\(submitError\)/, `${name}: исключение отправки должно попадать в диалог`);
  }
});
