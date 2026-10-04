import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { CAPABILITIES as SERVER_CAPABILITIES, ROLE_CAPABILITIES } from '../src/modules/access-control/public.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, 'public', 'modules', name), 'utf8');
const installed = await read('omnidata-v7-installed.js');
const [polish, awaiting, capabilities, v7, dom1, commercial, styles, linesheets, i18nRuntime] = await Promise.all([
  'omnidata-polish.js', 'awaiting-action.js', 'ui-capabilities.js', 'omnidata-v7.js', 'dom-1.js',
  'commercial-publication-actions.js', 'styles.js', 'linesheets.js', 'i18n-runtime.js',
].map(read));

// Приёмочный прогон нашёл на платформе девять дефектов интерфейса. Каждый проверяется поведением
// кода в песочнице (как в commercial-publication-reaches-the-screen.test.mjs), а не наличием строки в
// исходнике: исходник можно оставить, а дефект сохранить.

// ---------------------------------------------------------------------------------------------
// Узлы песочницы.

function node(tag, props = {}) {
  const item = {
    tag, props, children: [], dataset: {}, handlers: {}, className: props.className || '',
    textContent: props.rawText ?? props.text ?? '',
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelectorAll() { return []; },
  };
  return item;
}

function walk(root, visit) {
  visit(root);
  (root.children || []).forEach((child) => { if (child && typeof child === 'object') walk(child, visit); });
}

function workspaceOf(role, type = 'brand') {
  return {
    memberships: [{ id: `m-${role}`, organisationId: 'org-1', userId: 'u-1', status: 'active', role }],
    organisations: [{ id: 'org-1', type }],
  };
}

function uiCapabilities() {
  const window = {};
  vm.runInNewContext(capabilities, { window });
  return window.SynthaUiCapabilities;
}

// ---------------------------------------------------------------------------------------------
// 1. Белый экран при ошибке чтения инбокса.

function polishedPage() {
  const window = { Object, Array, String, Promise, queueMicrotask };
  window.window = window;
  window.el = node;
  // Исходная обёртка из omnidata-workspace.js: сама пережила бы null, а вот полировка поверх неё — нет.
  window.odPage = (title, header, content) => {
    const page = node('div', { className: 'od-view' });
    if (header && header.fragment) page.append(header.fragment);
    if (content) page.append(content);
    return page;
  };
  vm.runInContext(polish, vm.createContext(window));
  return window.odPage;
}

test('a page without a header is still a page: the error screen does not crash the application', () => {
  const odPage = polishedPage();
  const notice = node('div', { className: 'notice error' });
  let page;
  assert.doesNotThrow(() => { page = odPage('Ждёт вас', null, notice); });
  assert.deepEqual(page.children, [notice]);
  assert.doesNotThrow(() => odPage('Ждёт вас', undefined, notice));
  assert.doesNotThrow(() => odPage('Ждёт вас', null, null));
});

test('a page with a header keeps its header before the content', () => {
  const odPage = polishedPage();
  const fragment = node('fragment');
  const content = node('section');
  assert.deepEqual(odPage('t', { fragment }, content).children, [fragment, content]);
});

test('no screen under public/modules passes a header the page cannot survive', async () => {
  // Любой вызов `odPage(…, null, …)` обязан пережить полировка: проверено выше. Здесь — что их по-прежнему
  // только те, о которых известно, чтобы новый такой вызов не появился незамеченным.
  const names = ['awaiting-action.js', 'libraries.js', 'supplier-portal.js'];
  const files = await Promise.all(names.map(read));
  const calls = files.flatMap((source, index) => [...source.matchAll(/odPage\([^\n]*?,\s*null\s*,/g)].map(() => names[index]));
  assert.deepEqual([...new Set(calls)].sort(), names.slice().sort());
});

// ---------------------------------------------------------------------------------------------
// Стенд экрана «Ждёт вас».

function awaitingHarness({ reads = {}, failure = null, realPage = false } = {}) {
  const timers = [];
  const window = { Object, Array, String, Number, Promise, URLSearchParams, Intl, Date, Map, Set, queueMicrotask };
  window.window = window;
  window.setInterval = () => { timers.push(1); return timers.length; };
  window.clearInterval = () => {};
  window.document = { hidden: false, querySelector: () => null, querySelectorAll: () => [] };
  window.localText = (ru) => ru;
  window.I18N = { t: (key) => key, getLocale: () => 'ru', localeTag: () => 'ru-RU', formatMoney: (v) => String(v) };
  window.state = { view: 'awaiting-action', user: { actorId: 'u-1' } };
  window.OD_UI = { tabs: {}, selected: {}, filters: {} };
  window.el = node;
  window.icon = () => node('i');
  window.empty = (message) => node('div', { className: 'empty', rawText: message });
  window.notice = (message, kind) => node('div', { className: `notice ${kind || ''}`, rawText: message });
  window.odInspector = (config) => ({ inspector: config });
  window.odMiniTable = () => node('table');
  window.odHeader = () => ({ fragment: node('fragment'), active: 'all' });
  window.odRegistry = (config) => ({ registry: config });
  window.odPage = (title, header, content) => ({ title, header, content });
  if (realPage) {
    // Исходная обёртка из omnidata-workspace.js; поверх неё в браузере ложится omnidata-polish.js.
    window.odPage = (title, header, content) => {
      const page = node('div', { className: 'od-view' });
      if (header && header.fragment) page.append(header.fragment);
      if (content) page.append(content);
      return page;
    };
  }
  window.objectReference = (value) => `ORD-${String(value).replace(/^[a-z-]+_/, '').slice(0, 8).toUpperCase()}`;
  const calls = { rendered: 0, reads: [] };
  window.renderApp = () => { calls.rendered += 1; };
  window.renderView = () => 'previous-view';
  window.viewTitle = () => 'Обзор';
  window.viewSectionName = () => 'Рабочий стол';
  window.api = async (path) => {
    calls.reads.push(path);
    if (failure) throw failure;
    return reads[path.split('?')[0]] ?? { items: [], total: 0, overdue: 0, counts: {} };
  };
  const context = vm.createContext(window);
  vm.runInContext(awaiting, context);
  if (realPage) vm.runInContext(polish, context);
  return { window, calls };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a failed inbox read leaves a notice on the start screen instead of a blank application', async () => {
  // Тот же путь, что в браузере: исходная обёртка, затем полировка поверх неё.
  const { window } = awaitingHarness({ failure: new Error('Сервер недоступен'), realPage: true });
  window.SynthaAwaitingAction.refresh();
  await settle();
  assert.equal(window.SynthaAwaitingAction.error, 'Сервер недоступен');
  const page = window.renderView();
  assert.equal(page.children.length, 1);
  assert.match(page.children[0].props.className, /notice/);
  assert.equal(page.children[0].textContent, 'Сервер недоступен');
});

test('the awaiting screen carries its own title, not the fallback of an unknown view', () => {
  const { window } = awaitingHarness();
  assert.equal(window.viewTitle('awaiting-action'), 'Ждёт вас');
  assert.equal(window.viewTitle('anything-else'), 'Обзор');
  assert.notEqual(window.viewSectionName('awaiting-action'), 'Рабочий стол');
  assert.equal(window.viewSectionName('orders'), 'Рабочий стол');
});

test('"Open" selects the entity the item names and shows an order by its number, not its raw id', async () => {
  const order = {
    type: 'order-accept-terms', entityKind: 'order', entityId: 'order_c974ee97-e0c7-4f15-904a-f3d03233b562',
    label: 'order_c974ee97-e0c7-4f15-904a-f3d03233b562', organisationId: 'org-1', titleRu: 'Заказ ждёт', titleEn: 'Order waits',
    route: { view: 'orders', entityId: 'order_c974ee97-e0c7-4f15-904a-f3d03233b562' }, ageSeconds: 10, waitingSince: null, detail: {}, group: 'orders',
  };
  const named = { ...order, type: 'selection-approval', entityKind: 'selection', entityId: 'selection_1', label: 'Весна — Nordhaus', route: { view: 'selections', entityId: 'selection_1' } };
  const { window } = awaitingHarness({ reads: { '/v2/inbox/awaiting-action': { items: [order, named], total: 2, overdue: 0, counts: {} } } });
  window.SynthaAwaitingAction.refresh();
  await settle();
  const screen = window.renderView();
  const { registry } = screen.content;
  const objectColumn = registry.columns.find((column) => column.key === 'object');
  assert.equal(objectColumn.value(order), 'ORD-C974EE97');
  assert.equal(objectColumn.value(named), 'Весна — Nordhaus', 'a name the server gave is left as it is');

  const shown = registry.inspector(order).inspector;
  assert.equal(shown.title, 'ORD-C974EE97');
  shown.actions[0].handlers.click();
  assert.equal(window.state.view, 'orders');
  assert.equal(window.OD_UI.selected['od-orders'], order.entityId);
  assert.equal(window.OD_UI.tabs.orders, 'orders');

  registry.inspector(named).inspector.actions[0].handlers.click();
  assert.equal(window.state.view, 'selections');
  assert.equal(window.OD_UI.selected['od-selections'], 'selection_1');
});

test('a view with no per-entity selection still opens its screen', async () => {
  const rfq = { type: 'rfq-award', entityKind: 'sourcing-rfq', entityId: 'rfq_1', label: 'RFQ-1', organisationId: 'o', titleRu: 'x', titleEn: 'x', route: { view: 'rfqs', entityId: 'rfq_1' }, ageSeconds: 1, detail: {}, group: 'sourcing' };
  const { window } = awaitingHarness({ reads: { '/v2/inbox/awaiting-action': { items: [rfq], total: 1, overdue: 0, counts: {} } } });
  window.SynthaAwaitingAction.refresh();
  await settle();
  window.renderView().content.registry.inspector(rfq).inspector.actions[0].handlers.click();
  assert.equal(window.state.view, 'rfqs');
  assert.deepEqual(Object.keys(window.OD_UI.selected), []);
});

// ---------------------------------------------------------------------------------------------
// 4. Меню и вкладки по правам.

test('every capability the navigation map names exists on the server, and the map covers only real views', () => {
  const ui = uiCapabilities();
  const known = new Set(Object.values(SERVER_CAPABILITIES));
  for (const [view, needed] of Object.entries({ ...ui.VIEW_READ_CAPABILITIES, ...ui.PARTNERS_TAB_READ_CAPABILITIES })) {
    assert.ok(needed.length > 0, `${view} names no capability`);
    needed.forEach((capability) => assert.ok(known.has(capability), `${view}: ${capability} is not a server capability`));
  }
});

test('every role keeps the screens it is for, and loses the ones it cannot read', () => {
  const ui = uiCapabilities();
  const open = (role, view) => ui.canOpenView(workspaceOf(role), view);
  // Владелец и администратор видят всё.
  for (const view of Object.keys(ui.VIEW_READ_CAPABILITIES)) { assert.ok(open('owner', view), `owner ${view}`); assert.ok(open('admin', view), `admin ${view}`); }
  // Качество: своё и смежное, но не торговля.
  assert.ok(open('quality', 'final-quality'));
  assert.ok(open('quality', 'samples'));
  assert.ok(!open('quality', 'linesheets'), 'the publication list needs deal.read');
  assert.ok(!open('quality', 'showrooms'));
  assert.ok(!open('quality', 'orders'));
  assert.ok(!open('quality', 'rfqs'));
  // Наблюдатель: модели, склад-подобное чтение и сделки.
  assert.ok(open('viewer', 'styles'));
  assert.ok(open('viewer', 'calendar'));
  assert.ok(!open('viewer', 'boms'));
  assert.ok(!open('viewer', 'final-quality'));
  assert.ok(!open('viewer', 'production-orders'));
  // Финансы читают производство и заказы, но не пишут образцы и обмеры.
  assert.ok(open('finance', 'production-orders'));
  assert.ok(open('finance', 'orders'));
  assert.ok(!open('finance', 'measurements'));
  assert.ok(!open('finance', 'samples'));
  // Байер: торговля, а не разработка продукта.
  for (const view of ['showrooms', 'linesheets', 'selections', 'orders', 'partners', 'calendar']) assert.ok(open('buyer', view), `buyer ${view}`);
  for (const view of ['boms', 'rfqs', 'production-orders', 'final-quality']) assert.ok(!open('buyer', view), `buyer ${view}`);
});

test('an account with no active membership is not judged: the supplier without a grant keeps the menu it has', () => {
  const ui = uiCapabilities();
  for (const workspace of [{ memberships: [], organisations: [] }, {}, { memberships: [{ organisationId: 'x', status: 'inactive', role: 'owner' }] }]) {
    for (const view of Object.keys(ui.VIEW_READ_CAPABILITIES)) assert.ok(ui.canOpenView(workspace, view), view);
  }
  assert.ok(ui.canOpenView(workspaceOf('viewer'), 'a-view-nobody-listed'));
  assert.ok(ui.canOpenView(workspaceOf('viewer'), 'notifications'));
});

test('no role is left with an empty menu', () => {
  const ui = uiCapabilities();
  for (const role of Object.keys(ROLE_CAPABILITIES)) {
    const visible = Object.keys(ui.VIEW_READ_CAPABILITIES).filter((view) => ui.canOpenView(workspaceOf(role), view));
    assert.ok(visible.length >= 3, `${role} sees only ${visible.join(', ')}`);
  }
});

test('the partner tabs that carry restricted data appear only for the roles that may read it', () => {
  const ui = uiCapabilities();
  const tabs = (role) => ['roles', 'legal-entities', 'compliance-documents', 'retail-doors', 'relationships'].filter((tab) => ui.canOpenPartnersTab(workspaceOf(role), tab));
  assert.deepEqual(tabs('owner'), ['roles', 'legal-entities', 'compliance-documents', 'retail-doors', 'relationships']);
  assert.deepEqual(tabs('finance'), ['compliance-documents', 'retail-doors', 'relationships']);
  assert.deepEqual(tabs('viewer'), ['retail-doors', 'relationships']);
  assert.deepEqual(tabs('quality'), ['relationships']);
});

// ---------------------------------------------------------------------------------------------
// Меню: запланированные разделы и отбор по правам.

function navigationHarness(role) {
  const nav = node('nav');
  const window = { Object, Array, String, Map, Set, Number };
  window.window = window;
  window.document = {
    querySelector: (selector) => (selector === '.sidebar .nav' ? nav : null),
    querySelectorAll: () => [],
    body: { classList: { add() {}, remove() {} } },
  };
  window.localText = (ru) => ru;
  window.el = node;
  window.icon = () => node('i');
  window.clear = (target) => { target.children.length = 0; };
  window.toast = (message) => { window.lastToast = message; };
  window.state = { view: 'overview', workspace: { ...workspaceOf(role), memberships: [{ ...workspaceOf(role).memberships[0], organisationType: 'brand' }] } };
  window.renderApp = () => { window.rendered = (window.rendered || 0) + 1; };
  vm.runInContext(capabilities, vm.createContext(window));
  const context = vm.createContext(window);
  vm.runInContext(v7, context);
  // v7 оборачивает renderApp своей отрисовкой документа; для проверки меню нужен только счётчик перерисовок.
  window.renderApp = () => { window.rendered = (window.rendered || 0) + 1; };
  // Как в браузере: ядра модулей подключены, и каждый подключает свой пункт меню. Остаются
  // запланированными ровно те, у которых модуля нет.
  Object.assign(window, { SynthaPlanningCore: {}, SynthaStylesCore: {}, SynthaMaterialsCore: {}, SynthaBomCore: {}, SynthaMeasurementCore: {}, SynthaSampleCore: {}, SynthaSourcingCore: {}, SynthaLinesheetsWorkspace: {} });
  vm.runInContext(installed, context);
  const activate = window.SynthaOmnidataV7Nav.activate;
  activate('Tech packs', 'tech-packs', 'Технические пакеты', 'Tech packs');
  activate('Quality', 'final-quality', 'Качество', 'Quality');
  activate('Production orders', 'production-orders', 'Производственные заказы', 'Production orders');
  activate('Production execution', 'production-executions', 'Производственный календарь', 'Production execution');
  activate('Material RFQs', 'material-rfqs', 'Запросы цен на материал', 'Material RFQs');
  activate('Material purchase orders', 'material-purchase-orders', 'Заказы на материал', 'Material purchase orders');
  activate('Season palette', 'season-palette', 'Палитра сезона', 'Season palette');
  activate('Currency rates', 'currency-rates', 'Курсы валют', 'Currency rates');
  activate('Libraries', 'libraries', 'Библиотеки', 'Libraries');
  return { window, nav };
}

function navigation(nav) {
  const items = [];
  const toggles = [];
  walk(nav, (item) => {
    if (item.tag === 'button' && item.dataset.navGroup) toggles.push(item);
    else if (item.tag === 'button' && /nav-item/.test(item.className)) items.push(item);
  });
  return { items, toggles };
}

test('the dead menu entries live in a collapsed "In development" group at the bottom and are not removed', () => {
  const { window, nav } = navigationHarness('owner');
  window.odV7Navigation();
  const closed = navigation(nav);
  assert.equal(closed.toggles.length, 1);
  const toggle = closed.toggles[0];
  assert.match(toggle.textContent, /\(6\)$/, 'six planned entries are counted, not dropped');
  assert.equal(toggle.props['aria-expanded'], 'false');
  assert.equal(nav.children.at(-1).children[0], toggle, 'the group is the last one in the menu');
  assert.equal(closed.items.filter((item) => item.className.includes('planned')).length, 0, 'collapsed: no dead entry among the working ones');

  toggle.handlers.click();
  assert.equal(window.rendered, 1);
  window.odV7Navigation();
  const open = navigation(nav);
  const dead = open.items.filter((item) => item.className.includes('planned')).map((item) => item.props.title);
  assert.deepEqual(dead.sort(), ['Аналитика', 'Логистика', 'Платежи', 'Повторные заказы', 'Цены и условия', 'Задачи'].sort());
  assert.equal(open.toggles[0].props['aria-expanded'], 'true');
  // Нажатие по запланированному по-прежнему объясняет, что раздел впереди.
  open.items.find((item) => item.props.title === 'Логистика').handlers.click();
  assert.match(window.lastToast, /Логистика/);
});

test('the menu hides what the role cannot read', () => {
  const owner = navigationHarness('owner');
  owner.window.odV7Navigation();
  const ownerViews = navigation(owner.nav).items.map((item) => item.dataset.view).filter(Boolean);

  const quality = navigationHarness('quality');
  quality.window.odV7Navigation();
  const qualityViews = navigation(quality.nav).items.map((item) => item.dataset.view).filter(Boolean);
  assert.ok(qualityViews.includes('final-quality'));
  for (const hidden of ['linesheets', 'showrooms', 'orders', 'rfqs', 'quotations', 'material-purchase-orders']) assert.ok(!qualityViews.includes(hidden), hidden);
  assert.ok(qualityViews.length < ownerViews.length);

  const viewer = navigationHarness('viewer');
  viewer.window.odV7Navigation();
  const viewerViews = navigation(viewer.nav).items.map((item) => item.dataset.view).filter(Boolean);
  assert.ok(viewerViews.length < ownerViews.length);
  assert.notDeepEqual(viewerViews, qualityViews, 'roles no longer share one identical menu');
});

// ---------------------------------------------------------------------------------------------
// 3. Тихие отказы.

function commercialHarness(role, { reads = {}, failWith = null } = {}) {
  const calls = { reads: [] };
  const window = { Object, Map, Set, String, Array, Number, Promise, queueMicrotask, encodeURIComponent };
  window.window = window;
  window.I18N = { getLocale: () => 'ru' };
  window.odText = (ru) => ru;
  window.state = { view: 'showrooms', workspace: workspaceOf(role) };
  window.el = (tag, options) => ({ tag, ...options, append() {} });
  window.formatDate = (value) => String(value ?? '');
  window.api = async (requested) => {
    calls.reads.push(requested);
    if (failWith) throw failWith;
    return reads[requested.split('?')[0]] ?? { lines: [{}, {}], publishedAt: '2026-09-23' };
  };
  vm.runInContext(capabilities, vm.createContext(window));
  vm.runInContext(commercial, vm.createContext(window));
  return { actions: window.SynthaCommercialPublication, calls };
}

const showroom = { id: 'showroom-1', brandId: 'org-1' };
const accepted = { showroomId: 'showroom-1', shopId: 'shop-1', status: 'accepted' };

test('a role without deal.read does not ask for the buyer catalogue and is told it has no access', async () => {
  const { actions, calls } = commercialHarness('quality');
  assert.equal(actions.catalogCell(showroom, accepted, { onLoaded: () => {} }), 'Нет доступа');
  await settle();
  assert.deepEqual(calls.reads, [], 'the read that was bound to fail is not made');
});

test('a role with deal.read still reads the catalogue', async () => {
  const { actions, calls } = commercialHarness('owner');
  assert.equal(actions.catalogCell(showroom, accepted, { onLoaded: () => {} }), '—');
  await settle();
  assert.equal(calls.reads.length, 1);
  assert.equal(actions.catalogCell(showroom, accepted), '2 SKU · 2026-09-23');
});

test('a refusal from the server is said as a refusal, not shown as an empty catalogue', async () => {
  const refusal = Object.assign(new Error('forbidden'), { forbidden: true, status: 403 });
  const { actions } = commercialHarness('owner', { failWith: refusal });
  actions.catalogCell(showroom, accepted, { onLoaded: () => {} });
  await settle();
  assert.equal(actions.catalogCell(showroom, accepted), 'Нет доступа');
});

test('the screens that read certificates and publications check the right first and say so on a refusal', () => {
  // Сертификаты.
  assert.match(styles, /PRODUCT_CERTIFICATION_READ\)\) return noAccessNotice\(\);/);
  assert.match(styles, /if \(certificationState\.denied\[product\.id\]\) return noAccessNotice\(\);/);
  assert.match(styles, /problem\?\.forbidden\) certificationState\.denied\[styleId\] = true/);
  // Листы коллекций: запрос не уходит, повтор не предлагается.
  assert.match(linesheets, /function canReadPublications\(\)/);
  assert.match(linesheets, /CAPABILITIES\.DEAL_READ\);\n  \}\n\n  function deniedPanel/);
  assert.match(linesheets, /if \(!canReadPublications\(\)\) \{ LS\.loadedCollectionId = collectionId; LS\.items = \[\]; return; \}/);
  assert.match(linesheets, /if \(!canReadPublications\(\) \|\| LS\.forbidden\) return deniedPanel\(\);/);
  assert.match(linesheets, /LS\.forbidden = Boolean\(error\?\.forbidden\);/);
});

test('the denial sentence exists in both languages and the loading key is no longer raw', () => {
  const window = { Object, Array, String, Map, Set, Number, Intl, Date, Math, JSON, Promise };
  window.window = window;
  window.document = { documentElement: {}, body: {}, addEventListener() {}, querySelectorAll: () => [] };
  window.localStorage = { getItem: () => null, setItem() {} };
  window.navigator = { language: 'ru-RU', languages: ['ru-RU'] };
  window.dispatchEvent = () => {};
  window.CustomEvent = function CustomEvent() {};
  vm.runInContext(i18nRuntime, vm.createContext(window));
  const i18n = window.SynthaI18n;
  assert.equal(i18n.t('common.noSectionAccess'), 'Нет доступа к этому разделу для вашей роли');
  assert.equal(i18n.t('common.loading'), 'Загрузка…');
  for (const [key, ru] of [['common.dimensions', 'Габариты изделия'], ['common.net_weight', 'Масса нетто'], ['common.primary_material', 'Основной материал']]) assert.equal(i18n.t(key), ru);
  i18n.setLocale('en');
  assert.equal(i18n.t('common.noSectionAccess'), 'Your role has no access to this section');
  assert.equal(i18n.t('common.loading'), 'Loading…');
  assert.equal(i18n.t('common.net_weight'), 'Net weight');
});

test('every interface key a module asks the dictionary for exists in it', async () => {
  const { readdir } = await import('node:fs/promises');
  const dictionary = new Set([...i18nRuntime.matchAll(/'([a-z][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]+)'\s*:\s*\[/g)].map((match) => match[1]));
  const missing = [];
  for (const file of await readdir(path.join(root, 'public', 'modules'))) {
    if (!file.endsWith('.js')) continue;
    const source = await read(file);
    for (const match of source.matchAll(/I18N\.t\(\s*'([^']+)'/g)) if (!dictionary.has(match[1])) missing.push(`${file}: ${match[1]}`);
  }
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------------------------
// 7. Картинки и CSP.

function domHarness(origin = 'http://127.0.0.1:4262') {
  const window = { Object, String, Number, Array, Boolean, JSON, Math, Date, Intl, Map, Set, URL };
  window.window = window;
  window.location = { origin };
  window.I18N = { translate: (value) => value, t: (key) => key, getLocale: () => 'ru' };
  window.localText = (ru) => ru;
  window.document = {
    createElement(tag) {
      return { tag, attributes: {}, children: [], textContent: '', className: '', setAttribute(name, value) { this.attributes[name] = value; }, append() {}, addEventListener() {} };
    },
    querySelector: () => null,
  };
  window.state = { workspace: {} };
  vm.runInContext(dom1, vm.createContext(window));
  return window;
}

test('only the page origin and data: images are loaded; an external address becomes a placeholder', () => {
  const { imageSource, imagePlaceholder } = domHarness();
  assert.equal(imageSource('https://example.invalid/syntha-demo/aurora.jpg'), '');
  assert.equal(imageSource('http://cdn.example.com/a.png'), '');
  assert.equal(imageSource('//example.invalid/a.png'), '');
  assert.equal(imageSource('javascript:alert(1)'), '');
  assert.equal(imageSource('file:///etc/passwd'), '');
  assert.equal(imageSource(''), '');
  assert.equal(imageSource(null), '');
  assert.equal(imageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(imageSource('/media/a.png'), 'http://127.0.0.1:4262/media/a.png');
  assert.equal(imageSource('http://127.0.0.1:4262/media/a.png'), 'http://127.0.0.1:4262/media/a.png');
  const placeholder = imagePlaceholder('https://example.invalid/x.jpg');
  assert.equal(placeholder.textContent, 'Изображение недоступно');
  assert.match(placeholder.className, /image-placeholder/);
});

test('every screen that shows a stored image goes through the same check, and the CSP is not loosened', async () => {
  const sources = Object.fromEntries(await Promise.all(['styles.js', 'showroom-looks.js', 'tech-packs.js', 'measurements.js', 'linesheets.js'].map(async (name) => [name, await read(name)])));
  assert.match(sources['styles.js'], /!imageSource\(media\.uri\)\) return initialsTile/);
  assert.match(sources['styles.js'], /src: imageSource\(media\.uri\)/);
  assert.match(sources['styles.js'], /referenceSrc\s*\?\s*el\('img'[\s\S]{0,200}:\s*imagePlaceholder\(reference\.imageUri\)/);
  assert.match(sources['showroom-looks.js'], /look\.imageUri && imageSource\(look\.imageUri\)/);
  assert.match(sources['tech-packs.js'], /imageSource\(sketch\.uri\) \? h\('img'/);
  assert.match(sources['measurements.js'], /imageSource\(item\.chart\.schemaImageUri\)/);
  assert.match(sources['measurements.js'], /preview\.src = imageSource\(control\.value\)/);
  assert.match(sources['linesheets.js'], /imageSource\(parsed\.href\)/);
  const handler = await readFile(path.join(root, 'src', 'web', 'static-handler.mjs'), 'utf8');
  assert.match(handler, /img-src 'self' data:;/);
});

// ---------------------------------------------------------------------------------------------
// 8. Юрлица и эмитент документа.

test('an issuer is named by its legal entity, or by "Legal entity" and a short code, never by a raw id', async () => {
  const window = { Object, Array, String };
  window.window = window;
  window.localText = (ru) => ru;
  window.state = { workspace: {} };
  window.ownOrganisations = () => [];
  const context = vm.createContext(window);
  vm.runInContext("var legalEntityState = { data: { 'org-1': [{ id: 'legal-entity_aaaa', entityCode: 'RU-MAIN', latestVersion: { nameRu: 'ООО Синта' } }] } };", context);
  vm.runInContext(await read('compliance-documents.js'), context);
  assert.equal(window.legalEntityLabel('org-1', 'legal-entity_aaaa'), 'RU-MAIN (ООО Синта)');
  const unnamed = window.legalEntityLabel('org-1', 'legal-entity_3f9a1c2e-77aa-4a3c-9f00-1234567890ab');
  assert.equal(unnamed, 'Юрлицо 3F9A1C');
  assert.doesNotMatch(unnamed, /legal-entity_/);
  assert.equal(window.legalEntityLabel('org-1', ''), '—');
});

test('the legal-entities tab says "no access" instead of an empty table, and legal-entity reads follow the right', async () => {
  const entities = await read('legal-entities.js');
  assert.match(entities, /function legalEntitiesDenied\(\)/);
  assert.match(entities, /if \(!owned\.length\) return true;/);
  const workspaceScreen = await read('omnidata-workspace.js');
  assert.match(workspaceScreen, /if \(legalEntitiesDenied\(\)\) return odPage\([^\n]*noAccessNotice\(\)\);/);
  assert.match(workspaceScreen, /\.filter\(tab => caps\.canOpenPartnersTab\(w, tab\.id\)\)/);
  const documents = await read('compliance-documents.js');
  assert.doesNotMatch(documents, /loadLegalEntities\(/, 'the document screen must not ask for the full requisites list');
  assert.match(documents, /\/legal-entity-issuers/);
});

test('a remembered tab that is no longer on the strip falls back to the first one', async () => {
  const workspaceScreen = await read('omnidata-workspace.js');
  assert.match(workspaceScreen, /const active = stored && items\.some\(item => item\.id === stored\) \? stored : items\[0\]\.id;/);
});
