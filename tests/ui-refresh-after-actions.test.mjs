import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Найдено настоящим кликом на живом приложении (headless Chrome): интерфейс не обновился и не
// ответил после успешного действия.
//   N1: «Оптовые заказы» → заказ → «Изменения» → «Принять»: на сервере принято, а диалог остаётся с
//       «на рассмотрении» и активными «Принять»/«Отклонить», тоста нет, сумма в списке — старая.
//   N11: «Отправить RFQ» → «Отправить»: тост «Изменения сохранены» рисовался внутри диалога, который
//       тут же закрывался, и человек не видел ничего.
// Стенд — мини-DOM с настоящими dom-2.js (тост), open-form.js и модулями экранов.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = path.join(root, 'public', 'modules');
const readModule = (name) => readFile(path.join(modulesDir, name), 'utf8');

class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.attrs = new Map(); this.handlers = {};
    this.className = ''; this._text = ''; this.disabled = false; this.value = ''; this.modal = false; this.title = '';
  }

  get hidden() { return this.attrs.has('hidden'); }

  set hidden(value) { if (value) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }

  get open() { return this.attrs.has('open'); }

  get textContent() { return this._text + this.children.map((child) => (child instanceof Node ? child.textContent : String(child))).join(''); }

  set textContent(value) { this._text = String(value); this.children = []; }

  get isConnected() { let item = this; while (item.parentNode) item = item.parentNode; return item.tagName === 'HTML'; }

  append(...items) { for (const item of items) { if (item instanceof Node) { item.parentNode = this; this.children.push(item); } else this._text += String(item); } }

  insertBefore(item, before) { item.parentNode = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); }

  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }

  setAttribute(name, value) { if (name === 'class') this.className = String(value); else this.attrs.set(name, String(value)); }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  hasAttribute(name) { return this.attrs.has(name); }

  removeAttribute(name) { this.attrs.delete(name); }

  addEventListener(type, handler, options) { (this.handlers[type] ||= []).push({ handler, once: Boolean(options?.once) }); }

  removeEventListener() {}

  scrollIntoView() {}

  focus() {}

  showModal() { this.attrs.set('open', ''); this.modal = true; }

  close() {
    this.attrs.delete('open'); this.modal = false;
    const list = this.handlers.close || [];
    this.handlers.close = list.filter((entry) => !entry.once);
    for (const entry of list) entry.handler();
  }

  matches(selector) {
    if (selector === ':modal') return this.modal;
    return selector.split(',').some((part) => {
      const piece = part.trim();
      const id = /#([\w-]+)/.exec(piece)?.[1];
      if (id && this.getAttribute('id') !== id) return false;
      const tag = /^[a-z][\w-]*/i.exec(piece)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      const classes = [...piece.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (!classes.every((name) => this.className.split(/\s+/).includes(name))) return false;
      return [...piece.matchAll(/\[([\w-]+)\]/g)].every((m) => this.attrs.has(m[1]));
    });
  }

  walk() { const out = []; const visit = (item) => { for (const child of item.children) { if (child instanceof Node) { out.push(child); visit(child); } } }; visit(this); return out; }

  querySelectorAll(selector) { return this.walk().filter((item) => item.matches(selector)); }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  async click() { for (const entry of this.handlers.click || []) await entry.handler({ preventDefault() {} }); }

  dispatch(type, event = {}) {
    const fired = { preventDefault() {}, ...event };
    const chain = []; for (let item = this; item; item = item.parentNode) chain.push(item);
    return Promise.all(chain.flatMap((item) => (item.handlers[type] || []).map((entry) => entry.handler(fired))));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
const inert = () => new Proxy(function inertGlobal() {}, { get: (_t, key) => (key === 'then' ? undefined : inert()), apply: () => new Node('div'), construct: () => new Node('div') });

async function stand(modules, extra = {}) {
  const documentElement = new Node('html');
  const body = new Node('body');
  documentElement.append(body);
  const toastHost = new Node('div'); toastHost.setAttribute('id', 'toast'); body.append(toastHost);
  const formDialog = new Node('dialog'); formDialog.setAttribute('id', 'form-dialog'); body.append(formDialog);
  const document = {
    documentElement, body,
    createElement: (tag) => new Node(tag),
    createTextNode: (value) => String(value),
    querySelector: (selector) => documentElement.querySelector(selector),
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
  };
  const window = { Object, Array, String, Number, Promise, URLSearchParams, Intl, Date, Map, Set, Math, JSON, Error, queueMicrotask, setTimeout, clearTimeout };
  window.window = window;
  window.Node = Node;
  window.FormData = class { constructor(form) { this.entries = () => form.querySelectorAll('input, textarea, select').map((input) => [input.getAttribute('name'), input.value || input.textContent || '']); } };
  window.document = document;
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  window.localText = (ru) => ru;
  window.I18N = {
    t: (key) => (key === 'common.requestError' ? 'Не удалось выполнить запрос.' : key), getLocale: () => 'ru', localeTag: () => 'ru-RU',
    formatMoney: (value, currency) => `${value} ${currency}`, translate: (value) => value, formatDate: (value) => String(value),
  };
  window.state = { view: 'orders', user: { actorId: 'u-1' }, workspace: { memberships: [], organisations: [], orders: [] } };
  window.clear = (node) => { node.children = []; node._text = ''; };
  window.el = (tag, props = {}) => {
    const item = new Node(tag);
    if (props.className) item.className = props.className;
    item._text = props.rawText ?? props.text ?? '';
    if (props.title !== undefined) item.title = props.title;
    if (props.name !== undefined) item.setAttribute('name', props.name);
    return item;
  };
  window.notice = (message, kind = '') => { const item = new Node('div'); item.className = `notice ${kind}`.trim(); item._text = message; return item; };
  window.factValue = (value) => { const item = new Node('output'); item._text = String(value ?? '—'); return item; };
  window.reload = async () => {};
  window.renderApp = () => {};
  window.confirmAction = async () => true;
  window.setButtonBusy = () => {};
  Object.assign(window, extra);
  const context = vm.createContext(window);
  for (const name of modules) {
    const source = await readModule(name);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { vm.runInContext(source, context, { filename: name }); break; } catch (error) {
        const missing = /^(\w+) is not defined/.exec(error.message)?.[1];
        if (!missing || attempt === 79) throw error;
        window[missing] = inert();
      }
    }
  }
  return { window, document, toastHost, formDialog };
}

// ---------------------------------------------------------------------------------------------
// 1. Общие части: склонение, тост, переживающий закрытие диалога.

test('plural: русские числительные — одна, две, пять; английский — две формы; рантайм v7 отдаёт plural наружу', async () => {
  const win = { Intl, Date, Object, Array, String, Number, Math, JSON, Map, Set, Error, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'ru-RU' } };
  win.window = win;
  win.document = { documentElement: { lang: '' }, querySelectorAll: () => [], addEventListener() {}, title: '' };
  const context = vm.createContext(win);
  vm.runInContext(await readModule('i18n-runtime.js'), context, { filename: 'i18n-runtime.js' });
  const ru = ['политика', 'политики', 'политик'];
  const en = ['policy', 'policies'];
  const say = (count) => `${count} ${win.SynthaI18n.plural(count, ru, en)}`;
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(say), [
    '0 политик', '1 политика', '2 политики', '4 политики', '5 политик', '11 политик', '12 политик', '14 политик', '21 политика', '22 политики', '25 политик', '101 политика', '111 политик',
  ]);
  win.SynthaI18n.setLocale('en');
  assert.deepEqual([0, 1, 2].map(say), ['0 policies', '1 policy', '2 policies']);
  // Поверхность i18n-v7 перечисляется поимённо: добавленное в базу и не названное там исчезает молча.
  const v7 = await readModule('i18n-v7.js');
  assert.match(v7, /plural: base\.plural/);
});

test('тост «Готово: …», нарисованный внутри модального диалога, не пропадает вместе с ним, а появляется на обычном месте', async () => {
  const { window, document, toastHost } = await stand(['dom-2.js']);
  const dialog = document.createElement('dialog'); document.body.append(dialog); dialog.showModal();
  window.toastDone('запрос отправлен.', 'the request is issued.');
  assert.match(dialog.querySelector('[data-toast-host]').textContent, /^Готово: запрос отправлен\.$/, 'пока диалог открыт, тост лежит внутри него (под модальным окном его не видно)');
  assert.equal(toastHost.textContent, '');
  dialog.close();
  assert.match(toastHost.textContent, /Готово: запрос отправлен\./, 'после закрытия диалога тост показан там, где его видно');
});

test('openForm: afterSave вызывается после перечитывания и перерисовки, а тост «Готово» — после него', async () => {
  const log = [];
  const { window, formDialog } = await stand(['dom-2.js', 'open-form.js'], {});
  window.reload = async () => { log.push('reload'); };
  window.renderApp = () => { log.push('renderApp'); };
  window.buildField = (field) => { const control = new Node('input'); control.setAttribute('name', field.name); control.value = field.value ?? ''; const label = new Node('label'); label.append(control); return { label, control }; };
  window.toast = (message, kind) => { log.push(`toast:${message}:${kind}`); };
  vm.runInContext('toastDone = (ru) => toast("Готово: " + ru, "success")', vm.createContext(window));
  window.openForm('Форма', [{ name: 'a', label: 'A', kind: 'text', value: 'x' }], async () => { log.push('submit'); }, {
    afterSave: async () => { log.push('afterSave'); },
    successMessage: ['правка принята.', 'accepted.'],
  });
  await formDialog.querySelector('form').dispatch('submit');
  await settle();
  assert.deepEqual(log, ['submit', 'reload', 'renderApp', 'afterSave', 'toast:Готово: правка принята.:success']);
  log.length = 0;
  window.openForm('Форма', [{ name: 'a', label: 'A', kind: 'text', value: 'x' }], async () => { log.push('submit'); });
  await formDialog.querySelector('form').dispatch('submit');
  await settle();
  assert.deepEqual(log, ['submit', 'reload', 'renderApp', 'toast:common.changesSaved:success'], 'без параметров поведение прежнее');
});

// ---------------------------------------------------------------------------------------------
// 2. N1: диалог правок заказа.

function amendmentBackend() {
  const amendment = {
    id: 'AM-1', lineNo: 1, currentQuantity: 48, proposedQuantity: 43, deltaAmount: -640, currency: 'EUR',
    proposedOrganisationId: 'BRAND-1', reason: 'Фабрика не успевает', status: 'proposed', responseReason: null,
  };
  const order = { id: 'ORD-1', brandId: 'BRAND-1', shopId: 'SHOP-1', status: 'attached', totalAmount: 6144, lines: [{ sku: 'SKU-L', quantity: 48 }] };
  const calls = [];
  return {
    amendment, order, calls,
    api: async (url) => { calls.push(`GET ${url}`); return { amendments: [{ ...amendment }] }; },
    mutate: async (url, body, method = 'POST') => {
      calls.push(`${method} ${url} ${JSON.stringify(body)}`);
      if (/respond$/.test(url)) { amendment.status = body.decision === 'accepted' ? 'accepted' : 'rejected'; if (body.decision === 'accepted') order.lines[0].quantity = 43; order.totalAmount = 5504; }
      return { ok: true };
    },
  };
}

async function amendmentsStand(backend) {
  const buttons = [];
  const s = await stand(['dom-2.js', 'order-fulfillment-view.js'], {
    api: backend.api, mutate: backend.mutate,
    SynthaUiCapabilities: { hasForOrganisation: () => true, CAPABILITIES: { ORDER_WRITE: 'order.write' } },
    openForm: () => {},
  });
  // Настоящий actionButton делает то же, что здесь: нажатие, затем обновление экрана, если диалог не открыт.
  s.window.actionButton = (label, fn, variant = '') => {
    const button = new Node('button'); button._text = label; button.className = variant;
    button.addEventListener('click', async () => { await fn(); });
    buttons.push(button);
    return button;
  };
  s.window.state.workspace.memberships = [{ organisationId: 'SHOP-1' }];
  s.window.reload = async () => { backend.calls.push('reload'); s.window.state.workspace.orders = [JSON.parse(JSON.stringify(backend.order))]; };
  s.window.renderApp = () => { backend.calls.push('renderApp'); };
  s.window.textDef = () => ({}); s.window.numberDef = () => ({}); s.window.selectDef = () => ({});
  return s;
}

const buttonsOf = (dialog, label) => dialog.querySelectorAll('button').filter((node) => node.textContent === label);

test('N1: «Принять» правку — диалог перечитан (статус «принято», кнопок ответа нет), тост «Готово», список и сумма перечитаны', async () => {
  const backend = amendmentBackend();
  const { window, formDialog } = await amendmentsStand(backend);
  await window.orderAmendmentsDialog(backend.order);
  assert.equal(formDialog.open, true);
  assert.match(formDialog.textContent, /на рассмотрении/);
  const accept = buttonsOf(formDialog, 'Принять');
  assert.equal(accept.length, 1);
  assert.equal(buttonsOf(formDialog, 'Отклонить').length, 1);

  await accept[0].click();
  await settle();

  // Список заказов и сумма: рабочее пространство перечитано и приложение перерисовано.
  assert.ok(backend.calls.includes('reload'), 'рабочее пространство перечитано');
  assert.ok(backend.calls.includes('renderApp'), 'приложение перерисовано');
  assert.ok(backend.calls.indexOf('reload') < backend.calls.indexOf('renderApp'));
  // Диалог перечитан с сервера.
  assert.equal(backend.calls.filter((call) => /^GET .*\/amendments$/.test(call)).length, 2, 'правки прочитаны заново');
  assert.equal(formDialog.open, true, 'диалог остаётся открытым');
  assert.match(formDialog.textContent, /принято/);
  assert.doesNotMatch(formDialog.textContent, /на рассмотрении/);
  assert.equal(buttonsOf(formDialog, 'Принять').length, 0, 'второй раз «Принять» нажать нельзя');
  assert.equal(buttonsOf(formDialog, 'Отклонить').length, 0);
  // Тост об успехе лежит в самом диалоге.
  assert.match(formDialog.querySelector('[data-toast-host]').textContent, /Готово: правка принята/);
  // Принять отправлен ровно один раз.
  assert.equal(backend.calls.filter((call) => /respond/.test(call)).length, 1);
});

test('N1: заказ в перечитанном диалоге — свежий (количество строки уже новое)', async () => {
  const backend = amendmentBackend();
  const { window, formDialog } = await amendmentsStand(backend);
  await window.orderAmendmentsDialog(backend.order);
  await buttonsOf(formDialog, 'Принять')[0].click();
  await settle();
  const order = window.state.workspace.orders[0];
  assert.equal(order.lines[0].quantity, 43);
  assert.equal(order.totalAmount, 5504);
});

test('N1: «Отклонить» и «Предложить изменение» открывают формы, которые после сохранения возвращают диалог правок и говорят «Готово»', async () => {
  const backend = amendmentBackend();
  const forms = [];
  const { window, formDialog } = await amendmentsStand(backend);
  window.openForm = (title, fields, submit, options) => { forms.push({ title, submit, options }); };
  window.textDef = (name) => ({ name }); window.numberDef = (name) => ({ name }); window.selectDef = (name) => ({ name });
  await window.orderAmendmentsDialog(backend.order);
  await buttonsOf(formDialog, 'Отклонить')[0].click();
  await buttonsOf(formDialog, 'Предложить изменение')[0].click();
  assert.equal(forms.length, 2);
  for (const form of forms) {
    assert.equal(typeof form.options?.afterSave, 'function', `${form.title}: диалог правок возвращается после сохранения`);
    assert.ok(Array.isArray(form.options.successMessage), `${form.title}: тост «Готово»`);
  }
  backend.calls.length = 0;
  window.state.workspace.orders = [backend.order];
  await forms[0].options.afterSave();
  assert.equal(backend.calls.filter((call) => /^GET .*\/amendments$/.test(call)).length, 1, 'afterSave перечитывает диалог');
  assert.equal(formDialog.open, true);
});

// ---------------------------------------------------------------------------------------------
// 3. Шаги «Отгрузка и приёмка» возвращают рабочее место после сохранения.

test('«Отгрузка и приёмка»: формы шагов (план, отгрузка, приёмка, претензия, решение, возврат) возвращают рабочее место и говорят «Готово»', async () => {
  const source = await readModule('order-fulfillment-actions.js');
  const opened = [...source.matchAll(/^\s+openForm\(/gm)].length;
  const withStepDone = [...source.matchAll(/, stepDone\(order, '/g)].length;
  assert.equal(opened, 6, 'шесть форм шагов цепочки');
  assert.equal(withStepDone, opened, 'у каждой формы есть возврат в рабочее место');

  const calls = [];
  const forms = [];
  const { window } = await stand(['order-fulfillment-actions.js'], {
    openForm: (title, fields, submit, options) => { forms.push({ title, options }); },
    textDef: (name) => ({ name }), optionalTextDef: (name) => ({ name }), numberDef: (name) => ({ name }), selectDef: (name) => ({ name }), dateTimeDef: (name) => ({ name }),
    mutate: async () => ({}), api: async (url) => { calls.push(`GET ${url}`); return { orderId: 'ORD-1', plans: [] }; },
    SynthaUiCapabilities: { hasForOrganisation: () => true, CAPABILITIES: {} },
  });
  const order = { id: 'ORD-1', currency: 'EUR', lines: [{ sku: 'S', quantity: 4 }] };
  const shipment = { id: 'SH-1', shipmentNumber: 'N1', lines: [{ lineId: 'L1', sku: 'S', quantity: 4 }], discrepancy: { id: 'D1', lines: [] }, claim: { id: 'C1', claimReference: 'CLM' }, receipts: [] };
  const plan = { id: 'P1', lines: [{ lineId: 'L1', sku: 'S', quantity: 4 }], shipments: [], plannedShipAt: '2026-10-10T00:00:00.000Z' };
  const forms3 = window.SynthaFulfillmentForms;
  forms3.shipmentForm(order, plan);
  forms3.receiptForm(order, shipment);
  forms3.claimForm(order, shipment);
  forms3.resolutionForm(order, shipment);
  assert.equal(forms.length, 4);
  for (const form of forms) {
    assert.equal(typeof form.options?.afterSave, 'function', `${form.title}: afterSave`);
    assert.match(form.options.successMessage[0], /\.$/);
  }
  window.state.workspace.orders = [order];
  window.orderFulfillmentWorkspaceDialog = async (fresh) => { calls.push(`reopen ${fresh.id}`); };
  await forms[0].options.afterSave();
  assert.deepEqual(calls, ['reopen ORD-1']);
});

// ---------------------------------------------------------------------------------------------
// 4. N11: «Отправить RFQ» — тост виден после закрытия диалога.

test('N11: «Отправить RFQ» → «Отправить»: после закрытия диалога на экране тост «Готово: запрос отправлен»', async () => {
  const rfq = { rfqCode: 'RFQ-1', brandId: 'org-1', version: 2, status: 'draft', supplierCodes: [], quotes: [], targetQuantity: 10, deliveryDueAt: '2027-01-01T00:00:00.000Z' };
  const { window, document, toastHost } = await stand(['error-messages.js', 'dom-2.js', 'ui-capabilities.js', 'sourcing-core.js', 'sourcing.js'], {
    mutate: async () => ({ ...rfq, status: 'issued', version: 3 }),
    api: async () => ({ items: [], nextCursor: null }),
    renderView: () => null,
  });
  window.SynthaSourcingWorkspace.issueRfq(rfq);
  const dialog = document.querySelectorAll('dialog[open]').pop();
  assert.ok(dialog, 'диалог отправки открыт');
  await dialog.querySelector('form').dispatch('submit');
  await settle();
  assert.equal(document.querySelectorAll('dialog[open]').length, 0, 'диалог закрыт после успеха');
  assert.match(toastHost.textContent, /Готово: запрос отправлен\./, 'тост виден на обычном месте');
});

test('N11: каждая команда закупок называет, что сделала: «Готово: …» вместо общего «Изменения сохранены»', async () => {
  const source = await readModule('sourcing.js');
  assert.doesNotMatch(source, /toast\(text\('Изменения сохранены\.', 'Changes saved\.'\)\)/);
  const table = source.slice(source.indexOf('const DONE_BY_SUFFIX'), source.indexOf('async function runMutation'));
  for (const suffix of ['issue', 'quotes', 'award', 'allocate', 'cancel', 'qualify', 'suspend', 'archive', 'confirm', 'counter-offer', 'portal-access']) {
    assert.ok(table.includes(suffix), `для /${suffix} есть своя подпись`);
  }
});

test('успешные действия в диалогах всех экранов говорят «Готово: …» через единый toastDone', async () => {
  for (const [file, needle] of [
    ['currency-rates.js', "toastDone('курс записан.'"],
    ['season-palette.js', "toastDone('цвет добавлен в палитру.'"],
    ['showroom-looks.js', "toastDone('образ добавлен.'"],
    ['supplier-portal.js', "toastDone('встречное предложение принято.'"],
    ['final-quality.js', "toastDone('финальный контроль обновлён.'"],
    ['production-executions.js', "toastDone('производственный календарь обновлён.'"],
    ['order-fulfillment-view.js', 'toastDone(message[0], message[1])'],
    ['order-economics-workspace.js', 'toastDone(done[0], done[1])'],
  ]) assert.ok((await readModule(file)).includes(needle), `${file}: ${needle}`);
});

// ---------------------------------------------------------------------------------------------
// 5. Подсказка к отказу финального контроля.

test('финальный контроль: отказ «Производство ещё не готово» говорит, что сделать', async () => {
  const { window } = await stand(['error-messages.js']);
  const text = window.SynthaErrorMessages.describe('QUALITY_EXECUTION_NOT_READY', 'Final Quality requires a ready-for-QC production execution');
  assert.match(text, /Производство ещё не готово к финальной инспекции/);
  assert.match(text, /завершите все этапы производства и выдайте материалы/);
});
